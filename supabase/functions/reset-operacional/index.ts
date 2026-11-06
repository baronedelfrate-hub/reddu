import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Autenticação feita aqui dentro (verify_jwt=false, como o resto do projeto):
//  - exige um usuário logado (token no header Authorization);
//  - só administrador (perfil 'admin' / perfil admin padrão) ou super-admin;
//  - admin comum só pode resetar a PRÓPRIA empresa; super-admin, qualquer uma.
// A função reset_operacional_rpc é chamada com a chave de servidor (que a deixa passar),
// por isso a conferência da empresa precisa ser feita aqui.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
const falha = (message: string) => json({ success: false, message }, 400);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Quem está chamando?
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return falha('Não autenticado.');
    const { data: userAuth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userAuth?.user) return falha('Sessão inválida. Faça login novamente.');

    const { data: caller } = await supabase
      .from('usuarios')
      .select('empresa_id, perfil, perfil_id, is_super_admin')
      .eq('id', userAuth.user.id)
      .maybeSingle();
    if (!caller) return falha('Usuário sem cadastro na plataforma.');

    const isSuper = !!caller.is_super_admin;
    let isAdmin = caller.perfil === 'admin';
    if (!isAdmin && caller.perfil_id) {
      const { data: perfil } = await supabase
        .from('perfis').select('is_admin_padrao').eq('id', caller.perfil_id).maybeSingle();
      isAdmin = !!perfil?.is_admin_padrao;
    }
    if (!isSuper && !isAdmin) return falha('Apenas administradores podem resetar uma empresa.');

    // 2) Pode mexer nessa empresa? (a própria, ou super-admin)
    const { empresa_id } = await req.json();
    if (!empresa_id) return falha('empresa_id é obrigatório.');
    if (!isSuper && caller.empresa_id !== empresa_id) return falha('Sem permissão para esta empresa.');

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
