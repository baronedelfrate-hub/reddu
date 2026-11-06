
import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { to, subject, html } = body;

    // Validate request body
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields: to, subject, html' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set");
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error: RESEND_API_KEY is missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html
      })
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", data);
      return new Response(JSON.stringify({ success: false, error: data.message || 'Failed to send email via Resend' }), {
        status: resendResponse.status >= 400 && resendResponse.status < 600 ? resendResponse.status : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
