import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Autenticação feita aqui dentro (verify_jwt=false, como o resto do projeto):
//  - exige um usuário logado (token no header Authorization);
//  - só administrador (perfil 'admin' / perfil admin padrão) ou super-admin;
//  - admin comum só baixa o backup da PRÓPRIA empresa; super-admin, de qualquer uma.

const falha = (message: string) =>
  new Response(JSON.stringify({ success: false, message }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
    if (!isSuper && !isAdmin) return falha('Apenas administradores podem gerar o backup.');

    // 2) Pode ver essa empresa? (a própria, ou super-admin)
    const { empresa_id } = await req.json();
    if (!empresa_id) return falha('empresa_id é obrigatório.');
    if (!isSuper && caller.empresa_id !== empresa_id) return falha('Sem permissão para esta empresa.');

    const { data: empresa } = await supabase.from('empresas').select('nome').eq('id', empresa_id).single();
    const empresaNome = empresa?.nome || 'Desconhecida';

    const tables = ['pedidos', 'pedido_itens', 'lotes', 'movimentacoes', 'caixas'];
    let sqlDump = `-- Backup Lógico Operacional\n-- Empresa: ${empresaNome} (${empresa_id})\n-- Data: ${new Date().toISOString()}\n\n`;

    for (const table of tables) {
      let query = supabase.from(table).select('*');
      
      if (table === 'pedido_itens') {
        const { data: pedidos } = await supabase.from('pedidos').select('id').eq('empresa_id', empresa_id);
        const pedidoIds = pedidos?.map(p => p.id) || [];
        if (pedidoIds.length > 0) {
          query = query.in('pedido_id', pedidoIds);
        } else {
          continue;
        }
      } else {
        query = query.eq('empresa_id', empresa_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        sqlDump += `-- Tabela: ${table}\n`;
        for (const row of data) {
          const keys = Object.keys(row).join(', ');
          const values = Object.values(row).map(v => {
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            return v;
          }).join(', ');
          sqlDump += `INSERT INTO ${table} (${keys}) VALUES (${values});\n`;
        }
        sqlDump += '\n';
      }
    }

    const fileSize = new TextEncoder().encode(sqlDump).length;

    return new Response(JSON.stringify({
      success: true,
      backup_file: sqlDump,
      file_size: fileSize,
      message: 'Backup gerado com sucesso'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});