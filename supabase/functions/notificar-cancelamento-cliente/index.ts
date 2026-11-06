// Avisa a loja por WhatsApp quando o PRÓPRIO CLIENTE cancela um pedido pela
// tela pública (sem precisar de sessão de funcionário - por isso não pode
// usar a function evolution-api, que exige login). Manda a mensagem pro
// número da própria loja (o número conectado no WhatsApp Business dela),
// como uma nota "pra si mesma" - aparece pra quem tiver acesso àquele
// WhatsApp, sem precisar configurar nada a mais.
//
// Protegido contra abuso: só dispara se o pedido existir e já estiver
// mesmo com status CANCELADO no banco (não confia em nada que o chamador
// afirma, sempre confere o estado real antes de notificar).

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pedido_id } = await req.json();
    if (!pedido_id) {
      return jsonResponse({ ok: true, skipped: 'sem pedido_id' });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: pedido } = await serviceClient
      .from('pedidos_cardapio')
      .select('id, empresa_id, numero_pedido, cliente_nome, total, status')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ ok: true, skipped: 'pedido não encontrado' });
    }
    if (pedido.status !== 'CANCELADO') {
      return jsonResponse({ ok: true, skipped: 'pedido não está cancelado' });
    }

    const { data: empresa } = await serviceClient
      .from('empresas')
      .select('cardapio_config')
      .eq('id', pedido.empresa_id)
      .maybeSingle();

    if (!empresa?.cardapio_config?.whatsapp_notificacoes_pedido_ativo) {
      return jsonResponse({ ok: true, skipped: 'notificação desativada pra essa loja' });
    }

    const { data: config } = await serviceClient
      .from('whatsapp_configuracoes')
      .select('base_url, instance_name, phone_number')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!config?.base_url || !config?.instance_name || !config?.phone_number || !evolutionApiKey) {
      return jsonResponse({ ok: true, skipped: 'whatsapp não configurado' });
    }

    const totalFormatado = Number(pedido.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const texto = `⚠️ *Pedido cancelado pelo cliente*\nO cliente ${pedido.cliente_nome} cancelou o pedido #${pedido.numero_pedido} (${totalFormatado}) antes da confirmação.`;

    const numeroLimpo = String(config.phone_number).replace(/\D/g, '');
    const cleanBaseUrl = String(config.base_url).replace(/\/+$/, '');

    const evoResp = await fetch(`${cleanBaseUrl}/message/sendText/${encodeURIComponent(config.instance_name)}`, {
      method: 'POST',
      headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numeroLimpo, text: texto }),
    });
    const evoData = await evoResp.json().catch(() => ({}));

    if (!evoResp.ok) {
      console.error('[notificar-cancelamento-cliente] falha ao enviar:', evoData);
      return jsonResponse({ ok: false, error: 'falha ao enviar mensagem' });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('[notificar-cancelamento-cliente] erro:', error);
    return jsonResponse({ ok: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
