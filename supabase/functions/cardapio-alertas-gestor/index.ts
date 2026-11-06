// supabase/functions/cardapio-alertas-gestor/index.ts
//
// Chamada pelo pg_cron a cada 15 minutos. Para cada empresa com
// cardapio_config.alertas_gestor.ativo = true, verifica e dispara (por
// WhatsApp e/ou e-mail, conforme configurado pelo gestor):
//   - Resumo diário do Cardápio Digital (1x por dia, no horário configurado)
//   - Pedido parado além do tempo de preparo configurado
//   - Pedido com erro na emissão da NFC-e
//
// Segurança: mesmo padrão do campanha-processor — valida x-cron-secret
// contra o secret CARDAPIO_ALERTAS_CRON_SECRET, se configurado (opcional).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Completa o DDI 55 quando o número vier só com DDD + número (10 ou 11
// dígitos). Assume Brasil, único país atendido por este sistema.
function normalizarNumeroBR(valor: string): string {
  let digits = String(valor).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

const fmtMoeda = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

// Data/hora no fuso de São Paulo, sem depender de bibliotecas externas.
function agoraSP(): { data: string; hora: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`, // YYYY-MM-DD
    hora: `${partes.hour}:${partes.minute}`, // HH:MM
  };
}

async function enviarWhatsApp(serviceClient: any, empresaId: string, numero: string, texto: string): Promise<boolean> {
  const { data: config } = await serviceClient
    .from('whatsapp_configuracoes')
    .select('base_url, instance_name')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!config?.base_url || !config?.instance_name || !evolutionApiKey) {
    console.error('[cardapio-alertas-gestor] whatsapp não configurado pra empresa', empresaId);
    return false;
  }

  const numeroLimpo = normalizarNumeroBR(numero);
  const resp = await fetch(
    `${String(config.base_url).replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(config.instance_name)}`,
    {
      method: 'POST',
      headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numeroLimpo, text: texto }),
    }
  );
  if (!resp.ok) {
    console.error('[cardapio-alertas-gestor] falha ao enviar whatsapp:', await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

async function enviarEmail(destino: string, assunto: string, texto: string): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('[cardapio-alertas-gestor] RESEND_API_KEY não configurada.');
    return false;
  }
  const html = `<pre style="font-family: inherit; white-space: pre-wrap; font-size: 14px;">${texto.replace(/</g, '&lt;')}</pre>`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
    body: JSON.stringify({ from: 'Reddu <noreply@reddu.com.br>', to: [destino], subject: assunto, html }),
  });
  if (!resp.ok) {
    console.error('[cardapio-alertas-gestor] falha ao enviar e-mail:', await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

async function disparar(serviceClient: any, empresaId: string, cfg: any, texto: string, assuntoEmail: string) {
  const canal = cfg.canal || 'whatsapp';
  if ((canal === 'whatsapp' || canal === 'ambos') && cfg.whatsapp_numero) {
    await enviarWhatsApp(serviceClient, empresaId, cfg.whatsapp_numero, texto);
  }
  if ((canal === 'email' || canal === 'ambos') && cfg.email) {
    await enviarEmail(cfg.email, assuntoEmail, texto);
  }
}

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get('CARDAPIO_ALERTAS_CRON_SECRET');
    if (cronSecret) {
      const incoming = req.headers.get('x-cron-secret');
      if (incoming !== cronSecret) return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: empresas, error: empresasError } = await serviceClient
      .from('empresas')
      .select('id, nome, cardapio_config, alertas_gestor_ultimo_resumo_em');

    if (empresasError) throw empresasError;

    const hora = agoraSP();
    const resultados: Record<string, unknown> = {};

    for (const empresa of empresas || []) {
      const cfg = empresa.cardapio_config?.alertas_gestor;
      if (!cfg?.ativo) continue;

      const resumoExecucao: Record<string, unknown> = {};

      // --- Resumo diário ---
      if (cfg.resumo_diario_ativo && cfg.resumo_diario_horario) {
        const jaEnviouHoje = empresa.alertas_gestor_ultimo_resumo_em === hora.data;
        if (!jaEnviouHoje && hora.hora >= cfg.resumo_diario_horario) {
          const inicioDia = `${hora.data}T00:00:00-03:00`;
          const { data: pedidos } = await serviceClient
            .from('pedidos_cardapio')
            .select('status, total, tipo_entrega, bairro, numero_pedido, vendas(status_fiscal, nfe_erro_mensagem)')
            .eq('empresa_id', empresa.id)
            .gte('created_at', inicioDia);

          const validos = (pedidos || []).filter((p: any) => p.status !== 'CANCELADO');
          const cancelados = (pedidos || []).filter((p: any) => p.status === 'CANCELADO');
          const totalVendido = validos.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
          const ticketMedio = validos.length ? totalVendido / validos.length : 0;
          const bairroMap: Record<string, number> = {};
          validos.forEach((p: any) => { if (p.tipo_entrega === 'entrega' && p.bairro) bairroMap[p.bairro] = (bairroMap[p.bairro] || 0) + 1; });
          const topBairro = Object.entries(bairroMap).sort((a: any, b: any) => b[1] - a[1])[0];
          const comErro = validos.filter((p: any) => p.vendas?.status_fiscal === 'erro');

          const texto = `📊 Resumo do dia — ${empresa.nome}\n`
            + `${validos.length} pedidos${cancelados.length ? ` (${cancelados.length} cancelado${cancelados.length > 1 ? 's' : ''})` : ''} · ${fmtMoeda(totalVendido)} faturado\n`
            + `Ticket médio: ${fmtMoeda(ticketMedio)}\n`
            + (topBairro ? `Bairro campeão: ${topBairro[0]} (${topBairro[1]} pedidos)\n` : '')
            + (comErro.length ? `⚠️ ${comErro.length} pedido(s) com erro na nota fiscal — confira no painel` : '✅ Nenhum erro fiscal hoje');

          await disparar(serviceClient, empresa.id, cfg, texto, `Resumo do dia — ${empresa.nome}`);
          await serviceClient.from('empresas').update({ alertas_gestor_ultimo_resumo_em: hora.data }).eq('id', empresa.id);
          resumoExecucao.resumo_diario = 'enviado';
        }
      }

      // --- Pedido parado além do tempo de preparo ---
      if (cfg.pedido_parado_ativo) {
        const tempoPreparo = Number(empresa.cardapio_config?.tempo_preparo_minutos) || 30;
        const limiteMs = tempoPreparo * 1.5 * 60 * 1000;
        const limite = new Date(Date.now() - limiteMs).toISOString();
        const { data: parados } = await serviceClient
          .from('pedidos_cardapio')
          .select('id, numero_pedido, status, created_at')
          .eq('empresa_id', empresa.id)
          .in('status', ['PENDENTE', 'CONFIRMADO', 'EM_PREPARO'])
          .not('arquivado', 'eq', true)
          .lt('created_at', limite)
          .is('alerta_atraso_enviado_em', null);

        for (const p of parados || []) {
          const minutos = Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000);
          const texto = `⚠️ Pedido #${p.numero_pedido} parado em "${p.status}" há ${minutos} min (previsto: ${tempoPreparo} min)`;
          await disparar(serviceClient, empresa.id, cfg, texto, `Pedido atrasado — ${empresa.nome}`);
          await serviceClient.from('pedidos_cardapio').update({ alerta_atraso_enviado_em: new Date().toISOString() }).eq('id', p.id);
        }
        resumoExecucao.pedidos_parados_alertados = (parados || []).length;
      }

      // --- Erro fiscal na NFC-e ---
      if (cfg.erro_fiscal_ativo) {
        const { data: pedidosErro } = await serviceClient
          .from('pedidos_cardapio')
          .select('id, numero_pedido, vendas!inner(status_fiscal, nfe_erro_mensagem)')
          .eq('empresa_id', empresa.id)
          .eq('vendas.status_fiscal', 'erro')
          .is('alerta_fiscal_enviado_em', null);

        for (const p of pedidosErro || []) {
          const texto = `⚠️ Erro fiscal no pedido #${p.numero_pedido}: ${p.vendas?.nfe_erro_mensagem || 'erro não especificado'}`;
          await disparar(serviceClient, empresa.id, cfg, texto, `Erro fiscal — ${empresa.nome}`);
          await serviceClient.from('pedidos_cardapio').update({ alerta_fiscal_enviado_em: new Date().toISOString() }).eq('id', p.id);
        }
        resumoExecucao.erros_fiscais_alertados = (pedidosErro || []).length;
      }

      if (Object.keys(resumoExecucao).length) resultados[empresa.id] = resumoExecucao;
    }

    return jsonResponse({ ok: true, resultados });
  } catch (err) {
    console.error('[cardapio-alertas-gestor] erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno inesperado.', detalhe: String(err) }, 500);
  }
});
