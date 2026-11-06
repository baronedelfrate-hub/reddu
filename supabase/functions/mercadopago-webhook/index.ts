// Webhook público do Mercado Pago. Cada restaurante configura essa URL no
// próprio painel dele (Seu negócio > Configurações > Webhooks), então
// quando um PIX cai, o Mercado Pago avisa a gente na hora - sem depender
// do cliente ficar com a tela aberta esperando.
//
// SEGURANÇA: nunca confiamos no conteúdo do webhook em si (poderia ser
// forjado). Ele só nos diz "olha o pagamento X" - a gente sempre confirma
// o status de verdade consultando a API do Mercado Pago com o access_token
// guardado do restaurante dono daquele pedido.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mapStatus(mpStatus: string): 'pendente' | 'pago' | 'falhou' {
  if (mpStatus === 'approved') return 'pago';
  if (['rejected', 'cancelled'].includes(mpStatus)) return 'falhou';
  return 'pendente';
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let paymentId: string | null = url.searchParams.get('data.id') || url.searchParams.get('id');
    let tipo: string | null = url.searchParams.get('type') || url.searchParams.get('topic');

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (body) {
        tipo = body.type || body.topic || tipo;
        paymentId = body.data?.id ? String(body.data.id) : paymentId;
      }
    }

    if (tipo && tipo !== 'payment') {
      return jsonResponse({ ok: true, skipped: 'tipo não é payment' });
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
      .select('id, empresa_id, status_pagamento, mercadopago_payment_id')
      .eq('mercadopago_payment_id', paymentId)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ ok: true, skipped: 'pedido não encontrado pra esse payment id' });
    }

    if (pedido.status_pagamento === 'pago') {
      return jsonResponse({ ok: true, skipped: 'já estava pago' });
    }

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('access_token, provider')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config?.access_token || config.provider !== 'mercadopago') {
      return jsonResponse({ ok: true, skipped: 'restaurante sem Mercado Pago configurado' });
    }

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.access_token}` },
    });
    const mpData = await mpResp.json().catch(() => null);

    if (!mpResp.ok || !mpData?.status) {
      console.error('[mercadopago-webhook] falha ao consultar pagamento:', mpResp.status, JSON.stringify(mpData));
      return jsonResponse({ ok: true, skipped: 'falha ao consultar Mercado Pago' });
    }

    const novoStatus = mapStatus(mpData.status);

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
      }).catch((e) => console.error('[mercadopago-webhook] erro ao notificar pedido:', e));
    }

    return jsonResponse({ ok: true, status: novoStatus });
  } catch (error) {
    console.error('[mercadopago-webhook] erro:', error);
    return jsonResponse({ ok: false, error: error.message || 'Erro inesperado.' });
  }
});
