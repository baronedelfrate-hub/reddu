// Confere se um pedido já foi pago no Link de Pagamento da Cielo. Chamada:
//  - pela tela pública (a cada poucos segundos, e ao reabrir o pedido em "Meus Pedidos");
//  - pelo cielo-link-webhook, quando a Cielo avisa que algo mudou.
// Deploy com Verify JWT LIGADO.
//
// SEGURANÇA: nunca confia no que o navegador (ou o webhook) diz. Sempre pergunta à Cielo
// (GET /v1/products/{id}/payments com o token da loja) e só marca "pago" se existir uma
// tentativa com status "Paid" cujo valor cubra o total do pedido no banco. Em modo Produção,
// uma venda marcada como TESTE pela Cielo nunca vira paga.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const CIELO_API = 'https://cieloecommerce.cielo.com.br/api/public';

async function obterToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(`${CIELO_API}/v2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const dados = await resp.json().catch(() => null);
  if (!resp.ok || !dados?.access_token) {
    console.error('[cielo-link-verificar] falha ao obter token:', resp.status); // nunca loga credenciais
    throw new Error('TOKEN');
  }
  return dados.access_token as string;
}

const ehVerdadeiro = (v: unknown) => String(v ?? '').toLowerCase() === 'true';

// A consulta do pedido (link "self" da própria resposta da Cielo) diz se foi venda de teste.
// Só seguimos URLs da própria Cielo. Se o campo não vier, não dá pra afirmar nada: segue.
async function vendaEhDeTeste(href: unknown, token: string): Promise<boolean> {
  try {
    const url = new URL(String(href));
    if (url.protocol !== 'https:' || url.hostname !== 'cieloecommerce.cielo.com.br') return false;
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const d = await r.json().catch(() => null);
    return ehVerdadeiro(d?.test_transaction ?? d?.testTransaction ?? d?.payment?.test_transaction);
  } catch (_e) {
    return false;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, total, status_pagamento, cielo_link_id, cielo_link_url')
      .eq('id', pedido_id).maybeSingle();
    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

    if (pedido.status_pagamento === 'pago') {
      return json({ success: true, status: 'pago', numeroPedido: pedido.numero_pedido, total: pedido.total });
    }
    if (!pedido.cielo_link_id) return json({ success: true, status: pedido.status_pagamento });

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, ambiente, cielo_client_id, cielo_client_secret')
      .eq('empresa_id', pedido.empresa_id).maybeSingle();
    if (!config || config.provider !== 'cielo' || !config.cielo_client_id || !config.cielo_client_secret) {
      return json({ success: true, status: pedido.status_pagamento });
    }

    let token: string;
    try {
      token = await obterToken(config.cielo_client_id, config.cielo_client_secret);
    } catch (_e) {
      return json({ success: true, status: pedido.status_pagamento, url: pedido.cielo_link_url });
    }

    const resp = await fetch(`${CIELO_API}/v1/products/${encodeURIComponent(pedido.cielo_link_id)}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados) {
      console.error('[cielo-link-verificar] falha ao consultar pagamentos:', resp.status);
      return json({ success: true, status: pedido.status_pagamento, url: pedido.cielo_link_url });
    }

    const centavos = Math.round(Number(pedido.total) * 100);
    const tentativas: any[] = Array.isArray(dados.orders) ? dados.orders : [];
    const pagas = tentativas.filter((o) => o?.payment?.status === 'Paid');
    const valida = pagas.find((o) => Number(o?.payment?.price) >= centavos);

    if (pagas.length > 0 && !valida) {
      console.error('[cielo-link-verificar] valor pago não cobre o pedido:', JSON.stringify(pagas.map((o) => o?.payment?.price)), 'esperado', centavos);
    }

    if (valida) {
      const href = (valida.links || []).find((l: any) => l?.rel === 'self')?.href;
      if (config.ambiente === 'producao' && await vendaEhDeTeste(href, token)) {
        console.error('[cielo-link-verificar] venda de TESTE em modo Produção: não confirmada.', pedido.id);
      } else {
        await svc.from('pedidos_cardapio').update({
          status_pagamento: 'pago',
          pago_em: new Date().toISOString(),
        }).eq('id', pedido.id).neq('status_pagamento', 'pago');
        return json({ success: true, status: 'pago', numeroPedido: pedido.numero_pedido, total: pedido.total });
      }
    }

    // Negado / ainda não pago: o link continua valendo (negado não consome o uso único), o cliente pode tentar de novo.
    return json({ success: true, status: 'pendente', numeroPedido: pedido.numero_pedido, total: pedido.total, url: pedido.cielo_link_url });
  } catch (e) {
    console.error('[cielo-link-verificar] erro:', e);
    return json({ success: false, error: (e as Error).message || 'Erro inesperado.' }, 500);
  }
}

Deno.serve(handler);
