import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useCaixaManagement() {
  const [caixaState, setCaixaState] = useState({
    caixaAberto: null,
    loading: false,
    error: null,
    maxRetriesExceeded: false
  });

  const verificarCaixaAberto = async (empresaId, usuarioId) => {
    console.log('DEBUG [useCaixaManagement]: Iniciando verificarCaixaAberto', { empresaId, usuarioId });
    
    if (!empresaId || !usuarioId) {
      console.warn('DEBUG [useCaixaManagement]: Usuário não autenticado ou dados ausentes.');
      setCaixaState({ caixaAberto: null, loading: false, error: 'Usuário não autenticado.', maxRetriesExceeded: false });
      return null; 
    }

    setCaixaState(prev => ({ ...prev, loading: true, error: null, maxRetriesExceeded: false }));

    let attempts = 0;
    const maxAttempts = 3;
    const timeoutMs = 10000;

    const fetchWithTimeout = async (promise, ms) => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms)
      );
      return Promise.race([promise, timeoutPromise]);
    };

    while (attempts < maxAttempts) {
      attempts++;
      try {
        console.log(`DEBUG [useCaixaManagement]: Tentativa ${attempts}/${maxAttempts} de buscar caixa...`);
        
        let fetchResult = await fetchWithTimeout(
          supabase.rpc('get_caixa_aberto', {
            p_empresa_id: empresaId,
            p_usuario_id: usuarioId
          }),
          timeoutMs
        );

        let data = fetchResult.data;
        let error = fetchResult.error;

        if (error) {
          console.warn(`DEBUG [useCaixaManagement]: Falha no RPC (Tentativa ${attempts}):`, error.message);
          console.log('DEBUG [useCaixaManagement]: Tentando query direta (fallback)...');
          
          const fallbackResult = await fetchWithTimeout(
            supabase.from('caixas')
              .select('id, valor_inicial, data_abertura, observacao')
              .eq('empresa_id', empresaId)
              .eq('usuario_id', usuarioId)
              .eq('status', 'aberto')
              .order('data_abertura', { ascending: false })
              .limit(1),
            timeoutMs
          );

          if (fallbackResult.error) {
            throw fallbackResult.error;
          }
          data = fallbackResult.data;
        }

        if (data && data.length > 0) {
          const caixaData = data[0];
          console.log('DEBUG [useCaixaManagement]: Caixa aberto encontrado:', caixaData);
          if (caixaData.valor_inicial) {
            caixaData.valor_inicial = parseFloat(caixaData.valor_inicial);
          }
          setCaixaState({ caixaAberto: caixaData, loading: false, error: null, maxRetriesExceeded: false });
          return caixaData;
        }

        console.log('DEBUG [useCaixaManagement]: Nenhum caixa aberto encontrado.');
        setCaixaState({ caixaAberto: null, loading: false, error: null, maxRetriesExceeded: false });
        return null;

      } catch (err) {
        console.error(`DEBUG [useCaixaManagement]: Erro na tentativa ${attempts}:`, err.message);
        
        if (attempts >= maxAttempts) {
          console.error('DEBUG [useCaixaManagement]: Máximo de tentativas excedido.');
          const finalErrorMsg = err.message === 'Timeout' ? 'Tempo de limite excedido (10s).' : err.message;
          setCaixaState({ 
            caixaAberto: null, 
            loading: false, 
            error: `Falha ao verificar caixa: ${finalErrorMsg}`, 
            maxRetriesExceeded: true 
          });
          return null;
        }

        // Exponential backoff: 1s, 2s...
        const backoffTime = 1000 * Math.pow(2, attempts - 1);
        console.log(`DEBUG [useCaixaManagement]: Aguardando ${backoffTime}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    
    return null;
  };

  const getCaixaAberto = async (empresaId, usuarioId) => {
    return verificarCaixaAberto(empresaId, usuarioId);
  };

  const abrirCaixa = async (empresaId, usuarioId, valorInicial, observacao) => {
    const parsedValor = parseFloat(valorInicial);
    
    const { data, error } = await supabase.from('caixas').insert({
      empresa_id: empresaId,
      usuario_id: usuarioId,
      valor_inicial: isNaN(parsedValor) ? 0 : parsedValor,
      status: 'aberto',
      observacao: observacao,
      data_abertura: new Date().toISOString()
    }).select().single();

    if (error) throw error;
    setCaixaState({ caixaAberto: data, loading: false, error: null, maxRetriesExceeded: false });
    return data;
  };

  const fecharCaixa = async (caixaId, valorFinal, observacao) => {
    const parsedValor = parseFloat(valorFinal);

    const { data, error } = await supabase.from('caixas').update({
      valor_final: isNaN(parsedValor) ? 0 : parsedValor,
      status: 'fechado',
      observacao: observacao,
      data_fechamento: new Date().toISOString()
    }).eq('id', caixaId).select().single();

    if (error) throw error;
    setCaixaState({ caixaAberto: null, loading: false, error: null, maxRetriesExceeded: false });
    return data;
  };

  const calcularResumoCaixa = async (caixaId) => {
    try {
      const { data, error } = await supabase.rpc('calcular_resumo_vendas', {
        p_caixa_id: caixaId
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('DEBUG [useCaixaManagement]: Exceção capturada em calcularResumoCaixa:', err);
      throw err;
    }
  };

  return {
    caixaState,
    verificarCaixaAberto,
    getCaixaAberto,
    abrirCaixa,
    fecharCaixa,
    calcularResumoCaixa
  };
}