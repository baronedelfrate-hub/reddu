// Mensalidade do Reddu via INFINITEPAY (checkout hospedado: Pix ou cartão na página deles).
// Deploy na MESMA função de antes (reddu-mensalidade-pix), com Verify JWT LIGADO.
// Secret opcional: REDDU_INFINITEPAY_HANDLE (InfiniteTag da Reddu, sem o $). Sem ele usa o padrão abaixo.
// Ações: { action: 'status', transaction_nsu?, slug? } | { action: 'gerar', retorno_url }
// A empresa vem SEMPRE do usuário logado e o valor SEMPRE do banco (empresas.mensalidade_valor).
// SEGURANÇA: só marca "pago" depois de perguntar à InfinitePay (payment_check) e o valor bater.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const HANDLE_PADRAO = 'roberto-barone-del';
const LINKS = 'https://api.checkout.infinitepay.io/links';
const CHECK = 'https://api.checkout.infinitepay.io/payment_check';

function competenciaAtual(): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // mês no horário de Brasília
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function acharUrl(d: any): string | null {
  if (!d || typeof d !== 'object') return null;
  const c = [d.url, d.link, d.checkout_url, d.payment_url, d.invoice_url, d.checkout_link, d.data?.url, d.data?.link, d.data?.checkout_url];
  const achado = c.find((v) => typeof v === 'string' && /^https?:\/\//.test(v));
  if (achado) return achado as string;
  for (const v of Object.values(d)) if (typeof v === 'string' && /^https:\/\/\S+$/.test(v)) return v;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const reqBody = await req.json().catch(() => ({}));
    const action = reqBody?.action || 'status';

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const handle = (Deno.env.get('REDDU_INFINITEPAY_HANDLE') || HANDLE_PADRAO).trim().replace(/^\$/, '');

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: auth } = await svc.auth.getUser(jwt);
    if (!auth?.user) return json({ success: false, error: 'Não autenticado.' }, 401);

    const { data: usuario } = await svc.from('usuarios').select('empresa_id').eq('id', auth.user.id).maybeSingle();
    if (!usuario?.empresa_id) return json({ success: false, error: 'Usuário sem empresa.' }, 403);

    const { data: empresa } = await svc.from('empresas').select('id, nome, mensalidade_valor').eq('id', usuario.empresa_id).maybeSingle();
    const valor = Math.round(Number(empresa?.mensalidade_valor || 0) * 100) / 100;
    const centavos = Math.round(valor * 100);
    const competencia = competenciaAtual();
    const configurado = valor > 0;

    const { data: linha } = await svc.from('reddu_mensalidades').select('*')
      .eq('empresa_id', usuario.empresa_id).eq('competencia', competencia).maybeSingle();

    if (linha?.status === 'pago') return json({ success: true, pago: true, valor: Number(linha.valor), competencia, configurado });

    // já existe cobrança em aberto: pergunta à InfinitePay se foi paga
    if (linha?.ip_link) {
      const body: Record<string, string> = { handle, order_nsu: linha.id };
      if (typeof reqBody?.transaction_nsu === 'string' && reqBody.transaction_nsu) body.transaction_nsu = reqBody.transaction_nsu;
      if (typeof reqBody?.slug === 'string' && reqBody.slug) body.slug = reqBody.slug;
      const r = await fetch(CHECK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.paid === true) {
        if (Number(d?.amount) === Math.round(Number(linha.valor) * 100)) {
          await svc.from('reddu_mensalidades').update({
            status: 'pago', pago_em: new Date().toISOString(), ip_transaction_nsu: body.transaction_nsu || null,
          }).eq('id', linha.id).neq('status', 'pago');
          return json({ success: true, pago: true, valor: Number(linha.valor), competencia, configurado });
        }
        console.error('[reddu-mensalidade] valor não confere:', JSON.stringify(d), 'esperado', Math.round(Number(linha.valor) * 100));
      }
    }

    if (action !== 'gerar') return json({ success: true, pago: false, valor, competencia, configurado });

    if (!configurado) return json({ success: false, error: 'Pagamento online ainda não está disponível pra sua empresa.' }, 400);

    // reaproveita o link se o valor não mudou
    if (linha?.ip_link && Math.round(Number(linha.valor) * 100) === centavos) {
      return json({ success: true, pago: false, valor, competencia, configurado, url: linha.ip_link });
    }

    // cria (ou atualiza) a linha do mês e usa o id dela como order_nsu
    const { data: salva, error: errSalva } = await svc.from('reddu_mensalidades').upsert({
      empresa_id: usuario.empresa_id, competencia, valor, status: 'pendente',
    }, { onConflict: 'empresa_id,competencia' }).select('id').single();
    if (errSalva || !salva) {
      console.error('[reddu-mensalidade] erro ao salvar cobrança:', errSalva);
      return json({ success: false, error: 'Não foi possível preparar a cobrança.' }, 500);
    }

    const corpo: Record<string, unknown> = {
      handle,
      order_nsu: salva.id,
      items: [{ quantity: 1, price: centavos, description: `Mensalidade Reddu ${competencia} - ${empresa?.nome || ''}`.trim() }],
      webhook_url: `${url}/functions/v1/infinitepay-webhook`,
    };
    // dados pré-preenchidos na tela da InfinitePay (menos digitação para quem paga)
    const meta = (auth.user.user_metadata || {}) as Record<string, unknown>;
    const nomeCliente = String(meta.nome || meta.name || meta.full_name || empresa?.nome || '').trim();
    const customer: Record<string, string> = {};
    if (nomeCliente) customer.name = nomeCliente;
    if (auth.user.email) customer.email = auth.user.email;
    if (Object.keys(customer).length) corpo.customer = customer;
    if (typeof reqBody?.retorno_url === 'string' && /^https:\/\//.test(reqBody.retorno_url)) corpo.redirect_url = reqBody.retorno_url;

    const resp = await fetch(LINKS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await resp.json().catch(() => null);
    const link = acharUrl(dados);
    if (!resp.ok || !link) {
      console.error('[reddu-mensalidade] falha ao criar link:', resp.status, JSON.stringify(dados));
      const msg = dados?.error === 'external_checkout_not_enabled'
        ? 'O checkout externo ainda não está habilitado na conta InfinitePay da Reddu. Ative em app.infinitepay.io/external-checkout e tente de novo.'
        : 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.';
      return json({ success: false, error: msg }, 502);
    }

    await svc.from('reddu_mensalidades').update({ ip_link: link }).eq('id', salva.id);
    return json({ success: true, pago: false, valor, competencia, configurado, url: link });
  } catch (e) {
    console.error('[reddu-mensalidade] erro:', e);
    return json({ success: false, error: (e as Error).message || 'Erro inesperado.' }, 500);
  }
});
