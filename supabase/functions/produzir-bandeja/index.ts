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

    const { 
      empresa_id, 
      produto_id, 
      p_lote_base_id, 
      lote_base_id,   
      local_id, // Base lote location
      quantidade_bandejas, 
      unidades_por_bandeja
    } = await req.json();

    const originLoteId = p_lote_base_id || lote_base_id;

    if (!empresa_id || !produto_id || !originLoteId || !local_id || !quantidade_bandejas || !unidades_por_bandeja) {
      throw new Error('Campos obrigatórios ausentes.');
    }

    const quantidade_total_unidades = quantidade_bandejas * unidades_por_bandeja;

    // 1. Fetch origin batch data
    const { data: loteBase, error: loteBaseError } = await supabaseClient
      .from('lotes')
      .select('quantidade, numero_lote, data_validade, produto_id, produtos(nome)')
      .eq('id', originLoteId)
      .single();

    if (loteBaseError || !loteBase) throw new Error('Lote de origem não encontrado.');
    if (loteBase.quantidade < quantidade_total_unidades) throw new Error('Quantidade insuficiente no lote de origem.');

    // 2. Ensure "ESTOQUE BANDEJAS" local exists and get its ID
    const { data: localData, error: localFuncError } = await supabaseClient.functions.invoke('ensure-estoque-bandejas-local', {
      body: { empresa_id }
    });

    if (localFuncError || !localData?.success) {
      throw new Error('Erro ao obter ou criar o local ESTOQUE BANDEJAS.');
    }

    const destinoLocalId = localData.local_id;

    // 3. Decrement base stock
    const saldo_restante = loteBase.quantidade - quantidade_total_unidades;
    const { error: updateError } = await supabaseClient
      .from('lotes')
      .update({ quantidade: saldo_restante })
      .eq('id', originLoteId);

    if (updateError) throw updateError;

    // 4. Generate new bandeja lote number
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const prefix = `BDJ-${dateStr}-`;

    const { data: existingLotes, error: existingLotesError } = await supabaseClient
      .from('lotes')
      .select('numero_lote')
      .like('numero_lote', `${prefix}%`)
      .order('numero_lote', { ascending: false })
      .limit(1);

    if (existingLotesError) throw existingLotesError;

    let nextSeq = 1;
    if (existingLotes && existingLotes.length > 0) {
      const lastLote = existingLotes[0].numero_lote;
      const parts = lastLote.split('-');
      if (parts.length === 3) {
        nextSeq = parseInt(parts[2], 10) + 1;
      }
    }
    const seqStr = String(nextSeq).padStart(3, '0');
    const numero_lote_bandeja = `${prefix}${seqStr}`;

    // 5. Determine new product name
    const originalProductName = loteBase.produtos?.nome || 'Produto Desconhecido';
    const newProductName = originalProductName.startsWith('Bandeja') 
      ? originalProductName 
      : `Bandeja ${originalProductName}`;

    // 6. Create the new bandeja lote IN ESTOQUE BANDEJAS WITH unidades_por_bandeja
    const novoLoteId = crypto.randomUUID();

    const { error: insertLoteError } = await supabaseClient
      .from('lotes')
      .insert({
        id: novoLoteId,
        empresa_id,
        produto_id,
        numero_lote: numero_lote_bandeja,
        quantidade: quantidade_bandejas,
        local_id: destinoLocalId,
        data_validade: loteBase.data_validade,
        lote_origem_id: originLoteId,
        tipo_lote: 'bandeja',
        unidades_por_bandeja: unidades_por_bandeja
      });

    if (insertLoteError) throw insertLoteError;

    // 7. Insert into movimentacoes
    const { error: movError } = await supabaseClient
      .from('movimentacoes')
      .insert({
        empresa_id,
        tipo: 'bandeja',
        produto_id,
        lote_id: novoLoteId,
        local_origem_id: local_id,
        local_destino_id: destinoLocalId,
        quantidade: quantidade_bandejas,
        data_movimentacao: new Date().toISOString(),
        observacao: `Produção de ${quantidade_bandejas} bandejas a partir do lote ${loteBase.numero_lote}`
      });

    if (movError) throw movError;

    // 8. Return success payload
    return new Response(JSON.stringify({ 
      success: true, 
      lote_id: novoLoteId, 
      numero_lote: numero_lote_bandeja,
      data_validade: loteBase.data_validade,
      nome_produto: newProductName,
      lote_base_numero: loteBase.numero_lote,
      saldo_restante,
      local_armazenamento: 'ESTOQUE BANDEJAS'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});