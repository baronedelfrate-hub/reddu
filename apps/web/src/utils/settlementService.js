import { supabase } from '@/lib/customSupabaseClient';
import { isValidTipoLote } from './tipoLoteValidation';

export const normalizeFormaPagamento = (fp) => {
  if (!fp || fp === 'N/A') return 'nao_informado';
  
  const normalized = fp.toUpperCase().trim();
  if (normalized.includes('PIX')) return 'pix';
  if (normalized.includes('DINHEIRO')) return 'dinheiro';
  if (normalized.includes('CREDITO') || normalized.includes('CRÉDITO')) return 'cartao_credito';
  if (normalized.includes('DEBITO') || normalized.includes('DÉBITO')) return 'cartao_debito';
  if (normalized.includes('TRANSFERENCIA') || normalized.includes('TRANSFERÊNCIA')) return 'transferencia';
  if (normalized.includes('CHEQUE') || normalized.includes('PLATAFORMA')) return 'cheque';
  
  return 'outros';
};

export async function settlePendingSale({
  empresaId,
  vendaId: providedVendaId,
  movimentacaoId,
  dataBaixa,
  formaPagamento,
  observacao,
  valorLiquido,
  tipoLote // Explicitly receiving the original tipo_lote
}) {
  try {
    console.log(`[AUDIT] PRE-SETTLEMENT - Iniciando baixa para Movimentacao ID: ${movimentacaoId} | tipo_lote original fornecido: ${tipoLote}`);

    // Validação de segurança
    if (tipoLote && !isValidTipoLote(tipoLote)) {
      console.error(`[AUDIT] Falha de liquidação: tipo_lote inválido fornecido (${tipoLote}) para movId: ${movimentacaoId}`);
      throw new Error("Dados da movimentação inválidos (tipo de lote não reconhecido). O tipo deve ser 'bandeja', 'unitario' ou 'base'.");
    }

    let vendaId = providedVendaId;
    let finalTipoLote = tipoLote;
    
    // Fetch if missing vendaId or tipoLote to ensure we don't accidentally overwrite with nulls
    if (!vendaId || !finalTipoLote) {
      const { data: movData, error: fetchError } = await supabase
        .from('movimentacoes')
        .select('venda_id, tipo_lote')
        .eq('id', movimentacaoId)
        .eq('empresa_id', empresaId)
        .single();

      if (fetchError) throw fetchError;
      
      vendaId = vendaId || movData?.venda_id;
      finalTipoLote = finalTipoLote || movData?.tipo_lote;
      
      // Strict validation against database value
      if (!isValidTipoLote(finalTipoLote)) {
         console.error(`[AUDIT] Erro crítico: Movimentação no banco possui tipo_lote inválido: ${finalTipoLote}`);
         throw new Error("Não é possível baixar esta venda: Tipo de lote no banco de dados é inválido.");
      }
    }

    // A operação de baixa APENAS atualiza dados financeiros e de status.
    // Estamos passando o finalTipoLote EXPLICITAMENTE no update para garantir
    // que nenhuma trigger ou regra padrão do banco o sobrescreva para 'unitario'.
    const updates = {
      status: 'CONCILIADO',
      financeiro_baixado: true,
      data_baixa: dataBaixa,
      forma_pagamento: normalizeFormaPagamento(formaPagamento),
      tipo_lote: finalTipoLote // PRESERVAÇÃO EXPLÍCITA
    };
    
    if (observacao) {
      updates.observacoes = observacao;
    }
    
    if (valorLiquido !== undefined && valorLiquido !== null) {
      updates.total_final = valorLiquido;
    }

    console.log(`[AUDIT] Executando UPDATE no BD. Payload:`, updates);

    const { data: updatedMov, error: movError } = await supabase
      .from('movimentacoes')
      .update(updates)
      .eq('id', movimentacaoId)
      .eq('empresa_id', empresaId)
      .select('id, tipo_lote') // Select back the updated row to confirm preservation
      .single();

    if (movError) throw movError;
    
    // Confirm preservation after update
    console.log(`[AUDIT] POST-SETTLEMENT - Movimentacao ID: ${updatedMov.id} | tipo_lote preservado no banco: ${updatedMov.tipo_lote}`);
    
    if (updatedMov.tipo_lote !== finalTipoLote) {
      console.warn(`[AUDIT WARNING] O tipo_lote foi alterado no banco! Esperado: ${finalTipoLote}, Recebido: ${updatedMov.tipo_lote}`);
    }

    if (vendaId) {
      const vendasUpdates = {
        status: 'CONCILIADO',
        financeiro_baixado: true,
        data_baixa: dataBaixa
      };
      
      const { error: vendasError } = await supabase
        .from('vendas')
        .update(vendasUpdates)
        .eq('id', vendaId);
        
      if (vendasError) {
        console.error('Aviso: Falha ao sincronizar tabela vendas:', vendasError.message);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Erro na conciliação:', error);
    return { success: false, error: error.message };
  }
}