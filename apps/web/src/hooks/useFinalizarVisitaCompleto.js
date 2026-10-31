import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Complete audit finalization hook with comprehensive data collection
 * Records conferências, sales, divergências, vendas_data, conferencias_data and updates market_audits table
 */
export function useFinalizarVisitaCompleto() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /**
   * Collect all session data from ongoing market operation
   * @param {Object} sessionData - { mercadoId, conferenceRecords, salesRecords, stockData, generalObservations, startTime, endTime, vendas_data, conferencias_data }
   * @returns {Object} Processed session data ready for database insert
   */
  const collectSessionData = useCallback(async (sessionData) => {
    try {
      console.log('[useFinalizarVisitaCompleto] collectSessionData called');
      console.log('[useFinalizarVisitaCompleto] input auditSessionData:', sessionData);

      const { 
        mercadoId, 
        conferenceRecords = [], 
        salesRecords = [], 
        stockData = [],
        generalObservations = '',
        startTime,
        endTime,
        vendas_data = [],
        conferencias_data = []
      } = sessionData;

      console.log('[useFinalizarVisitaCompleto] vendas_data extracted:', vendas_data);
      console.log('[useFinalizarVisitaCompleto] conferencias_data extracted:', conferencias_data);
      console.table(vendas_data);
      console.table(conferencias_data);

      // Calculate totals
      const total_vendido = salesRecords.reduce((sum, sale) => sum + (parseFloat(sale.total_final) || 0), 0);
      const total_itens = salesRecords.reduce((sum, sale) => sum + (sale.quantidade || 0), 0);
      const total_itens_conferidos = conferenceRecords.length;

      // Build divergências array (expected vs actual stock)
      const divergencias = [];
      
      for (const stockItem of stockData) {
        const { produto_id, produto_nome, esperado, contado, lote_id } = stockItem;
        
        if (esperado !== contado) {
          const diferenca = contado - esperado;
          const tipo = diferenca < 0 ? 'faltante' : 'excedente';
          const is_critico = Math.abs(diferenca) >= (esperado * 0.2); // 20% threshold for critical
          
          // Calculate value of divergence
          const { data: produtoData } = await supabase
            .from('produtos')
            .select('preco_unitario, preco_bandeja')
            .eq('id', produto_id)
            .single();
          
          const valor_unitario = produtoData?.preco_unitario || produtoData?.preco_bandeja || 0;
          const valor_divergencia = Math.abs(diferenca) * valor_unitario;

          divergencias.push({
            produto_id,
            produto_nome,
            lote_id,
            esperado,
            contado,
            diferenca,
            tipo,
            is_critico,
            valor_divergencia
          });
        }
      }

      return {
        local_id: mercadoId,
        usuario_id: currentUser?.id || null,
        empresa_id: empresaId,
        data_auditoria: endTime || new Date().toISOString(),
        total_vendido,
        total_itens,
        total_itens_conferidos,
        divergencias,
        observacao_geral: generalObservations,
        status_auditoria: 'concluido',
        data_criacao: new Date().toISOString(),
        vendas_data,
        conferencias_data
      };
    } catch (err) {
      console.error('[useFinalizarVisitaCompleto] Error in collectSessionData:', err);
      throw new Error('Falha ao processar dados da sessão: ' + err.message);
    }
  }, [empresaId, currentUser]);

  /**
   * Save audit record to market_audits table
   * @param {Object} auditData - Complete audit data from collectSessionData
   * @returns {Object} Inserted audit record
   */
  const saveToMarketAudits = useCallback(async (auditData) => {
    try {
      console.log('[useFinalizarVisitaCompleto] saveToMarketAudits called');
      console.log('[useFinalizarVisitaCompleto] sessionData:', auditData);
      console.log('[useFinalizarVisitaCompleto] payload before insert:', auditData);
      console.log('[useFinalizarVisitaCompleto] payload.vendas_data count:', auditData.vendas_data?.length);
      console.log('[useFinalizarVisitaCompleto] payload.conferencias_data count:', auditData.conferencias_data?.length);
      console.table(auditData);

      const { data: auditRecord, error: insertError } = await supabase
        .from('market_audits')
        .insert({
          local_id: auditData.local_id,
          empresa_id: auditData.empresa_id,
          usuario_id: auditData.usuario_id,
          data_auditoria: auditData.data_auditoria,
          total_vendido: auditData.total_vendido,
          total_itens: auditData.total_itens,
          total_itens_conferidos: auditData.total_itens_conferidos,
          divergencias: auditData.divergencias,
          observacao_geral: auditData.observacao_geral,
          status_auditoria: auditData.status_auditoria,
          data_criacao: auditData.data_criacao,
          vendas_data: auditData.vendas_data,
          conferencias_data: auditData.conferencias_data
        })
        .select()
        .single();

      if (insertError) {
        console.error('[useFinalizarVisitaCompleto] Supabase insert error:', insertError);
        throw insertError;
      }

      console.log('[useFinalizarVisitaCompleto] Supabase INSERT successful');
      console.log('[useFinalizarVisitaCompleto] response:', auditRecord);
      console.table(auditRecord);

      // Also update locais table with last audit info
      await supabase
        .from('locais')
        .update({
          data_auditoria: auditData.data_auditoria,
          usuario_auditoria: auditData.usuario_id,
          observacao_auditoria: auditData.observacao_geral
        })
        .eq('id', auditData.local_id);

      return auditRecord;
    } catch (err) {
      console.error('[useFinalizarVisitaCompleto] Error in saveToMarketAudits:', err);
      throw new Error('Falha ao salvar auditoria: ' + err.message);
    }
  }, []);

  /**
   * Mark all lots involved in session as audited and ready for PDV
   * @param {Array} loteIds - Array of lote IDs to activate
   * @returns {Number} Count of updated lots
   */
  const markLotsAsAudited = useCallback(async (loteIds) => {
    if (!loteIds || loteIds.length === 0) return 0;

    try {
      const { data: updatedLots, error: updateError } = await supabase
        .from('lotes')
        .update({
          ativo: true,
          liberado_pdv: true
        })
        .in('id', loteIds)
        .select('id');

      if (updateError) throw updateError;

      return updatedLots?.length || 0;
    } catch (err) {
      console.error('[useFinalizarVisitaCompleto] Error marking lots:', err);
      throw new Error('Falha ao ativar lotes: ' + err.message);
    }
  }, []);

  /**
   * Send audit report (placeholder for future email integration)
   * Currently logs the completion for admin tracking
   * @param {Object} auditRecord - The saved audit record
   * @param {Object} sessionData - Original session data
   */
  const sendAuditReport = useCallback(async (auditRecord, sessionData) => {
    try {
      // TODO: Future integration with email service
      return { success: true };
    } catch (err) {
      console.error('[useFinalizarVisitaCompleto] Error sending report:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Main orchestration function - finalizes complete visit audit
   * @param {Object} sessionData - Complete session data
   * @returns {Object} { success: boolean, auditRecord, error }
   */
  const finalizarVisita = useCallback(async (sessionData) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      console.log('[useFinalizarVisitaCompleto] finalizarVisita called');
      console.log('[useFinalizarVisitaCompleto] auditSessionData:', sessionData);
      console.log('[useFinalizarVisitaCompleto] vendas_data count:', sessionData?.vendas_data?.length);
      console.log('[useFinalizarVisitaCompleto] conferencias_data count:', sessionData?.conferencias_data?.length);
      console.table(sessionData);

      // Step 1: Collect and process session data
      const auditData = await collectSessionData(sessionData);

      // Step 2: Save to market_audits table
      const auditRecord = await saveToMarketAudits(auditData);

      // Step 3: Mark lots as audited (extract lote_ids from conference/sales records)
      const loteIds = [
        ...(sessionData.conferenceRecords || []).map(c => c.lote_id),
        ...(sessionData.salesRecords || []).map(s => s.lote_id)
      ].filter((id, index, self) => id && self.indexOf(id) === index); // unique IDs

      const lotsUpdated = await markLotsAsAudited(loteIds);

      // Step 4: Send audit report
      await sendAuditReport(auditRecord, sessionData);

      setSuccess(true);
      setLoading(false);

      toast({
        title: '✅ Auditoria Finalizada com Sucesso',
        description: 'Dados enviados para administrativo. Todos os lotes foram ativados para PDV.',
        duration: 5000,
      });

      return { 
        success: true, 
        auditRecord, 
        lotsUpdated,
        error: null 
      };

    } catch (err) {
      console.error('[useFinalizarVisitaCompleto] Error in finalizarVisita:', err);
      
      const errorMsg = err.message || 'Erro ao finalizar auditoria';
      setError(errorMsg);
      setLoading(false);

      toast({
        title: 'Erro ao Finalizar Auditoria',
        description: errorMsg,
        variant: 'destructive',
      });

      return { 
        success: false, 
        auditRecord: null,
        lotsUpdated: 0,
        error: errorMsg 
      };
    }
  }, [collectSessionData, saveToMarketAudits, markLotsAsAudited, sendAuditReport, toast]);

  return {
    loading,
    error,
    success,
    collectSessionData,
    saveToMarketAudits,
    markLotsAsAudited,
    sendAuditReport,
    finalizarVisita
  };
}