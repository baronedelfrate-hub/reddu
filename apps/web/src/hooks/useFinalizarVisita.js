import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function useFinalizarVisita() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [summary, setSummary] = useState(null);

  // Callable function to fetch summary (no auto-fetch, no useEffect)
  const fetchVisitSummary = useCallback(async (mercado_id) => {
    if (!empresaId || !mercado_id) {
      console.error('[useFinalizarVisita] Missing empresaId or mercado_id');
      setError('Dados incompletos');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Get today's date range (start and end of day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.toISOString();
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todayEnd = tomorrow.toISOString();

      console.log('[useFinalizarVisita] Fetching sales for mercado:', mercado_id, 'date range:', todayStart, '-', todayEnd);

      // Fetch all movimentacoes (sales) for this mercado today
      const { data: movimentacoes, error: movError } = await supabase
        .from('movimentacoes')
        .select(`
          id,
          tipo,
          produto_id,
          quantidade,
          valor_unitario,
          subtotal,
          total_final,
          tipo_lote,
          data_movimentacao,
          venda_id,
          produtos:produto_id (nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('local_origem_id', mercado_id)
        .in('tipo', ['venda', 'venda_mercado', 'venda_unitario'])
        .gte('data_movimentacao', todayStart)
        .lt('data_movimentacao', todayEnd)
        .order('data_movimentacao', { ascending: false });

      if (movError) {
        console.error('[useFinalizarVisita] Error fetching movimentacoes:', movError);
        throw movError;
      }

      console.log('[useFinalizarVisita] Found movimentacoes:', movimentacoes?.length || 0);

      // Calculate summary metrics
      let total_vendas = 0;
      let total_valor = 0;
      let total_itens = 0;
      let vendas_bandeja = 0;
      let valor_bandeja = 0;
      let vendas_unitario = 0;
      let valor_unitario = 0;

      const vendasMap = new Map();

      (movimentacoes || []).forEach(mov => {
        total_itens += mov.quantidade || 0;
        total_valor += parseFloat(mov.total_final || 0);

        // Count unique vendas
        if (mov.venda_id && !vendasMap.has(mov.venda_id)) {
          vendasMap.set(mov.venda_id, true);
          total_vendas += 1;
        }

        // Breakdown by tipo_lote
        if (mov.tipo_lote === 'bandeja') {
          vendas_bandeja += 1;
          valor_bandeja += parseFloat(mov.total_final || 0);
        } else {
          vendas_unitario += 1;
          valor_unitario += parseFloat(mov.total_final || 0);
        }
      });

      const summaryData = {
        total_vendas,
        total_valor,
        total_itens,
        vendas_bandeja,
        valor_bandeja,
        vendas_unitario,
        valor_unitario,
        movimentacoes: movimentacoes || []
      };

      console.log('[useFinalizarVisita] Summary calculated:', summaryData);

      setSummary(summaryData);
      setLoading(false);
      return summaryData;
    } catch (err) {
      console.error('[useFinalizarVisita] Error fetching summary:', err);
      
      setError(err.message || 'Erro ao carregar resumo');
      setLoading(false);
      
      toast({
        title: 'Erro ao Buscar Resumo',
        description: err.message || 'Não foi possível carregar os dados da visita.',
        variant: 'destructive',
      });

      return null;
    }
  }, [empresaId, toast]);

  const finalizarVisita = useCallback(async (mercado_id, observacao_geral, summaryData) => {
    if (!empresaId || !mercado_id) {
      const errorMsg = 'Dados incompletos para finalizar a visita.';
      setError(errorMsg);
      toast({
        title: 'Erro de Validação',
        description: errorMsg,
        variant: 'destructive',
      });
      return { success: false, error: errorMsg };
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      console.log('[useFinalizarVisita] Finalizing visit for mercado:', mercado_id);

      const usuario_id = currentUser?.id || null;

      // Insert audit_visits record
      const { data: auditRecord, error: auditError } = await supabase
        .from('audit_visits')
        .insert({
          local_id: mercado_id,
          empresa_id: empresaId,
          usuario_id: usuario_id,
          data_auditoria: new Date().toISOString(),
          observacao_geral: observacao_geral || null,
          total_vendas: summaryData?.total_vendas || 0,
          total_valor: summaryData?.total_valor || 0,
          total_itens: summaryData?.total_itens || 0,
          vendas_bandeja: summaryData?.vendas_bandeja || 0,
          valor_bandeja: summaryData?.valor_bandeja || 0,
          vendas_unitario: summaryData?.vendas_unitario || 0,
          valor_unitario: summaryData?.valor_unitario || 0,
        })
        .select()
        .single();

      if (auditError) {
        console.error('[useFinalizarVisita] Error inserting audit_visits:', auditError);
        throw auditError;
      }

      console.log('[useFinalizarVisita] Audit record created:', auditRecord);

      // Update locais table with audit info
      const { error: updateError } = await supabase
        .from('locais')
        .update({
          data_auditoria: new Date().toISOString(),
          usuario_auditoria: usuario_id,
          observacao_auditoria: observacao_geral || null,
        })
        .eq('id', mercado_id);

      if (updateError) {
        console.error('[useFinalizarVisita] Error updating locais:', updateError);
        // Non-critical error, continue
      }

      console.log('[useFinalizarVisita] Visit finalized successfully');

      // Success vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      setSuccess(true);
      setLoading(false);

      toast({
        title: '✅ Visita Finalizada',
        description: `Auditoria registrada com sucesso para este mercado.`,
        duration: 5000,
      });

      return { success: true, summary: summaryData, audit_id: auditRecord.id };
    } catch (err) {
      console.error('[useFinalizarVisita] Error finalizing visit:', err);

      const errorMsg = err.message || 'Ocorreu um erro inesperado.';
      setError(errorMsg);
      setLoading(false);

      // Error vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }

      toast({
        title: 'Erro ao Finalizar Visita',
        description: errorMsg,
        variant: 'destructive',
      });

      return { success: false, error: errorMsg };
    }
  }, [empresaId, currentUser, toast]);

  return {
    loading,
    error,
    success,
    summary,
    fetchVisitSummary,
    finalizarVisita,
  };
}