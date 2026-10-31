import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) throw new Error('Missing Authorization header');

    const { data: userAuth, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !userAuth?.user) throw new Error('Unauthorized');

    const { data: userRecord } = await supabase.from('usuarios').select('perfil').eq('id', userAuth.user.id).single();
    if (userRecord?.perfil !== 'admin') throw new Error('Forbidden');

    const { empresa_id } = await req.json();
    if (!empresa_id) throw new Error('empresa_id is required');

    // Verify empresa exists
    const { data: empresa, error: empError } = await supabase.from('empresas').select('id').eq('id', empresa_id).single();
    if (empError || !empresa) throw new Error('Empresa não encontrada');

    // Call the RPC to handle the transaction safely
    const { data, error } = await supabase.rpc('reset_operacional_rpc', { p_empresa_id: empresa_id });

    if (error) throw error;

    if (data?.success) {
      // Log the reset
      await supabase.from('logs_auditoria').insert({
        empresa_id: empresa_id,
        usuario_id: userAuth.user.id,
        acao: 'reset_operacional',
        entidade: 'sistema',
        dados_depois: data.deleted_records
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});