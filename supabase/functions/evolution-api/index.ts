// supabase/functions/evolution-api/index.ts
//
// Proxy seguro entre o frontend do Estoque 360 e a Evolution API.
// A API Key da Evolution API fica SOMENTE aqui, como secret da função
// (EVOLUTION_API_KEY). Nunca é enviada ao navegador do usuário.
//
// Segurança:
//   - Exige usuário logado e usa a empresa DELE.
//   - O servidor e a instância vêm SEMPRE de whatsapp_configuracoes (da empresa do usuário).
//     base_url e instance_name enviados pelo navegador são IGNORADOS: assim a API Key da
//     Evolution nunca é enviada a um endereço escolhido por usuário.
//   - A URL do webhook é fixa (evolution-webhook deste projeto); o navegador não escolhe.
//   - media_url precisa ser um arquivo da pasta da própria empresa no bucket whatsapp-media.
//
// Ações: status, gerarQrCode, sendText, sendAudio, sendMedia, setWebhook.
// (A criação automática da instância está na função whatsapp-instancia.)
//
// Deploy:
//   supabase functions deploy evolution-api
//   supabase secrets set EVOLUTION_API_KEY=<a API Key global da Evolution>
//
// Chamada a partir do frontend (base_url e instance_name são opcionais e ignorados):
//   await supabase.functions.invoke('evolution-api', {
//     body: { action: 'sendText', numero, texto }
//   });

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

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

// Completa o DDI 55 quando o número vier só com DDD + número (10 ou 11
// dígitos). Assume Brasil, único país atendido por este sistema.
function normalizarNumeroBR(valor: string): string {
  let digits = String(valor).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

// Só aceita servidor com https (a API Key viaja no cabeçalho).
function normalizarBaseUrl(valor: string | undefined | null): string | null {
  const limpo = String(valor || '').trim().replace(/\/+$/, '');
  return limpo.startsWith('https://') ? limpo : null;
}

// media_url só pode apontar para a pasta da própria empresa no Storage do projeto.
export function mediaUrlPermitida(mediaUrl: unknown, supabaseUrl: string, empresaId: string): boolean {
  if (typeof mediaUrl !== 'string') return false;
  const prefixo = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/whatsapp-media/${empresaId}/`;
  if (!mediaUrl.startsWith(prefixo)) return false;
  // sem "../" nem barras codificadas para escapar da pasta
  const resto = mediaUrl.slice(prefixo.length);
  return resto.length > 0 && !/(^|\/)\.\.(\/|$)/.test(resto) && !/%2e%2e|%2f|%5c/i.test(resto);
}

// Registra (ou atualiza) a conversa e grava a mensagem enviada no histórico.
// Usa select + update/insert em vez de upsert: a mesma conversa pode estar
// sendo escrita ao mesmo tempo pelo webhook (mensagem chegando do cliente)
// ou por outro envio, e um upsert concorrente pode falhar sem lançar erro
// visível — foi exatamente isso que deixou mensagens de campanha sem
// registro no histórico. Aqui, qualquer falha é logada.
async function registrarMensagemEnviada(params: {
  serviceClient: any;
  empresaId: string;
  jid: string;
  preview: string;
  mensagem: Record<string, unknown>;
}) {
  const { serviceClient, empresaId, jid, preview, mensagem } = params;

  const { data: conversaExistente, error: buscaErro } = await serviceClient
    .from('whatsapp_conversas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('telefone_jid', jid)
    .maybeSingle();

  if (buscaErro) {
    console.error('[evolution-api] erro ao buscar conversa:', buscaErro);
  }

  let conversaId: string | undefined = conversaExistente?.id;

  if (conversaId) {
    const { error: updateErro } = await serviceClient
      .from('whatsapp_conversas')
      .update({ ultima_mensagem_preview: preview, ultima_mensagem_at: new Date().toISOString() })
      .eq('id', conversaId);
    if (updateErro) console.error('[evolution-api] erro ao atualizar conversa:', updateErro);
  } else {
    const { data: nova, error: criarErro } = await serviceClient
      .from('whatsapp_conversas')
      .insert({
        empresa_id: empresaId,
        telefone_jid: jid,
        ultima_mensagem_preview: preview,
        ultima_mensagem_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (criarErro) console.error('[evolution-api] erro ao criar conversa:', criarErro);
    conversaId = nova?.id;
  }

  if (conversaId) {
    const { error: msgErro } = await serviceClient.from('whatsapp_mensagens').insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      ...mensagem,
    });
    if (msgErro) console.error('[evolution-api] erro ao gravar mensagem:', msgErro);
  } else {
    console.error('[evolution-api] não foi possível determinar conversa_id para registrar a mensagem enviada.');
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado.' }, 401);
    }

    // Cliente "no contexto do usuário" — usado só para validar quem está chamando
    // e garantir que ele pertence a uma empresa (RLS já filtra o resto).
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Sessão inválida.' }, 401);
    }

    const { data: usuarioRow, error: usuarioError } = await userClient
      .from('usuarios')
      .select('empresa_id')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (usuarioError || !usuarioRow?.empresa_id) {
      return jsonResponse({ error: 'Usuário sem empresa vinculada.' }, 403);
    }

    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionApiKey) {
      return jsonResponse({ error: 'EVOLUTION_API_KEY não configurada no servidor.' }, 500);
    }

    const payload = await req.json();
    const { action } = payload;

    if (!action) {
      return jsonResponse({ error: 'Parâmetro obrigatório: action.' }, 400);
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Servidor e instância: SEMPRE os gravados para a empresa do usuário.
    const { data: config } = await serviceClient
      .from('whatsapp_configuracoes')
      .select('instance_name, base_url')
      .eq('empresa_id', usuarioRow.empresa_id)
      .maybeSingle();

    if (!config) {
      return jsonResponse({ error: 'Esta empresa ainda não tem WhatsApp configurado.' }, 404);
    }
    const cleanBaseUrl = normalizarBaseUrl(config.base_url);
    if (!cleanBaseUrl) {
      return jsonResponse({ error: 'A URL do servidor cadastrada é inválida (precisa começar com https://).' }, 500);
    }
    const instance_name: string = config.instance_name;

    if (action === 'gerarQrCode') {
      const conectar = async () =>
        fetch(`${cleanBaseUrl}/instance/connect/${encodeURIComponent(instance_name)}`, {
          method: 'GET',
          headers: { apikey: evolutionApiKey },
        });

      let evoResponse = await conectar();
      let evoData = await evoResponse.json().catch(() => ({}));

      // Instância ainda não existe nesse servidor -> cria e tenta conectar de novo
      if (!evoResponse.ok) {
        const criarResponse = await fetch(`${cleanBaseUrl}/instance/create`, {
          method: 'POST',
          headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceName: instance_name,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
          }),
        });
        // Se a instância já existir por outro motivo (ex: 403 "already in use"),
        // seguimos mesmo assim e tentamos conectar de novo.
        await criarResponse.json().catch(() => ({}));

        evoResponse = await conectar();
        evoData = await evoResponse.json().catch(() => ({}));
      }

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Não foi possível gerar o QR Code.', detalhe: evoData },
          evoResponse.status
        );
      }

      if (!evoData?.base64) {
        return jsonResponse(
          { error: 'A instância não retornou um QR Code. Ela já pode estar conectada — tente "Testar conexão".' },
          409
        );
      }

      return jsonResponse({
        ok: true,
        base64: evoData.base64,
        pairingCode: evoData.pairingCode || null,
      });
    }

    if (action === 'status') {
      const evoResponse = await fetch(
        `${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(instance_name)}`,
        {
          method: 'GET',
          headers: { apikey: evolutionApiKey },
        }
      );
      const evoData = await evoResponse.json().catch(() => ({}));

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Falha ao consultar status da instância.', detalhe: evoData },
          evoResponse.status
        );
      }

      return jsonResponse({ ok: true, data: evoData });
    }

    if (action === 'sendText') {
      const { numero, texto } = payload;
      if (!numero || !texto) {
        return jsonResponse({ error: 'Parâmetros obrigatórios: numero, texto.' }, 400);
      }

      // Normaliza número: só dígitos
      const numeroLimpo = normalizarNumeroBR(numero);
      if (numeroLimpo.length < 10) {
        return jsonResponse({ error: 'Número inválido. Use o formato DDI+DDD+número, ex: 5519988992192.' }, 400);
      }

      const evoResponse = await fetch(
        `${cleanBaseUrl}/message/sendText/${encodeURIComponent(instance_name)}`,
        {
          method: 'POST',
          headers: {
            apikey: evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: numeroLimpo,
            text: texto,
          }),
        }
      );
      const evoData = await evoResponse.json().catch(() => ({}));

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Falha ao enviar mensagem.', detalhe: evoData },
          evoResponse.status
        );
      }

      // Registra a mensagem de teste no histórico (fundação para a Fase 3/4)
      const jid = `${numeroLimpo}@s.whatsapp.net`;

      await registrarMensagemEnviada({
        serviceClient,
        empresaId: usuarioRow.empresa_id,
        jid,
        preview: texto.slice(0, 120),
        mensagem: {
          evolution_message_id: evoData?.key?.id ?? null,
          from_me: true,
          remetente_user_id: userData.user.id,
          tipo: 'text',
          conteudo: texto,
          status: 'enviado',
          timestamp_mensagem: new Date().toISOString(),
        },
      });

      return jsonResponse({ ok: true, data: evoData });
    }

    if (action === 'sendAudio') {
      const { numero, media_url } = payload;

      if (!numero || !media_url) {
        return jsonResponse({ error: 'Parâmetros obrigatórios: numero, media_url.' }, 400);
      }
      if (!mediaUrlPermitida(media_url, supabaseUrl, usuarioRow.empresa_id)) {
        return jsonResponse({ error: 'media_url inválida: use um arquivo enviado pela própria empresa.' }, 400);
      }

      const numeroLimpo = normalizarNumeroBR(numero);
      if (numeroLimpo.length < 10) {
        return jsonResponse({ error: 'Número inválido. Use o formato DDI+DDD+número, ex: 5519988992192.' }, 400);
      }

      const evoResponse = await fetch(
        `${cleanBaseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance_name)}`,
        {
          method: 'POST',
          headers: {
            apikey: evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: numeroLimpo,
            audio: media_url,
            encoding: true, // deixa a Evolution API converter pro formato de nota de voz do WhatsApp
          }),
        }
      );
      const evoData = await evoResponse.json().catch(() => ({}));

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Falha ao enviar áudio.', detalhe: evoData },
          evoResponse.status
        );
      }

      const jid = `${numeroLimpo}@s.whatsapp.net`;

      await registrarMensagemEnviada({
        serviceClient,
        empresaId: usuarioRow.empresa_id,
        jid,
        preview: '[Áudio]',
        mensagem: {
          evolution_message_id: evoData?.key?.id ?? null,
          from_me: true,
          remetente_user_id: userData.user.id,
          tipo: 'audio',
          conteudo: null,
          media_url,
          media_mime_type: payload.mimetype || 'audio/webm',
          media_filename: payload.filename || null,
          status: 'enviado',
          timestamp_mensagem: new Date().toISOString(),
        },
      });

      return jsonResponse({ ok: true, data: evoData });
    }

    if (action === 'sendMedia') {
      const { numero, media_url, mediatype, mimetype, filename, caption } = payload;

      if (!numero || !media_url || !mediatype) {
        return jsonResponse({ error: 'Parâmetros obrigatórios: numero, media_url, mediatype.' }, 400);
      }
      if (!['image', 'document'].includes(mediatype)) {
        return jsonResponse({ error: 'mediatype deve ser "image" ou "document" nesta fase.' }, 400);
      }
      if (!mediaUrlPermitida(media_url, supabaseUrl, usuarioRow.empresa_id)) {
        return jsonResponse({ error: 'media_url inválida: use um arquivo enviado pela própria empresa.' }, 400);
      }

      const numeroLimpo = normalizarNumeroBR(numero);
      if (numeroLimpo.length < 10) {
        return jsonResponse({ error: 'Número inválido. Use o formato DDI+DDD+número, ex: 5519988992192.' }, 400);
      }

      const evoResponse = await fetch(
        `${cleanBaseUrl}/message/sendMedia/${encodeURIComponent(instance_name)}`,
        {
          method: 'POST',
          headers: {
            apikey: evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: numeroLimpo,
            mediatype,
            mimetype: mimetype || undefined,
            media: media_url,
            fileName: filename || undefined,
            caption: caption || undefined,
          }),
        }
      );
      const evoData = await evoResponse.json().catch(() => ({}));

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Falha ao enviar mídia.', detalhe: evoData },
          evoResponse.status
        );
      }

      const jid = `${numeroLimpo}@s.whatsapp.net`;

      await registrarMensagemEnviada({
        serviceClient,
        empresaId: usuarioRow.empresa_id,
        jid,
        preview: mediatype === 'image' ? (caption || '[Imagem]') : (filename || '[Documento]'),
        mensagem: {
          evolution_message_id: evoData?.key?.id ?? null,
          from_me: true,
          remetente_user_id: userData.user.id,
          tipo: mediatype,
          conteudo: caption || filename || null,
          media_url,
          media_mime_type: mimetype || null,
          media_filename: filename || null,
          status: 'enviado',
          timestamp_mensagem: new Date().toISOString(),
        },
      });

      return jsonResponse({ ok: true, data: evoData });
    }

    if (action === 'setWebhook') {
      // A URL do webhook é sempre a deste projeto (o navegador não escolhe), porque o
      // segredo do webhook vai junto no cabeçalho.
      const webhookUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/evolution-webhook`;

      const webhookSecret = Deno.env.get('WHATSAPP_WEBHOOK_SECRET');
      if (!webhookSecret) {
        return jsonResponse(
          { error: 'WHATSAPP_WEBHOOK_SECRET não configurado no servidor. Configure o secret antes de ativar o webhook.' },
          500
        );
      }

      const evoResponse = await fetch(
        `${cleanBaseUrl}/webhook/set/${encodeURIComponent(instance_name)}`,
        {
          method: 'POST',
          headers: {
            apikey: evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
              headers: { 'x-webhook-secret': webhookSecret },
            },
          }),
        }
      );
      const evoData = await evoResponse.json().catch(() => ({}));

      if (!evoResponse.ok) {
        return jsonResponse(
          { error: 'Falha ao configurar webhook na Evolution API.', detalhe: evoData },
          evoResponse.status
        );
      }

      return jsonResponse({ ok: true, data: evoData });
    }

    return jsonResponse({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error('[evolution-api] erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno inesperado.', detalhe: String(err) }, 500);
  }
}

Deno.serve(handler);
