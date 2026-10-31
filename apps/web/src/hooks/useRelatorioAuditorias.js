import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function useRelatorioAuditorias() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);

  /**
   * Resolve recursivamente o lote-base (tipo_lote = 'base') de uma lista de lote_origem_id,
   * subindo a cadeia de bandejas até achar a origem real de produção.
   * Retorna um Map: lote_id -> numero_lote do lote base.
   */
  const resolverLotesOrigem = async (lotesComOrigem) => {
    // lotesComOrigem: [{ lote_id, lote_origem_id }]
    let idsParaResolver = [...new Set(lotesComOrigem.map(l => l.lote_origem_id).filter(Boolean))];
    let nivelMap = {};
    let tentativas = 0;
    while (idsParaResolver.length > 0 && tentativas < 5) {
      const { data: nivelData } = await supabase.from('lotes')
        .select('id, numero_lote, tipo_lote, lote_origem_id')
        .in('id', idsParaResolver);
      (nivelData || []).forEach(l => { nivelMap[l.id] = l; });
      idsParaResolver = [...new Set(
        (nivelData || [])
          .filter(l => l.tipo_lote !== 'base' && l.lote_origem_id)
          .map(l => l.lote_origem_id)
      )];
      tentativas++;
    }
    const origemMap = {};
    lotesComOrigem.forEach(l => {
      let atual = l.lote_origem_id ? nivelMap[l.lote_origem_id] : null;
      let safety = 0;
      while (atual && atual.tipo_lote !== 'base' && atual.lote_origem_id && safety < 5) {
        atual = nivelMap[atual.lote_origem_id];
        safety++;
      }
      if (atual) origemMap[l.lote_id] = atual.numero_lote;
    });
    return origemMap;
  };

  /**
   * Fetch auditorias com filtros, ordenação e paginação.
   * Tabela correta: `auditorias_mercado`. Os totais são calculados a partir
   * dos itens em `auditoria_mercado_itens`, que também trazem o lote (e seu lote de origem).
   */
  const fetchAuditorias = useCallback(async (
    filters = {},
    sortBy = 'data_auditoria',
    sortDesc = true,
    page = currentPage,
    limit = pageSize
  ) => {
    if (!empresaId) {
      console.warn('[useRelatorioAuditorias] empresaId not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('auditorias_mercado')
        .select(`
          id,
          local_id,
          empresa_id,
          data_auditoria,
          observacao,
          created_at,
          locais:local_id (
            id,
            nome
          ),
          auditoria_mercado_itens (
            id,
            lote_id,
            produto_id,
            quantidade_contada,
            quantidade_calculada_vendida,
            reabastecimento,
            valor_unitario,
            subtotal,
            produtos:produto_id ( nome ),
            lotes:lote_id ( numero_lote, tipo_lote, lote_origem_id )
          )
        `, { count: 'exact' })
        .eq('empresa_id', empresaId);

      if (filters.dataInicio) {
        query = query.gte('data_auditoria', `${filters.dataInicio}T00:00:00.000Z`);
      }
      if (filters.dataFim) {
        query = query.lte('data_auditoria', `${filters.dataFim}T23:59:59.999Z`);
      }
      if (filters.localId && filters.localId !== 'all') {
        query = query.eq('local_id', filters.localId);
      }
      // Nota: auditorias_mercado não tem usuario_id na estrutura atual.

      query = query.order(sortBy, { ascending: !sortDesc });

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data: auditorias, error: fetchError, count } = await query;

      if (fetchError) {
        console.error('[useRelatorioAuditorias] Fetch error:', fetchError);
        throw fetchError;
      }

      // Coleta todos os itens com lote_origem_id para resolver o lote-base em lote
      const lotesComOrigem = [];
      (auditorias || []).forEach(audit => {
        (audit.auditoria_mercado_itens || []).forEach(item => {
          if (item.lotes?.lote_origem_id) {
            lotesComOrigem.push({ lote_id: item.lote_id, lote_origem_id: item.lotes.lote_origem_id });
          }
        });
      });
      const origemMap = lotesComOrigem.length > 0 ? await resolverLotesOrigem(lotesComOrigem) : {};

      // Processa: calcula totais e anexa numero_lote / lote_origem_numero em cada item
      let processedData = (auditorias || []).map(audit => {
        const itens = (audit.auditoria_mercado_itens || []).map(item => ({
          ...item,
          produto_nome: item.produtos?.nome || 'Produto',
          numero_lote: item.lotes?.numero_lote || null,
          lote_origem_numero: origemMap[item.lote_id] || null,
        }));
        const total_vendido = itens.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        const total_itens = itens.length;
        const total_itens_conferidos = itens.filter(i => i.quantidade_contada !== null).length;
        return {
          ...audit,
          itens,
          total_vendido,
          total_itens,
          total_itens_conferidos,
        };
      });

      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        processedData = processedData.filter(audit =>
          audit.locais?.nome?.toLowerCase().includes(term)
        );
      }

      setData(processedData);
      setTotalRecords(count || 0);
      setCurrentPage(page);
      setLoading(false);

      return { data: processedData, count };
    } catch (err) {
      console.error('[useRelatorioAuditorias] Error:', err);

      setError(err.message || 'Erro ao buscar auditorias');
      setLoading(false);

      toast({
        title: 'Erro ao Buscar Auditorias',
        description: err.message || 'Não foi possível carregar os dados.',
        variant: 'destructive',
      });

      return { data: [], count: 0 };
    }
  }, [empresaId, currentPage, pageSize, toast]);

  const fetchAuditoriaById = useCallback(async (auditoriaId) => {
    if (!empresaId || !auditoriaId) return null;

    try {
      const { data: auditoria, error } = await supabase
        .from('auditorias_mercado')
        .select(`
          *,
          locais:local_id ( id, nome ),
          auditoria_mercado_itens (
            id, lote_id, produto_id, quantidade_contada,
            quantidade_calculada_vendida, reabastecimento,
            valor_unitario, subtotal,
            produtos:produto_id ( nome ),
            lotes:lote_id ( numero_lote, tipo_lote, lote_origem_id )
          )
        `)
        .eq('id', auditoriaId)
        .eq('empresa_id', empresaId)
        .single();

      if (error) throw error;

      const lotesComOrigem = (auditoria.auditoria_mercado_itens || [])
        .filter(item => item.lotes?.lote_origem_id)
        .map(item => ({ lote_id: item.lote_id, lote_origem_id: item.lotes.lote_origem_id }));
      const origemMap = lotesComOrigem.length > 0 ? await resolverLotesOrigem(lotesComOrigem) : {};

      const itens = (auditoria.auditoria_mercado_itens || []).map(item => ({
        ...item,
        produto_nome: item.produtos?.nome || 'Produto',
        numero_lote: item.lotes?.numero_lote || null,
        lote_origem_numero: origemMap[item.lote_id] || null,
      }));

      return { ...auditoria, itens };
    } catch (err) {
      console.error('[useRelatorioAuditorias] Error fetching single auditoria:', err);

      toast({
        title: 'Erro ao Buscar Auditoria',
        description: err.message || 'Não foi possível carregar os detalhes.',
        variant: 'destructive',
      });

      return null;
    }
  }, [empresaId, toast]);

  const resetPagination = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const changePageSize = useCallback((size) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  return {
    data,
    loading,
    error,
    currentPage,
    pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / pageSize),
    fetchAuditorias,
    fetchAuditoriaById,
    resetPagination,
    goToPage,
    changePageSize
  };
}