// Cria uma cobrança PIX no Mercado Pago (conta própria do restaurante, sem
// split - o dinheiro cai direto na conta do Mercado Pago do restaurante).
// Chamada pela tela pública do cardápio, sem login - por isso usa service
// role internamente, nunca expõe o access_token pro navegador.
//
// Mercado Pago exige um payer.email no corpo do pagamento. Como a tela de
// checkout do cardápio não coleta e-mail do cliente, geramos um e-mail
// sintético a partir do telefone informado - isso é aceito pela API tanto
// em sandbox (TEST-...) quanto em produção, e não afeta a cobrança em si.

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

function gerarEmailSintetico(telefone: string | null | undefined): string {
  const digitos = (telefone || '').replace(/\D/g, '') || 'cliente';
  return `cliente${digitos}@pedido-cardapio.com`;
}

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
      .select('id, empresa_id, numero_pedido, cliente_nome, cliente_telefone, total, status_pagamento, mercadopago_payment_id')
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
      .select('provider, access_token, pix_ativo')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config || config.provider !== 'mercadopago' || !config.pix_ativo || !config.access_token) {
      return jsonResponse({ success: false, error: 'Pagamento por PIX não está configurado pra essa loja.' }, 400);
    }

    const valor = Math.round(Number(pedido.total) * 100) / 100;
    const nomeCompleto = (pedido.cliente_nome || 'Cliente').trim();
    const [primeiroNome, ...resto] = nomeCompleto.split(' ');
    const sobrenome = resto.join(' ') || 'Cardapio';

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pedido-${pedido.id}`,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: `Pedido #${pedido.numero_pedido} - Cardápio Digital`,
        payment_method_id: 'pix',
        external_reference: pedido.id,
        payer: {
          email: gerarEmailSintetico(pedido.cliente_telefone),
          first_name: primeiroNome,
          last_name: sobrenome,
        },
      }),
    });

    const mpData = await mpResp.json().catch(() => null);

    if (!mpResp.ok || !mpData?.id || !mpData?.point_of_interaction?.transaction_data) {
      console.error('[mercadopago-criar-pagamento] falha no Mercado Pago:', mpResp.status, JSON.stringify(mpData));
      return jsonResponse({ success: false, error: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
    }

    const txData = mpData.point_of_interaction.transaction_data;

    await serviceClient
      .from('pedidos_cardapio')
      .update({
        forma_pagamento_online: 'pix',
        status_pagamento: 'pendente',
        mercadopago_payment_id: String(mpData.id),
      })
      .eq('id', pedido.id);

    return jsonResponse({
      success: true,
      paymentId: mpData.id,
      qrCodeBase64: txData.qr_code_base64 || null,
      qrCodeString: txData.qr_code || null,
    });
  } catch (error) {
    console.error('[mercadopago-criar-pagamento] erro:', error);
    return jsonResponse({ success: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
