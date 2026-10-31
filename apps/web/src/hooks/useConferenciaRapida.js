import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

export function useConferenciaRapida(empresaId) {
  const { toast } = useToast();
  const [conferenciasHoje, setConferenciasHoje] = useState(new Map());
  const [isRegistering, setIsRegistering] = useState(false);

  const fetchConferenciasHoje = useCallback(async (produtoId) => {
    if (!empresaId || !produtoId) return;

    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const hojeISO = hoje.toISOString();

      // CRITICAL FIX: Use 'ajuste_manual' tipo (valid per movimentacoes_tipo_check constraint)
      // with observacao containing 'Conferência Rápida' to identify these records
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('lote_id, created_at')
        .eq('empresa_id', empresaId)
        .eq('produto_id', produtoId)
        .eq('tipo', 'ajuste_manual')
        .ilike('observacao', '%Conferência Rápida%')
        .gte('data_movimentacao', hojeISO)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const conferenciasMap = new Map();
      (data || []).forEach(mov => {
        if (!conferenciasMap.has(mov.lote_id)) {
          conferenciasMap.set(mov.lote_id, mov.created_at);
        }
      });

      setConferenciasHoje(conferenciasMap);
      console.log('[useConferenciaRapida] Conferências de hoje carregadas:', conferenciasMap.size);
    } catch (error) {
      console.error('[useConferenciaRapida] Erro ao buscar conferências:', error);
    }
  }, [empresaId]);

  const registrarConferencia = useCallback(async (lote, produto) => {
    if (!empresaId || !lote || !produto) {
      toast({
        title: 'Erro de Validação',
        description: 'Dados insuficientes para registrar conferência.',
        variant: 'destructive',
      });
      return false;
    }

    if (conferenciasHoje.has(lote.lote_id)) {
      toast({
        title: 'Já Conferido',
        description: 'Este lote já foi conferido hoje.',
        variant: 'default',
      });
      return false;
    }

    setIsRegistering(true);
    try {
      // CRITICAL FIX: Use 'ajuste_manual' tipo instead of 'conferencia_rapida'
      // 'ajuste_manual' is a valid tipo per movimentacoes_tipo_check constraint
      // Quantidade = 0 because this is just an audit, not a stock change
      const { error } = await supabase
        .from('movimentacoes')
        .insert({
          empresa_id: empresaId,
          tipo: 'ajuste_manual',
          produto_id: produto.id,
          lote_id: lote.lote_id,
          local_origem_id: lote.local_id,
          quantidade: 0, // Zero quantity - this is an audit record, not a stock change
          data_movimentacao: new Date().toISOString(),
          observacao: 'Conferência Rápida - Automática'
        });

      if (error) throw error;

      // Update local state immediately
      setConferenciasHoje(prev => new Map(prev).set(lote.lote_id, new Date().toISOString()));

      toast({
        title: '✅ Conferência Registrada',
        description: `Lote ${lote.numero_lote} conferido com sucesso.`,
        duration: 3000,
      });

      console.log('[useConferenciaRapida] Conferência registrada:', lote.numero_lote);
      return true;
    } catch (error) {
      console.error('[useConferenciaRapida] Erro ao registrar conferência:', error);
      toast({
        title: 'Erro ao Registrar Conferência',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [empresaId, conferenciasHoje, toast]);

  const isConferidoHoje = useCallback((loteId) => {
    return conferenciasHoje.has(loteId);
  }, [conferenciasHoje]);

  return {
    conferenciasHoje,
    isRegistering,
    fetchConferenciasHoje,
    registrarConferencia,
    isConferidoHoje,
  };
}