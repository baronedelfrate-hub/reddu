
import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return json({ error: 'empresa_id is required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Segurança: exige usuário logado e só deixa criar/obter o local da
    // PRÓPRIA empresa dele (super admin pode qualquer uma). Antes, qualquer
    // visitante anônimo conseguia disparar isso para qualquer empresa.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    if (!auth?.user) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('empresa_id, is_super_admin')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (!usuario || (usuario.empresa_id !== empresa_id && !usuario.is_super_admin)) {
      return json({ error: 'Sem permissão para essa empresa.' }, 403);
    }

    // Call the RPC function that handles the atomic get-or-create logic
    const { data: localId, error } = await supabase.rpc('ensure_estoque_bandejas_local_rpc', {
      p_empresa_id: empresa_id
    });

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    return json({ success: true, local_id: localId });
  } catch (error: any) {
    console.error('Error ensuring ESTOQUE BANDEJAS local:', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
});
