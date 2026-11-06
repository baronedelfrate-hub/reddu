import { corsHeaders } from "./cors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

    const { venda_id, empresa_id, payload, url_api } = await req.json();

    if (!empresa_id) throw new Error('empresa_id ausente.');

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

    const requiredFields = ['logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep'];
    const missingFields = requiredFields.filter(field => !config[field]);
    if (missingFields.length > 0) {
      throw new Error(`Campos de endereço obrigatórios ausentes nas configurações fiscais: ${missingFields.join(', ')}`);
    }

    if (payload) {
      let payloadCorrected = false;

      if (payload.tipo_documento !== "1") {
        console.log(`Correção tipo_documento: de '${payload.tipo_documento}' para '1'`);
        payload.tipo_documento = "1";
        payloadCorrected = true;
      }

      if (Array.isArray(payload.itens)) {
        payload.itens.forEach((item: any, index: number) => {
          const origCsosn = item.icms_situacao_tributaria;
          const origNcm = item.codigo_ncm;

          if (origCsosn === '103') {
            item.icms_situacao_tributaria = '102';
            payloadCorrected = true;
            console.log(`[Item ${index}] Correção CSOSN: de '${origCsosn}' para '102'`);
          }

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

    const authString = btoa(`${config.token_api_focus}:`);
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

    // IMPORTANTE: um HTTP 200/201 da Focus NÃO significa que a nota foi
    // autorizada pela SEFAZ — só significa que a Focus aceitou o pedido
    // pra processar. O status real vem no campo "status" da resposta:
    //   - "autorizado" -> sucesso de verdade
    //   - "processando_autorizacao" -> ainda não terminou
    //   - "erro_autorizacao"/"denegado"/"cancelado" -> rejeitado pela SEFAZ
    // O código antigo só checava "erros"/"codigo" (erros de validação do
    // payload antes de chegar na SEFAZ) e deixava passar como "sucesso"
    // uma nota que a SEFAZ tinha rejeitado de verdade.
    const statusResposta = result.status;
    const mensagemSefaz = result.mensagem_sefaz || null;
    const statusSefaz = result.status_sefaz || null;

    const foiRejeitada = ['erro_autorizacao', 'denegado', 'cancelado', 'nao_encontrada'].includes(statusResposta);
    const aindaProcessando = statusResposta === 'processando_autorizacao';

    if (!response.ok || result.erros || result.codigo === 'erro_validacao' || foiRejeitada) {
      const mensagemErro = mensagemSefaz
        ? `Rejeição SEFAZ${statusSefaz ? ` ${statusSefaz}` : ''}: ${mensagemSefaz}`
        : JSON.stringify(result.erros || result.mensagem || 'Erro de validação na API Focus NFe');

      return new Response(JSON.stringify({
        success: false,
        erro: mensagemErro,
        status_sefaz: statusSefaz,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (aindaProcessando) {
      return new Response(JSON.stringify({
        success: false,
        pendente: true,
        erro: 'A nota ainda está sendo processada pela SEFAZ. Aguarde alguns segundos e tente novamente.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
