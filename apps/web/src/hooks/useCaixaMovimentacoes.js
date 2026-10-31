import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useCaixaMovimentacoes() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMovimentacoes = useCallback(async (caixa_id) => {
    if (!caixa_id) return [];
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('caixa_movimentacoes')
        .select(`
          id,
          caixa_id,
          tipo,
          valor,
          observacao,
          created_at,
          usuarios ( nome )
        `)
        .eq('caixa_id', caixa_id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching caixa movimentacoes:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createRetirada = useCallback(async (caixa_id, valor, observacao, usuario_id) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from('caixa_movimentacoes')
        .insert({
          caixa_id,
          tipo: 'RETIRADA',
          valor: Number(valor),
          observacao,
          usuario_id
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return { success: true, data };
    } catch (err) {
      console.error('Error creating retirada:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateCaixaBalance = useCallback(async (caixa_id, valor_inicial) => {
    try {
      // Get sales total
      const { data: salesData } = await supabase.rpc('calcular_resumo_vendas', {
        p_caixa_id: caixa_id
      });
      const total_vendas = salesData?.total_geral || 0;

      // Get withdrawals
      const { data: retData } = await supabase
        .from('caixa_movimentacoes')
        .select('valor')
        .eq('caixa_id', caixa_id)
        .eq('tipo', 'RETIRADA');
      
      const total_retiradas = (retData || []).reduce((acc, curr) => acc + Number(curr.valor), 0);

      const saldo_atual = Number(valor_inicial) + Number(total_vendas) - total_retiradas;

      return { total_vendas, total_retiradas, saldo_atual };
    } catch (err) {
      console.error('Error calculating balance:', err);
      return { total_vendas: 0, total_retiradas: 0, saldo_atual: valor_inicial };
    }
  }, []);

  return {
    loading,
    error,
    fetchMovimentacoes,
    createRetirada,
    calculateCaixaBalance
  };
}