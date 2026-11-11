// Cobra um pedido do cardápio no CARTÃO DE CRÉDITO pela API E-commerce da Cielo.
// Deploy com Verify JWT LIGADO (a tela pública chama com a chave anon).
//
// Recebe só o PaymentToken que o Silent Order Post devolveu ao navegador (o cartão em si nunca passa
// por aqui). O VALOR vem SEMPRE do pedido no banco, nunca do que o navegador mandar. O PaymentToken é de
// uso único e vale por 20 minutos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const API_BASE = { sandbox: 'https://apisandbox.cieloecommerce.cielo.com.br', producao: 'https://api.cieloecommerce.cielo.com.br' };
// Credenciais FIXAS de teste, publicadas na documentação da Cielo (só valem no sandbox, ninguém é cobrado).
const SANDBOX = { merchantId: '832ce400-9c97-4fe7-9d4f-0928675e36cd', merchantKey: 'IIHc5F35mO9BS1FQ64ZGaqqYPG9L1OvMh2ld8kYv' };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Status da Cielo: 0 NotFinished, 1 Authorized, 2 PaymentConfirmed (pago), 3 Denied, 10 Voided,
// 11 Refunded, 12 Pending, 13 Aborted, 20 Scheduled.
export function mapStatus(s: number): 'pago' | 'falhou' | 'pendente' {
  if (s === 2) return 'pago';
  if ([3, 10, 13].includes(s)) return 'falhou';
  return 'pendente';
}

// Mensagem pro cliente: curta e sem detalhe técnico.
export function motivoAmigavel(returnCode: unknown, returnMessage: unknown): string {
  const c = String(returnCode ?? '');
  if (['51', '78'].includes(c)) return 'Cartão sem limite ou saldo suficiente. Tente outro cartão ou pague com PIX.';
  if (['54', '57'].includes(c)) return 'Cartão vencido. Tente outro cartão ou pague com PIX.';
  if (['14', '82', '83'].includes(c)) return 'Dados do cartão não conferem. Confira número, validade e código de segurança.';
  const m = String(returnMessage ?? '').trim();
  return m && m.length < 90 && !/error|exception/i.test(m)
    ? `${m}. Tente outro cartão ou pague com PIX.`
    : 'O banco não autorizou o pagamento. Tente outro cartão ou pague com PIX.';
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { pedido_id, payment_token, parcelas } = await req.json();
    if (!pedido_id) return json({ success: false, error: 'Pedido não informado.' }, 400);
    if (typeof payment_token !== 'string' || !GUID.test(payment_token)) {
      return json({ success: false, error: 'Não foi possível ler os dados do cartão. Tente novamente.' }, 400);
    }

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: pedido } = await svc.from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, cliente_nome, total, status, status_pagamento')
      .eq('id', pedido_id).maybeSingle();
    if (!pedido) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
    if (pedido.status === 'CANCELADO') return json({ success: false, error: 'Esse pedido foi cancelado.' }, 400);
    if (pedido.status_pagamento === 'pago') return json({ success: false, error: 'Esse pedido já está pago.' }, 400);

    const { data: config } = await svc.from('cardapio_pagamento_config')
      .select('provider, ambiente, merchant_id, merchant_key, cielo_cartao_ativo, cartao_max_parcelas')
      .eq('empresa_id', pedido.empresa_id).maybeSingle();
    if (!config || config.provider !== 'cielo' || !config.cielo_cartao_ativo) {
      return json({ success: false, error: 'Pagamento com cartão não está configurado pra essa loja.' }, 400);
    }

    const ambiente = config.ambiente === 'producao' ? 'producao' : 'sandbox';
    const merchantId = ambiente === 'sandbox' ? SANDBOX.merchantId : config.merchant_id;
    const merchantKey = ambiente === 'sandbox' ? SANDBOX.merchantKey : config.merchant_key;
    if (!merchantId || !merchantKey) {
      return json({ success: false, error: 'Pagamento com cartão não está configurado pra essa loja.' }, 400);
    }

    const maxParcelas = Math.max(1, Math.min(12, Number(config.cartao_max_parcelas) || 1));
    const nParcelas = Math.max(1, Math.min(maxParcelas, Math.floor(Number(parcelas) || 1)));
    const centavos = Math.round(Number(pedido.total) * 100);
    if (!(centavos > 0)) return json({ success: false, error: 'Valor do pedido inválido.' }, 400);

    const { data: empresa } = await svc.from('empresas').select('nome').eq('id', pedido.empresa_id).maybeSingle();
    const softDescriptor = String(empresa?.nome || 'Cardapio').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 13);

    const pagamento: Record<string, unknown> = {
      Type: 'CreditCard',
      Amount: centavos,
      Currency: 'BRL',
      Country: 'BRA',
      Installments: nParcelas,
      Capture: true,
      Authenticate: false,
      CreditCard: { PaymentToken: payment_token },
    };
    if (nParcelas > 1) pagamento.Interest = 'ByMerchant'; // a loja assume o parcelamento
    if (softDescriptor) pagamento.SoftDescriptor = softDescriptor;
    if (ambiente === 'sandbox') pagamento.Provider = 'Simulado'; // exclusivo de teste

    const resp = await fetch(`${API_BASE[ambiente]}/1/sales/`, {
      method: 'POST',
      headers: { MerchantId: merchantId, MerchantKey: merchantKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MerchantOrderId: `pedido-${pedido.numero_pedido}-${pedido.id.slice(0, 8)}-cc`,
        Customer: { Name: String(pedido.cliente_nome || 'Cliente').slice(0, 255) },
        Payment: pagamento,
      }),
    });
    const dados = await resp.json().catch(() => null);
    const pay = dados?.Payment;

    if (!resp.ok || !pay) {
      // Nunca loga o corpo da requisição (tem o token do cartão); só o status e a resposta da Cielo.
      console.error('[cielo-cartao-pagar] falha na Cielo:', resp.status, JSON.stringify(dados)?.slice(0, 400));
      return json({ success: false, error: 'Não foi possível processar o cartão agora. Tente novamente.' }, 502);
    }

    const status = mapStatus(Number(pay.Status));

    // Confere se a Cielo cobrou o valor do pedido (nunca marca pago se o valor não bate).
    if (status === 'pago' && Number(pay.Amount) < centavos) {
      console.error('[cielo-cartao-pagar] valor cobrado diferente do pedido:', pay.Amount, centavos);
      return json({ success: false, error: 'Não foi possível confirmar o pagamento. Fale com a loja.' }, 502);
    }

    await svc.from('pedidos_cardapio').update({
      forma_pagamento_online: 'cartao',
      status_pagamento: status,
      cielo_payment_id: pay.PaymentId ?? null,
      pago_em: status === 'pago' ? new Date().toISOString() : null,
    }).eq('id', pedido.id).neq('status_pagamento', 'pago');

    if (status === 'falhou') {
      return json({ success: true, status, motivo: motivoAmigavel(pay.ReturnCode, pay.ReturnMessage) });
    }
    return json({ success: true, status, numeroPedido: pedido.numero_pedido, total: pedido.total });
  } catch (e) {
    console.error('[cielo-cartao-pagar] erro:', e);
    return json({ success: false, error: 'Erro inesperado.' }, 500);
  }
}

Deno.serve(handler);
