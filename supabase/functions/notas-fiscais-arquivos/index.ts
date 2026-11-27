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
//   cancelar  { fonte, id, justificativa (15 a 255 caracteres) }  só administrador; cancela na SEFAZ via Focus e marca como 'cancelado' -> { protocolo }
//   xml       { fonte: 'vendas'|'reabastecimento'|'consignado', id }          -> { nome, xml }
//   zip       { de, ate, origem? }  (datas YYYY-MM-DD; origem opcional)       -> { nome, base64, incluidas, falhas }
//   completar { limite?, ignorar? }  notas emitidas sem chave/link: busca na Focus e grava -> { atualizadas, restantes, falhas }
//   enviar_escritorio { mes: 'YYYY-MM', forcar?, empresa_id? (só chamada de serviço da rotina mensal) }  monta o ZIP dos XMLs do mês e envia por e-mail ao
//             escritório contábil cadastrado (configuracoes_fiscais.email_escritorio_contabil) -> { enviadas, falhas, email }
//   compras_listar {}                       notas de compra (NFes emitidas contra o CNPJ da empresa, recebidas pela Focus) -> { notas }
//   compras_xml   { chave }                 XML completo de uma nota de compra                     -> { nome, xml }
//   compras_pdf   { chave }                 DANFE (PDF) de uma nota de compra                      -> { nome, base64 }
//   compras_zip   { de, ate }               XMLs completos das notas de compra do período          -> { nome, base64, incluidas, falhas }
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
// A chave de acesso tem o modelo nas posições 21-22: 55 = NF-e (endereço /v2/nfe), 65 = NFC-e (/v2/nfce).
const modeloDaChave = (chave: unknown) => chaveLimpa(chave).slice(20, 22);

type UrlNota = (ref: string, chave?: unknown) => string;

function configurarFocus(urlApi: string, token: string): { focus: Focus; urlNota: UrlNota } {
  let u: URL;
  try { u = new URL(String(urlApi)); } catch { throw new ErroHttp(400, 'URL da API Focus inválida nas configurações fiscais.'); }
  if (u.protocol !== 'https:' || !HOSTS_FOCUS.includes(u.hostname)) {
    throw new ErroHttp(400, 'A URL da API Focus nas configurações fiscais não é um endereço da Focus NFe.');
  }
  const base = u.origin;
  const caminho = u.pathname.replace(/\/+$/, '');
  return {
    focus: { base, auth: `Basic ${btoa(`${token}:`)}` },
    urlNota: (ref: string, chave?: unknown) => (modeloDaChave(chave) === '55'
      ? `${base}/v2/nfe/${encodeURIComponent(ref)}`
      : `${base}${caminho}/${encodeURIComponent(ref)}`),
  };
}

async function chamarFocus(url: string, focus: Focus): Promise<Response> {
  return await fetch(url, { headers: { Authorization: focus.auth }, signal: AbortSignal.timeout(TEMPO_CHAMADA_MS) });
}

async function consultarNota(urlNota: UrlNota, focus: Focus, ref: string, chave?: unknown) {
  const resp = await chamarFocus(urlNota(ref, chave), focus);
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
async function xmlDaNota(urlNota: UrlNota, focus: Focus, ref: string, chaveConhecida?: unknown) {
  const dados = await consultarNota(urlNota, focus, ref, chaveConhecida);
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

// Baixa os XMLs das notas e monta o ZIP.
async function montarZipXml(notas: NotaRef[], urlNota: UrlNota, focus: Focus) {
  const arquivos: Record<string, Uint8Array> = {};
  const falhas: { descricao: string; motivo: string }[] = [];
  await comConcorrencia(notas, CONCORRENCIA, async (n) => {
    try {
      const { chave, xml } = await xmlDaNota(urlNota, focus, n.ref, n.chave);
      let nome = `${chave || chaveLimpa(n.chave) || n.ref}.xml`;
      if (arquivos[nome]) nome = `${n.ref}-${nome}`;
      arquivos[nome] = strToU8(xml);
    } catch (e) {
      falhas.push({ descricao: n.descricao, motivo: (e as Error).message });
    }
  });
  const incluidas = Object.keys(arquivos).length;
  return { zip: incluidas > 0 ? zipSync(arquivos) : null, arquivos, incluidas, falhas };
}

// ---------- NFes recebidas (notas de compra) ----------
const MAX_PAGINAS_RECEBIDAS = 20;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const dataEmissaoISO = (n: any) => String(n?.data_emissao || '').slice(0, 10);

// Lê TODAS as notas recebidas (a Focus devolve 100 por consulta; o parâmetro "versao" traz o restante)
// e fica com a versão mais nova de cada chave.
async function listarRecebidas(focus: Focus, cnpj: string): Promise<any[]> {
  const mapa = new Map<string, any>();
  let versao: number | null = null;
  for (let p = 0; p < MAX_PAGINAS_RECEBIDAS; p += 1) {
    const url = `${focus.base}/v2/nfes_recebidas?cnpj=${encodeURIComponent(cnpj)}${versao !== null ? `&versao=${versao}` : ''}`;
    const resp = await chamarFocus(url, focus);
    const dados = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error(dados?.mensagem || dados?.codigo || `A Focus respondeu ${resp.status}.`);
    if (!Array.isArray(dados) || dados.length === 0) break;
    for (const n of dados) {
      const k = chaveLimpa(n?.chave_nfe);
      if (!k) continue;
      const atual = mapa.get(k);
      if (!atual || Number(n.versao) >= Number(atual.versao)) mapa.set(k, n);
    }
    const maxVersao = Number(resp.headers.get('x-max-version')) || Math.max(...dados.map((n: any) => Number(n.versao) || 0));
    if (dados.length < 100 || (versao !== null && maxVersao <= versao)) break;
    versao = maxVersao;
  }
  return [...mapa.values()];
}

function resumirRecebida(n: any) {
  return {
    chave: chaveLimpa(n.chave_nfe),
    emitente: String(n.nome_emitente || ''),
    documento_emitente: soDigitos(n.documento_emitente),
    valor: Number(n.valor_total) || 0,
    data_emissao: dataEmissaoISO(n),
    situacao: String(n.situacao || ''),
    completa: n.nfe_completa === true,
    manifestacao: n.manifestacao_destinatario ?? null,
    cancelada_em: n.data_cancelamento || null,
  };
}

const chaveValida = (c: unknown) => /^\d{44}$/.test(String(c ?? ''));

async function xmlRecebida(focus: Focus, chave: string): Promise<string> {
  const resp = await chamarFocus(`${focus.base}/v2/nfes_recebidas/${chave}.xml`, focus);
  if (!resp.ok) {
    if (resp.status === 404) throw new Error('A Focus ainda não tem o XML completo desta nota.');
    throw new Error(`Não foi possível baixar o XML (${resp.status}).`);
  }
  const xml = await resp.text();
  if (!xml.trim().startsWith('<')) throw new Error('A Focus não devolveu um XML válido para esta nota.');
  return xml;
}

// O DANFE vem por redirecionamento (302) para um endereço temporário do arquivo, que NÃO deve receber o
// cabeçalho de autenticação da Focus.
async function pdfRecebida(focus: Focus, chave: string): Promise<Uint8Array> {
  const resp = await fetch(`${focus.base}/v2/nfes_recebidas/${chave}.pdf`, {
    headers: { Authorization: focus.auth }, redirect: 'manual', signal: AbortSignal.timeout(TEMPO_CHAMADA_MS),
  });
  let alvo: Response = resp;
  if (resp.status >= 300 && resp.status < 400) {
    const local = resp.headers.get('location') || '';
    let u: URL;
    try { u = new URL(local, focus.base); } catch { throw new Error('A Focus devolveu um endereço de PDF inválido.'); }
    if (u.protocol !== 'https:' || /^(\d+\.){3}\d+$/.test(u.hostname) || u.hostname === 'localhost') {
      throw new Error('A Focus devolveu um endereço de PDF não permitido.');
    }
    alvo = await fetch(u.toString(), { signal: AbortSignal.timeout(TEMPO_CHAMADA_MS) });
  }
  if (!alvo.ok) throw new Error(alvo.status === 404 ? 'O PDF desta nota ainda não está disponível na Focus.' : `Não foi possível baixar o PDF (${alvo.status}).`);
  const bytes = new Uint8Array(await alvo.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) throw new Error('O PDF devolvido pela Focus é inválido.');
  return bytes;
}

// XMLs completos das notas de compra de um período → arquivos do ZIP
async function xmlsDeCompras(focus: Focus, notas: any[]) {
  const arquivos: Record<string, Uint8Array> = {};
  const falhas: { descricao: string; motivo: string }[] = [];
  await comConcorrencia(notas, CONCORRENCIA, async (n) => {
    const nome = `${n.chave}.xml`;
    try {
      if (!n.completa) throw new Error('só o resumo da nota está na Focus (sem XML completo)');
      arquivos[nome] = strToU8(await xmlRecebida(focus, n.chave));
    } catch (e) {
      falhas.push({ descricao: `${n.emitente || 'Nota'} (${n.data_emissao})`, motivo: (e as Error).message });
    }
  });
  return { arquivos, falhas };
}

const escHtml = (t: string) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

// ---------- tratamento ----------
async function tratar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new ErroHttp(401, 'Não autenticado.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const corpo = await req.json().catch(() => ({}));
  const action = corpo?.action;
  if (!action) throw new ErroHttp(400, 'Parâmetro obrigatório: action.');

  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  // Chamada interna da rotina mensal (notas-fiscais-envio-automatico): vem com a chave de serviço,
  // que só existe no servidor. Só pode pedir o envio do mês de UMA empresa.
  const ehServico = jwt !== '' && jwt === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  let empresaId: string;
  let usuarioId: string | null = null;
  let ehAdmin = false;
  if (ehServico) {
    if (action !== 'enviar_escritorio' || !/^[0-9a-f-]{36}$/i.test(String(corpo?.empresa_id || ''))) {
      throw new ErroHttp(403, 'Chamada de serviço só pode enviar o mês de uma empresa.');
    }
    empresaId = String(corpo.empresa_id);
  } else {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    // O token vai explícito: getUser() sem argumento procura uma sessão guardada (que não existe no
    // servidor) e devolvia "Auth session missing" mesmo com o Authorization certo.
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData?.user) throw new ErroHttp(401, 'Sessão inválida. Entre novamente.');

    const { data: usuarioRow } = await userClient.from('usuarios').select('empresa_id, perfil').eq('id', userData.user.id).maybeSingle();
    if (!usuarioRow?.empresa_id) throw new ErroHttp(403, 'Usuário sem empresa vinculada.');
    empresaId = usuarioRow.empresa_id;
    usuarioId = userData.user.id;
    ehAdmin = usuarioRow.perfil === 'admin';
  }

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await service.from('configuracoes_fiscais').select('token_api_focus, url_api_focus, cnpj').eq('empresa_id', empresaId).maybeSingle();
  if (!cfg?.token_api_focus || !cfg?.url_api_focus) throw new ErroHttp(400, 'Token ou URL da Focus NFe não configurados nas configurações fiscais.');
  const { focus, urlNota } = configurarFocus(cfg.url_api_focus, cfg.token_api_focus);

  // ----- cancelamento de uma nota (só administrador) -----
  if (action === 'cancelar') {
    if (!ehAdmin) throw new ErroHttp(403, 'Só o administrador pode cancelar notas fiscais.');
    const fonte = corpo?.fonte as Fonte;
    if (!['vendas', 'reabastecimento', 'consignado'].includes(fonte) || !corpo?.id) throw new ErroHttp(400, 'Informe fonte e id da nota.');
    const justificativa = String(corpo?.justificativa ?? '').trim().replace(/\s+/g, ' ');
    if (justificativa.length < 15 || justificativa.length > 255) throw new ErroHttp(400, 'A justificativa precisa ter de 15 a 255 caracteres.');

    const nota = await notaPorId(service, empresaId, fonte, String(corpo.id));
    let resp: Response;
    try {
      resp = await fetch(urlNota(nota.ref, nota.chave), {
        method: 'DELETE',
        headers: { Authorization: focus.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new ErroHttp(502, `A Focus não respondeu ao cancelamento: ${(e as Error).message}`);
    }
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok || dados?.status !== 'cancelado') {
      const motivo = dados?.mensagem_sefaz
        ? `SEFAZ ${dados.status_sefaz || ''}: ${dados.mensagem_sefaz}`.replace('  ', ' ')
        : (dados?.mensagem || dados?.codigo || `A Focus respondeu ${resp.status}.`);
      throw new ErroHttp(422, `Não foi possível cancelar a nota. ${motivo}`);
    }

    const protocolo = String(dados?.numero_protocolo || '');
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const msg = `Nota cancelada em ${hoje}${protocolo ? ` (protocolo ${protocolo})` : ''}: ${justificativa}`.slice(0, 500);
    const tabela = fonte === 'vendas' ? 'vendas' : fonte === 'reabastecimento' ? 'pedidos_reabastecimento_mercados' : 'pedidos_consignado_mercados';
    // Nota combinada (vários mercados na mesma nota): todos os mercados dela ficam cancelados.
    const filtroNota = fonte === 'vendas' ? { col: 'id', val: nota.id } : { col: 'nfe_id', val: nota.ref };
    const { error: updError } = await service.from(tabela).update({ status_fiscal: 'cancelado', nfe_erro_mensagem: msg }).eq(filtroNota.col, filtroNota.val);
    if (updError) throw new ErroHttp(500, `A nota foi cancelada na SEFAZ, mas não consegui atualizar o sistema: ${updError.message}`);
    return jsonResponse({ ok: true, protocolo, mensagem: msg });
  }

  // ----- XML de uma nota -----
  if (action === 'xml') {
    const fonte = corpo?.fonte as Fonte;
    if (!['vendas', 'reabastecimento', 'consignado'].includes(fonte) || !corpo?.id) throw new ErroHttp(400, 'Informe fonte e id da nota.');
    const nota = await notaPorId(service, empresaId, fonte, String(corpo.id));
    try {
      const { chave, xml } = await xmlDaNota(urlNota, focus, nota.ref, nota.chave);
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

    const { zip, incluidas, falhas } = await montarZipXml(notas, urlNota, focus);
    if (!zip) throw new ErroHttp(502, `Não foi possível obter nenhum XML. ${falhas[0]?.motivo || ''}`.trim());
    return jsonResponse({ ok: true, nome: `xml-notas_${de}_a_${ate}.zip`, base64: paraBase64(zip), incluidas, falhas });
  }

  // ----- notas de compra (NFes recebidas) -----
  if (typeof action === 'string' && action.startsWith('compras_')) {
    const cnpj = soDigitos(cfg.cnpj);
    if (cnpj.length !== 14) throw new ErroHttp(400, 'CNPJ da empresa não configurado nas configurações fiscais.');

    if (action === 'compras_listar') {
      try {
        const notas = (await listarRecebidas(focus, cnpj)).map(resumirRecebida)
          .sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : a.data_emissao > b.data_emissao ? -1 : 0));
        return jsonResponse({ ok: true, notas });
      } catch (e) {
        throw new ErroHttp(502, `Não foi possível consultar as notas de compra: ${(e as Error).message}`);
      }
    }

    if (action === 'compras_xml' || action === 'compras_pdf') {
      if (!chaveValida(corpo?.chave)) throw new ErroHttp(400, 'Informe a chave de 44 dígitos.');
      const chave = String(corpo.chave);
      try {
        if (action === 'compras_xml') return jsonResponse({ ok: true, nome: `${chave}.xml`, xml: await xmlRecebida(focus, chave) });
        return jsonResponse({ ok: true, nome: `${chave}.pdf`, base64: paraBase64(await pdfRecebida(focus, chave)) });
      } catch (e) {
        throw new ErroHttp(502, (e as Error).message);
      }
    }

    if (action === 'compras_zip') {
      const de = String(corpo?.de || ''); const ate = String(corpo?.ate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new ErroHttp(400, 'Informe o período (de e ate, YYYY-MM-DD).');
      let notas: any[];
      try {
        notas = (await listarRecebidas(focus, cnpj)).map(resumirRecebida).filter((n) => n.data_emissao >= de && n.data_emissao <= ate);
      } catch (e) {
        throw new ErroHttp(502, `Não foi possível consultar as notas de compra: ${(e as Error).message}`);
      }
      if (notas.length === 0) throw new ErroHttp(404, 'Nenhuma nota de compra neste período.');
      if (notas.length > MAX_NOTAS_ZIP) throw new ErroHttp(413, `Mais de ${MAX_NOTAS_ZIP} notas no período. Reduza o período e baixe por partes.`);
      const { arquivos, falhas } = await xmlsDeCompras(focus, notas);
      if (Object.keys(arquivos).length === 0) throw new ErroHttp(502, `Nenhuma nota tem o XML completo na Focus. ${falhas[0]?.motivo || ''}`.trim());
      return jsonResponse({ ok: true, nome: `xml-compras_${de}_a_${ate}.zip`, base64: paraBase64(zipSync(arquivos)), incluidas: Object.keys(arquivos).length, falhas });
    }

    throw new ErroHttp(400, `Ação desconhecida: ${action}`);
  }

  // ----- envio do mês ao escritório contábil -----
  if (action === 'enviar_escritorio') {
    const mes = String(corpo?.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErroHttp(400, 'Informe o mês (YYYY-MM).');
    const { data: cfgEmail } = await service.from('configuracoes_fiscais')
      .select('email_escritorio_contabil, razao_social, cnpj').eq('empresa_id', empresaId).maybeSingle();
    const email = String(cfgEmail?.email_escritorio_contabil || '').trim();
    if (!emailValido(email)) throw new ErroHttp(400, 'Cadastre o e-mail do escritório contábil antes de enviar.');

    const [ano, m] = mes.split('-').map(Number);
    const de = `${mes}-01`;
    const ate = `${mes}-${String(new Date(ano, m, 0).getDate()).padStart(2, '0')}`;
    const notas = await notasDoPeriodo(service, empresaId, de, ate, null);
    if (notas.length > MAX_NOTAS_ZIP) throw new ErroHttp(413, `Mais de ${MAX_NOTAS_ZIP} notas no mês. Fale com o suporte para enviar por partes.`);

    // Notas de compra (NFes recebidas) do mês: entram numa pasta "compras" do mesmo ZIP. Se a consulta
    // falhar (ex.: recebimento não habilitado), o envio das emitidas segue e o e-mail avisa.
    let compras: any[] = [];
    let comprasErro = '';
    const cnpjEmpresa = soDigitos(cfgEmail?.cnpj);
    if (corpo?.incluir_compras !== false && cnpjEmpresa.length === 14) {
      try {
        compras = (await listarRecebidas(focus, cnpjEmpresa)).map(resumirRecebida).filter((n) => n.data_emissao >= de && n.data_emissao <= ate);
      } catch (e) {
        comprasErro = (e as Error).message;
      }
    }
    if (compras.length > MAX_NOTAS_ZIP) throw new ErroHttp(413, `Mais de ${MAX_NOTAS_ZIP} notas de compra no mês. Fale com o suporte para enviar por partes.`);
    if (notas.length === 0 && compras.length === 0) throw new ErroHttp(404, 'Nenhuma nota emitida nem de compra neste mês.');

    const emit = notas.length > 0 ? await montarZipXml(notas, urlNota, focus) : { zip: null, arquivos: {} as Record<string, Uint8Array>, incluidas: 0, falhas: [] as { descricao: string; motivo: string }[] };
    const cmp = compras.length > 0 ? await xmlsDeCompras(focus, compras) : { arquivos: {} as Record<string, Uint8Array>, falhas: [] as { descricao: string; motivo: string }[] };
    const nEmitidas = emit.incluidas;
    const nCompras = Object.keys(cmp.arquivos).length;
    if (nEmitidas + nCompras === 0) {
      throw new ErroHttp(502, `Não foi possível obter nenhum XML. ${(emit.falhas[0] || cmp.falhas[0])?.motivo || ''}`.trim());
    }
    const falhas = emit.falhas;
    const incluidas = nEmitidas + nCompras;
    if (falhas.length > 0 && corpo?.forcar !== true) {
      return jsonResponse({ ok: false, error: `${falhas.length} nota(s) não puderam ser baixadas da Focus. Envie mesmo assim ou tente de novo mais tarde.`, falhas, incluidas }, 409);
    }

    const todos: Record<string, Uint8Array> = { ...emit.arquivos };
    Object.entries(cmp.arquivos).forEach(([nome, bytes]) => { todos[`compras/${nome}`] = bytes; });
    const zip = zipSync(todos);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new ErroHttp(500, 'Envio de e-mail não configurado no servidor.');
    const rotuloMes = `${String(m).padStart(2, '0')}/${ano}`;
    const nomeEmpresa = cfgEmail?.razao_social || 'Empresa';
    const nomeZip = `xml-notas_${mes}.zip`;
    const linhasEmail = [
      `<p>Seguem em anexo os XMLs das notas fiscais de <strong>${escHtml(nomeEmpresa)}</strong>${cfgEmail?.cnpj ? ` (CNPJ ${escHtml(cfgEmail.cnpj)})` : ''} do mês <strong>${rotuloMes}</strong>.</p>`,
      `<p>Notas <strong>emitidas</strong> (vendas), na raiz do arquivo: <strong>${nEmitidas}</strong>${falhas.length > 0 ? ` (${falhas.length} nota(s) não puderam ser incluídas; serão enviadas à parte)` : ''}.</p>`,
    ];
    if (compras.length > 0 || comprasErro) {
      linhasEmail.push(comprasErro
        ? '<p>Notas de <strong>compra</strong> (emitidas contra o CNPJ): não foi possível consultá-las desta vez.</p>'
        : `<p>Notas de <strong>compra</strong> (emitidas contra o CNPJ), na pasta <em>compras</em>: <strong>${nCompras}</strong>${cmp.falhas.length > 0 ? ` (${cmp.falhas.length} ainda sem o XML completo na Focus)` : ''}.</p>`);
    }
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <p>Olá,</p>
      ${linhasEmail.join('\n      ')}
      <p style="color:#666;font-size:12px">Enviado automaticamente pelo Reddu.</p></div>`;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'Reddu <noreply@reddu.com.br>',
        to: [email],
        subject: `XMLs das notas fiscais ${rotuloMes} — ${nomeEmpresa}`,
        html,
        attachments: [{ filename: nomeZip, content: paraBase64(zip) }],
      }),
    });
    const retorno = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new ErroHttp(502, `Não foi possível enviar o e-mail: ${retorno?.message || resp.status}`);

    await service.from('notas_fiscais_envios_escritorio').insert({
      empresa_id: empresaId, mes, email, quantidade: incluidas, falhas: falhas.length + cmp.falhas.length, enviado_por: usuarioId, origem: ehServico ? 'automatico' : 'manual',
    });
    return jsonResponse({ ok: true, enviadas: incluidas, emitidas: nEmitidas, compras: nCompras, compras_sem_xml: cmp.falhas.length, compras_erro: comprasErro || null, falhas, email });
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
