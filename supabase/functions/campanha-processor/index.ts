// supabase/functions/campanha-processor/index.ts
//
// Chamada pelo pg_cron a cada 1 minuto. Para cada campanha "em_andamento",
// pega um lote de destinatários pendentes (do tamanho configurado em
// mensagens_por_minuto) e dispara, com um pequeno atraso aleatório entre
// cada envio (reduz o padrão "mensagens idênticas em rajada").
//
// IMPORTANTÍSSIMO NO DEPLOY:
//   Assim como a evolution-webhook, essa função precisa estar com
//   "Verify JWT" DESLIGADO — quem chama é o pg_cron do banco, não um
//   usuário logado.
//   - Pela CLI: supabase functions deploy campanha-processor --no-verify-jwt
//
// Segurança: valida um segredo compartilhado (header x-cron-secret),
// configurado no job do pg_cron e no secret WHATSAPP_CAMPAIGN_CRON_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolverMensagem(template: string, nome: string | null, variaveis: Record<string, unknown> | null): string {
  const nomeSeguro = nome?.trim() || 'cliente';
  const primeiroNome = nomeSeguro.split(' ')[0];
  let texto = template.replaceAll('{nome}', primeiroNome);
  if (variaveis) {
    for (const [chave, valor] of Object.entries(variaveis)) {
      if (chave === 'nome') continue; // já tratado acima (usa só o primeiro nome)
      texto = texto.replaceAll(`{${chave}}`, valor == null ? '' : String(valor));
    }
  }
  return texto;
}

// Completa o DDI 55 quando o número vier só com DDD + número (10 ou 11
// dígitos). Assume Brasil, único país atendido por este sistema. Também
// serve como rede de segurança para números já importados sem DDI.
function normalizarNumeroBR(valor: string): string {
  let digits = String(valor).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('WHATSAPP_CAMPAIGN_CRON_SECRET');
    if (cronSecret) {
      const incoming = req.headers.get('x-cron-secret');
      if (incoming !== cronSecret) {
        return jsonResponse({ error: 'Não autorizado.' }, 401);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiKey) {
      return jsonResponse({ error: 'EVOLUTION_API_KEY não configurada.' }, 500);
    }

    // Todas as campanhas em andamento, de qualquer empresa
    const { data: campanhas, error: campanhasError } = await serviceClient
      .from('whatsapp_campanhas')
      .select('*')
      .eq('status', 'em_andamento');

    if (campanhasError) {
      console.error('[campanha-processor] erro ao buscar campanhas:', campanhasError);
      return jsonResponse({ error: 'Erro ao buscar campanhas.' }, 500);
    }

    if (!campanhas || campanhas.length === 0) {
      return jsonResponse({ ok: true, processadas: 0 });
    }

    const resultados: Record<string, unknown> = {};

    for (const campanha of campanhas) {
      // Configuração da instância dessa empresa
      const { data: config } = await serviceClient
        .from('whatsapp_configuracoes')
        .select('base_url, instance_name')
        .eq('empresa_id', campanha.empresa_id)
        .maybeSingle();

      if (!config?.base_url || !config?.instance_name) {
        resultados[campanha.id] = { skipped: 'instância não configurada' };
        continue;
      }

      // Pega o lote da vez, já marcando como "enviando" (evita corrida com outra execução)
      const { data: lote, error: loteError } = await serviceClient.rpc('rpc_pegar_lote_campanha', {
        p_campanha_id: campanha.id,
        p_quantidade: campanha.mensagens_por_minuto,
      });

      if (loteError) {
        console.error('[campanha-processor] erro ao pegar lote:', loteError);
        resultados[campanha.id] = { error: loteError.message };
        continue;
      }

      if (!lote || lote.length === 0) {
        // Nada pendente: se não sobrou nada em nenhum status "pendente"/"enviando", encerra a campanha
        const { count } = await serviceClient
          .from('whatsapp_campanha_destinatarios')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', campanha.id)
          .in('status', ['pendente', 'enviando']);

        if (!count) {
          await serviceClient
            .from('whatsapp_campanhas')
            .update({ status: 'concluida', concluida_em: new Date().toISOString() })
            .eq('id', campanha.id);
        }
        resultados[campanha.id] = { enviados: 0, motivo: 'sem pendentes' };
        continue;
      }

      // Espalha os envios do lote ao longo de ~50s (deixa uma folga dos 60s do cron)
      const intervaloMs = lote.length > 1 ? Math.floor(50000 / lote.length) : 0;
      let enviados = 0;
      let erros = 0;

      for (const destinatario of lote) {
        const numeroLimpo = normalizarNumeroBR(destinatario.telefone);
        const texto = resolverMensagem(campanha.mensagem_template, destinatario.nome, destinatario.variaveis);

        try {
          const evoResponse = await fetch(
            `${config.base_url.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(config.instance_name)}`,
            {
              method: 'POST',
              headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: numeroLimpo, text: texto }),
            }
          );
          const evoData = await evoResponse.json().catch(() => ({}));

          if (!evoResponse.ok) {
            throw new Error(evoData?.response?.message?.[0] || evoData?.message || 'Falha no envio');
          }

          await serviceClient
            .from('whatsapp_campanha_destinatarios')
            .update({
              status: 'enviado',
              mensagem_enviada: texto,
              evolution_message_id: evoData?.key?.id ?? null,
              enviado_em: new Date().toISOString(),
            })
            .eq('id', destinatario.id);

          // Também registra na conversa normal, pra aparecer no histórico do cliente.
          // Usamos select + update/insert (em vez de upsert) porque a mesma conversa
          // pode estar sendo escrita ao mesmo tempo pelo webhook (mensagem chegando)
          // e um upsert concorrente pode falhar de forma silenciosa.
          const jid = `${numeroLimpo}@s.whatsapp.net`;
          let conversaId: string | undefined;

          const { data: conversaExistente, error: buscaConversaError } = await serviceClient
            .from('whatsapp_conversas')
            .select('id')
            .eq('empresa_id', campanha.empresa_id)
            .eq('telefone_jid', jid)
            .maybeSingle();

          if (buscaConversaError) {
            console.error('[campanha-processor] erro ao buscar conversa:', buscaConversaError);
          }

          if (conversaExistente?.id) {
            conversaId = conversaExistente.id;
            const { error: updateConversaError } = await serviceClient
              .from('whatsapp_conversas')
              .update({
                ultima_mensagem_preview: texto.slice(0, 120),
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq('id', conversaId);
            if (updateConversaError) {
              console.error('[campanha-processor] erro ao atualizar conversa:', updateConversaError);
            }
          } else {
            const { data: novaConversa, error: criarConversaError } = await serviceClient
              .from('whatsapp_conversas')
              .insert({
                empresa_id: campanha.empresa_id,
                telefone_jid: jid,
                ultima_mensagem_preview: texto.slice(0, 120),
                ultima_mensagem_at: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (criarConversaError) {
              console.error('[campanha-processor] erro ao criar conversa:', criarConversaError);
            } else {
              conversaId = novaConversa?.id;
            }
          }

          if (conversaId) {
            const { error: msgError } = await serviceClient.from('whatsapp_mensagens').insert({
              empresa_id: campanha.empresa_id,
              conversa_id: conversaId,
              evolution_message_id: evoData?.key?.id ?? null,
              from_me: true,
              tipo: 'text',
              conteudo: texto,
              status: 'enviado',
              timestamp_mensagem: new Date().toISOString(),
            });
            if (msgError) {
              console.error('[campanha-processor] erro ao gravar mensagem da campanha:', msgError);
            }
          } else {
            console.error(
              '[campanha-processor] não foi possível determinar a conversa para registrar a mensagem do destinatário:',
              destinatario.id
            );
          }

          enviados++;
        } catch (err) {
          await serviceClient
            .from('whatsapp_campanha_destinatarios')
            .update({ status: 'erro', erro_detalhe: String(err) })
            .eq('id', destinatario.id);
          erros++;
        }

        if (intervaloMs > 0) {
          await aguardar(intervaloMs + Math.floor(Math.random() * 1000));
        }
      }

      await serviceClient
        .from('whatsapp_campanhas')
        .update({
          total_enviados: (campanha.total_enviados || 0) + enviados,
          total_erros: (campanha.total_erros || 0) + erros,
        })
        .eq('id', campanha.id);

      resultados[campanha.id] = { enviados, erros };
    }

    return jsonResponse({ ok: true, resultados });
  } catch (err) {
    console.error('[campanha-processor] erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno inesperado.', detalhe: String(err) }, 500);
  }
});
