import { corsHeaders } from "./cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase Client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Parse request body
    const body = await req.json();
    const { 
      empresa_id, 
      local_origem_id, 
      produto_id, 
      lote_id, 
      quantidade, 
      motivo_devolucao, 
      observacao 
    } = body;

    console.log("Recebendo requisição de devolução:", { 
      empresa_id, local_origem_id, produto_id, lote_id, quantidade, motivo_devolucao 
    });

    // Validate required parameters
    if (!empresa_id || !local_origem_id || !produto_id || !lote_id || !quantidade || !motivo_devolucao) {
      console.error("Parâmetros ausentes na requisição.");
      return new Response(
        JSON.stringify({ success: false, error: 'Parâmetros obrigatórios ausentes.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (quantidade <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'A quantidade deve ser maior que zero.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Iniciando chamada para a RPC registrar_devolucao_rpc...");
    
    // Call the RPC function
    const { data, error } = await supabaseClient.rpc('registrar_devolucao_rpc', {
      p_empresa_id: empresa_id,
      p_local_origem_id: local_origem_id,
      p_produto_id: produto_id,
      p_lote_id: lote_id,
      p_quantidade: quantidade,
      p_motivo_devolucao: motivo_devolucao,
      p_observacao: observacao || null
    });

    if (error) {
      console.error("Erro na RPC registrar_devolucao_rpc:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Devolução registrada com sucesso. Movimentação ID:", data);

    // Return success response
    return new Response(
      JSON.stringify({ success: true, movimentacao_id: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error("Erro interno no Edge Function (registrar-devolucao):", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});