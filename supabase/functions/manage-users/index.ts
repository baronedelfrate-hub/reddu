import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Autenticação feita aqui dentro (verify_jwt=false, como o resto do projeto):
//  - exige um usuário logado (token no header Authorization);
//  - só administradores (perfil 'admin' / perfil admin padrão) ou super-admin podem usar;
//  - admin comum só mexe em usuários da PRÓPRIA empresa; super-admin em qualquer uma.

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) throw new Error('Missing environment variables.');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Quem está chamando?
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Não autenticado.' }, 401);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401);
    const callerId = authData.user.id;

    const { data: caller } = await admin
      .from('usuarios')
      .select('id, empresa_id, perfil, perfil_id, is_super_admin')
      .eq('id', callerId)
      .maybeSingle();
    if (!caller) return json({ error: 'Usuário sem cadastro na plataforma.' }, 403);

    const isSuper = !!caller.is_super_admin;
    let isAdmin = caller.perfil === 'admin';
    if (!isAdmin && caller.perfil_id) {
      const { data: perfil } = await admin
        .from('perfis').select('is_admin_padrao').eq('id', caller.perfil_id).maybeSingle();
      isAdmin = !!perfil?.is_admin_padrao;
    }
    if (!isSuper && !isAdmin) {
      return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
    }

    // 2) Pode mexer nesse usuário-alvo? (mesma empresa, ou super-admin)
    // Usuário sem linha em public.usuarios = órfão (ex.: já apagado do BD, ou rollback
    // de criação): admin pode finalizar a limpeza, pois não pertence a nenhuma empresa.
    const podeMexerEm = async (targetId: string | null | undefined, permitirOrfao = false) => {
      if (isSuper) return true;
      if (!targetId) return false;
      const { data: alvo } = await admin
        .from('usuarios').select('id, empresa_id, is_super_admin').eq('id', targetId).maybeSingle();
      if (!alvo) return permitirOrfao;
      if (alvo.is_super_admin) return false;
      return !!caller.empresa_id && alvo.empresa_id === caller.empresa_id;
    };

    const body = await req.json();
    const { action, email, password, userId, method } = body;

    if (action === 'create') {
      if (!email || !password) return json({ error: 'E-mail e senha são obrigatórios.' }, 400);
      if (String(password).length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      return json({ success: true, userId: data.user.id });
    }

    if (action === 'resetPassword') {
      if (method === 'admin') {
        if (!(await podeMexerEm(userId))) return json({ error: 'Sem permissão para este usuário.' }, 403);
        if (!password || String(password).length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
      } else if (method === 'email') {
        let alvoId = userId;
        if (!alvoId && email) {
          const { data: u } = await admin.from('usuarios').select('id').eq('email', email).maybeSingle();
          alvoId = u?.id;
        }
        if (!(await podeMexerEm(alvoId))) return json({ error: 'Sem permissão para este usuário.' }, 403);
        const { error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
        if (error) throw error;
      } else {
        return json({ error: 'Invalid reset method.' }, 400);
      }
      return json({ success: true });
    }

    if (action === 'delete') {
      if (!userId) return json({ error: 'userId obrigatório.' }, 400);
      if (userId === callerId) return json({ error: 'Você não pode excluir o próprio usuário.' }, 400);
      if (!(await podeMexerEm(userId, true))) return json({ error: 'Sem permissão para este usuário.' }, 403);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
