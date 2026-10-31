import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { filterActiveLotes } from '@/lib/lotFormatUtils';

export function useLoteManagement() {
  const fetchCountRef = useRef(0);
  const mountTimeRef = useRef(new Date().toISOString());

  useEffect(() => {
    console.log(`[useLoteManagement] Hook mounted at ${mountTimeRef.current}`);
    return () => console.log(`[useLoteManagement] Hook unmounted. Was mounted at ${mountTimeRef.current}`);
  }, []);

  const isManualLote = useCallback((numeroLote) => {
    return numeroLote && numeroLote.trim().length > 0;
  }, []);

  const validateManualLote = useCallback((data) => {
    if (typeof data === 'string') {
      if (!data || data.trim().length < 3) return "Número de lote deve ter pelo menos 3 caracteres.";
      return null;
    }
    
    const errors = {};
    if (!data.produto_id) errors.produto_id = "O ID do produto é obrigatório.";
    if (!data.quantidade || parseInt(data.quantidade, 10) <= 0) errors.quantidade = "A quantidade deve ser maior que zero.";
    
    if (data.data_validade) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [year, month, day] = data.data_validade.split('-');
      const valDate = new Date(year, month - 1, day);
      if (valDate < today) {
        errors.data_validade = "A data de validade deve ser uma data futura ou presente.";
      }
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  }, []);

  const checkLoteExists = useCallback(async (empresaId, produtoId, numeroLote) => {
    const { data, error } = await supabase
      .from('lotes')
      .select('id, ativo')
      .eq('empresa_id', empresaId)
      .eq('produto_id', produtoId)
      .eq('numero_lote', numeroLote)
      .limit(1);
    if (error) throw error;
    return filterActiveLotes(data).length > 0;
  }, []);

  const validateLotDuplicate = useCallback(async (empresaId, produtoId, numeroLote, tipoLote) => {
    let query = supabase.from('lotes').select('id, ativo').eq('empresa_id', empresaId).eq('numero_lote', numeroLote);
    if (produtoId) query = query.eq('produto_id', produtoId);
    if (tipoLote) query = query.eq('tipo_lote', tipoLote);
    const { data, error } = await query.limit(1);
    if (error) return { exists: false, message: error.message };
    
    const activeData = filterActiveLotes(data);
    return { exists: activeData.length > 0, message: activeData.length > 0 ? 'Lote duplicado' : '' };
  }, []);

  const generateAutomaticLote = useCallback(async (empresaId, dataFabricacao) => {
    const dateStr = dataFabricacao ? dataFabricacao.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
    const { data } = await supabase
      .from('lotes')
      .select('numero_lote')
      .eq('empresa_id', empresaId)
      .like('numero_lote', `LOT-${dateStr}-%`)
      .order('created_at', { ascending: false })
      .limit(1);
      
    let seq = 1;
    if (data && data.length > 0) {
      const parts = data[0].numero_lote.split('-');
      if (parts.length === 3) seq = parseInt(parts[2], 10) + 1;
    }
    return `LOT-${dateStr}-${seq.toString().padStart(3, '0')}`;
  }, []);

  const createLote = useCallback(async (loteData) => {
    try {
      if (!loteData.empresa_id || !loteData.produto_id || !loteData.numero_lote || !loteData.quantidade) {
        return { success: false, error: 'Dados obrigatórios ausentes para criação do lote.' };
      }

      const loteId = loteData.id || crypto.randomUUID();

      const { data, error } = await supabase.from('lotes').insert({
        id: loteId,
        empresa_id: loteData.empresa_id,
        produto_id: loteData.produto_id,
        numero_lote: loteData.numero_lote,
        data_validade: loteData.data_validade || null,
        quantidade: parseInt(loteData.quantidade, 10),
        local_id: loteData.local_id || null,
        tipo_lote: loteData.tipo_lote || 'base',
        unidades_por_bandeja: loteData.unidades_por_bandeja ? parseInt(loteData.unidades_por_bandeja, 10) : null,
        lote_devolvido: loteData.lote_devolvido || false,
        ativo: true
      }).select().single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const deleteLote = useCallback(async (loteId, empresaId) => {
    try {
      const { data: lote, error: loteError } = await supabase.from('lotes').select('*').eq('id', loteId).eq('empresa_id', empresaId).single();
      if (loteError || !lote) return { success: false, error: 'Lote não encontrado.' };
      
      const { data: movs, error: movsError } = await supabase.from('movimentacoes').select('id').eq('lote_id', loteId).limit(1);
      if (movsError) return { success: false, error: 'Erro ao verificar dependências do lote.' };
      if (movs && movs.length > 0) return { success: false, error: 'Não é possível excluir um lote que possui movimentações atreladas' };

      const { error: deleteError } = await supabase.from('lotes').delete().eq('id', loteId).eq('empresa_id', empresaId);
      if (deleteError) return { success: false, error: deleteError.message };

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const inactivateLote = useCallback(async (loteId, empresaId) => {
    try {
      const { error: updateError } = await supabase
        .from('lotes')
        .update({ ativo: false })
        .eq('id', loteId)
        .eq('empresa_id', empresaId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const reactivateLote = useCallback(async (loteId, empresaId) => {
    try {
      const { error: updateError } = await supabase
        .from('lotes')
        .update({ ativo: true })
        .eq('id', loteId)
        .eq('empresa_id', empresaId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const fetchLotes = useCallback(async (empresaId, filterStatus = 'ativo') => {
    try {
      fetchCountRef.current += 1;
      // Modified to include .limit(5000) as requested
      let query = supabase.from('lotes').select('*').eq('empresa_id', empresaId).limit(5000);
      
      if (filterStatus === 'ativo') {
        query = query.eq('ativo', true);
      } else if (filterStatus === 'inativo') {
        query = query.eq('ativo', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return { success: true, data };
    } catch (err) {
      console.error(`[useLoteManagement] Error fetching lotes:`, err);
      return { success: false, error: err.message };
    }
  }, []);

  const getLoteByBarcode = useCallback(async (empresaId, codigoBarraValue) => {
    try {
      if (!empresaId || !codigoBarraValue) {
        return { success: false, error: 'Parâmetros inválidos para busca por código de barras.' };
      }

      const { data, error } = await supabase
        .from('lotes')
        .select(`
          *,
          produtos (id, nome),
          locais (id, nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('codigo_barra', codigoBarraValue.trim())
        .eq('ativo', true);

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Nenhum lote ativo encontrado para este código de barras.' };
      }

      if (data.length > 1) {
        return { success: false, error: 'Múltiplos lotes encontrados com o mesmo código de barras. Verifique a base de dados.' };
      }

      return { success: true, data: data[0] };
    } catch (err) {
      console.error(`[useLoteManagement] Error fetching lote by barcode:`, err);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    isManualLote,
    validateManualLote,
    checkLoteExists,
    validateLotDuplicate,
    generateAutomaticLote,
    createLote,
    deleteLote,
    inactivateLote,
    reactivateLote,
    fetchLotes,
    getLoteByBarcode
  };
}