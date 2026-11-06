// supabase/functions/whatsapp-contatos/index.ts
//
// Importa os contatos do WhatsApp conectado (Evolution API), busca as fotos de perfil
// e as guarda no Supabase Storage (os links de foto do WhatsApp vencem em poucos dias).
//
// Segurança (igual à whatsapp-instancia):
//   - Exige usuário logado e usa a empresa DELE.
//   - NÃO aceita base_url nem instance_name do navegador: usa só o gravado em
//     whatsapp_configuracoes. A API Key da Evolution nunca vai a um endereço de usuário.
//   - A foto só é baixada de endereço https público (nunca IP, localhost ou rede interna).
//
// Ações (body: { action }):
//   sincronizar -> importa os contatos e preenche o nome das conversas que estão sem nome
//   fotos       -> busca um lote de fotos pendentes. Opções: { jid } (uma pessoa, forçando)
//                  ou { todos: true } (inclui contatos sem conversa). Devolve quantas restam.
//
// Deploy: precisa de "Verify JWT" LIGADO (padrão).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEMPO_LIMITE_MS = 20000;
const TEMPO_CONTATOS_MS = 60000;
const LOTE_FOTOS = 12;
const CONCORRENCIA = 4;
const VALIDADE_FOTO_DIAS = 7;
const TAMANHO_MAX_FOTO = 2 * 1024 * 1024;
const TAMANHO_LOTE_GRAVACAO = 500;
const BUCKET = 'whatsapp-media';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class ErroHttp extends Error {
  status: number;
  detalhe?: unknown;
  constructor(status: number, mensagem: string, detalhe?: unknown) {
    super(mensagem);
    this.status = status;
    this.detalhe = detalhe;
  }
}

function normalizarBaseUrl(valor: string | undefined | null): string | null {
  const limpo = String(valor || '').trim().replace(/\/+$/, '');
  return limpo.startsWith('https://') ? limpo : null;
}

// Só contatos individuais: ignora grupos, status, listas de transmissão e ids "@lid".
export function normalizarContatos(lista: any): Array<{ jid: string; telefone: string; nome: string | null }> {
  const itens = Array.isArray(lista) ? lista : Array.isArray(lista?.contacts) ? lista.contacts : [];
  const mapa = new Map<string, { jid: string; telefone: string; nome: string | null }>();
  for (const c of itens) {
    const jid = String(c?.remoteJid || c?.id || '');
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    const telefone = jid.split('@')[0].replace(/\D/g, '');
    if (telefone.length < 10 || telefone.length > 15) continue;
    const nome = String(c?.pushName || c?.name || c?.notify || '').trim();
    const anterior = mapa.get(jid);
    mapa.set(jid, { jid, telefone, nome: nome ? nome.slice(0, 120) : anterior?.nome ?? null });
  }
  return [...mapa.values()];
}

// Endereço da foto: só https e nada de IP, localhost ou nome interno (evita usar a função
// para alcançar a rede interna).
export function urlDeFotoSegura(valor: unknown): URL | null {
  try {
    const url = new URL(String(valor));
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;
    return url;
  } catch {
    return null;
  }
}

async function hashDoJid(jid: string): Promise<string> {
  const bytes = new TextEncoder().encode(jid);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function evolution(base: string, apiKey: string, caminho: string, init: RequestInit = {}, limiteMs = TEMPO_LIMITE_MS) {
  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers: { apikey: apiKey, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(limiteMs),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, dados };
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function comConcorrencia<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length > 0) {
      const item = fila.shift() as T;
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}

async function tratar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new ErroHttp(401, 'Não autenticado.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) throw new ErroHttp(401, 'Sessão inválida. Entre novamente.');

  const { data: usuarioRow, error: usuarioError } = await userClient
    .from('usuarios')
    .select('empresa_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError || !usuarioRow?.empresa_id) throw new ErroHttp(403, 'Usuário sem empresa vinculada.');
  const empresaId: string = usuarioRow.empresa_id;

  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!apiKey) throw new ErroHttp(500, 'EVOLUTION_API_KEY não configurada no servidor.');

  const corpo = await req.json().catch(() => ({}));
  const action = corpo?.action;
  if (!action) throw new ErroHttp(400, 'Parâmetro obrigatório: action.');

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: config } = await service
    .from('whatsapp_configuracoes')
    .select('instance_name, base_url')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!config) throw new ErroHttp(404, 'Esta empresa ainda não tem WhatsApp configurado.');
  const base = normalizarBaseUrl(config.base_url);
  if (!base) throw new ErroHttp(500, 'A URL do servidor cadastrada é inválida (precisa começar com https://).');
  const instancia: string = config.instance_name;

  // ------------------------------------------------------------------ sincronizar
  if (action === 'sincronizar') {
    const r = await evolution(base, apiKey, `/chat/findContacts/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      body: JSON.stringify({ where: {} }),
    }, TEMPO_CONTATOS_MS);
    if (!r.ok) {
      throw new ErroHttp(502, 'Não foi possível buscar os contatos no WhatsApp. Confira se ele está conectado.', r.dados);
    }

    const contatos = normalizarContatos(r.dados);
    const agora = new Date().toISOString();
    const comNome = contatos.filter((c) => c.nome);
    const semNome = contatos.filter((c) => !c.nome);

    // Dois grupos: quem não tem nome não pode apagar o nome que já está salvo.
    for (const lote of emLotes(comNome, TAMANHO_LOTE_GRAVACAO)) {
      const { error } = await service.from('whatsapp_contatos').upsert(
        lote.map((c) => ({ empresa_id: empresaId, telefone_jid: c.jid, telefone: c.telefone, nome: c.nome, push_name: c.nome, updated_at: agora })),
        { onConflict: 'empresa_id,telefone_jid' },
      );
      if (error) throw new ErroHttp(500, 'Erro ao salvar os contatos importados.', error.message);
    }
    for (const lote of emLotes(semNome, TAMANHO_LOTE_GRAVACAO)) {
      const { error } = await service.from('whatsapp_contatos').upsert(
        lote.map((c) => ({ empresa_id: empresaId, telefone_jid: c.jid, telefone: c.telefone, updated_at: agora })),
        { onConflict: 'empresa_id,telefone_jid' },
      );
      if (error) throw new ErroHttp(500, 'Erro ao salvar os contatos importados.', error.message);
    }

    // Conversas que ainda estão sem nome ganham o nome do contato.
    const { data: semNomeConv } = await service
      .from('whatsapp_conversas')
      .select('id, telefone_jid, nome_exibicao')
      .eq('empresa_id', empresaId)
      .limit(2000);
    const pendentes = (semNomeConv || []).filter((c: any) => !String(c.nome_exibicao || '').trim());
    const nomePorJid = new Map(comNome.map((c) => [c.jid, c.nome as string]));
    let conversasNomeadas = 0;
    for (const conv of pendentes) {
      const nome = nomePorJid.get(conv.telefone_jid);
      if (!nome) continue;
      const { error } = await service.from('whatsapp_conversas').update({ nome_exibicao: nome }).eq('id', conv.id);
      if (!error) conversasNomeadas += 1;
    }

    return jsonResponse({ ok: true, total: contatos.length, com_nome: comNome.length, conversas_nomeadas: conversasNomeadas });
  }

  // ------------------------------------------------------------------------ fotos
  if (action === 'fotos') {
    const limiteIso = new Date(Date.now() - VALIDADE_FOTO_DIAS * 86400000).toISOString();
    const forcarJid: string | undefined = typeof corpo.jid === 'string' ? corpo.jid : undefined;
    const incluirTodos = corpo.todos === true;

    // Quem tem conversa precisa existir em whatsapp_contatos (mesmo sem importação).
    const { data: conversas } = await service
      .from('whatsapp_conversas')
      .select('telefone_jid')
      .eq('empresa_id', empresaId)
      .limit(2000);
    const jidsConversa = [...new Set((conversas || []).map((c: any) => String(c.telefone_jid)).filter((j: string) => j.endsWith('@s.whatsapp.net')))] as string[];
    if (jidsConversa.length > 0) {
      const novos = jidsConversa.map((jid) => ({ empresa_id: empresaId, telefone_jid: jid, telefone: jid.split('@')[0].replace(/\D/g, '') }));
      for (const lote of emLotes(novos, TAMANHO_LOTE_GRAVACAO)) {
        await service.from('whatsapp_contatos').upsert(lote, { onConflict: 'empresa_id,telefone_jid', ignoreDuplicates: true });
      }
    }

    const buscarPendentes = async (filtroJids: string[] | null, limite: number) => {
      const consultas = [
        service.from('whatsapp_contatos').select('id, telefone_jid, telefone').eq('empresa_id', empresaId).is('foto_atualizada_em', null).limit(limite),
        service.from('whatsapp_contatos').select('id, telefone_jid, telefone').eq('empresa_id', empresaId).lt('foto_atualizada_em', limiteIso).limit(limite),
      ];
      const [semTentativa, vencidas] = await Promise.all(consultas.map((q) => (filtroJids ? q.in('telefone_jid', filtroJids) : q)));
      return [...(semTentativa.data || []), ...(vencidas.data || [])].slice(0, limite);
    };

    let lote: Array<{ id: string; telefone_jid: string; telefone: string }> = [];
    if (forcarJid) {
      const { data: contato } = await service
        .from('whatsapp_contatos')
        .select('id, telefone_jid, telefone')
        .eq('empresa_id', empresaId)
        .eq('telefone_jid', forcarJid)
        .maybeSingle();
      if (contato) lote = [contato];
    } else {
      lote = jidsConversa.length > 0 ? await buscarPendentes(jidsConversa, LOTE_FOTOS) : [];
      if (incluirTodos && lote.length < LOTE_FOTOS) {
        const extra = await buscarPendentes(null, LOTE_FOTOS - lote.length);
        const ja = new Set(lote.map((c) => c.id));
        lote = [...lote, ...extra.filter((c: any) => !ja.has(c.id))];
      }
    }

    const resultado = { processados: 0, com_foto: 0, sem_foto: 0, erros: 0 };

    const processar = async (contato: { id: string; telefone_jid: string; telefone: string }) => {
      resultado.processados += 1;
      const marcar = (campos: Record<string, unknown>) =>
        service.from('whatsapp_contatos').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', contato.id);
      try {
        const r = await evolution(base, apiKey, `/chat/fetchProfilePictureUrl/${encodeURIComponent(instancia)}`, {
          method: 'POST',
          body: JSON.stringify({ number: contato.telefone }),
        });
        const origem = r.ok ? (r.dados?.profilePictureUrl || r.dados?.profilePicUrl || r.dados?.url) : null;
        const url = urlDeFotoSegura(origem);
        if (!url) {
          resultado.sem_foto += 1;
          await marcar({ foto_url: null, foto_atualizada_em: new Date().toISOString() });
          return;
        }

        const imagem = await fetch(url.toString(), { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
        const tipo = (imagem.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!imagem.ok || !tipo.startsWith('image/')) throw new Error(`resposta inesperada ao baixar a foto (${imagem.status}, ${tipo})`);
        const binario = new Uint8Array(await imagem.arrayBuffer());
        if (binario.byteLength === 0 || binario.byteLength > TAMANHO_MAX_FOTO) throw new Error(`foto fora do tamanho aceito (${binario.byteLength} bytes)`);

        const caminho = `${empresaId}/perfil/${await hashDoJid(contato.telefone_jid)}.jpg`;
        const { error: uploadError } = await service.storage.from(BUCKET).upload(caminho, binario, { contentType: tipo, upsert: true });
        if (uploadError) throw new Error(`falha ao guardar a foto: ${uploadError.message}`);

        const { data: pub } = service.storage.from(BUCKET).getPublicUrl(caminho);
        const fotoUrl = `${pub.publicUrl}?v=${Date.now()}`;
        await marcar({ foto_url: fotoUrl, foto_atualizada_em: new Date().toISOString() });
        await service.from('whatsapp_conversas').update({ foto_url: fotoUrl }).eq('empresa_id', empresaId).eq('telefone_jid', contato.telefone_jid);
        resultado.com_foto += 1;
      } catch (err) {
        resultado.erros += 1;
        console.error('[whatsapp-contatos] erro ao buscar foto:', contato.telefone_jid, String((err as Error)?.message || err));
        // Tenta de novo só daqui a ~1 dia, para não repetir o mesmo erro sem parar.
        await marcar({ foto_atualizada_em: new Date(Date.now() - (VALIDADE_FOTO_DIAS - 1) * 86400000).toISOString() });
      }
    };

    await comConcorrencia(lote, CONCORRENCIA, processar);

    // Quantas ainda faltam (só entra quem a tela pediu: conversas, ou todos).
    let restantes = 0;
    if (!forcarJid) {
      const contar = async (filtroJids: string[] | null) => {
        const a = service.from('whatsapp_contatos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).is('foto_atualizada_em', null);
        const b = service.from('whatsapp_contatos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).lt('foto_atualizada_em', limiteIso);
        const [ra, rb] = await Promise.all([filtroJids ? a.in('telefone_jid', filtroJids) : a, filtroJids ? b.in('telefone_jid', filtroJids) : b]);
        return (ra.count || 0) + (rb.count || 0);
      };
      restantes = incluirTodos ? await contar(null) : jidsConversa.length > 0 ? await contar(jidsConversa) : 0;
    }

    return jsonResponse({ ok: true, ...resultado, restantes });
  }

  throw new ErroHttp(400, `Ação desconhecida: ${action}`);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    return await tratar(req);
  } catch (err) {
    if (err instanceof ErroHttp) {
      return jsonResponse({ error: err.message, ...(err.detalhe ? { detalhe: err.detalhe } : {}) }, err.status);
    }
    const mensagem = (err as Error)?.name === 'TimeoutError'
      ? 'O servidor do WhatsApp demorou demais para responder. Tente novamente.'
      : 'Erro interno inesperado.';
    console.error('[whatsapp-contatos] erro inesperado:', err);
    return jsonResponse({ error: mensagem }, 500);
  }
}

Deno.serve(handler);
