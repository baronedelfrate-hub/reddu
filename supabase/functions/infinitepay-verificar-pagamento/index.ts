// Confere se um pedido já foi pago na InfinitePay. Chamada pela tela pública:
// - quando o cliente volta da página da InfinitePay (com transaction_nsu e slug da URL de retorno);
// - em polling enquanto aguarda; e ao reabrir um pedido pendente em "Meus Pedidos".
// Deploy com Verify JWT LIGADO.
// SEGURANÇA: nunca confia no que o navegador diz — sempre pergunta à InfinitePay (payment_check)
// e só marca "pago" se ela confirmar E o valor bater com o total do pedido no banco.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id, transaction_nsu, slug } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, total, status_pagamento, infinitepay_link')
      .eq('id', pedido_id).maybeSingle();
    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

    if (pedido.status_pagamento === 'pago') return json({ success: true, status: 'pago', numeroPedido: pedido.numero_pedido, total: pedido.total });
    if (!pedido.infinitepay_link) return json({ success: true, status: pedido.status_pagamento });

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, merchant_id').eq('empresa_id', pedido.empresa_id).maybeSingle();
    const handle = (config?.merchant_id || '').trim().replace(/^\$/, '');
    if (!handle || config?.provider !== 'infinitepay') return json({ success: true, status: pedido.status_pagamento });

    const body: Record<string, string> = { handle, order_nsu: pedido.id };
    if (typeof transaction_nsu === 'string' && transaction_nsu) body.transaction_nsu = transaction_nsu;
    if (typeof slug === 'string' && slug) body.slug = slug;

    const r = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);

    const centavos = Math.round(Number(pedido.total) * 100);
    const pago = r.ok && d?.paid === true && Number(d?.amount) === centavos;

    if (r.ok && d?.paid === true && !pago) {
      console.error('[infinitepay-verificar-pagamento] valor não confere:', JSON.stringify(d), 'esperado', centavos);
    }

    if (pago) {
      await svc.from('pedidos_cardapio').update({
        status_pagamento: 'pago',
        pago_em: new Date().toISOString(),
        forma_pagamento_online: d?.capture_method === 'credit_card' ? 'cartao' : 'pix',
        infinitepay_transaction_nsu: body.transaction_nsu || null,
      }).eq('id', pedido.id).neq('status_pagamento', 'pago');

      // A notificação por WhatsApp é disparada pela própria tela ao ver "pago" (e pelo webhook).

      return json({ success: true, status: 'pago', numeroPedido: pedido.numero_pedido, total: pedido.total });
    }

    return json({ success: true, status: 'pendente', numeroPedido: pedido.numero_pedido, total: pedido.total, url: pedido.infinitepay_link });
  } catch (e) {
    console.error('[infinitepay-verificar-pagamento] erro:', e);
    return json({ success: false, error: (e as Error).message || 'Erro inesperado.' }, 500);
  }
});
