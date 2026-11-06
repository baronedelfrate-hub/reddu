// Confirmação de "pedido recebido" via WhatsApp, disparada pela tela pública
// do cardápio (sem login - por isso NÃO pode usar a function evolution-api,
// que exige sessão de funcionário). Protegida contra abuso: só manda
// mensagem se o pedido existir de verdade no banco, e só uma vez por pedido
// (trava por pedido_id, não aceita telefone/texto arbitrário do chamador).

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
      .select('id, empresa_id, numero_pedido, cliente_nome, cliente_telefone, total, tipo_entrega, data_agendamento, confirmacao_whatsapp_enviada')
      .eq('id', pedido_id)
      .maybeSingle();

    if (!pedido) {
      return jsonResponse({ ok: true, skipped: 'pedido não encontrado' });
    }
    if (pedido.confirmacao_whatsapp_enviada) {
      return jsonResponse({ ok: true, skipped: 'já notificado antes' });
    }

    const { data: empresa } = await serviceClient
      .from('empresas')
      .select('nome, cardapio_config')
      .eq('id', pedido.empresa_id)
      .maybeSingle();

    if (!empresa?.cardapio_config?.whatsapp_notificacoes_pedido_ativo) {
      return jsonResponse({ ok: true, skipped: 'notificação desativada pra essa loja' });
    }

    const { data: config } = await serviceClient
      .from('whatsapp_configuracoes')
      .select('base_url, instance_name')
      .eq('empresa_id', pedido.empresa_id)
      .maybeSingle();

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!config?.base_url || !config?.instance_name || !evolutionApiKey) {
      return jsonResponse({ ok: true, skipped: 'whatsapp não configurado' });
    }

    const totalFormatado = Number(pedido.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const templateRecebido = empresa.cardapio_config?.whatsapp_msg_recebido?.trim()
      || 'Recebemos seu pedido #{numero}! 🎉\nTotal: {total}\n\nJá estamos analisando, aguarde a confirmação.';
    let texto = templateRecebido
      .replaceAll('{numero}', pedido.numero_pedido)
      .replaceAll('{total}', totalFormatado);
    if (pedido.data_agendamento) {
      const dataFormatada = new Date(pedido.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      texto += `\nAgendado para: ${dataFormatada}`;
    }

    const numeroLimpo = String(pedido.cliente_telefone).replace(/\D/g, '');
    const cleanBaseUrl = String(config.base_url).replace(/\/+$/, '');

    const evoResp = await fetch(`${cleanBaseUrl}/message/sendText/${encodeURIComponent(config.instance_name)}`, {
      method: 'POST',
      headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numeroLimpo, text: texto }),
    });
    const evoData = await evoResp.json().catch(() => ({}));

    if (!evoResp.ok) {
      console.error('[enviar-confirmacao-pedido] falha ao enviar:', evoData);
      return jsonResponse({ ok: false, error: 'falha ao enviar mensagem' });
    }

    await serviceClient.from('pedidos_cardapio').update({ confirmacao_whatsapp_enviada: true }).eq('id', pedido.id);

    // Registra no histórico do WhatsApp normal, pra equipe ver junto com o resto
    const jid = `${numeroLimpo}@s.whatsapp.net`;
    const { data: conversa } = await serviceClient
      .from('whatsapp_conversas')
      .upsert(
        { empresa_id: pedido.empresa_id, telefone_jid: jid, ultima_mensagem_preview: texto.slice(0, 120), ultima_mensagem_at: new Date().toISOString() },
        { onConflict: 'empresa_id,telefone_jid' }
      )
      .select('id')
      .single();

    if (conversa?.id) {
      await serviceClient.from('whatsapp_mensagens').insert({
        empresa_id: pedido.empresa_id,
        conversa_id: conversa.id,
        evolution_message_id: evoData?.key?.id ?? null,
        from_me: true,
        tipo: 'text',
        conteudo: texto,
        status: 'enviado',
        timestamp_mensagem: new Date().toISOString(),
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('[enviar-confirmacao-pedido] erro:', error);
    return jsonResponse({ ok: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
