// Consulta o status de um pagamento na Cielo e atualiza o pedido se já
// tiver sido pago. Chamada pela tela pública (polling, a cada alguns
// segundos, enquanto mostra o QR code pro cliente) e também quando o
// cliente reabre um pedido pendente em "Meus Pedidos" pra retomar o
// pagamento - nesse caso devolvemos o QR code de novo, se ainda pendente.
//
// IMPORTANTE: mesma ressalva do cielo-criar-pagamento sobre os status codes -
// confirmar contra o sandbox real assim que possível.

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

const API_QUERY_BASE = {
  sandbox: 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
  producao: 'https://apiquery.cieloecommerce.cielo.com.br',
};

// Status da Cielo: 0 NotFinished, 1 Authorized, 2 PaymentConfirmed (pago),
// 3 Denied, 10 Voided, 11 Refunded, 12 Pending, 13 Aborted, 20 Scheduled.
function mapStatus(cieloStatus: number): 'pendente' | 'pago' | 'falhou' {
  if (cieloStatus === 2) return 'pago';
  if ([3, 10, 13].includes(cieloStatus)) return 'falhou';
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
      .select('id, empresa_id, numero_pedido, total, status_pagamento, cielo_payment_id, cielo_pix_qr')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ success: false, error: 'Pedido não encontrado.' }, 404);
    }

    if (pedido.status_pagamento === 'pago') {
      return jsonResponse({ success: true, status: 'pago' });
    }

    if (!pedido.cielo_payment_id) {
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const { data: config } = await serviceClient
      .from('cardapio_pagamento_config')
      .select('ambiente, merchant_id, merchant_key')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    if (!config?.merchant_id || !config?.merchant_key) {
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const apiBase = API_QUERY_BASE[config.ambiente] || API_QUERY_BASE.sandbox;

    const cieloResp = await fetch(`${apiBase}/1/sales/${pedido.cielo_payment_id}`, {
      method: 'GET',
      headers: {
        MerchantId: config.merchant_id,
        MerchantKey: config.merchant_key,
      },
    });

    const cieloData = await cieloResp.json().catch(() => null);

    if (!cieloResp.ok || !cieloData?.Payment) {
      console.error('[cielo-verificar-pagamento] falha na Cielo:', cieloResp.status, JSON.stringify(cieloData));
      return jsonResponse({ success: true, status: pedido.status_pagamento });
    }

    const novoStatus = mapStatus(cieloData.Payment.Status);

    if (novoStatus !== pedido.status_pagamento) {
      await serviceClient
        .from('pedidos_cardapio')
        .update({
          status_pagamento: novoStatus,
          pago_em: novoStatus === 'pago' ? new Date().toISOString() : null,
        })
        .eq('id', pedido.id);
    }

    return jsonResponse({
      success: true,
      status: novoStatus,
      numeroPedido: pedido.numero_pedido,
      total: pedido.total,
      qrCodeBase64: novoStatus === 'pendente' ? campo(cieloData.Payment, 'QrCodeBase64Image') : null,
      // a consulta da Cielo nem sempre devolve o QR: nesse caso usa o código guardado na criação do PIX
      qrCodeString: novoStatus === 'pendente' ? (campo(cieloData.Payment, 'QrCodeString') || pedido.cielo_pix_qr || null) : null,
    });
  } catch (error) {
    console.error('[cielo-verificar-pagamento] erro:', error);
    return jsonResponse({ success: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
