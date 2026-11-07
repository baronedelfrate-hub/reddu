// Cria o LINK DE PAGAMENTO da Cielo (Link & Checkout) pra um pedido do cardápio.
// Deploy com Verify JWT LIGADO (a tela pública chama com a chave anon).
//
// Fluxo: pega um token OAuth2 com o ClientId/ClientSecret da loja (guardados em
// cardapio_pagamento_config, nunca expostos ao navegador), cria o link com o VALOR LIDO
// DO PEDIDO NO BANCO e devolve a URL (shortUrl). O cliente paga na página da Cielo (PIX e/ou
// cartão, conforme ligado na configuração) e a confirmação é feita por cielo-link-verificar /
// cielo-link-webhook consultando a Cielo.
//
// A API do Link & Checkout NÃO tem sandbox: o teste é feito ligando o "Modo teste" na conta da
// loja, no site da Cielo (as transações ficam marcadas como teste e não cobram ninguém).

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
    console.error('[cielo-link-criar] falha ao obter token:', resp.status); // nunca loga credenciais
    throw new Error('TOKEN');
  }
  return dados.access_token as string;
}

// OrderNumber: só letras e números, até 20 caracteres (limite funcional da conciliação) e
// único. Determinístico a partir do pedido, então repetir a chamada gera o mesmo número.
export function montarOrderNumber(numeroPedido: unknown, pedidoId: string): string {
  const numero = String(numeroPedido ?? '').replace(/\D/g, '').slice(0, 6);
  const hex = pedidoId.replace(/[^0-9a-fA-F]/g, '');
  const tamanhoHex = Math.max(8, 19 - numero.length);
  return `R${numero}${hex.slice(0, tamanhoHex)}`.slice(0, 20);
}

function dataDaquiADias(dias: number): string {
  // Horário de Brasília, formato AAAA-MM-DD HH:mm:ss (como no exemplo da Cielo)
  const d = new Date(Date.now() - 3 * 3600 * 1000 + dias * 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} 23:59:59`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, total, status, status_pagamento, cielo_link_url')
      .eq('id', pedido_id).maybeSingle();

    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return json({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return json({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, cielo_client_id, cielo_client_secret, cielo_link_ativo, cielo_link_pix, cielo_link_cartao, cartao_max_parcelas')
      .eq('empresa_id', pedido.empresa_id).maybeSingle();

    if (!config || config.provider !== 'cielo' || !config.cielo_link_ativo || !config.cielo_client_id || !config.cielo_client_secret) {
      return json({ success: false, error: 'Pagamento online não está configurado pra essa loja.' }, 400);
    }

    // já existe link pra esse pedido: reaproveita (o valor do pedido não muda)
    if (pedido.cielo_link_url && pedido.status_pagamento === 'pendente') {
      return json({ success: true, url: pedido.cielo_link_url, reaproveitado: true });
    }

    const meios: Array<{ type: string }> = [];
    if (config.cielo_link_pix) meios.push({ type: 'Pix' });
    if (config.cielo_link_cartao) { meios.push({ type: 'CreditCard' }); meios.push({ type: 'DebitCard' }); }
    if (meios.length === 0) {
      return json({ success: false, error: 'Pagamento online não está configurado pra essa loja.' }, 400);
    }

    const centavos = Math.round(Number(pedido.total) * 100);
    if (!(centavos > 0)) return json({ success: false, error: 'Valor do pedido inválido.' }, 400);

    const { data: empresa } = await svc.from('empresas').select('nome').eq('id', pedido.empresa_id).maybeSingle();
    const nomeLoja = String(empresa?.nome || 'Cardápio Digital');
    const orderNumber = montarOrderNumber(pedido.numero_pedido, pedido.id);
    const softDescriptor = nomeLoja.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 13);

    const corpo: Record<string, unknown> = {
      OrderNumber: orderNumber,
      type: 'Service',
      name: `Pedido #${pedido.numero_pedido} - ${nomeLoja}`.slice(0, 128),
      description: `Pedido #${pedido.numero_pedido}`.slice(0, 256),
      showDescription: false,
      price: centavos,
      quantity: 1, // o link deixa de funcionar depois de 1 pagamento aprovado
      shipping: { type: 'WithoutShipping' },
      expirationDate: dataDaquiADias(2),
      customLinkConfiguration: { paymentTypes: meios },
    };
    if (softDescriptor) corpo.softDescriptor = softDescriptor;
    if (config.cielo_link_cartao) {
      corpo.maxNumberOfInstallments = Math.max(1, Math.min(12, Number(config.cartao_max_parcelas) || 1));
    }

    let token: string;
    try {
      token = await obterToken(config.cielo_client_id, config.cielo_client_secret);
    } catch (_e) {
      return json({ success: false, error: 'Não foi possível abrir o pagamento. Tente novamente.' }, 502);
    }

    const resp = await fetch(`${CIELO_API}/v1/products/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json().catch(() => null);
    const url = typeof dados?.shortUrl === 'string' && /^https:\/\//.test(dados.shortUrl) ? dados.shortUrl : null;

    if (!resp.ok || !dados?.id || !url) {
      console.error('[cielo-link-criar] falha ao criar link:', resp.status, JSON.stringify(dados)?.slice(0, 500));
      return json({ success: false, error: 'Não foi possível abrir o pagamento. Tente novamente.' }, 502);
    }

    const { error: erroSalvar } = await svc.from('pedidos_cardapio').update({
      forma_pagamento_online: 'pix', // ajustado quando o pagamento é confirmado (a Cielo não diz o meio na consulta)
      status_pagamento: 'pendente',
      cielo_link_id: String(dados.id),
      cielo_link_url: url,
      cielo_link_order_number: orderNumber,
    }).eq('id', pedido.id);
    if (erroSalvar) console.error('[cielo-link-criar] link criado mas não salvo no pedido:', erroSalvar.message);

    return json({ success: true, url });
  } catch (e) {
    console.error('[cielo-link-criar] erro:', e);
    return json({ success: false, error: (e as Error).message || 'Erro inesperado.' }, 500);
  }
}

Deno.serve(handler);
