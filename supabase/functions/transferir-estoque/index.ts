import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { empresa_id, lote_id, local_origem_id, local_destino_id, quantidade, produto_id } = await req.json();

    console.log("Recebendo requisição de transferência:", { empresa_id, lote_id, local_origem_id, local_destino_id, quantidade, produto_id });

    if (!empresa_id || !lote_id || !local_origem_id || !local_destino_id || !quantidade || !produto_id) {
      console.error("Parâmetros ausentes na requisição.");
      return new Response(
        JSON.stringify({ success: false, error: 'Parâmetros obrigatórios ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Iniciando chamada para a RPC transferir_estoque_rpc...");
    
    const { data, error } = await supabaseClient.rpc('transferir_estoque_rpc', {
      p_empresa_id: empresa_id,
      p_lote_id: lote_id,
      p_local_origem_id: local_origem_id,
      p_local_destino_id: local_destino_id,
      p_quantidade: quantidade,
      p_produto_id: produto_id
    });

    if (error) {
      console.error("Erro na RPC transferir_estoque_rpc:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Transferência concluída com sucesso. Movimentação ID:", data);

    return new Response(
      JSON.stringify({ success: true, movimentacao_id: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error("Erro interno no Edge Function:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});