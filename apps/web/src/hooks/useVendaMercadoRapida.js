import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { recordMarketplaceSale } from '@/services/salesService';

/**
 * Retry utility with exponential backoff
 * Delays: 500ms → 1000ms → 2000ms (max 3 attempts)
 */
async function retryWithBackoff(operation, operationName, maxAttempts = 3) {
  const delays = [500, 1000, 2000];
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[useVendaMercadoRapida] Retry attempt ${attempt}/${maxAttempts} for ${operationName}, delay: ${attempt > 1 ? delays[attempt - 2] : 0}ms`);
      
      const result = await operation();
      
      console.log(`[useVendaMercadoRapida] ${operationName} succeeded on attempt ${attempt}`);
      return result;
      
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      
      if (isLastAttempt) {
        console.error(`[useVendaMercadoRapida] ${operationName} failed after ${maxAttempts} attempts`);
        throw error;
      }
      
      const delayMs = delays[attempt - 1];
      console.warn(`[useVendaMercadoRapida] Retry attempt ${attempt}/${maxAttempts} for ${operationName} failed, retrying in ${delayMs}ms...`, error);
      
      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export function useVendaMercadoRapida() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const registrarVendaRapida = async ({
    lote_id,
    produto_id,
    mercado_id,
    quantidade,
    preco,
    tipo_lote,
    numero_lote
  }) => {
    if (!empresaId) {
      toast({
        title: 'Erro de Autenticação',
        description: 'Empresa não identificada. Faça login novamente.',
        variant: 'destructive',
      });
      return { success: false, error: 'Empresa não identificada' };
    }

    // Validation
    if (!lote_id || !produto_id || !mercado_id) {
      toast({
        title: 'Dados Incompletos',
        description: 'Informações do lote ou mercado não foram fornecidas.',
        variant: 'destructive',
      });
      return { success: false, error: 'Dados incompletos' };
    }

    if (quantidade <= 0 || isNaN(quantidade)) {
      toast({
        title: 'Quantidade Inválida',
        description: 'A quantidade deve ser maior que zero.',
        variant: 'destructive',
      });
      return { success: false, error: 'Quantidade inválida' };
    }

    if (preco <= 0 || isNaN(preco)) {
      toast({
        title: 'Preço Inválido',
        description: 'O preço deve ser maior que zero.',
        variant: 'destructive',
      });
      return { success: false, error: 'Preço inválido' };
    }

    setIsProcessing(true);

    try {
      console.log('[useVendaMercadoRapida] ===== STARTING SALE CREATION =====');
      
      // STEP 1: Verify lote stock availability WITH RETRY
      console.log('[useVendaMercadoRapida] Starting retry for lote verification');
      
      let loteData;
      try {
        loteData = await retryWithBackoff(
          async () => {
            const { data, error } = await supabase
              .from('lotes')
              .select('quantidade')
              .eq('id', lote_id)
              .single();

            if (error) throw error;
            return data;
          },
          'lote verification'
        );
      } catch (error) {
        const isNetworkError = error.message?.includes('fetch') || 
                               error.message?.includes('network') ||
                               error.name === 'TypeError';
        
        if (isNetworkError) {
          throw new Error('Erro de conexão ao verificar lote. Tente novamente.');
        }
        throw new Error(`Erro ao verificar lote: ${error.message}`);
      }

      if (!loteData || loteData.quantidade < quantidade) {
        throw new Error(
          `Quantidade insuficiente. Disponível: ${loteData?.quantidade || 0}, Solicitado: ${quantidade}`
        );
      }

      // CRITICAL: Calculate totals with FULL PRECISION (no intermediate rounding)
      const subtotal = quantidade * preco;
      const totalFinal = subtotal;

      console.log('[useVendaMercadoRapida] Financial calculation:', {
        quantidade,
        preco,
        subtotal,
        totalFinal
      });

      // STEP 2: Get mercado name
      const { data: mercadoData, error: mercadoError } = await supabase
        .from('locais')
        .select('nome')
        .eq('id', mercado_id)
        .single();

      if (mercadoError) {
        throw new Error(`Erro ao buscar mercado: ${mercadoError.message}`);
      }

      const mercadoNome = mercadoData?.nome || 'Mercado Desconhecido';

      // STEP 3: Create sale record via salesService WITH RETRY
      console.log('[useVendaMercadoRapida] Starting retry for sale creation');
      
      let venda_id, cliente_referencia, canal_venda;
      try {
        const saleResult = await retryWithBackoff(
          async () => {
            return await recordMarketplaceSale(
              empresaId,
              mercado_id,
              mercadoNome,
              { total_final: totalFinal },
              { forma_pagamento: 'nao_informado' },
              {
                status: 'PENDENTE',
                financeiro_baixado: false,
                data_venda: new Date().toISOString()
              }
            );
          },
          'sale creation'
        );
        
        venda_id = saleResult.venda_id;
        cliente_referencia = saleResult.cliente_referencia;
        canal_venda = saleResult.canal_venda;
        
      } catch (error) {
        const isNetworkError = error.message?.includes('fetch') || 
                               error.message?.includes('network') ||
                               error.name === 'TypeError';
        
        if (isNetworkError) {
          throw new Error('Erro de conexão ao criar venda. Tente novamente.');
        }
        throw new Error(`Erro ao criar venda: ${error.message}`);
      }

      console.log('[useVendaMercadoRapida] Sale record created:', {
        venda_id,
        cliente_referencia,
        canal_venda,
        status: 'PENDENTE',
        financeiro_baixado: false
      });

      const dataMovimentacao = new Date().toISOString();

      // STEP 4: Insert movimentacao WITH RETRY
      console.log('[useVendaMercadoRapida] Starting retry for movimentacao creation');
      
      let movimentacaoData;
      try {
        movimentacaoData = await retryWithBackoff(
          async () => {
            const { data, error } = await supabase
              .from('movimentacoes')
              .insert({
                empresa_id: empresaId,
                tipo: 'venda',
                produto_id: produto_id,
                lote_id: lote_id,
                local_origem_id: mercado_id,
                quantidade: quantidade,
                data_movimentacao: dataMovimentacao,
                observacao: `Venda Rápida - Operação Mercado (Lote: ${numero_lote})`,
                venda_id: venda_id,
                canal_venda: canal_venda,
                cliente_referencia: cliente_referencia,
                forma_pagamento: 'nao_informado',
                status: 'PENDENTE',
                financeiro_baixado: false,
                valor_unitario: preco,
                subtotal: subtotal,
                total_final: totalFinal,
                tipo_lote: tipo_lote
              })
              .select()
              .single();

            if (error) throw error;
            return data;
          },
          'movimentacao creation'
        );
      } catch (error) {
        const isNetworkError = error.message?.includes('fetch') || 
                               error.message?.includes('network') ||
                               error.name === 'TypeError';
        
        if (isNetworkError) {
          throw new Error('Erro de conexão ao registrar movimentação. Tente novamente.');
        }
        throw new Error(`Erro ao registrar movimentação: ${error.message}`);
      }

      console.log('[useVendaMercadoRapida] Movimentação created successfully:', movimentacaoData);

      // STEP 5: Update lote quantity WITH RETRY
      console.log('[useVendaMercadoRapida] Starting retry for lote update');
      
      try {
        await retryWithBackoff(
          async () => {
            const { error } = await supabase
              .from('lotes')
              .update({ quantidade: loteData.quantidade - quantidade })
              .eq('id', lote_id);

            if (error) throw error;
            return { success: true };
          },
          'lote update'
        );
      } catch (error) {
        const isNetworkError = error.message?.includes('fetch') || 
                               error.message?.includes('network') ||
                               error.name === 'TypeError';
        
        if (isNetworkError) {
          throw new Error('Erro de conexão ao atualizar estoque. Tente novamente.');
        }
        throw new Error(`Erro ao atualizar estoque: ${error.message}`);
      }

      console.log('[useVendaMercadoRapida] Lote quantity updated successfully');
      console.log('[useVendaMercadoRapida] ===== SALE CREATION COMPLETED =====');

      // CRITICAL: Return complete sale data structure for callback
      const saleResult = {
        success: true,
        movimentacao: {
          id: movimentacaoData.id,
          produto_id: produto_id,
          lote_id: lote_id,
          mercado_id: mercado_id,
          usuario_id: currentUser?.id || null,
          quantidade: quantidade,
          valor_unitario: preco,
          subtotal: subtotal,
          total_final: totalFinal,
          data_movimentacao: dataMovimentacao,
          venda_id: venda_id,
          cliente_referencia: cliente_referencia,
          canal_venda: canal_venda,
          status: 'PENDENTE',
          financeiro_baixado: false
        }
      };

      console.log('[useVendaMercadoRapida] Returning sale result:', saleResult);

      return saleResult;

    } catch (error) {
      console.error('[useVendaMercadoRapida] ===== ERROR DURING SALE CREATION =====');
      console.error('[useVendaMercadoRapida] Error details:', error);
      
      // Check if this is a user-friendly retry-exhausted error
      const isRetryError = error.message?.includes('Erro de conexão') || 
                          error.message?.includes('Tente novamente');
      
      // Show appropriate toast message
      toast({
        title: isRetryError ? 'Erro de Conexão' : 'Erro ao Registrar Venda',
        description: error.message || 'Ocorreu um erro inesperado. Tente novamente.',
        variant: 'destructive',
      });

      return { success: false, error: error.message };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    registrarVendaRapida,
  };
}