import { corsHeaders } from "./cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { venda_id, empresa_id, payload, url_api } = await req.json();

    if (!empresa_id) throw new Error('empresa_id ausente.');

    // Fetch config for token and address validation
    const { data: config, error: configError } = await supabaseClient
      .from('configuracoes_fiscais')
      .select('*')
      .eq('empresa_id', empresa_id)
      .single();

    if (configError || !config) {
      throw new Error('Configurações fiscais não encontradas.');
    }

    if (!config.token_api_focus) {
      throw new Error('Token da API Focus não configurado.');
    }

    // Validate required address fields
    const requiredFields = ['logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep'];
    const missingFields = requiredFields.filter(field => !config[field]);
    if (missingFields.length > 0) {
      throw new Error(`Campos de endereço obrigatórios ausentes nas configurações fiscais: ${missingFields.join(', ')}`);
    }

    // ==========================================
    // Pre-submission Validation & Correction
    // ==========================================
    if (payload) {
      let payloadCorrected = false;

      // Ensure tipo_documento is 1
      if (payload.tipo_documento !== "1") {
        console.log(`Correção tipo_documento: de '${payload.tipo_documento}' para '1'`);
        payload.tipo_documento = "1";
        payloadCorrected = true;
      }

      if (Array.isArray(payload.itens)) {
        payload.itens.forEach((item: any, index: number) => {
          const origCsosn = item.icms_situacao_tributaria;
          const origNcm = item.codigo_ncm;
          
          // Check and correct CSOSN to SEFAZ-SP compliance
          if (origCsosn === '103') {
            item.icms_situacao_tributaria = '102';
            payloadCorrected = true;
            console.log(`[Item ${index}] Correção CSOSN: de '${origCsosn}' para '102'`);
          }

          // Check and correct NCM to SEFAZ-SP compliance
          if (!origNcm || origNcm === '00000000' || origNcm.trim() === '') {
            item.codigo_ncm = '19059090';
            payloadCorrected = true;
            console.log(`[Item ${index}] Correção NCM: de '${origNcm}' para '19059090'`);
          }
        });
      }

      if (payloadCorrected) {
        console.log("NFC-e payload corrected: CSOSN='102', NCM='19059090' aplicado(s)");
      }
    }

    // Prepare request to Focus NFe
    const authString = btoa(`${config.token_api_focus}:`);
    
    // Focus NFe expects a reference (ref) for idempotency - using venda_id
    const apiUrl = `${url_api}?ref=${venda_id}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // Check for Focus NFe specific errors
    if (!response.ok || result.erros || result.codigo === 'erro_validacao') {
       return new Response(JSON.stringify({ 
         success: false, 
         erro: JSON.stringify(result.erros || result.mensagem || 'Erro de validação na API Focus NFe')
       }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      nfe_id: result.referencia || venda_id,
      nfe_chave: result.chave_nfe || result.chave || null,
      nfe_url_pdf: result.caminho_xml_nota_fiscal ? `https://api.focusnfe.com.br${result.caminho_danfe}` : (result.uri_danfe || null)
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, erro: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});