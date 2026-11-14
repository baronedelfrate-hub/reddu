// supabase/functions/notas-fiscais-arquivos/index.ts
//
// Arquivos e dados das notas fiscais emitidas, buscados na Focus NFe com o token da empresa
// (o token NUNCA vai para o navegador).
//
// Segurança:
//   - Exige usuário logado e usa a empresa DELE; só mexe em notas dessa empresa.
//   - O token vem de configuracoes_fiscais (servidor). Só chama o endereço da Focus
//     (host api.focusnfe.com.br ou homologacao.focusnfe.com.br) e só baixa arquivos cujo
//     caminho começa com "/" — nunca um endereço completo vindo da resposta.
//
// Ações (body: { action, ... }):
//   xml       { fonte: 'vendas'|'reabastecimento'|'consignado', id }          -> { nome, xml }
//   zip       { de, ate, origem? }  (datas YYYY-MM-DD; origem opcional)       -> { nome, base64, incluidas, falhas }
//   completar { limite?, ignorar? }  notas emitidas sem chave/link: busca na Focus e grava -> { atualizadas, restantes, falhas }
//
// Deploy: precisa de "Verify JWT" LIGADO (padrão).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOSTS_FOCUS = ['api.focusnfe.com.br', 'homologacao.focusnfe.com.br'];
const MAX_NOTAS_ZIP = 300;
const LOTE_COMPLETAR = 40;
const CONCORRENCIA = 6;
const TEMPO_CHAMADA_MS = 15000;

class ErroHttp extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function comConcorrencia<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length > 0) await tarefa(fila.shift() as T);
  });
  await Promise.all(trabalhadores);
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
// A Focus devolve a chave como "NFe" + 44 dígitos.
const chaveLimpa = (v: unknown) => soDigitos(v).slice(0, 44);

type Focus = { base: string; auth: string };

// Endereço base da Focus (origem) + cabeçalho de autenticação, validando o host.
function configurarFocus(urlApi: string, token: string): { focus: Focus; urlNota: (ref: string) => string } {
  let u: URL;
  try { u = new URL(String(urlApi)); } catch { throw new ErroHttp(400, 'URL da API Focus inválida nas configurações fiscais.'); }
  if (u.protocol !== 'https:' || !HOSTS_FOCUS.includes(u.hostname)) {
    throw new ErroHttp(400, 'A URL da API Focus nas configurações fiscais não é um endereço da Focus NFe.');
  }
  const base = u.origin;
  const caminho = u.pathname.replace(/\/+$/, '');
  return {
    focus: { base, auth: `Basic ${btoa(`${token}:`)}` },
    urlNota: (ref: string) => `${base}${caminho}/${encodeURIComponent(ref)}`,
  };
}

async function chamarFocus(url: string, focus: Focus): Promise<Response> {
  return await fetch(url, { headers: { Authorization: focus.auth }, signal: AbortSignal.timeout(TEMPO_CHAMADA_MS) });
}

async function consultarNota(urlNota: (ref: string) => string, focus: Focus, ref: string) {
  const resp = await chamarFocus(urlNota(ref), focus);
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados?.mensagem || dados?.codigo || `A Focus respondeu ${resp.status}.`);
  return dados;
}

async function baixarXml(focus: Focus, caminho: string): Promise<string> {
  if (!caminho || !String(caminho).startsWith('/')) throw new Error('A Focus não informou o arquivo XML desta nota.');
  const resp = await chamarFocus(`${focus.base}${caminho}`, focus);
  if (!resp.ok) throw new Error(`Não foi possível baixar o XML (${resp.status}).`);
  return await resp.text();
}

// Nota autorizada → { chave, xml, linkDanfe }
async function xmlDaNota(urlNota: (ref: string) => string, focus: Focus, ref: string) {
  const dados = await consultarNota(urlNota, focus, ref);
  if (dados.status && dados.status !== 'autorizado') throw new Error(`Nota com status "${dados.status}" na Focus.`);
  const xml = await baixarXml(focus, dados.caminho_xml_nota_fiscal);
  return { chave: chaveLimpa(dados.chave_nfe || dados.chave), xml, dados };
}

// ---------- leitura das notas da empresa ----------
type Fonte = 'vendas' | 'reabastecimento' | 'consignado';
type NotaRef = { fonte: Fonte; id: string; ref: string; chave: string | null; descricao: string; origem: string };

async function notaPorId(service: any, empresaId: string, fonte: Fonte, id: string): Promise<NotaRef> {
  if (fonte === 'vendas') {
    const { data } = await service.from('vendas').select('id, nfe_id, nfe_chave, cliente_referencia, canal_venda, status_fiscal')
      .eq('empresa_id', empresaId).eq('id', id).maybeSingle();
    if (!data || data.status_fiscal !== 'emitido') throw new ErroHttp(404, 'Nota não encontrada.');
    return { fonte, id, ref: data.nfe_id || data.id, chave: data.nfe_chave, descricao: data.cliente_referencia || 'Consumidor', origem: data.canal_venda || 'VENDAS' };
  }
  const tabela = fonte === 'reabastecimento' ? 'pedidos_reabastecimento_mercados' : 'pedidos_consignado_mercados';
  const pedidos = fonte === 'reabastecimento' ? 'pedidos_reabastecimento' : 'pedidos_consignado';
  const { data } = await service.from(tabela)
    .select(`id, nfe_id, nfe_chave, status_fiscal, locais(nome), ${pedidos}!inner(empresa_id)`)
    .eq('id', id).eq(`${pedidos}.empresa_id`, empresaId).maybeSingle();
  if (!data || data.status_fiscal !== 'emitido' || !data.nfe_id) throw new ErroHttp(404, 'Nota não encontrada.');
  return { fonte, id, ref: data.nfe_id, chave: data.nfe_chave, descricao: data.locais?.nome || 'Mercado', origem: fonte === 'reabastecimento' ? 'REABASTECIMENTO' : 'CONSIGNADO' };
}

async function notasDoPeriodo(service: any, empresaId: string, de: string, ate: string, origem: string | null): Promise<NotaRef[]> {
  const ini = `${de}T00:00:00`;
  const fim = `${ate}T23:59:59`;
  const notas: NotaRef[] = [];

  if (!origem || (origem !== 'REABASTECIMENTO' && origem !== 'CONSIGNADO')) {
    let q = service.from('vendas').select('id, nfe_id, nfe_chave, cliente_referencia, canal_venda')
      .eq('empresa_id', empresaId).eq('status_fiscal', 'emitido').gte('data_venda', ini).lte('data_venda', fim)
      .order('data_venda', { ascending: false }).limit(MAX_NOTAS_ZIP + 1);
    if (origem) q = q.eq('canal_venda', origem);
    const { data } = await q;
    (data || []).forEach((v: any) => notas.push({ fonte: 'vendas', id: v.id, ref: v.nfe_id || v.id, chave: v.nfe_chave, descricao: v.cliente_referencia || 'Consumidor', origem: v.canal_venda || 'VENDAS' }));
  }

  for (const [fonte, tabela, pedidos, rotulo] of [
    ['reabastecimento', 'pedidos_reabastecimento_mercados', 'pedidos_reabastecimento', 'REABASTECIMENTO'],
    ['consignado', 'pedidos_consignado_mercados', 'pedidos_consignado', 'CONSIGNADO'],
  ] as const) {
    if (origem && origem !== rotulo) continue;
    const { data } = await service.from(tabela)
      .select(`id, nfe_id, nfe_chave, locais(nome), ${pedidos}!inner(empresa_id, gerado_em)`)
      .eq('status_fiscal', 'emitido').eq(`${pedidos}.empresa_id`, empresaId)
      .gte(`${pedidos}.gerado_em`, ini).lte(`${pedidos}.gerado_em`, fim).limit(MAX_NOTAS_ZIP + 1);
    const vistos = new Set<string>();
    (data || []).forEach((m: any) => {
      if (!m.nfe_id || vistos.has(m.nfe_id)) return; // nota combinada: um XML só
      vistos.add(m.nfe_id);
      notas.push({ fonte, id: m.id, ref: m.nfe_id, chave: m.nfe_chave, descricao: m.locais?.nome || 'Mercado', origem: rotulo });
    });
  }
  return notas;
}

function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}

// ---------- tratamento ----------
async function tratar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new ErroHttp(401, 'Não autenticado.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  // O token vai explícito: getUser() sem argumento procura uma sessão guardada (que não existe no
  // servidor) e devolvia "Auth session missing" mesmo com o Authorization certo.
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData?.user) throw new ErroHttp(401, 'Sessão inválida. Entre novamente.');

  const { data: usuarioRow } = await userClient.from('usuarios').select('empresa_id').eq('id', userData.user.id).maybeSingle();
  if (!usuarioRow?.empresa_id) throw new ErroHttp(403, 'Usuário sem empresa vinculada.');
  const empresaId: string = usuarioRow.empresa_id;

  const corpo = await req.json().catch(() => ({}));
  const action = corpo?.action;
  if (!action) throw new ErroHttp(400, 'Parâmetro obrigatório: action.');

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await service.from('configuracoes_fiscais').select('token_api_focus, url_api_focus').eq('empresa_id', empresaId).maybeSingle();
  if (!cfg?.token_api_focus || !cfg?.url_api_focus) throw new ErroHttp(400, 'Token ou URL da Focus NFe não configurados nas configurações fiscais.');
  const { focus, urlNota } = configurarFocus(cfg.url_api_focus, cfg.token_api_focus);

  // ----- XML de uma nota -----
  if (action === 'xml') {
    const fonte = corpo?.fonte as Fonte;
    if (!['vendas', 'reabastecimento', 'consignado'].includes(fonte) || !corpo?.id) throw new ErroHttp(400, 'Informe fonte e id da nota.');
    const nota = await notaPorId(service, empresaId, fonte, String(corpo.id));
    try {
      const { chave, xml } = await xmlDaNota(urlNota, focus, nota.ref);
      return jsonResponse({ ok: true, nome: `${chave || chaveLimpa(nota.chave) || nota.ref}.xml`, xml });
    } catch (e) {
      throw new ErroHttp(502, `Não foi possível obter o XML: ${(e as Error).message}`);
    }
  }

  // ----- ZIP com os XMLs do período -----
  if (action === 'zip') {
    const de = String(corpo?.de || ''); const ate = String(corpo?.ate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new ErroHttp(400, 'Informe o período (de e ate, YYYY-MM-DD).');
    const notas = await notasDoPeriodo(service, empresaId, de, ate, corpo?.origem ? String(corpo.origem) : null);
    if (notas.length === 0) throw new ErroHttp(404, 'Nenhuma nota emitida neste período.');
    if (notas.length > MAX_NOTAS_ZIP) throw new ErroHttp(413, `Mais de ${MAX_NOTAS_ZIP} notas no período. Reduza o período e baixe por partes.`);

    const arquivos: Record<string, Uint8Array> = {};
    const falhas: { descricao: string; motivo: string }[] = [];
    await comConcorrencia(notas, CONCORRENCIA, async (n) => {
      try {
        const { chave, xml } = await xmlDaNota(urlNota, focus, n.ref);
        let nome = `${chave || chaveLimpa(n.chave) || n.ref}.xml`;
        if (arquivos[nome]) nome = `${n.ref}-${nome}`;
        arquivos[nome] = strToU8(xml);
      } catch (e) {
        falhas.push({ descricao: n.descricao, motivo: (e as Error).message });
      }
    });
    if (Object.keys(arquivos).length === 0) throw new ErroHttp(502, `Não foi possível obter nenhum XML. ${falhas[0]?.motivo || ''}`.trim());
    const zip = zipSync(arquivos);
    return jsonResponse({ ok: true, nome: `xml-notas_${de}_a_${ate}.zip`, base64: paraBase64(zip), incluidas: Object.keys(arquivos).length, falhas });
  }

  // ----- completa chave/link de notas emitidas antigas -----
  if (action === 'completar') {
    const limite = Math.min(Math.max(Number(corpo?.limite) || LOTE_COMPLETAR, 1), LOTE_COMPLETAR);
    // ids que já falharam numa chamada anterior: não tenta de novo (senão uma nota sem retorno trava a fila)
    const ignorar: string[] = Array.isArray(corpo?.ignorar)
      ? corpo.ignorar.map((x: unknown) => String(x)).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500)
      : [];
    let qPendentes = service.from('vendas').select('id, nfe_id')
      .eq('empresa_id', empresaId).eq('status_fiscal', 'emitido').is('nfe_chave', null);
    if (ignorar.length > 0) qPendentes = qPendentes.not('id', 'in', `(${ignorar.join(',')})`);
    const { data: pendentes } = await qPendentes.limit(limite);
    let atualizadas = 0;
    const falhas: { id: string; motivo: string }[] = [];
    await comConcorrencia(pendentes || [], CONCORRENCIA, async (v: any) => {
      try {
        const dados = await consultarNota(urlNota, focus, v.nfe_id || v.id);
        if (dados.status !== 'autorizado') throw new Error(`status "${dados.status || 'desconhecido'}" na Focus`);
        const chave = dados.chave_nfe || (dados.chave ? `NFe${soDigitos(dados.chave)}` : null);
        if (!chave) throw new Error('a Focus não informou a chave');
        const link = dados.caminho_danfe && String(dados.caminho_danfe).startsWith('/') ? `${focus.base}${dados.caminho_danfe}` : null;
        const { error } = await service.from('vendas').update({ nfe_chave: chave, ...(link ? { nfe_url_pdf: link } : {}) })
          .eq('id', v.id).eq('empresa_id', empresaId);
        if (error) throw new Error(error.message);
        atualizadas += 1;
      } catch (e) {
        falhas.push({ id: v.id, motivo: (e as Error).message });
      }
    });
    let qRestantes = service.from('vendas').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('status_fiscal', 'emitido').is('nfe_chave', null);
    if (ignorar.length > 0) qRestantes = qRestantes.not('id', 'in', `(${ignorar.join(',')})`);
    const { count } = await qRestantes;
    return jsonResponse({ ok: true, atualizadas, restantes: count ?? 0, falhas });
  }

  throw new ErroHttp(400, `Ação desconhecida: ${action}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);
  try {
    return await tratar(req);
  } catch (e) {
    if (e instanceof ErroHttp) return jsonResponse({ ok: false, error: e.message }, e.status);
    console.error('[notas-fiscais-arquivos] erro inesperado:', e);
    return jsonResponse({ ok: false, error: 'Erro interno inesperado.' }, 500);
  }
});
