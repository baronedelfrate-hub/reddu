
import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Segurança: só usuário logado pode usar o proxy (ele gasta crédito da
    // Anthropic). Antes qualquer visitante anônimo podia chamar.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    if (!auth?.user) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set");
      return json({ error: 'Server configuration error: ANTHROPIC_API_KEY is missing' }, 500);
    }

    const body = await req.json();
    const { messages, system } = body;

    // Validate request body
    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Missing or invalid "messages" parameter. Must be an array.' }, 400);
    }

    if (system && typeof system !== 'string') {
      return json({ error: 'Invalid "system" parameter. Must be a string.' }, 400);
    }

    // Call Anthropic API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: system || undefined,
        messages: messages
      })
    });

    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.text();
      console.error("Anthropic API error:", errorData);
      return json({ error: 'Anthropic API request failed', details: errorData }, 500);
    }

    const data = await anthropicResponse.json();

    return json(data, 200);

  } catch (error) {
    console.error("Function error:", error);
    return json({ error: 'Internal server error', details: error.message }, 500);
  }
});
