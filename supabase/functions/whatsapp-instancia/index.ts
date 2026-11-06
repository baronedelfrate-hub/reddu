// supabase/functions/whatsapp-instancia/index.ts
//
// Cria e gerencia a instância do WhatsApp (Evolution API) de cada empresa, sem
// que ninguém precise criar nada na mão no manager da Evolution.
//
// Segurança:
//   - Exige usuário logado e usa a empresa DELE (nunca uma empresa vinda do navegador).
//   - NÃO aceita base_url nem instance_name do navegador: usa só o que está gravado
//     em whatsapp_configuracoes ou, para empresa nova, o servidor central
//     (secret EVOLUTION_BASE_URL) e um nome gerado a partir do id da empresa.
//     Assim a API Key da Evolution nunca é enviada a um endereço escolhido por usuário.
//
// Secrets usados: EVOLUTION_API_KEY, EVOLUTION_BASE_URL, WHATSAPP_WEBHOOK_SECRET.
//
// Ações (body: { action }):
//   provisionar     -> garante a instância (cria se faltar), webhook e devolve o QR Code
//   qrcode          -> novo QR Code da instância já cadastrada
//   status          -> consulta o estado e atualiza whatsapp_configuracoes
//   desconectar     -> faz logout do WhatsApp (a instância continua existindo)
//   ativarWebhook   -> (re)aplica o webhook da instância
//
// Deploy: precisa de "Verify JWT" LIGADO (padrão).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];
const TEMPO_LIMITE_MS = 20000;

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

// Nome único e estável por empresa. Só letras minúsculas, números e hífen.
export function nomeInstanciaPara(empresaId: string): string {
  return `reddu-${String(empresaId).replace(/-/g, '').toLowerCase().slice(0, 12)}`;
}

function normalizarBaseUrl(valor: string | undefined | null): string | null {
  const limpo = String(valor || '').trim().replace(/\/+$/, '');
  return limpo.startsWith('https://') ? limpo : null;
}

function statusDoEstado(estado: string | undefined): 'conectado' | 'desconectado' | 'desconhecido' {
  if (estado === 'open') return 'conectado';
  if (estado === 'connecting') return 'desconhecido';
  return 'desconectado';
}

async function evolution(base: string, apiKey: string, caminho: string, init: RequestInit = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers: { apikey: apiKey, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, dados };
}

async function consultarEstado(base: string, apiKey: string, instancia: string) {
  const r = await evolution(base, apiKey, `/instance/connectionState/${encodeURIComponent(instancia)}`);
  if (!r.ok) return { existe: false, estado: undefined as string | undefined };
  const estado = r.dados?.instance?.state || r.dados?.state;
  return { existe: true, estado: estado as string | undefined };
}

async function pedirQrCode(base: string, apiKey: string, instancia: string) {
  const r = await evolution(base, apiKey, `/instance/connect/${encodeURIComponent(instancia)}`);
  return {
    ok: r.ok,
    status: r.status,
    base64: (r.dados?.base64 as string | undefined) || null,
    pairingCode: (r.dados?.pairingCode as string | undefined) || null,
    dados: r.dados,
  };
}

async function aplicarWebhook(base: string, apiKey: string, instancia: string, supabaseUrl: string) {
  const segredo = Deno.env.get('WHATSAPP_WEBHOOK_SECRET');
  if (!segredo) return { aplicado: false, motivo: 'sem_segredo' as const };

  const r = await evolution(base, apiKey, `/webhook/set/${encodeURIComponent(instancia)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: `${supabaseUrl}/functions/v1/evolution-webhook`,
        webhook_by_events: false,
        webhook_base64: false,
        events: EVENTOS_WEBHOOK,
        headers: { 'x-webhook-secret': segredo },
      },
    }),
  });
  if (!r.ok) {
    console.error('[whatsapp-instancia] falha ao aplicar webhook:', r.status, r.dados);
    return { aplicado: false, motivo: 'falhou' as const };
  }
  return { aplicado: true, motivo: 'configurado' as const };
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

  // empresa do usuário (a RLS de "usuarios" já garante que é a dele)
  const { data: usuarioRow, error: usuarioError } = await userClient
    .from('usuarios')
    .select('empresa_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError || !usuarioRow?.empresa_id) throw new ErroHttp(403, 'Usuário sem empresa vinculada.');
  const empresaId: string = usuarioRow.empresa_id;

  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!apiKey) throw new ErroHttp(500, 'EVOLUTION_API_KEY não configurada no servidor.');

  const { action } = await req.json().catch(() => ({ action: undefined }));
  if (!action) throw new ErroHttp(400, 'Parâmetro obrigatório: action.');

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: config } = await service
    .from('whatsapp_configuracoes')
    .select('empresa_id, instance_name, base_url, status')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  // ---------------------------------------------------------------- provisionar
  if (action === 'provisionar') {
    const instancia: string = config?.instance_name || nomeInstanciaPara(empresaId);
    const base = config ? normalizarBaseUrl(config.base_url) : normalizarBaseUrl(Deno.env.get('EVOLUTION_BASE_URL'));
    if (!base) {
      throw new ErroHttp(500, config
        ? 'A URL do servidor cadastrada para esta empresa é inválida (precisa começar com https://).'
        : 'Servidor do WhatsApp não configurado (EVOLUTION_BASE_URL).');
    }

    const atual = await consultarEstado(base, apiKey, instancia);
    let webhook: 'configurado' | 'ja_existente' | 'sem_segredo' | 'falhou' = 'ja_existente';
    let qrDaCriacao: { base64: string | null; pairingCode: string | null } | null = null;

    if (!atual.existe) {
      const criada = await evolution(base, apiKey, '/instance/create', {
        method: 'POST',
        body: JSON.stringify({ instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
      });
      // 403 "already in use": a instância existe mesmo assim, seguimos.
      if (!criada.ok && criada.status !== 403) {
        throw new ErroHttp(502, 'Não foi possível criar a instância no servidor do WhatsApp.', criada.dados);
      }
      if (criada.dados?.qrcode?.base64) {
        qrDaCriacao = { base64: criada.dados.qrcode.base64, pairingCode: criada.dados.qrcode.pairingCode || null };
      }
      const aplicado = await aplicarWebhook(base, apiKey, instancia, supabaseUrl);
      webhook = aplicado.aplicado ? 'configurado' : aplicado.motivo;
    }

    if (!config) {
      const { error: insertError } = await service.from('whatsapp_configuracoes').insert({
        empresa_id: empresaId,
        instance_name: instancia,
        base_url: base,
        status: 'desconhecido',
      });
      if (insertError) {
        console.error('[whatsapp-instancia] erro ao gravar configuração:', insertError);
        throw new ErroHttp(500, 'A instância foi criada, mas não foi possível salvar a configuração. Tente de novo.');
      }
    }

    if (atual.existe && atual.estado === 'open') {
      await service.from('whatsapp_configuracoes')
        .update({ status: 'conectado', last_checked_at: new Date().toISOString() })
        .eq('empresa_id', empresaId);
      return jsonResponse({ ok: true, instance_name: instancia, conectado: true, status: 'conectado', webhook });
    }

    const qr = qrDaCriacao?.base64 ? { ...qrDaCriacao, ok: true } : await pedirQrCode(base, apiKey, instancia);
    if (!qr.base64) {
      throw new ErroHttp(409, 'A instância foi preparada, mas o QR Code ainda não ficou pronto. Clique em "Gerar QR Code" de novo em alguns segundos.');
    }
    return jsonResponse({
      ok: true,
      instance_name: instancia,
      conectado: false,
      status: 'desconhecido',
      base64: qr.base64,
      pairingCode: qr.pairingCode,
      webhook,
    });
  }

  // As demais ações exigem instância já cadastrada para a empresa.
  if (!config) throw new ErroHttp(404, 'Esta empresa ainda não tem WhatsApp configurado. Use "Conectar WhatsApp".');
  const base = normalizarBaseUrl(config.base_url);
  if (!base) throw new ErroHttp(500, 'A URL do servidor cadastrada é inválida (precisa começar com https://).');
  const instancia: string = config.instance_name;

  if (action === 'status') {
    const atual = await consultarEstado(base, apiKey, instancia);
    const status = atual.existe ? statusDoEstado(atual.estado) : 'desconectado';
    await service.from('whatsapp_configuracoes')
      .update({ status, last_checked_at: new Date().toISOString() })
      .eq('empresa_id', empresaId);
    return jsonResponse({ ok: true, instance_name: instancia, existe: atual.existe, estado: atual.estado || null, status });
  }

  if (action === 'qrcode') {
    const atual = await consultarEstado(base, apiKey, instancia);
    if (atual.existe && atual.estado === 'open') {
      return jsonResponse({ ok: true, conectado: true, status: 'conectado' });
    }
    const qr = await pedirQrCode(base, apiKey, instancia);
    if (!qr.base64) {
      throw new ErroHttp(409, 'O servidor não retornou um QR Code. Tente "Testar conexão" ou gere de novo em instantes.');
    }
    return jsonResponse({ ok: true, conectado: false, base64: qr.base64, pairingCode: qr.pairingCode });
  }

  if (action === 'desconectar') {
    const r = await evolution(base, apiKey, `/instance/logout/${encodeURIComponent(instancia)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) {
      throw new ErroHttp(502, 'Não foi possível desconectar o WhatsApp agora.', r.dados);
    }
    await service.from('whatsapp_configuracoes')
      .update({ status: 'desconectado', last_checked_at: new Date().toISOString() })
      .eq('empresa_id', empresaId);
    return jsonResponse({ ok: true, status: 'desconectado' });
  }

  if (action === 'ativarWebhook') {
    const aplicado = await aplicarWebhook(base, apiKey, instancia, supabaseUrl);
    if (!aplicado.aplicado) {
      throw new ErroHttp(
        aplicado.motivo === 'sem_segredo' ? 500 : 502,
        aplicado.motivo === 'sem_segredo'
          ? 'WHATSAPP_WEBHOOK_SECRET não configurado no servidor. Configure o secret antes de ativar o webhook.'
          : 'Falha ao configurar o recebimento de mensagens no servidor do WhatsApp.',
      );
    }
    return jsonResponse({ ok: true, webhook: 'configurado' });
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
    const mensagem = String((err as Error)?.name === 'TimeoutError'
      ? 'O servidor do WhatsApp demorou demais para responder. Tente novamente.'
      : 'Erro interno inesperado.');
    console.error('[whatsapp-instancia] erro inesperado:', err);
    return jsonResponse({ error: mensagem }, 500);
  }
}

Deno.serve(handler);
