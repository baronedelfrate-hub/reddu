// Bot do Cardápio Digital via WhatsApp.
// Chamado pelo evolution-webhook (não diretamente pelo cliente/navegador).
// Protegido pelo mesmo WHATSAPP_WEBHOOK_SECRET usado no evolution-webhook.
//
// FASE 6:
//  - Cliente pediu "atendente": confirma pro cliente e DEPOIS marca
//    atendente_solicitado_em (dispara o alarme no PC da loja). A primeira
//    mensagem enviada por humano (sistema ou celular) marca atendente_assumido_em
//    via trigger no banco e o alarme para.
//  - Depois de "Encerrar conversa", o robô fica quieto até bot_retorno_em
//    (config whatsapp_bot_retorno_minutos, padrão 30) — a mensagem do cliente
//    nesse intervalo cai pra equipe, não pro robô.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function enviarTexto(baseUrl: string, instanceName: string, apiKey: string, numero: string, texto: string) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const resp = await fetch(`${cleanBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: numero, text: texto }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
}

async function registrarSaida(serviceClient: any, empresaId: string, jid: string, texto: string, evoData: any) {
  const { data: conversa } = await serviceClient
    .from('whatsapp_conversas')
    .upsert(
      {
        empresa_id: empresaId,
        telefone_jid: jid,
        ultima_mensagem_preview: texto.slice(0, 120),
        ultima_mensagem_at: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,telefone_jid' }
    )
    .select('id')
    .single();

  if (conversa?.id) {
    await serviceClient.from('whatsapp_mensagens').insert({
      empresa_id: empresaId,
      conversa_id: conversa.id,
      evolution_message_id: evoData?.key?.id ?? null,
      from_me: true,
      tipo: 'text',
      conteudo: texto,
      status: 'enviado',
      timestamp_mensagem: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('WHATSAPP_WEBHOOK_SECRET');
    if (webhookSecret) {
      const incoming = req.headers.get('x-webhook-secret');
      if (incoming !== webhookSecret) {
        return jsonResponse({ error: 'Não autorizado.' }, 401);
      }
    }

    const { empresa_id, telefone_jid, texto_recebido, bot_pausado_atual, bot_pausado_em } = await req.json();

    if (!empresa_id || !telefone_jid) {
      return jsonResponse({ ok: true, skipped: 'payload incompleto' });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const numeroLimpo = String(telefone_jid).split('@')[0];
    const textoLower = String(texto_recebido || '').toLowerCase();

    const { data: config } = await serviceClient
      .from('whatsapp_configuracoes')
      .select('base_url, instance_name')
      .eq('empresa_id', empresa_id)
      .maybeSingle();

    if (!config?.base_url || !config?.instance_name) {
      return jsonResponse({ ok: true, skipped: 'whatsapp não configurado' });
    }

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionApiKey) {
      return jsonResponse({ ok: true, skipped: 'EVOLUTION_API_KEY ausente' });
    }

    // Cliente pediu atendente: pausa o bot nessa conversa, confirma e dispara o alarme.
    if (textoLower.includes('atendente')) {
      await serviceClient
        .from('whatsapp_conversas')
        .update({ bot_pausado: true, bot_pausado_em: new Date().toISOString(), bot_retorno_em: null })
        .eq('empresa_id', empresa_id)
        .eq('telefone_jid', telefone_jid);

      const { data: empresaAtendente } = await serviceClient
        .from('empresas')
        .select('cardapio_config')
        .eq('id', empresa_id)
        .maybeSingle();

      const texto = empresaAtendente?.cardapio_config?.whatsapp_mensagem_atendente?.trim()
        || 'Beleza! Já vou chamar um atendente pra te ajudar por aqui mesmo. 🙋';
      const envio = await enviarTexto(config.base_url, config.instance_name, evolutionApiKey, numeroLimpo, texto);

      if (envio.ok) {
        await registrarSaida(serviceClient, empresa_id, telefone_jid, texto, envio.data);
      }

      // Só AGORA marca o pedido de atendente (depois da mensagem do robô, pra ela
      // não ser confundida com resposta de humano).
      await serviceClient
        .from('whatsapp_conversas')
        .update({ atendente_solicitado_em: new Date().toISOString(), atendente_assumido_em: null })
        .eq('empresa_id', empresa_id)
        .eq('telefone_jid', telefone_jid);

      return jsonResponse({ ok: true, acao: 'pausou_bot' });
    }

    // Conversa encerrada há pouco: robô fica quieto até bot_retorno_em.
    const { data: conversaAtual } = await serviceClient
      .from('whatsapp_conversas')
      .select('bot_retorno_em')
      .eq('empresa_id', empresa_id)
      .eq('telefone_jid', telefone_jid)
      .maybeSingle();

    if (conversaAtual?.bot_retorno_em && new Date(conversaAtual.bot_retorno_em).getTime() > Date.now()) {
      return jsonResponse({ ok: true, skipped: 'aguardando prazo pra o robô voltar' });
    }

    // Já está com atendente humano: confere se já passou do prazo configurado
    // pra reativar o bot sozinho (segurança pra caso o atendente esqueça de
    // clicar em "Encerrar conversa").
    if (bot_pausado_atual) {
      const { data: empresaTimeout } = await serviceClient
        .from('empresas')
        .select('cardapio_config')
        .eq('id', empresa_id)
        .maybeSingle();

      const timeoutHoras = Number(empresaTimeout?.cardapio_config?.whatsapp_bot_timeout_horas) || 12;
      const pausadoDesde = bot_pausado_em ? new Date(bot_pausado_em).getTime() : null;
      const expirou = pausadoDesde !== null && (Date.now() - pausadoDesde) > timeoutHoras * 60 * 60 * 1000;

      if (!expirou) {
        return jsonResponse({ ok: true, skipped: 'bot pausado nessa conversa' });
      }

      await serviceClient
        .from('whatsapp_conversas')
        .update({ bot_pausado: false, bot_pausado_em: null, atendente_solicitado_em: null, atendente_assumido_em: null })
        .eq('empresa_id', empresa_id)
        .eq('telefone_jid', telefone_jid);
    }

    // Busca dados públicos do cardápio dessa empresa
    const { data: empresa } = await serviceClient
      .from('empresas')
      .select('nome, cardapio_ativo, cardapio_slug, cardapio_config')
      .eq('id', empresa_id)
      .maybeSingle();

    if (!empresa?.cardapio_ativo || !empresa?.cardapio_slug) {
      return jsonResponse({ ok: true, skipped: 'cardápio não está ativo' });
    }

    const botAtivo = empresa.cardapio_config?.whatsapp_bot_ativo;
    const siteBaseUrl = empresa.cardapio_config?.site_base_url;
    if (!botAtivo || !siteBaseUrl) {
      return jsonResponse({ ok: true, skipped: 'bot do cardápio desativado ou sem site_base_url configurado' });
    }

    const baseLimpo = String(siteBaseUrl).replace(/\/+$/, '').replace(/\/cardapio\/[^/]+$/, '');
    const link = `${baseLimpo}/cardapio/${empresa.cardapio_slug}`;
    const templateBoasVindas = empresa.cardapio_config?.whatsapp_mensagem_boas_vindas?.trim()
      || 'Bem-vindo ao {nome}! 🎉\n\nAcesse nosso cardápio digital e faça seu pedido:\n{link}\n\nSe quiser falar com um atendente, é só digitar *atendente*.';
    const texto = templateBoasVindas
      .replaceAll('{nome}', empresa.nome)
      .replaceAll('{link}', link);

    const envio = await enviarTexto(config.base_url, config.instance_name, evolutionApiKey, numeroLimpo, texto);
    if (!envio.ok) {
      console.error('[cardapio-whatsapp-bot] erro ao enviar:', envio.data);
      return jsonResponse({ ok: false, error: 'falha ao enviar mensagem' });
    }

    await registrarSaida(serviceClient, empresa_id, telefone_jid, texto, envio.data);

    return jsonResponse({ ok: true, acao: 'enviou_boas_vindas' });
  } catch (error) {
    console.error('[cardapio-whatsapp-bot] erro:', error);
    return jsonResponse({ ok: false, error: error.message || 'Erro inesperado.' }, 500);
  }
});
