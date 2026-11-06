// Webhook da InfinitePay: avisa quando um pagamento é aprovado (a URL vai junto com cada link criado).
// Atende DOIS tipos de cobrança: pedidos do cardápio (order_nsu = id do pedido) e a mensalidade
// do Reddu (order_nsu = id da linha em reddu_mensalidades).
// Deploy com Verify JWT DESLIGADO (a InfinitePay chama sem login).
// SEGURANÇA: o webhook não tem assinatura, então NÃO confiamos no conteúdo. Ele só serve de
// "gatilho": confirmamos de verdade com payment_check e só então damos baixa, e só se o valor
// pago bater com o valor da cobrança no banco.
// Responde 200 rápido; devolve 400 só quando vale a pena a InfinitePay tentar de novo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECK = 'https://api.checkout.infinitepay.io/payment_check';
const HANDLE_PADRAO = 'roberto-barone-del'; // InfiniteTag da Reddu (mensalidade)

async function conferir(handle: string, orderNsu: string, b: any) {
  const body: Record<string, string> = { handle, order_nsu: orderNsu };
  if (b?.transaction_nsu) body.transaction_nsu = String(b.transaction_nsu);
  if (b?.invoice_slug) body.slug = String(b.invoice_slug);
  const r = await fetch(CHECK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => null);
  return { r, d, body };
}

Deno.serve(async (req) => {
  try {
    const b = await req.json().catch(() => null);
    const orderNsu = b?.order_nsu;
    if (!orderNsu || !UUID.test(String(orderNsu))) return ok({ ok: true, skipped: 'order_nsu inválido' });

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // ── 1) pedido do cardápio ────────────────────────────────────────────────
    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, total, status_pagamento').eq('id', orderNsu).maybeSingle();

    if (pedido) {
      if (pedido.status_pagamento === 'pago') return ok({ ok: true, skipped: 'já estava pago' });

      const { data: config } = await svc.from('cardapio_pagamento_config')
        .select('provider, merchant_id').eq('empresa_id', pedido.empresa_id).maybeSingle();
      const handle = (config?.merchant_id || '').trim().replace(/^\$/, '');
      if (!handle || config?.provider !== 'infinitepay') return ok({ ok: true, skipped: 'loja sem InfinitePay' });

      const { r, d, body } = await conferir(handle, pedido.id, b);
      if (!r.ok) {
        console.error('[infinitepay-webhook] payment_check falhou:', r.status, JSON.stringify(d));
        return ok({ ok: false, error: 'falha ao confirmar' }, 400); // InfinitePay tenta de novo
      }

      const centavos = Math.round(Number(pedido.total) * 100);
      if (d?.paid !== true) return ok({ ok: true, skipped: 'ainda não pago' });
      if (Number(d?.amount) !== centavos) {
        console.error('[infinitepay-webhook] valor não confere:', JSON.stringify(d), 'esperado', centavos);
        return ok({ ok: true, skipped: 'valor não confere' });
      }

      await svc.from('pedidos_cardapio').update({
        status_pagamento: 'pago',
        pago_em: new Date().toISOString(),
        forma_pagamento_online: (d?.capture_method || b.capture_method) === 'credit_card' ? 'cartao' : 'pix',
        infinitepay_transaction_nsu: body.transaction_nsu || null,
      }).eq('id', pedido.id).neq('status_pagamento', 'pago');

      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-confirmacao-pedido`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedido.id }),
      }).catch((e) => console.error('[infinitepay-webhook] erro ao notificar pedido:', e));

      return ok({ ok: true, status: 'pago' });
    }

    // ── 2) mensalidade do Reddu ──────────────────────────────────────────────
    const { data: mens } = await svc.from('reddu_mensalidades')
      .select('id, valor, status').eq('id', orderNsu).maybeSingle();
    if (!mens) return ok({ ok: true, skipped: 'cobrança não encontrada' });
    if (mens.status === 'pago') return ok({ ok: true, skipped: 'já estava pago' });

    const handleReddu = (Deno.env.get('REDDU_INFINITEPAY_HANDLE') || HANDLE_PADRAO).trim().replace(/^\$/, '');
    const { r, d, body } = await conferir(handleReddu, mens.id, b);
    if (!r.ok) {
      console.error('[infinitepay-webhook] payment_check (mensalidade) falhou:', r.status, JSON.stringify(d));
      return ok({ ok: false, error: 'falha ao confirmar' }, 400);
    }
    if (d?.paid !== true) return ok({ ok: true, skipped: 'ainda não pago' });
    if (Number(d?.amount) !== Math.round(Number(mens.valor) * 100)) {
      console.error('[infinitepay-webhook] valor da mensalidade não confere:', JSON.stringify(d));
      return ok({ ok: true, skipped: 'valor não confere' });
    }
    await svc.from('reddu_mensalidades').update({
      status: 'pago', pago_em: new Date().toISOString(), ip_transaction_nsu: body.transaction_nsu || null,
    }).eq('id', mens.id).neq('status', 'pago');
    return ok({ ok: true, status: 'mensalidade paga' });
  } catch (e) {
    console.error('[infinitepay-webhook] erro:', e);
    return ok({ ok: false, error: (e as Error).message }, 400);
  }
});
