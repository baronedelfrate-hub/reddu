// supabase/functions/notas-fiscais-envio-automatico/index.ts
//
// Rotina mensal: chamada 1x por dia pelo pg_cron. Para cada empresa com
// configuracoes_fiscais.envio_escritorio_ativo = true, no dia configurado
// (envio_escritorio_dia) envia ao escritório contábil o ZIP com os XMLs das notas
// emitidas no MÊS ANTERIOR, usando a ação enviar_escritorio da função
// notas-fiscais-arquivos (chamada interna com a chave de serviço).
//
// Regras:
//   - Janela de 6 dias a partir do dia configurado (cobre um dia em que algo falhou).
//   - Não envia de novo se o mês já foi enviado (manual ou automático).
//   - Se algumas notas não puderem ser baixadas da Focus, espera e tenta de novo nos dias
//     seguintes; a partir do 4º dia da janela envia o que tiver.
//   - O resultado fica em envio_escritorio_ultimo_resultado (aparece na tela).
//
// Segurança: não recebe dados do chamador. Só age sobre empresas que ligaram a rotina,
// no máximo 1 envio por mês e só para o e-mail cadastrado. Se NOTAS_FISCAIS_CRON_SECRET
// existir, exige o mesmo valor no cabeçalho x-cron-secret (opcional, como nas outras rotinas).
//
// Deploy: "Verify JWT" DESLIGADO (chamada do pg_cron).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const JANELA_DIAS = 6;
const FORCAR_A_PARTIR_DO_DIA = 3; // dias depois do dia configurado

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function hojeSP(): { ano: number; mes: number; dia: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value])) as Record<string, string>;
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day) };
}

const rotulo = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
const dataBR = (h: { ano: number; mes: number; dia: number }) => `${String(h.dia).padStart(2, '0')}/${String(h.mes).padStart(2, '0')}`;

Deno.serve(async (req) => {
  const segredo = Deno.env.get('NOTAS_FISCAIS_CRON_SECRET');
  if (segredo && req.headers.get('x-cron-secret') !== segredo) return jsonResponse({ error: 'Não autorizado.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service = createClient(supabaseUrl, serviceKey);

  const hoje = hojeSP();
  const mesAnt = hoje.mes === 1 ? { ano: hoje.ano - 1, mes: 12 } : { ano: hoje.ano, mes: hoje.mes - 1 };
  const mesRef = `${mesAnt.ano}-${String(mesAnt.mes).padStart(2, '0')}`;

  const { data: configs, error } = await service.from('configuracoes_fiscais')
    .select('empresa_id, envio_escritorio_dia, email_escritorio_contabil')
    .eq('envio_escritorio_ativo', true);
  if (error) { console.error('[notas-fiscais-envio-automatico] erro ao ler configurações:', error.message); return jsonResponse({ error: 'Erro interno.' }, 500); }

  const resultados: { empresa_id: string; resultado: string }[] = [];

  for (const c of configs || []) {
    const dia = Number(c.envio_escritorio_dia) || 5;
    const diasDesde = hoje.dia - dia;
    if (diasDesde < 0 || diasDesde >= JANELA_DIAS) continue; // não é a hora desta empresa

    const grava = async (texto: string) => {
      await service.from('configuracoes_fiscais').update({ envio_escritorio_ultimo_resultado: texto }).eq('empresa_id', c.empresa_id);
      resultados.push({ empresa_id: c.empresa_id, resultado: texto });
    };

    try {
      const { count } = await service.from('notas_fiscais_envios_escritorio')
        .select('id', { count: 'exact', head: true }).eq('empresa_id', c.empresa_id).eq('mes', mesRef);
      if ((count ?? 0) > 0) continue; // mês já enviado

      const resp = await fetch(`${supabaseUrl}/functions/v1/notas-fiscais-arquivos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enviar_escritorio', empresa_id: c.empresa_id, mes: mesRef, forcar: diasDesde >= FORCAR_A_PARTIR_DO_DIA }),
      });
      const corpo = await resp.json().catch(() => ({}));

      if (resp.ok && corpo?.ok) {
        await grava(`Enviado em ${dataBR(hoje)}: ${corpo.enviadas} nota(s) de ${rotulo(mesRef)} para ${corpo.email}.`);
      } else if (resp.status === 409) {
        await grava(`${dataBR(hoje)}: ${corpo?.falhas?.length ?? 'algumas'} nota(s) de ${rotulo(mesRef)} indisponíveis na Focus. Nova tentativa amanhã.`);
      } else if (resp.status === 404) {
        await grava(`${dataBR(hoje)}: nenhuma nota emitida em ${rotulo(mesRef)}; nada a enviar.`);
      } else {
        await grava(`${dataBR(hoje)}: não foi possível enviar ${rotulo(mesRef)} — ${corpo?.error || `erro ${resp.status}`}`);
      }
    } catch (e) {
      console.error('[notas-fiscais-envio-automatico] erro na empresa', c.empresa_id, e);
      await grava(`${dataBR(hoje)}: erro inesperado ao enviar ${rotulo(mesRef)}. Tentaremos de novo amanhã.`);
    }
  }

  return jsonResponse({ ok: true, mes: mesRef, processadas: resultados.length, resultados });
});
