// Cria uma cobrança PIX na Cielo (conta própria do restaurante, Caminho A -
// sem split). Chamada pela tela pública do cardápio, sem login - por isso
// usa service role internamente, nunca expõe merchant_key pro navegador.
//
// Manda um NotifyUrl pra Cielo nos avisar sozinha quando o status do
// pagamento mudar (webhook), em vez de depender só do polling da tela
// pública enquanto o cliente espera.
//
// IMPORTANTE: os status codes da Cielo usados aqui (2 = pago, etc.) são os
// documentados publicamente, mas o ideal é confirmar contra uma resposta
// real do sandbox assim que tivermos credenciais de teste - podem precisar
// de ajuste fino.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// A Cielo nem sempre usa a mesma capitalização nos nomes dos campos (ex.: "QrcodeBase64Image" x
// "QrCodeBase64Image"), então procuramos o campo sem diferenciar maiúsculas de minúsculas.
function campo(obj: any, nome: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === nome.toLowerCase());
  const v = k ? obj[k] : null;
  return typeof v === 'string' && v ? v : null;
}

const API_BASE = {
  sandbox: 'https://apisandbox.cieloecommerce.cielo.com.br',
  producao: 'https://api.cieloecommerce.cielo.com.br',
};
const API_QUERY_BASE = {
  sandbox: 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
  producao: 'https://apiquery.cieloecommerce.cielo.com.br',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) {
      return jsonResponse({ success: false, error: 'Pedido não informado.' }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: pedido } = await serviceClient
      .from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, cliente_nome, total, status_pagamento, cielo_payment_id')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ success: false, error: 'Pedido não encontrado.' }, 404);
    }

    if (pedido.status_pagamento === 'pago') {
      return jsonResponse({ success: false, error: 'Esse pedido já está pago.' }, 400);
    }

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('ambiente, merchant_id, merchant_key, pix_ativo')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config || !config.pix_ativo || !config.merchant_id || !config.merchant_key) {
      return jsonResponse({ success: false, error: 'Pagamento por PIX não está configurado pra essa loja.' }, 400);
    }

    const apiBase = API_BASE[config.ambiente] || API_BASE.sandbox;
    const valorCentavos = Math.round(Number(pedido.total) * 100);
    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cielo-webhook`;

    const cieloResp = await fetch(`${apiBase}/1/sales`, {
      method: 'POST',
      headers: {
        MerchantId: config.merchant_id,
        MerchantKey: config.merchant_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        MerchantOrderId: `pedido-${pedido.numero_pedido}-${pedido.id.slice(0, 8)}`,
        Customer: { Name: pedido.cliente_nome },
        Payment: { Type: 'Pix', Amount: valorCentavos, NotifyUrl: notifyUrl },
      }),
    });

    const cieloData = await cieloResp.json().catch(() => null);

    if (!cieloResp.ok || !cieloData?.Payment) {
      console.error('[cielo-criar-pagamento] falha na Cielo:', cieloResp.status, JSON.stringify(cieloData));
      return jsonResponse({ success: false, error: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
    }

    const payment = cieloData.Payment;

    await serviceClient
      .from('pedidos_cardapio')
      .update({
        forma_pagamento_online: 'pix',
        status_pagamento: 'pendente',
        cielo_payment_id: payment.PaymentId,
      })
      .eq('id', pedido.id);

    let qrCodeBase64 = campo(payment, 'QrCodeBase64Image');
    let qrCodeString = campo(payment, 'QrCodeString');

    if (!qrCodeBase64 && !qrCodeString) {
      // Sem QR na resposta da criação: registra o diagnóstico (sem dados sensíveis) e consulta a venda
      // na API de consulta, que às vezes já traz o QR code.
      console.error('[cielo-criar-pagamento] criação sem QR code. Campos:', Object.keys(payment).join(','),
        '| Status:', payment.Status, '| ReturnCode:', payment.ReturnCode, '| ReturnMessage:', payment.ReturnMessage, '| Provider:', payment.Provider);
      try {
        const queryBase = API_QUERY_BASE[config.ambiente] || API_QUERY_BASE.sandbox;
        const consulta = await fetch(`${queryBase}/1/sales/${payment.PaymentId}`, {
          headers: { MerchantId: config.merchant_id, MerchantKey: config.merchant_key },
        });
        const dadosConsulta = await consulta.json().catch(() => null);
        const p2 = dadosConsulta?.Payment;
        qrCodeBase64 = campo(p2, 'QrCodeBase64Image');
        qrCodeString = campo(p2, 'QrCodeString');
        if (!qrCodeBase64 && !qrCodeString) {
          console.error('[cielo-criar-pagamento] consulta também sem QR code. HTTP:', consulta.status,
            '| Campos:', p2 ? Object.keys(p2).join(',') : '(sem Payment)', '| Status:', p2?.Status, '| ReturnMessage:', p2?.ReturnMessage);
        }
      } catch (e) {
        console.error('[cielo-criar-pagamento] erro na consulta do QR code:', e);
      }
    }

    if (!qrCodeBase64 && !qrCodeString) {
      return jsonResponse({
        success: false,
        error: 'Não foi possível gerar o QR code do PIX agora. Fale com a loja ou tente novamente em instantes.',
      }, 502);
    }

    return jsonResponse({
      success: true,
      paymentId: payment.PaymentId,
      qrCodeBase64: qrCodeBase64,
      qrCodeString: qrCodeString,
    });
  } catch (error) {
    console.error('[cielo-criar-pagamento] erro:', error);
    return jsonResponse({ success: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
