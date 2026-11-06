
import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ success: false, error: 'Method not allowed' }, 405);
    }

    const body = await req.json();
    const { to, subject, html, orcamento_token } = body;

    // Validate request body
    if (!to || !subject || !html) {
      return json({ success: false, error: 'Missing required fields: to, subject, html' }, 400);
    }

    const destinatarios: string[] = Array.isArray(to) ? to : [to];
    if (destinatarios.length === 0 || destinatarios.length > 10) {
      return json({ success: false, error: 'Lista de destinatários inválida.' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Segurança: antes qualquer visitante anônimo podia mandar e-mail
    // (com o domínio da Reddu) para qualquer endereço. Agora:
    //  1) usuário logado: pode enviar (telas internas de pedido/fechamento);
    //  2) visitante SEM login: só o aviso da tela pública de aprovação de
    //     orçamento, e apenas se houver um orçamento recém-aprovado com o
    //     token informado, e só para o e-mail que o cliente informou nessa
    //     aprovação ou para o e-mail da própria empresa.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = jwt ? await supabase.auth.getUser(jwt) : { data: null };

    if (!auth?.user) {
      if (!orcamento_token || typeof orcamento_token !== 'string') {
        return json({ success: false, error: 'Não autenticado.' }, 401);
      }

      const { data: evento } = await supabase
        .from('eventos')
        .select('empresa_id, aprovado_email, aprovado_em')
        .eq('token_aprovacao', orcamento_token)
        .maybeSingle();

      const aprovadoHa = evento?.aprovado_em ? Date.now() - new Date(evento.aprovado_em).getTime() : Infinity;
      if (!evento || !(aprovadoHa >= 0 && aprovadoHa <= 15 * 60 * 1000)) {
        return json({ success: false, error: 'Não autorizado.' }, 403);
      }

      const { data: empresa } = await supabase
        .from('empresas')
        .select('email')
        .eq('id', evento.empresa_id)
        .maybeSingle();

      const permitidos = new Set([norm(evento.aprovado_email), norm(empresa?.email)].filter(Boolean));
      if (!destinatarios.every((d) => permitidos.has(norm(d)))) {
        return json({ success: false, error: 'Destinatário não autorizado.' }, 403);
      }
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set");
      return json({ success: false, error: 'Server configuration error: RESEND_API_KEY is missing' }, 500);
    }

    // Call Resend API
    // Remetente atualizado pro domínio verificado (reddu.com.br) — o
    // endereço de teste onboarding@resend.dev só consegue mandar pro
    // próprio dono da conta Resend, por isso e-mail pra outros
    // destinatários (ex: cliente) vinha com erro 403.
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Reddu <noreply@reddu.com.br>',
        to: destinatarios,
        subject: subject,
        html: html
      })
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", data);
      return json(
        { success: false, error: data.message || 'Failed to send email via Resend' },
        resendResponse.status >= 400 && resendResponse.status < 600 ? resendResponse.status : 400
      );
    }

    return json({ success: true, id: data.id }, 200);

  } catch (error) {
    console.error("Function error:", error);
    return json({ success: false, error: error.message || 'Internal server error' }, 500);
  }
});
