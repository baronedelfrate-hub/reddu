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