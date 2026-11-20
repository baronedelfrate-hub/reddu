// supabase/functions/resumo-geral-diario/index.ts
//
// Resumo geral do dia por WhatsApp para o dono/gestor (não é o resumo do cardápio).
// Chamada pelo pg_cron a cada 15 minutos. Para cada empresa com
// cardapio_config.resumo_geral.ativo = true e número cadastrado, a partir do horário
// configurado (padrão 19:00, fuso de São Paulo) envia UMA vez por dia:
//   - vendas do dia por canal (PDV, balcão, cardápio digital, mercados...) e total;
//   - produtos mais vendidos do dia;
//   - eventos do dia (confirmados e realizados) com salgados e valor.
//
// Teste: o usuário logado pode pedir { teste: true } (com o token dele) para receber o resumo
// agora, sem marcar o dia como enviado.
//
// Segurança: o envio automático só age sobre empresas que ligaram a rotina e só para o número
// cadastrado por elas. Se CARDAPIO_ALERTAS_CRON_SECRET existir, exige x-cron-secret igual
// (mesmo padrão das outras rotinas agendadas). O teste exige usuário logado da empresa.
//
// Deploy: "Verify JWT" DESLIGADO (chamada do pg_cron; o teste valida o token por conta própria).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const fmtMoeda = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);

function agoraSP(): { data: string; hora: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value])) as Record<string, string>;
  const hora = p.hour === '24' ? '00' : p.hour;
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${hora}:${p.minute}` };
}

// Completa o DDI 55 quando vier só DDD + número.
function normalizarNumeroBR(valor: string): string {
  let d = String(valor).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

const ROTULOS_CANAL: Record<string, string> = {
  PDV: 'PDV', PEDIDO_BALCAO: 'Pedido balcão', CARDAPIO_DIGITAL: 'Cardápio digital', MERCADO: 'Mercados',
};
const rotuloCanal = (c: string) =>
  ROTULOS_CANAL[c] || String(c || 'Outros').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

const ehCancelada = (status: unknown) => String(status ?? '').trim().toUpperCase() === 'CANCELADO';

async function montarResumo(service: any, empresa: { id: string; nome: string }, data: string): Promise<string> {
  const inicio = `${data}T00:00:00-03:00`;
  const fim = `${data}T23:59:59.999-03:00`;

  const { data: vendasBrutas } = await service.from('vendas')
    .select('id, canal_venda, status, total_final')
    .eq('empresa_id', empresa.id).gte('created_at', inicio).lte('created_at', fim);
  const vendas = (vendasBrutas || []).filter((v: any) => !ehCancelada(v.status));

  const porCanal = new Map<string, { n: number; total: number }>();
  let totalGeral = 0;
  vendas.forEach((v: any) => {
    const k = String(v.canal_venda || 'OUTROS');
    const c = porCanal.get(k) || { n: 0, total: 0 };
    c.n += 1; c.total += Number(v.total_final) || 0;
    porCanal.set(k, c);
    totalGeral += Number(v.total_final) || 0;
  });

  // produtos mais vendidos (movimentações das vendas do dia)
  const qtdPorProduto = new Map<string, number>();
  const ids = vendas.map((v: any) => v.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: movs } = await service.from('movimentacoes')
      .select('produto_id, quantidade, tipo_item')
      .in('venda_id', ids.slice(i, i + 100)).in('tipo', ['venda', 'venda_mercado']);
    (movs || []).forEach((m: any) => {
      if (!m.produto_id || (m.tipo_item && m.tipo_item !== 'NORMAL')) return;
      qtdPorProduto.set(m.produto_id, (qtdPorProduto.get(m.produto_id) || 0) + (Number(m.quantidade) || 0));
    });
  }
  const topIds = [...qtdPorProduto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const nomes = new Map<string, string>();
  if (topIds.length > 0) {
    const { data: prods } = await service.from('produtos').select('id, nome').in('id', topIds.map(([id]) => id));
    (prods || []).forEach((p: any) => nomes.set(p.id, p.nome));
  }

  // eventos do dia
  const { data: eventos } = await service.from('eventos')
    .select('id, nome_cliente, status, total_salgados, valor_total')
    .eq('empresa_id', empresa.id).eq('data_evento', data).in('status', ['confirmado', 'realizado']);
  const evIds = (eventos || []).map((e: any) => e.id);
  const salgadosPorEvento = new Map<string, number>();
  if (evIds.length > 0) {
    const { data: itens } = await service.from('evento_itens').select('evento_id, quantidade').in('evento_id', evIds);
    (itens || []).forEach((i: any) => salgadosPorEvento.set(i.evento_id, (salgadosPorEvento.get(i.evento_id) || 0) + (Number(i.quantidade) || 0)));
  }

  const [, mm, dd] = data.split('-');
  const linhas: string[] = [`📊 *Resumo do dia ${dd}/${mm}* — ${empresa.nome}`, ''];

  if (vendas.length === 0) {
    linhas.push('💰 Nenhuma venda registrada hoje.');
  } else {
    linhas.push(`💰 *Vendas:* ${fmtMoeda(totalGeral)} (${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'})`);
    [...porCanal.entries()].sort((a, b) => b[1].total - a[1].total)
      .forEach(([canal, c]) => linhas.push(`• ${rotuloCanal(canal)}: ${fmtMoeda(c.total)} (${c.n})`));
  }

  if (topIds.length > 0) {
    linhas.push('', '🥟 *Mais vendidos hoje:*');
    topIds.forEach(([id, qtd], idx) => linhas.push(`${idx + 1}. ${nomes.get(id) || 'Produto'} — ${fmtNum(qtd)} un`));
  }

  if ((eventos || []).length > 0) {
    linhas.push('', '🎉 *Eventos de hoje:*');
    (eventos || []).forEach((e: any) => {
      const salgados = salgadosPorEvento.get(e.id) || Number(e.total_salgados) || 0;
      linhas.push(`• ${e.nome_cliente} — ${fmtNum(salgados)} salgados · ${fmtMoeda(Number(e.valor_total) || 0)} (${e.status === 'realizado' ? 'realizado' : 'confirmado'})`);
    });
  }

  return linhas.join('\n');
}

async function enviarWhatsApp(service: any, empresaId: string, numero: string, texto: string): Promise<boolean> {
  const { data: config } = await service.from('whatsapp_configuracoes').select('base_url, instance_name').eq('empresa_id', empresaId).maybeSingle();
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!config?.base_url || !config?.instance_name || !apiKey) {
    console.error('[resumo-geral-diario] whatsapp não configurado para a empresa', empresaId);
    return false;
  }
  const resp = await fetch(`${String(config.base_url).replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(config.instance_name)}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: normalizarNumeroBR(numero), text: texto, linkPreview: false }),
  });
  if (!resp.ok) {
    console.error('[resumo-geral-diario] falha ao enviar whatsapp:', await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const corpo = await req.json().catch(() => ({}));
    const agora = agoraSP();

    // ----- teste: usuário logado recebe o resumo agora -----
    if (corpo?.teste === true) {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: auth } = jwt ? await service.auth.getUser(jwt) : { data: null };
      if (!auth?.user) return jsonResponse({ ok: false, error: 'Não autenticado.' }, 401);
      const { data: u } = await service.from('usuarios').select('empresa_id').eq('id', auth.user.id).maybeSingle();
      if (!u?.empresa_id) return jsonResponse({ ok: false, error: 'Usuário sem empresa vinculada.' }, 403);
      const { data: emp } = await service.from('empresas').select('id, nome, cardapio_config').eq('id', u.empresa_id).maybeSingle();
      const cfg = emp?.cardapio_config?.resumo_geral;
      if (!cfg?.whatsapp_numero) return jsonResponse({ ok: false, error: 'Cadastre o número de WhatsApp antes de testar.' }, 400);
      const texto = await montarResumo(service, emp, agora.data);
      const enviado = await enviarWhatsApp(service, emp.id, cfg.whatsapp_numero, texto);
      if (!enviado) return jsonResponse({ ok: false, error: 'Não foi possível enviar pelo WhatsApp. Confira se a conexão do WhatsApp está ativa.' }, 502);
      return jsonResponse({ ok: true, enviado_para: String(cfg.whatsapp_numero) });
    }

    // ----- envio automático (cron) -----
    const segredo = Deno.env.get('CARDAPIO_ALERTAS_CRON_SECRET');
    if (segredo && req.headers.get('x-cron-secret') !== segredo) return jsonResponse({ error: 'Não autorizado.' }, 401);

    const { data: empresas, error } = await service.from('empresas').select('id, nome, cardapio_config, resumo_geral_ultimo_em');
    if (error) throw error;

    const resultados: Record<string, string> = {};
    for (const empresa of empresas || []) {
      const cfg = empresa.cardapio_config?.resumo_geral;
      if (!cfg?.ativo || !cfg?.whatsapp_numero) continue;
      const horario = String(cfg.horario || '19:00');
      if (empresa.resumo_geral_ultimo_em === agora.data || agora.hora < horario) continue;

      try {
        const texto = await montarResumo(service, empresa, agora.data);
        const enviado = await enviarWhatsApp(service, empresa.id, cfg.whatsapp_numero, texto);
        if (enviado) {
          await service.from('empresas').update({ resumo_geral_ultimo_em: agora.data }).eq('id', empresa.id);
          resultados[empresa.id] = 'enviado';
        } else {
          resultados[empresa.id] = 'falhou (tenta de novo no próximo ciclo)';
        }
      } catch (e) {
        console.error('[resumo-geral-diario] erro na empresa', empresa.id, e);
        resultados[empresa.id] = 'erro';
      }
    }
    return jsonResponse({ ok: true, resultados });
  } catch (e) {
    console.error('[resumo-geral-diario] erro inesperado:', e);
    return jsonResponse({ ok: false, error: 'Erro interno inesperado.' }, 500);
  }
});
