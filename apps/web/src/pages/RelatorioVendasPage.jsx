import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import RelatorioVendasFiltrosConsolidados from '@/components/relatorios/RelatorioVendasFiltrosConsolidados';
import RelatorioVendasTabelaConsolidada from '@/components/relatorios/RelatorioVendasTabelaConsolidada';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileBarChart2, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getPaymentMethodDisplay } from '@/utils/validatePaymentMethod';
import { resolveTipoLote } from '@/utils/resolveTipoLote';

export default function RelatorioVendasPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [locais, setLocais] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const defaultFilters = {
    dataInicio: todayStr,
    dataFim: todayStr,
    canalVenda: 'all',
    formaPagamento: 'all',
    produtoId: 'all',
    localId: 'all'
  };

  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => { if (empresaId) fetchFilterOptions(); }, [empresaId]);

  const fetchFilterOptions = async () => {
    try {
      const [{ data: prods }, { data: locs }] = await Promise.all([
        supabase.from('produtos').select('id, nome, preco_venda').eq('empresa_id', empresaId).order('nome'),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome')
      ]);
      if (prods) setProdutos(prods);
      if (locs) setLocais(locs);
    } catch (err) { console.error('Erro:', err); }
  };

  const fetchRelatorio = useCallback(async (currentFilters = appliedFilters, currentStatus = statusFilter) => {
    if (!empresaId) return;
    setIsLoading(true); setError(null);
    try {
      // Mercados Venda Direta não usam o fluxo de baixa (a cobrança deles é
      // via reabastecimento, não via confirmação de venda) — não devem
      // nunca aparecer como "pendente" aqui, mesmo que o campo
      // financeiro_baixado ainda esteja como false no banco (dado antigo).
      const { data: mercadosVD } = await supabase
        .from('locais').select('nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado').eq('modelo_negocio', 'venda_direta');
      const nomesVendaDireta = new Set((mercadosVD || []).map(l => l.nome));

      let query = supabase.from('vendas').select(`
        id, data_venda, data_baixa, financeiro_baixado, canal_venda, cliente_referencia, total_final, forma_pagamento, responsavel_retirada, observacao_retirada, numero_pedido_app, status_fiscal, nfe_url_pdf, nfe_chave,
        movimentacoes!fk_movimentacoes_vendas!inner (
          id, tipo, quantidade, subtotal, desconto, taxa_motoboy, total_final, valor_unitario, observacao, observacoes, produto_id, local_origem_id, tipo_item, commercial_product_name,
          meta_quantidade, status, financeiro_baixado, data_baixa, tipo_lote, forma_pagamento, numero_pedido_app, desconto_valor, produtos ( id, nome, preco_venda ), locais:local_origem_id ( id, nome ),
          lotes ( tipo_lote, numero_lote )
        )
      `).eq('empresa_id', empresaId).order('data_venda', { ascending: false });

      if (currentFilters.dataInicio && currentFilters.dataFim) {
        const start = `${currentFilters.dataInicio}T00:00:00.000Z`;
        const end = `${currentFilters.dataFim}T23:59:59.999Z`;
        query = query.or(`and(data_baixa.not.is.null,data_baixa.gte.${start},data_baixa.lte.${end}),and(data_baixa.is.null,data_venda.gte.${start},data_venda.lte.${end})`);
      }

      if (currentFilters.canalVenda && currentFilters.canalVenda !== 'all') query = query.eq('canal_venda', currentFilters.canalVenda);
      if (currentFilters.formaPagamento && currentFilters.formaPagamento !== 'all') query = query.eq('forma_pagamento', currentFilters.formaPagamento);
      if (currentFilters.produtoId && currentFilters.produtoId !== 'all') query = query.eq('movimentacoes.produto_id', currentFilters.produtoId);
      if (currentFilters.localId && currentFilters.localId !== 'all') query = query.eq('movimentacoes.local_origem_id', currentFilters.localId);

      const { data: reportData, error: reportError } = await query;
      if (reportError) throw reportError;

      let consolidatedList = (reportData || []).map(venda => {
        const ehMercadoVendaDireta = venda.canal_venda === 'MERCADO' && nomesVendaDireta.has(venda.cliente_referencia);
        const isPendente = !ehMercadoVendaDireta && !venda.financeiro_baixado;
        if (currentStatus === 'CONCILIADOS' && isPendente) return null;
        if (currentStatus === 'PENDENTES' && !isPendente) return null;

        const tiposLoteMap = {};
        const baseItens = [];

        let sumSubtotal = 0;
        let sumDesconto = 0;
        let sumTaxa = 0;
        let sumQuantidade = 0;

        // CRITICAL FIX: Use valor_unitario as single source of truth
        (venda.movimentacoes || []).forEach(m => {
          const qtd = Number(m.quantidade || 0);
          sumQuantidade += qtd;

          const resolvedTipoLote = resolveTipoLote(m);
          if (resolvedTipoLote && resolvedTipoLote !== 'N/A') {
            const tl = resolvedTipoLote.toLowerCase() === 'base' ? 'unitario' : resolvedTipoLote.toLowerCase();
            tiposLoteMap[tl] = true;
          }

          // CRITICAL: Extract valor_unitario directly from database (single source of truth)
          // DO NOT calculate from subtotal/quantidade or total_final/quantidade
          const valorUnitario = Number(m.valor_unitario || m.produtos?.preco_venda || 0);

          // CRITICAL FIX: Calculate subtotal using valor_unitario × quantidade
          // This preserves fractional precision (e.g., 5 × 0.999 = 4.995)
          const itemSubtotal = qtd * valorUnitario;

          const dbDesconto = Number(m.desconto_valor || 0);
          const dbTaxa = Number(m.taxa_motoboy || 0);

          // Accumulate for summary (only NORMAL items contribute to subtotal)
          if (m.tipo_item === 'NORMAL' || !m.tipo_item) {
            sumSubtotal += itemSubtotal;
          }

          // CRITICAL: Store valor_unitario WITHOUT any recalculation
          // subtotal is CALCULATED from valor_unitario, not stored from DB
          baseItens.push({
            ...m,
            valor_unitario: valorUnitario,  // SINGLE SOURCE OF TRUTH (e.g., 0.999)
            subtotal: itemSubtotal,         // CALCULATED: qtd × valor_unitario (e.g., 4.995)
            total_final: itemSubtotal - dbDesconto + dbTaxa,
            desconto: dbDesconto,
            taxa_motoboy: dbTaxa,
            isBase: true
          });
        });

        // Extract global discount and tax from first item
       // DEPOIS — busca o maior valor entre todos os itens (está no último item)
if (venda.movimentacoes && venda.movimentacoes.length > 0) {
  venda.movimentacoes.forEach(m => {
    if (Number(m.desconto_valor || 0) > sumDesconto) {
      sumDesconto = Number(m.desconto_valor);
    }
    if (Number(m.taxa_motoboy || 0) > sumTaxa) {
      sumTaxa = Number(m.taxa_motoboy);
    }
  });
}

        // Add synthetic items for display (taxa and desconto)
        if (sumTaxa > 0) {
          baseItens.push({
            id: venda.id + '_taxa',
            tipo_item: 'TAXA',
            produtos: { nome: 'Taxa de Entrega' },
            quantidade: 1,
            valor_unitario: sumTaxa,
            subtotal: sumTaxa,
            total_final: sumTaxa,
            isSynthetic: true
          });
        }

        if (sumDesconto > 0) {
          baseItens.push({
            id: venda.id + '_desc',
            tipo_item: 'DESCONTO',
            produtos: { nome: 'Desconto' },
            quantidade: 1,
            valor_unitario: -sumDesconto,
            subtotal: -sumDesconto,
            total_final: -sumDesconto,
            isSynthetic: true
          });
        }

        // Use EXACT total_final from vendas table (authoritative source)
        const finalTotal = Number(venda.total_final) || 0;

        const statusGlobal = isPendente ? 'PENDENTE' : 'CONCILIADO';
        const arrTiposLote = Object.keys(tiposLoteMap);
        const tipoLoteSummary = arrTiposLote.length > 1 ? 'Misto' : (arrTiposLote.length === 1 ? (arrTiposLote[0] === 'bandeja' ? 'Bandeja' : 'Unitário') : 'N/A');

        return {
          ...venda,
          data_movimentacao: venda.data_baixa || venda.data_venda,
          local_nome: venda.movimentacoes?.[0]?.locais?.nome || 'N/A',
          canal_venda: venda.canal_venda,
          itens: baseItens,
          quantidade: sumQuantidade,
          subtotal: sumSubtotal,        // Sum of CALCULATED subtotals (qtd × valor_unitario)
          desconto: sumDesconto,         // Global discount
          taxa_motoboy: sumTaxa,         // Global tax
          total_final: finalTotal,       // EXACT database value from vendas.total_final
          status: statusGlobal,
          financeiro_baixado: !isPendente,
          tipo_lote_resumo: tipoLoteSummary
        };
      }).filter(Boolean);

      setData(consolidatedList);
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erro', description: 'Falha ao carregar o relatório.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, appliedFilters, statusFilter, toast]);

  useEffect(() => { fetchRelatorio(appliedFilters, statusFilter); }, [fetchRelatorio, appliedFilters, statusFilter]);

  const handleApplyFilters = () => { setAppliedFilters(filters); toast({ title: 'Filtros aplicados' }); };
  const handleClearFilters = () => { setFilters(defaultFilters); setAppliedFilters(defaultFilters); setStatusFilter('ALL'); toast({ title: 'Filtros limpos' }); };

  const normalizedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(item => ({
      ...item,
      canal_venda: String(item.canal_venda || 'NÃO INFORMADO').toUpperCase(),
      cliente_referencia: String(item.cliente_referencia || 'NÃO INFORMADO').trim(),
      forma_pagamento_display: getPaymentMethodDisplay(item.forma_pagamento)
    }));
  }, [data]);

  return (
    <>
      <Helmet><title>Relatório de Vendas Consolidado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><FileBarChart2 className="h-6 w-6" /></div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Relatório de Vendas</h1>
                <p className="text-gray-600 mt-1">Visão consolidada das vendas com dados financeiros e tipos de lote.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium text-gray-700">Status:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px] bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as Vendas</SelectItem>
                    <SelectItem value="CONCILIADOS">Apenas Conciliadas</SelectItem>
                    <SelectItem value="PENDENTES">Apenas Pendentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => fetchRelatorio()} variant="outline" className="gap-2 shadow-sm"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar</Button>
            </div>
          </div>

          <RelatorioVendasFiltrosConsolidados filters={filters} setFilters={setFilters} onApply={handleApplyFilters} onClear={handleClearFilters} produtos={produtos} locais={locais} />

          <Alert className="bg-emerald-50/50 text-emerald-800 border-emerald-100">
            <Info className="h-4 w-4 text-emerald-600" />
            <AlertDescription>Mostrando vendas de {appliedFilters.dataInicio.split('-').reverse().join('/')} a {appliedFilters.dataFim.split('-').reverse().join('/')}. Status: {statusFilter === 'ALL' ? 'Todas' : statusFilter === 'CONCILIADOS' ? 'Conciliadas' : 'Pendentes'}.</AlertDescription>
          </Alert>

          {error ? (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center border-red-100">
              <p className="text-red-600 mb-2">Erro ao carregar</p>
              {/* Antes o toast "Falha ao carregar o relatório." escondia a causa real
                  (err.message ficava só no state `error`, nunca aparecia na tela).
                  Mostrando aqui pra dar pra ver o motivo exato na hora que acontecer
                  de novo, sem precisar abrir o console do navegador. */}
              {error && (
                <p className="text-xs text-gray-400 mb-4 font-mono break-all max-w-lg mx-auto">{error}</p>
              )}
              <Button onClick={() => fetchRelatorio()} variant="outline"><RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente</Button>
            </div>
          ) : isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border p-24 text-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto" /></div>
          ) : (
            <RelatorioVendasTabelaConsolidada data={normalizedData} />
          )}
        </div>
      </DashboardLayout>
    </>
  );
}