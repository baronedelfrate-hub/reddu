// Webhook público da Cielo. A gente já manda a URL desse webhook (NotifyUrl)
// junto com a criação de cada cobrança PIX, então a Cielo chama esse
// endpoint sozinha quando o status do pagamento muda - sem depender do
// cliente ficar com a tela aberta esperando.
//
// SEGURANÇA: nunca confiamos no conteúdo do webhook em si (poderia ser
// forjado). Ele só nos diz "olha o pagamento X" - a gente sempre confirma
// o status de verdade consultando a API de query da Cielo com as
// credenciais guardadas do restaurante dono daquele pedido.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const API_QUERY_BASE = {
  sandbox: 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
  producao: 'https://apiquery.cieloecommerce.cielo.com.br',
};

function mapStatus(cieloStatus: number): 'pendente' | 'pago' | 'falhou' {
  if (cieloStatus === 2) return 'pago';
  if ([3, 10, 13].includes(cieloStatus)) return 'falhou';
  return 'pendente';
}

Deno.serve(async (req) => {
  try {
    let paymentId: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      paymentId = body?.PaymentId || body?.Payment?.PaymentId || null;
    }
    if (!paymentId) {
      const url = new URL(req.url);
      paymentId = url.searchParams.get('PaymentId') || url.searchParams.get('paymentId');
    }

    if (!paymentId) {
      return jsonResponse({ ok: true, skipped: 'sem payment id' });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: pedido } = await serviceClient
      .from('pedidos_cardapio')
      .select('id, empresa_id, status_pagamento, cielo_payment_id')
      .eq('cielo_payment_id', paymentId)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ ok: true, skipped: 'pedido não encontrado pra esse payment id' });
    }

    if (pedido.status_pagamento === 'pago') {
      return jsonResponse({ ok: true, skipped: 'já estava pago' });
    }

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('ambiente, merchant_id, merchant_key, provider')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config?.merchant_id || !config?.merchant_key || config.provider !== 'cielo') {
      return jsonResponse({ ok: true, skipped: 'restaurante sem Cielo configurada' });
    }

    const apiBase = API_QUERY_BASE[config.ambiente] || API_QUERY_BASE.sandbox;

    const cieloResp = await fetch(`${apiBase}/1/sales/${paymentId}`, {
      method: 'GET',
      headers: { MerchantId: config.merchant_id, MerchantKey: config.merchant_key },
    });
    const cieloData = await cieloResp.json().catch(() => null);

    if (!cieloResp.ok || !cieloData?.Payment) {
      console.error('[cielo-webhook] falha ao consultar pagamento:', cieloResp.status, JSON.stringify(cieloData));
      return jsonResponse({ ok: true, skipped: 'falha ao consultar Cielo' });
    }

    const novoStatus = mapStatus(cieloData.Payment.Status);

    if (novoStatus === pedido.status_pagamento) {
      return jsonResponse({ ok: true, skipped: 'status sem mudança' });
    }

    await serviceClient
      .from('pedidos_cardapio')
      .update({
        status_pagamento: novoStatus,
        pago_em: novoStatus === 'pago' ? new Date().toISOString() : null,
      })
      .eq('id', pedido.id);

    if (novoStatus === 'pago') {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-confirmacao-pedido`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedido.id }),
      }).catch((e) => console.error('[cielo-webhook] erro ao notificar pedido:', e));
    }

    return jsonResponse({ ok: true, status: novoStatus });
  } catch (error) {
    console.error('[cielo-webhook] erro:', error);
    return jsonResponse({ ok: false, error: error.message || 'Erro inesperado.' });
  }
});
