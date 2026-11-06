// Cria o link de pagamento da InfinitePay pra um pedido do cardápio.
// Deploy com Verify JWT LIGADO (a tela pública chama com a chave anon).
// A InfinitePay não usa token: a loja é identificada só pela InfiniteTag (handle),
// guardada em cardapio_pagamento_config.merchant_id. O VALOR vem sempre do pedido no banco.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const API = 'https://api.checkout.infinitepay.io/links';

// A documentação não mostra o formato da resposta: procura a URL nos nomes mais prováveis.
function acharUrl(d: any): string | null {
  if (!d || typeof d !== 'object') return null;
  const candidatos = [d.url, d.link, d.checkout_url, d.payment_url, d.invoice_url, d.checkout_link,
    d.data?.url, d.data?.link, d.data?.checkout_url];
  const achado = candidatos.find((v) => typeof v === 'string' && /^https?:\/\//.test(v));
  if (achado) return achado as string;
  for (const v of Object.values(d)) {
    if (typeof v === 'string' && /^https:\/\/\S+$/.test(v)) return v;
  }
  return null;
}

function telefoneE164(tel: string | null | undefined): string | null {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id, retorno_url } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, cliente_nome, cliente_telefone, total, status, status_pagamento, infinitepay_link')
      .eq('id', pedido_id).maybeSingle();

    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return json({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return json({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, merchant_id, pix_ativo, cartao_ativo')
      .eq('empresa_id', pedido.empresa_id).maybeSingle();

    const handle = (config?.merchant_id || '').trim().replace(/^\$/, '');
    if (!config || config.provider !== 'infinitepay' || !handle || !(config.pix_ativo || config.cartao_ativo)) {
      return json({ success: false, error: 'Pagamento online não está configurado pra essa loja.' }, 400);
    }

    // já existe link pra esse pedido: reaproveita (o valor do pedido não muda)
    if (pedido.infinitepay_link && pedido.status_pagamento === 'pendente') {
      return json({ success: true, url: pedido.infinitepay_link, reaproveitado: true });
    }

    const { data: empresa } = await svc.from('empresas').select('nome').eq('id', pedido.empresa_id).maybeSingle();
    const centavos = Math.round(Number(pedido.total) * 100);
    if (!(centavos > 0)) return json({ success: false, error: 'Valor do pedido inválido.' }, 400);

    const corpo: Record<string, unknown> = {
      handle,
      order_nsu: pedido.id,
      items: [{ quantity: 1, price: centavos, description: `Pedido #${pedido.numero_pedido} - ${empresa?.nome || 'Cardápio Digital'}` }],
      webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/infinitepay-webhook`,
    };
    if (typeof retorno_url === 'string' && /^https:\/\//.test(retorno_url)) corpo.redirect_url = retorno_url;
    const fone = telefoneE164(pedido.cliente_telefone);
    corpo.customer = { name: (pedido.cliente_nome || 'Cliente').trim(), ...(fone ? { phone_number: fone } : {}) };

    const resp = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await resp.json().catch(() => null);
    const url = acharUrl(dados);

    if (!resp.ok || !url) {
      console.error('[infinitepay-criar-pagamento] falha:', resp.status, JSON.stringify(dados));
      return json({ success: false, error: 'Não foi possível abrir o pagamento. Tente novamente.' }, 502);
    }

    await svc.from('pedidos_cardapio').update({
      forma_pagamento_online: 'pix', // ajustado pra o método real quando o pagamento é confirmado
      status_pagamento: 'pendente',
      infinitepay_link: url,
    }).eq('id', pedido.id);

    return json({ success: true, url });
  } catch (e) {
    console.error('[infinitepay-criar-pagamento] erro:', e);
    return json({ success: false, error: (e as Error).message || 'Erro inesperado.' }, 500);
  }
});
