// Consulta o status de um pagamento no Mercado Pago e atualiza o pedido se
// já tiver sido pago. Chamada pela tela pública (polling, a cada alguns
// segundos, enquanto mostra o QR code pro cliente) e também quando o
// cliente reabre um pedido pendente em "Meus Pedidos" pra retomar o
// pagamento - nesse caso devolvemos o QR code de novo, se ainda pendente.

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

// Status do Mercado Pago: approved (pago), rejected/cancelled (falhou),
// pending/in_process/authorized (ainda pendente).
function mapStatus(mpStatus: string): 'pendente' | 'pago' | 'falhou' {
  if (mpStatus === 'approved') return 'pago';
  if (['rejected', 'cancelled'].includes(mpStatus)) return 'falhou';
  return 'pendente';
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
      .select('id, empresa_id, numero_pedido, total, status_pagamento, mercadopago_payment_id')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ success: false, error: 'Pedido não encontrado.' }, 404);
    }

    if (pedido.status_pagamento === 'pago') {
      return jsonResponse({ success: true, status: 'pago' });
    }

    if (!pedido.mercadopago_payment_id) {
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('access_token')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config?.access_token) {
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${pedido.mercadopago_payment_id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
    });

    const mpData = await mpResp.json().catch(() => null);

    if (!mpResp.ok || !mpData?.status) {
      console.error('[mercadopago-verificar-pagamento] falha no Mercado Pago:', mpResp.status, JSON.stringify(mpData));
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const novoStatus = mapStatus(mpData.status);

    if (novoStatus !== pedido.status_pagamento) {
      await serviceClient
        .from('pedidos_cardapio')
        .update({
          status_pagamento: novoStatus,
          pago_em: novoStatus === 'pago' ? new Date().toISOString() : null,
        })
        .eq('id', pedido.id);
    }

    const txData = mpData.point_of_interaction?.transaction_data;

    return jsonResponse({
      success: true,
      status: novoStatus,
      numeroPedido: pedido.numero_pedido,
      total: pedido.total,
      qrCodeBase64: novoStatus === 'pendente' ? (txData?.qr_code_base64 || null) : null,
      qrCodeString: novoStatus === 'pendente' ? (txData?.qr_code || null) : null,
    });
  } catch (error) {
    console.error('[mercadopago-verificar-pagamento] erro:', error);
    return jsonResponse({ success: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
