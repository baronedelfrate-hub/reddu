import { supabase } from '@/lib/customSupabaseClient';

export function useMovimentacaoValidation() {
  const validateMovimentacao = async (empresaId, formData) => {
    const { tipo, lote_id, local_origem_id, quantidade, observacao } = formData;
    const qtd = parseInt(quantidade, 10);

    if (isNaN(qtd) || qtd <= 0) {
      if (tipo !== 'ajuste') {
         return { isValid: false, error: "A quantidade deve ser maior que zero." };
      }
    }

    if (tipo === 'ajuste' && (!observacao || observacao.trim() === '')) {
      return { isValid: false, error: "A observação é obrigatória para ajustes manuais." };
    }

    if (tipo === 'transferencia' || tipo === 'baixa') {
      if (!local_origem_id || local_origem_id === 'none') {
        return { isValid: false, error: "Local de origem é obrigatório para esta operação." };
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('estoque_por_local')
          .select('quantidade_atual')
          .eq('empresa_id', empresaId)
          .eq('lote_id', lote_id)
          .eq('local_id', local_origem_id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          // PGRST116 is no rows returned, which means 0 stock
          throw fetchError;
        }

        const currentStock = data ? parseInt(data.quantidade_atual, 10) : 0;

        if (qtd > currentStock) {
          return { 
            isValid: false, 
            error: `Estoque insuficiente para ${tipo === 'baixa' ? 'baixa' : 'transferência'}. Disponível: ${currentStock}` 
          };
        }
      } catch (err) {
        console.error("Erro ao validar estoque:", err);
        return { isValid: false, error: "Erro ao validar o estoque atual. Tente novamente." };
      }
    }

    return { isValid: true, error: null };
  };

  return { validateMovimentacao };
}