// supabase/functions/evolution-webhook/index.ts
//
// Recebe os eventos da Evolution API (mensagens recebidas/enviadas,
// mudança de status de conexão) e grava no banco. Não tem sessão de
// usuário — quem chama é o servidor da Evolution API, não o navegador.
//
// IMPORTANTÍSSIMO NO DEPLOY:
//   Essa função precisa estar com "Verify JWT" DESLIGADO, porque a
//   Evolution API não manda token do Supabase. Se ficar ligado, todo
//   webhook vai voltar 401 e nenhuma mensagem vai chegar no sistema.
//   - Pela Dashboard: Edge Functions > evolution-webhook > Settings >
//     desmarcar "Enforce JWT Verification".
//   - Pela CLI: supabase functions deploy evolution-webhook --no-verify-jwt
//
// Segurança: como a função fica pública na internet, validamos um
// segredo compartilhado (header x-webhook-secret) configurado junto
// com o webhook na Evolution API. Configure o secret:
//   supabase secrets set WHATSAPP_WEBHOOK_SECRET=<uma-string-aleatoria>
// e use o botão "Ativar recebimento de mensagens" na tela de
// configuração do WhatsApp — ele chama a action "setWebhook" da
// evolution-api function, que já injeta esse header automaticamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extrairConteudoMensagem(message: any): { tipo: string; conteudo: string | null } {
  if (!message) return { tipo: 'text', conteudo: null };

  if (message.conversation) {
    return { tipo: 'text', conteudo: message.conversation };
  }
  if (message.extendedTextMessage?.text) {
    return { tipo: 'text', conteudo: message.extendedTextMessage.text };
  }
  if (message.imageMessage) {
    return { tipo: 'image', conteudo: message.imageMessage.caption || '[Imagem]' };
  }
  if (message.documentMessage) {
    return {
      tipo: 'document',
      conteudo: message.documentMessage.caption || message.documentMessage.fileName || '[Documento]',
    };
  }
  if (message.audioMessage) {
    return { tipo: 'audio', conteudo: '[Áudio]' };
  }
  if (message.videoMessage) {
    return { tipo: 'video', conteudo: message.videoMessage.caption || '[Vídeo]' };
  }
  if (message.stickerMessage) {
    return { tipo: 'sticker', conteudo: '[Figurinha]' };
  }

  return { tipo: 'text', conteudo: '[Mensagem não suportada nesta versão]' };
}

function extensaoPorMimetype(mime: string | undefined): string {
  if (!mime) return 'bin';
  const mapa: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
  };
  return mapa[mime] || mime.split('/')[1]?.split(';')[0] || 'bin';
}

// Baixa a mídia (descriptografada pela própria Evolution API) e sobe pro
// Supabase Storage. Só é chamada para 'image' e 'document' nesta fase.
// Em caso de falha, não derruba o processamento da mensagem — ela fica
// registrada só com o texto (ex: "[Imagem]"), sem o anexo.
async function baixarESalvarMidia(params: {
  serviceClient: any;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  evolutionMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  empresaId: string;
  conversaId: string;
  mimetypeOriginal: string | undefined;
  fileNameOriginal: string | undefined;
}): Promise<{ mediaUrl: string | null; mimeType: string | null; fileName: string | null }> {
  const {
    serviceClient, baseUrl, instanceName, apiKey, evolutionMessageId,
    remoteJid, fromMe, empresaId, conversaId, mimetypeOriginal, fileNameOriginal,
  } = params;

  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { key: { id: evolutionMessageId, remoteJid, fromMe } },
      }),
    });

    if (!resp.ok) {
      console.error('[evolution-webhook] falha ao baixar mídia:', await resp.text().catch(() => ''));
      return { mediaUrl: null, mimeType: null, fileName: null };
    }

    const dados = await resp.json().catch(() => ({}));
    const base64: string | undefined = dados?.base64;
    if (!base64) {
      console.error('[evolution-webhook] resposta sem base64 ao baixar mídia');
      return { mediaUrl: null, mimeType: null, fileName: null };
    }

    const mimeType = dados?.mimetype || mimetypeOriginal || 'application/octet-stream';
    const ext = extensaoPorMimetype(mimeType);
    const nomeArquivo = fileNameOriginal || `${evolutionMessageId}.${ext}`;
    const path = `${empresaId}/${conversaId}/${Date.now()}-${nomeArquivo}`;

    const binario = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const { error: uploadError } = await serviceClient.storage
      .from('whatsapp-media')
      .upload(path, binario, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error('[evolution-webhook] falha ao subir mídia pro storage:', uploadError);
      return { mediaUrl: null, mimeType: null, fileName: null };
    }

    const { data: publicUrlData } = serviceClient.storage.from('whatsapp-media').getPublicUrl(path);

    return { mediaUrl: publicUrlData?.publicUrl || null, mimeType, fileName: nomeArquivo };
  } catch (err) {
    console.error('[evolution-webhook] erro inesperado ao baixar mídia:', err);
    return { mediaUrl: null, mimeType: null, fileName: null };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const webhookSecret = Deno.env.get('WHATSAPP_WEBHOOK_SECRET');
    if (webhookSecret) {
      const incomingSecret = req.headers.get('x-webhook-secret');
      if (incomingSecret !== webhookSecret) {
        return jsonResponse({ error: 'Não autorizado.' }, 401);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const payload = await req.json();
    const evento = payload?.event;
    const instanceName = payload?.instance;
    const data = payload?.data;

    if (!evento || !instanceName) {
      return jsonResponse({ ok: true, skipped: 'payload incompleto' });
    }

    // Descobre a qual empresa essa instância pertence
    const { data: config } = await serviceClient
      .from('whatsapp_configuracoes')
      .select('empresa_id, base_url, instance_name, resposta_automatica_ativa, resposta_automatica_mensagem')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (!config?.empresa_id) {
      return jsonResponse({ ok: true, skipped: `instância desconhecida: ${instanceName}` });
    }

    const empresaId = config.empresa_id;

    // -----------------------------------------------------------------
    // connection.update — mantém o status da instância sempre atualizado
    // -----------------------------------------------------------------
    if (evento === 'connection.update') {
      const estado = data?.state;
      const novoStatus = estado === 'open' ? 'conectado' : estado === 'connecting' ? 'desconhecido' : 'desconectado';

      await serviceClient
        .from('whatsapp_configuracoes')
        .update({ status: novoStatus, last_checked_at: new Date().toISOString() })
        .eq('empresa_id', empresaId);

      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // messages.update — atualização de status (enviado/entregue/lido/erro)
    // -----------------------------------------------------------------
    if (evento === 'messages.update') {
      const evolutionMessageId: string | undefined = data?.keyId || data?.key?.id;
      const statusBruto: string | undefined = data?.status;

      if (!evolutionMessageId || !statusBruto) {
        return jsonResponse({ ok: true, skipped: 'sem keyId/status' });
      }

      const MAPA_STATUS: Record<string, string> = {
        PENDING: 'pendente',
        SERVER_ACK: 'enviado',
        DELIVERY_ACK: 'entregue',
        READ: 'lido',
        PLAYED: 'lido',
        ERROR: 'erro',
      };
      const novoStatus = MAPA_STATUS[statusBruto] || 'enviado';

      await serviceClient
        .from('whatsapp_mensagens')
        .update({ status: novoStatus })
        .eq('empresa_id', empresaId)
        .eq('evolution_message_id', evolutionMessageId);

      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------
    // messages.upsert — nova mensagem (recebida ou enviada)
    // -----------------------------------------------------------------
    if (evento === 'messages.upsert') {
      const remoteJid: string | undefined = data?.key?.remoteJid;
      const fromMe: boolean = !!data?.key?.fromMe;
      const evolutionMessageId: string | undefined = data?.key?.id;
      const pushName: string | undefined = data?.pushName;
      const messageTimestamp: number | undefined = data?.messageTimestamp;

      if (!remoteJid) {
        return jsonResponse({ ok: true, skipped: 'sem remoteJid' });
      }

      // Grupos ficam fora do escopo deste módulo por enquanto
      if (remoteJid.endsWith('@g.us')) {
        return jsonResponse({ ok: true, skipped: 'mensagem de grupo' });
      }

      // Evita duplicar mensagem que a própria evolution-api function já
      // gravou no momento do envio (quando o disparo parte do sistema)
      if (evolutionMessageId) {
        const { data: existente } = await serviceClient
          .from('whatsapp_mensagens')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('evolution_message_id', evolutionMessageId)
          .maybeSingle();

        if (existente?.id) {
          return jsonResponse({ ok: true, skipped: 'mensagem já registrada' });
        }
      }

      const { tipo, conteudo } = extrairConteudoMensagem(data?.message);
      const mimetypeOriginal: string | undefined =
        data?.message?.imageMessage?.mimetype ||
        data?.message?.documentMessage?.mimetype ||
        data?.message?.audioMessage?.mimetype;
      const fileNameOriginal: string | undefined = data?.message?.documentMessage?.fileName;
      const timestampMensagem = messageTimestamp
        ? new Date(messageTimestamp * 1000).toISOString()
        : new Date().toISOString();

      // Verifica se já existe cliente cadastrado com esse telefone
      const telefoneDigits = remoteJid.split('@')[0];
      const { data: clienteExistente } = await serviceClient
        .from('whatsapp_clientes')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('telefone', telefoneDigits)
        .maybeSingle();

      // Busca conversa existente para decidir se incrementa não lidas
      const { data: conversaExistente } = await serviceClient
        .from('whatsapp_conversas')
        .select('id, nao_lidas, bot_pausado, bot_pausado_em')
        .eq('empresa_id', empresaId)
        .eq('telefone_jid', remoteJid)
        .maybeSingle();

      const conversaPayload: Record<string, unknown> = {
        empresa_id: empresaId,
        telefone_jid: remoteJid,
        ultima_mensagem_preview: conteudo?.slice(0, 120) || null,
        ultima_mensagem_at: timestampMensagem,
      };

      if (pushName) {
        conversaPayload.nome_exibicao = pushName;
      }
      if (clienteExistente?.id) {
        conversaPayload.cliente_id = clienteExistente.id;
      }
      if (!fromMe) {
        conversaPayload.nao_lidas = (conversaExistente?.nao_lidas || 0) + 1;
        // Se a conversa tinha sido encerrada/arquivada, uma mensagem nova do
        // cliente reabre ela automaticamente, senão o atendente nem fica sabendo.
        conversaPayload.status = 'aberta';
      }

      const { data: conversa, error: conversaError } = await serviceClient
        .from('whatsapp_conversas')
        .upsert(conversaPayload, { onConflict: 'empresa_id,telefone_jid' })
        .select('id')
        .single();

      if (conversaError) {
        console.error('[evolution-webhook] erro ao gravar conversa:', conversaError);
        return jsonResponse({ error: 'Erro ao gravar conversa.' }, 500);
      }

      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;
      let mediaFileName: string | null = null;

      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
      if (['image', 'document', 'audio'].includes(tipo) && evolutionMessageId && config.base_url && evolutionApiKey) {
        const resultado = await baixarESalvarMidia({
          serviceClient,
          baseUrl: config.base_url,
          instanceName,
          apiKey: evolutionApiKey,
          evolutionMessageId,
          remoteJid,
          fromMe,
          empresaId,
          conversaId: conversa.id,
          mimetypeOriginal,
          fileNameOriginal,
        });
        mediaUrl = resultado.mediaUrl;
        mediaMimeType = resultado.mimeType;
        mediaFileName = resultado.fileName;
      }

      await serviceClient.from('whatsapp_mensagens').insert({
        empresa_id: empresaId,
        conversa_id: conversa.id,
        evolution_message_id: evolutionMessageId || null,
        from_me: fromMe,
        tipo,
        conteudo,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        media_filename: mediaFileName,
        status: fromMe ? 'enviado' : 'recebido',
        timestamp_mensagem: timestampMensagem,
      });

      // Resposta automática de boas-vindas: só dispara na primeiríssima
      // mensagem de um contato que nunca tinha conversa registrada, e só
      // uma vez (não é recorrente, não é um bot de fluxo).
      const ehConversaNova = !conversaExistente;
      if (
        ehConversaNova &&
        !fromMe &&
        config.resposta_automatica_ativa &&
        config.resposta_automatica_mensagem?.trim() &&
        config.base_url &&
        evolutionApiKey
      ) {
        try {
          const evoResponse = await fetch(
            `${config.base_url.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(instanceName)}`,
            {
              method: 'POST',
              headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: telefoneDigits, text: config.resposta_automatica_mensagem }),
            }
          );
          const evoData = await evoResponse.json().catch(() => ({}));

          if (evoResponse.ok) {
            await serviceClient.from('whatsapp_mensagens').insert({
              empresa_id: empresaId,
              conversa_id: conversa.id,
              evolution_message_id: evoData?.key?.id ?? null,
              from_me: true,
              tipo: 'text',
              conteudo: config.resposta_automatica_mensagem,
              status: 'enviado',
              timestamp_mensagem: new Date().toISOString(),
            });

            await serviceClient
              .from('whatsapp_conversas')
              .update({
                ultima_mensagem_preview: config.resposta_automatica_mensagem.slice(0, 120),
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq('id', conversa.id);
          } else {
            console.error('[evolution-webhook] falha ao enviar resposta automática:', evoData);
          }
        } catch (err) {
          console.error('[evolution-webhook] erro inesperado na resposta automática:', err);
        }
      }

      // Bot do Cardápio Digital: roda numa function separada e isolada -
      // se ela falhar, não afeta o registro normal da conversa acima.
      if (!fromMe) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/cardapio-whatsapp-bot`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-webhook-secret': webhookSecret || '',
            },
            body: JSON.stringify({
              empresa_id: empresaId,
              telefone_jid: remoteJid,
              texto_recebido: conteudo || '',
              bot_pausado_atual: conversaExistente?.bot_pausado || false,
              bot_pausado_em: conversaExistente?.bot_pausado_em || null,
            }),
          });
        } catch (e) {
          console.error('[evolution-webhook] erro ao chamar bot do cardápio:', e);
        }
      }

      return jsonResponse({ ok: true });
    }

    // Outros eventos: apenas confirma recebimento, sem processar (por enquanto)
    return jsonResponse({ ok: true, skipped: `evento não tratado: ${evento}` });
  } catch (err) {
    console.error('[evolution-webhook] erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno inesperado.', detalhe: String(err) }, 500);
  }
});
