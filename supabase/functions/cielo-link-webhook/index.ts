// Webhook do Link de Pagamento da Cielo. O restaurante cola o endereço desta função, no site da
// Cielo, em Configurações da loja > "URL de Notificação" e "URL de Mudança de Status".
// Deploy com Verify JWT DESLIGADO (a Cielo chama sem login e NÃO dá pra pôr headers nem assinatura).
//
// SEGURANÇA: a notificação não tem autenticação, então NÃO confiamos no conteúdo. Ela só serve de
// "gatilho": identificamos o pedido pelo order_number (o OrderNumber que nós enviamos ao criar o
// link) e mandamos o cielo-link-verificar confirmar de verdade com a Cielo. Só ele dá baixa.
//
// Formato: POST application/x-www-form-urlencoded (a Cielo pode levar até 3 minutos para enviar,
// espera HTTP 200 em até 100 s e, se der erro, tenta de novo mais 3 vezes, a cada hora).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// OrderNumber que enviamos: R + dígitos + hex, só letras e números, até 20.
const ORDER_NUMBER = /^[A-Za-z0-9]{1,20}$/;

async function lerCampos(req: Request): Promise<Record<string, string>> {
  const tipo = req.headers.get('content-type') || '';
  const texto = await req.text();
  if (tipo.includes('application/json')) {
    try {
      const j = JSON.parse(texto);
      return {
        order_number: String(j?.order_number ?? j?.MerchantOrderNumber ?? j?.orderNumber ?? ''),
      };
    } catch (_e) { return {}; }
  }
  const p = new URLSearchParams(texto);
  return {
    order_number: p.get('order_number') ?? p.get('MerchantOrderNumber') ?? '',
  };
}

export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return ok({ ok: true, skipped: 'método' });

    const { order_number } = await lerCampos(req);
    if (!order_number || !ORDER_NUMBER.test(order_number)) return ok({ ok: true, skipped: 'order_number inválido' });

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const svc = createClient(url, key);

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, status_pagamento')
      .eq('cielo_link_order_number', order_number).maybeSingle();
    if (!pedido) return ok({ ok: true, skipped: 'pedido não encontrado' });
    if (pedido.status_pagamento === 'pago') return ok({ ok: true, skipped: 'já estava pago' });

    // quem confirma com a Cielo (e só ele dá baixa) é o cielo-link-verificar
    const resp = await fetch(`${url}/functions/v1/cielo-link-verificar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido_id: pedido.id }),
    });
    const dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados?.success) {
      console.error('[cielo-link-webhook] verificação falhou:', resp.status);
      return ok({ ok: false, error: 'falha ao confirmar' }, 500); // a Cielo tenta de novo mais tarde
    }

    if (dados.status === 'pago') {
      fetch(`${url}/functions/v1/enviar-confirmacao-pedido`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedido.id }),
      }).catch((e) => console.error('[cielo-link-webhook] erro ao notificar pedido:', e));
    }

    return ok({ ok: true, status: dados.status });
  } catch (e) {
    console.error('[cielo-link-webhook] erro:', e);
    return ok({ ok: false, error: (e as Error).message }, 500);
  }
}

Deno.serve(handler);
