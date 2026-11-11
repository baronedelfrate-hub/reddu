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

const MPI_BASE = { sandbox: 'https://mpisandbox.braspag.com.br', producao: 'https://mpi.braspag.com.br' };
const MPI_SCRIPT = {
  sandbox: 'https://mpisandbox.braspag.com.br/Scripts/BP.Mpi.3ds20.min.js',
  producao: 'https://mpi.braspag.com.br/Scripts/BP.Mpi.3ds20.min.js',
};
// Credenciais FIXAS de teste do 3DS (documentação da Cielo). Só valem no sandbox.
export const SANDBOX_3DS = {
  clientId: 'dba3a8db-fa54-40e0-8bab-7bfb9b6f2e2e',
  clientSecret: 'D/ilRsfoqHlSUChwAMnlyKdDNd7FMsM7cU/vo02REag=',
  establishmentCode: 1006993068, merchantName: 'Loja Exemplo', mcc: '0000',
};

// Token do 3DS (um novo a cada autenticação). Devolve null se o 3DS não está configurado ou falhou.
async function token3ds(config: any, ambiente: 'sandbox' | 'producao', nomeLoja: string) {
  const sandbox = ambiente === 'sandbox';
  const clientId = sandbox ? SANDBOX_3DS.clientId : config.cielo_3ds_client_id;
  const clientSecret = sandbox ? SANDBOX_3DS.clientSecret : config.cielo_3ds_client_secret;
  const ec = sandbox ? SANDBOX_3DS.establishmentCode : Number(String(config.cielo_ec_codigo || '').replace(/\D/g, ''));
  const mcc = sandbox ? SANDBOX_3DS.mcc : String(config.cielo_mcc || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  if (!clientId || !clientSecret || !ec || !mcc) return null;
  const nome = (sandbox ? SANDBOX_3DS.merchantName : nomeLoja).normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 25) || 'Loja';
  const r = await fetch(`${MPI_BASE[ambiente]}/v2/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ EstablishmentCode: ec, MerchantName: nome, MCC: mcc }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) {
    console.error('[cielo-cartao-sop-token] falha no token do 3DS:', r.status); // nunca loga credenciais
    return null;
  }
  return { accessToken: d.access_token as string, environment: sandbox ? 'SDB' : 'PRD', scriptUrl: MPI_SCRIPT[ambiente] };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id, com_3ds } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, status, status_pagamento')
      .eq('id', pedido_id).maybeSingle();
    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return json({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return json({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, ambiente, merchant_id, cielo_cartao_ativo, cielo_sop_client_id, cielo_sop_client_secret, cielo_3ds_client_id, cielo_3ds_client_secret, cielo_ec_codigo, cielo_mcc')
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

    // 3DS (só quando a tela pede: débito ou crédito com 3DS). O IP do cliente é exigido pelo 3DS.
    let mpi = null;
    if (com_3ds === true) {
      const { data: empresa } = await svc.from('empresas').select('nome').eq('id', pedido.empresa_id).maybeSingle();
      mpi = await token3ds(config, ambiente, String(empresa?.nome || 'Loja'));
    }
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim() || null;

    return json({
      success: true,
      mpi,
      ip,
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
