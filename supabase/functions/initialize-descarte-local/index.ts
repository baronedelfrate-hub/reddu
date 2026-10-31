import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { empresa_id } = body;

    if (!empresa_id) {
      throw new Error('empresa_id is required');
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check if DESCARTE exists
    const { data: existing, error: checkError } = await supabase
      .from('locais')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('nome', 'DESCARTE')
      .eq('tipo', 'Técnico')
      .single();

    if (existing) {
      return new Response(JSON.stringify({ success: true, local_id: existing.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert DESCARTE
    const { data: inserted, error: insertError } = await supabase
      .from('locais')
      .insert([{
        empresa_id,
        nome: 'DESCARTE',
        tipo: 'Técnico',
        descricao: 'Local técnico para rastreamento de devoluções',
        controla_validade: false,
        controla_estoque: true
      }])
      .select('id')
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, local_id: inserted.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});