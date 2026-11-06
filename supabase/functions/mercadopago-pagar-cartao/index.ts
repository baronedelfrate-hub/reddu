// Cobra um pedido do cardápio no CARTÃO DE CRÉDITO via Mercado Pago.
// O navegador NUNCA manda número de cartão pra cá: o Card Payment Brick do
// Mercado Pago (iframe deles) gera um "token" de uso único, e é só ele que chega.
// O VALOR é sempre lido do pedido no banco — nunca do navegador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mapStatus(mpStatus: string): 'pendente' | 'pago' | 'falhou' {
  if (mpStatus === 'approved') return 'pago';
  if (['rejected', 'cancelled'].includes(mpStatus)) return 'falhou';
  return 'pendente'; // pending / in_process / authorized
}

// Mensagens amigáveis para os motivos de recusa mais comuns.
function motivoRecusa(detalhe: string | undefined): string {
  switch (detalhe) {
    case 'cc_rejected_insufficient_amount': return 'Saldo/limite insuficiente no cartão.';
    case 'cc_rejected_bad_filled_card_number': return 'Número do cartão incorreto.';
    case 'cc_rejected_bad_filled_date': return 'Validade do cartão incorreta.';
    case 'cc_rejected_bad_filled_security_code': return 'Código de segurança incorreto.';
    case 'cc_rejected_bad_filled_other': return 'Confira os dados do cartão.';
    case 'cc_rejected_call_for_authorize': return 'O banco pede autorização: ligue para o banco e tente de novo.';
    case 'cc_rejected_card_disabled': return 'Cartão desabilitado. Ative-o com o banco ou use outro.';
    case 'cc_rejected_high_risk': return 'Pagamento recusado por segurança. Tente outra forma de pagamento.';
    case 'cc_rejected_duplicated_payment': return 'Pagamento duplicado: esse pedido já foi cobrado.';
    default: return 'O cartão foi recusado. Tente outro cartão ou pague com PIX.';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { pedido_id, token, payment_method_id, issuer_id, installments, payer, preparar } = await req.json();
    if (!pedido_id) return jsonResponse({ success: false, error: 'Pedido não informado.' }, 400);
    if (!preparar && (!token || !payment_method_id)) {
      return jsonResponse({ success: false, error: 'Dados do cartão incompletos.' }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: pedido } = await serviceClient
      .from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, cliente_nome, cliente_telefone, total, status, status_pagamento')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) return jsonResponse({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return jsonResponse({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return jsonResponse({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('provider, access_token, cartao_ativo, cartao_max_parcelas')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config || config.provider !== 'mercadopago' || !config.cartao_ativo || !config.access_token) {
      return jsonResponse({ success: false, error: 'Pagamento por cartão não está configurado pra essa loja.' }, 400);
    }

    // "preparar": marca o pedido como "pagamento online pendente (cartão)" assim que o cliente
    // chega na tela do cartão — a loja já enxerga o aviso, e o pedido não passa por pago sem estar.
    if (preparar) {
      await serviceClient
        .from('pedidos_cardapio')
        .update({ forma_pagamento_online: 'cartao', status_pagamento: 'pendente' })
        .eq('id', pedido.id);
      return jsonResponse({ success: true, status: 'pendente', numeroPedido: pedido.numero_pedido, total: pedido.total });
    }

    const maxParcelas = Math.max(1, Math.min(12, Number(config.cartao_max_parcelas) || 1));
    const parcelas = Math.max(1, Math.min(maxParcelas, Number(installments) || 1));
    const valor = Math.round(Number(pedido.total) * 100) / 100;
    const nomeCompleto = (pedido.cliente_nome || 'Cliente').trim();
    const [primeiroNome, ...resto] = nomeCompleto.split(' ');

    const email = payer?.email && /^\S+@\S+\.\S+$/.test(payer.email)
      ? payer.email
      : `cliente${(pedido.cliente_telefone || '').replace(/\D/g, '') || 'pedido'}@pedido-cardapio.com`;

    const corpo: Record<string, unknown> = {
      transaction_amount: valor,
      token,
      description: `Pedido #${pedido.numero_pedido} - Cardápio Digital`,
      installments: parcelas,
      payment_method_id,
      external_reference: pedido.id,
      payer: {
        email,
        first_name: primeiroNome,
        last_name: resto.join(' ') || 'Cardapio',
        ...(payer?.identification?.type && payer?.identification?.number
          ? { identification: { type: payer.identification.type, number: String(payer.identification.number) } }
          : {}),
      },
    };
    if (issuer_id) corpo.issuer_id = Number(issuer_id);

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
        // Um token é de uso único: a chave por token evita cobrar em dobro se o cliente clicar 2x.
        'X-Idempotency-Key': `cartao-${pedido.id}-${String(token).slice(0, 40)}`,
      },
      body: JSON.stringify(corpo),
    });
    const mpData = await mpResp.json().catch(() => null);

    if (!mpData?.id || !mpData?.status) {
      console.error('[mercadopago-pagar-cartao] falha no Mercado Pago:', mpResp.status, JSON.stringify(mpData));
      return jsonResponse({ success: false, error: 'Não foi possível processar o cartão. Tente novamente.' }, 502);
    }

    const novoStatus = mapStatus(mpData.status);

    await serviceClient
      .from('pedidos_cardapio')
      .update({
        forma_pagamento_online: 'cartao',
        status_pagamento: novoStatus,
        mercadopago_payment_id: String(mpData.id),
        pago_em: novoStatus === 'pago' ? new Date().toISOString() : null,
      })
      .eq('id', pedido.id);

    if (novoStatus === 'pago') {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-confirmacao-pedido`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedido.id }),
      }).catch((e) => console.error('[mercadopago-pagar-cartao] erro ao notificar pedido:', e));
    }

    return jsonResponse({
      success: true,
      status: novoStatus,
      paymentId: mpData.id,
      numeroPedido: pedido.numero_pedido,
      total: pedido.total,
      motivo: novoStatus === 'falhou' ? motivoRecusa(mpData.status_detail) : null,
    });
  } catch (error) {
    console.error('[mercadopago-pagar-cartao] erro:', error);
    return jsonResponse({ success: false, error: (error as Error).message || 'Erro inesperado.' }, 500);
  }
});
