// Prepara o pagamento com CARTÃO (Silent Order Post da Cielo) de um pedido do cardápio.
// Deploy com Verify JWT LIGADO (a tela pública chama com a chave anon).
//
// O navegador captura o cartão e manda DIRETO pra Cielo (script do SOP), usando o AccessToken do SOP
// que esta função gera. As credenciais (Client ID/Secret do SOP) ficam só no servidor. O AccessToken do
// SOP dura ~20 minutos e permite salvar UM cartão; o PaymentToken que volta é de uso único.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const AUTH_BASE = { sandbox: 'https://authsandbox.braspag.com.br', producao: 'https://auth.braspag.com.br' };
const SOP_BASE = { sandbox: 'https://transactionsandbox.pagador.com.br', producao: 'https://transaction.pagador.com.br' };

// Credenciais FIXAS de teste, publicadas na documentação da Cielo (só valem no sandbox, ninguém é cobrado).
export const SANDBOX = {
  merchantId: '832ce400-9c97-4fe7-9d4f-0928675e36cd',
  sopClientId: '6631016d-72e6-4db1-a2d2-9cbe61464925',
  sopClientSecret: 'flY1vN/dDx/5A9g/shJoOlTEiZfb9bZrig/WtJojqMM=',
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, status, status_pagamento')
      .eq('id', pedido_id).maybeSingle();
    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return json({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return json({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, ambiente, merchant_id, cielo_cartao_ativo, cielo_sop_client_id, cielo_sop_client_secret')
      .eq('empresa_id', pedido.empresa_id).maybeSingle();
    if (!config || config.provider !== 'cielo' || !config.cielo_cartao_ativo) {
      return json({ success: false, error: 'Pagamento com cartão não está configurado pra essa loja.' }, 400);
    }

    const ambiente = config.ambiente === 'producao' ? 'producao' : 'sandbox';
    const merchantId = ambiente === 'sandbox' ? SANDBOX.merchantId : config.merchant_id;
    const clientId = ambiente === 'sandbox' ? SANDBOX.sopClientId : config.cielo_sop_client_id;
    const clientSecret = ambiente === 'sandbox' ? SANDBOX.sopClientSecret : config.cielo_sop_client_secret;
    if (!merchantId || !clientId || !clientSecret) {
      return json({ success: false, error: 'Pagamento com cartão não está configurado pra essa loja.' }, 400);
    }

    // 1) token OAuth2 (server-to-server)
    const oauth = await fetch(`${AUTH_BASE[ambiente]}/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const oauthDados = await oauth.json().catch(() => null);
    if (!oauth.ok || !oauthDados?.access_token) {
      console.error('[cielo-cartao-sop-token] falha no OAuth2:', oauth.status); // nunca loga credenciais
      return json({ success: false, error: 'Não foi possível preparar o pagamento com cartão. Tente novamente.' }, 502);
    }

    // 2) AccessToken do Silent Order Post
    const sop = await fetch(`${SOP_BASE[ambiente]}/post/api/public/v2/accesstoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', MerchantId: merchantId, Authorization: `Bearer ${oauthDados.access_token}` },
    });
    const sopDados = await sop.json().catch(() => null);
    if (!sop.ok || !sopDados?.AccessToken) {
      console.error('[cielo-cartao-sop-token] falha no AccessToken do SOP:', sop.status);
      return json({ success: false, error: 'Não foi possível preparar o pagamento com cartão. Tente novamente.' }, 502);
    }

    // A loja já vê o aviso "pagamento por cartão pendente" (e o cliente consegue reabrir em Meus Pedidos).
    await svc.from('pedidos_cardapio')
      .update({ forma_pagamento_online: 'cartao', status_pagamento: 'pendente' })
      .eq('id', pedido.id).neq('status_pagamento', 'pago');

    return json({
      success: true,
      accessToken: sopDados.AccessToken,
      environment: ambiente === 'producao' ? 'production' : 'sandbox',
      scriptUrl: ambiente === 'producao'
        ? 'https://www.pagador.com.br/post/scripts/silentorderpost-1.0.min.js'
        : 'https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js',
    });
  } catch (e) {
    console.error('[cielo-cartao-sop-token] erro:', e);
    return json({ success: false, error: 'Erro inesperado.' }, 500);
  }
}

Deno.serve(handler);
