import { supabase } from '@/lib/customSupabaseClient';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';

// Serviço pequeno e compartilhado pra registrar/editar a forma de pagamento
// de uma venda ligada a um pedido do cardápio digital (seja ele criado pelo
// PDV Pedidos Balcão ou já existente vindo do cardápio público). Só grava
// metadados (qual método, se já foi recebido) na linha de `vendas` que a
// rpc_criar_pedido_cardapio já criou — nenhum total/desconto é recalculado
// aqui, então não mexe em nenhuma matemática financeira já existente.
export const pagamentoCardapioService = {
  // payments: [{ method, value }] — pode ter mais de um (pagamento múltiplo).
  // financeiroBaixado: true quando o dinheiro já foi efetivamente recebido.
  async registrarPagamento(vendaId, { payments = [], cpfCliente = null, financeiroBaixado, observacaoPagamento = null }) {
    if (!vendaId) throw new Error('vendaId é obrigatório.');

    const formaPagamentoFinal = payments.length > 1
      ? 'Múltiplo'
      : validateAndFixPaymentData(payments[0]?.method || 'nao_informado');

    const { error } = await supabase
      .from('vendas')
      .update({
        forma_pagamento: formaPagamentoFinal,
        forma_pagamento_detalhes: payments,
        financeiro_baixado: !!financeiroBaixado,
        cpf_cliente: cpfCliente || null,
      })
      .eq('id', vendaId);

    if (error) throw error;
    return { forma_pagamento: formaPagamentoFinal };
  },

  // Pra registrar só a expectativa de pagamento (ainda não recebido), sem
  // valor(es) exatos ainda — usado quando o pedido sai como "paga na
  // entrega/retirada".
  async registrarPagamentoPrevisto(vendaId, { metodoEsperado, cpfCliente = null }) {
    if (!vendaId) throw new Error('vendaId é obrigatório.');
    const formaPagamentoFinal = validateAndFixPaymentData(metodoEsperado || 'nao_informado');

    const { error } = await supabase
      .from('vendas')
      .update({
        forma_pagamento: formaPagamentoFinal,
        forma_pagamento_detalhes: [{ method: metodoEsperado, esperado: true }],
        financeiro_baixado: false,
        cpf_cliente: cpfCliente || null,
      })
      .eq('id', vendaId);

    if (error) throw error;
    return { forma_pagamento: formaPagamentoFinal };
  },

  async buscarVendaDoPedido(pedidoId) {
    const { data, error } = await supabase
      .from('pedidos_cardapio')
      .select('venda_id')
      .eq('id', pedidoId)
      .maybeSingle();
    if (error) throw error;
    return data?.venda_id || null;
  },
};