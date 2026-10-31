import { supabase } from '@/lib/customSupabaseClient';
import { validateNFcePayload } from '@/utils/validateNFcePayload';

export const fiscalService = {
  /**
   * Fetches configuracoes_fiscais record for the company.
   */
  async obterConfiguracoesEmpresa(empresaId) {
    if (!empresaId) throw new Error("empresaId é obrigatório");
    
    const { data, error } = await supabase
      .from('configuracoes_fiscais')
      .select('*')
      .eq('empresa_id', empresaId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[fiscalService] Erro ao obter configurações:', error);
      throw error;
    }
    
    return data || null;
  },

  /**
   * Fetches the configured API URL from configuracoes_fiscais
   */
  async getConfiguredAPIUrl(empresaId) {
    const config = await this.obterConfiguracoesEmpresa(empresaId);
    if (!config || !config.url_api_focus) {
      throw new Error("URL da API não configurada nas configurações fiscais.");
    }
    return config.url_api_focus;
  },

  /**
   * Translates payment method to Focus NFe format
   */
  mapearFormaPagamento(forma) {
    const mapeamento = {
      'dinheiro': '01',
      'cheque': '02',
      'cartao_credito': '03',
      'cartao_debito': '04',
      'credito_loja': '05',
      'vale_alimentacao': '10',
      'vale_refeicao': '11',
      'vale_presente': '12',
      'vale_combustivel': '13',
      'boleto': '15',
      'pix': '17',
      'pagamento_instantaneo': '17',
      'transferencia': '17',
      'deposito': '17',
      'nao_informado': '99',
    };
    return mapeamento[forma?.toLowerCase()] || '99'; // 99 = Outros
  },

  /**
   * Builds the complete JSON payload matching homologated model exactly
   */
  construirPayloadNFCe(venda, configuracoes) {
    // Determine Regime Tributario
    let regimeEmitente = "1"; // Default to Simples
    if (configuracoes.regime_tributario === "Lucro Presumido") regimeEmitente = "2";
    if (configuracoes.regime_tributario === "Lucro Real") regimeEmitente = "3";

    // Handle items
    const itensFiltrados = venda.items.filter(i => i.tipo_item === 'NORMAL' || !i.tipo_item);
    
    // Pre-calculate total for proportional discount distribution
    const totalBrutoItens = itensFiltrados.reduce((acc, item) => {
      const qtde = parseFloat(item.quantidade) || 0;
      const precoUnit = parseFloat(item.preco || item.valor_unitario) || 0;
      return acc + Math.round(qtde * precoUnit * 100) / 100;
    }, 0);
    
    const descontoTotalDistribuir = parseFloat(venda.desconto || 0);
    let descontoDistribuido = 0;

    let valorTotalProdutos = 0;
    const itens = itensFiltrados.map((item, index) => {
      const qtde = parseFloat(item.quantidade) || 0;
      const precoUnit = parseFloat(item.preco || item.valor_unitario) || 0;
      const valorBrutoRaw = qtde * precoUnit;
      const valorBruto = Math.round(valorBrutoRaw * 100) / 100;
      valorTotalProdutos += valorBruto; // soma os já truncados
      
      // Distribute discount proportionally, last item gets the remainder
      let descontoItem = 0;
      if (descontoTotalDistribuir > 0 && totalBrutoItens > 0) {
        const isLastItem = index === itensFiltrados.length - 1;
        if (isLastItem) {
          descontoItem = Math.round((descontoTotalDistribuir - descontoDistribuido) * 100) / 100;
        } else {
          descontoItem = Math.round((valorBruto / totalBrutoItens) * descontoTotalDistribuir * 100) / 100;
          descontoDistribuido += descontoItem;
        }
      }


      // Validação NCM conforme regras SEFAZ-SP
      let ncm = item.ncm ? item.ncm.replace(/\D/g, '') : "";
      if (!ncm || ncm === '00000000' || ncm.trim() === '') {
        ncm = '19059090'; // NCM padrão salgados/padaria
      }

      return {
        numero_item: (index + 1).toString(),
        codigo_produto: (item.produto_id || "0").substring(0, 10),
        codigo_barras_comercial: item.barcode || "SEM GTIN",
        descricao: item.produto_nome || item.nome || 'Produto',
        codigo_ncm: ncm,
        cfop: item.cfop_padrao ? item.cfop_padrao.replace(/\D/g, '') : "5102",
        unidade_comercial: "un",
        quantidade_comercial: qtde.toFixed(4),
        valor_unitario_comercial: precoUnit.toFixed(10),
        valor_bruto: valorBruto.toFixed(2),
        ...(descontoItem > 0 ? { desconto: descontoItem.toFixed(2) } : {}),
        codigo_barras_tributavel: item.barcode || "SEM GTIN",
        unidade_tributavel: "un",
        quantidade_tributavel: qtde.toFixed(4),
        valor_unitario_tributavel: precoUnit.toFixed(10),
        inclui_no_total: "1",
        icms_percentual_partilha: "100.0000",
        icms_origem: item.origem_produto !== undefined ? String(item.origem_produto) : "0",
        // SEFAZ-SP compliance: CSOSN 102 for direct consumer sales
        icms_situacao_tributaria: regimeEmitente === "1" ? "102" : "00",
        pis_situacao_tributaria: "99",
        pis_base_calculo: "0",
        pis_aliquota_porcentual: "0",
        pis_valor: "0",
        cofins_situacao_tributaria: "99",
        cofins_base_calculo: "0",
        cofins_aliquota_porcentual: "0",
        cofins_valor: "0"
      };
    });

    // Handle Document Date
    let dataEmissao = new Date().toISOString();
    if (venda.data_venda) {
      dataEmissao = new Date(venda.data_venda).toISOString();
    }

    // Taxes & Totals
const freteValor = 0; // Taxa de entrega não entra na NF-e
const descontoValor = parseFloat(venda.desconto || 0);
const totalVenda = Math.round((valorTotalProdutos - descontoValor) * 100) / 100;

    // Handle CPF
    let cpfLimpo = null;
    let cnpjLimpo = null;
    let nomeDestinatario = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
    if (venda.cpf_cliente) {
      const docLimpo = venda.cpf_cliente.replace(/\D/g, '');
      if (docLimpo.length === 14) { cnpjLimpo = docLimpo; }
      else { cpfLimpo = docLimpo;
      if (cpfLimpo && cpfLimpo.length !== 11) cpfLimpo = null;
      }
    }
    if (configuracoes.ambiente_fiscal === 'producao' && !cpfLimpo) {
      nomeDestinatario = venda.cliente_referencia || "CONSUMIDOR FINAL";
    }
    // O XSD da NFC-e exige que, se o bloco "destinatário" existir, ele comece
    // por CNPJ, CPF ou idEstrangeiro — não dá pra mandar só o nome
    // (xNome) sem documento (foi o erro "Element xNome not expected" do
    // pedido #33). Então, sem CPF/CNPJ, omitimos o destinatário inteiro:
    // a nota sai anônima pra "consumidor final", que é válido e comum em
    // vendas de varejo.
    const temDestinatario = Boolean(cpfLimpo || cnpjLimpo);

    // Payment mapping
    const formasPagamento = [];
    if (venda.forma_pagamento === 'multiplo' && Array.isArray(venda.forma_pagamento_detalhes)) {
      venda.forma_pagamento_detalhes.forEach(p => {
        formasPagamento.push({
          forma_pagamento: this.mapearFormaPagamento(p.method),
          valor_pagamento: parseFloat(p.value || 0).toFixed(2)
        });
      });
    } else {
      formasPagamento.push({
        forma_pagamento: this.mapearFormaPagamento(venda.forma_pagamento),
        valor_pagamento: totalVenda.toFixed(2)
      });
    }

    // Payload Focus Model
    const payload = {
      // Header
      natureza_operacao: "Venda",
      data_emissao: dataEmissao,
      tipo_documento: "65", // 1 = Nota Fiscal Eletrônica (NFC-e)
      local_destino: "1",
      finalidade_emissao: "1",
      consumidor_final: "1", // Sempre venda a consumidor final no PDV
      presenca_comprador: "1", // 1=Operação presencial
      indicador_intermediario: "0",
      
      // Emitter
      cnpj_emitente: configuracoes.cnpj ? configuracoes.cnpj.replace(/\D/g, '') : '',
      nome_emitente: configuracoes.razao_social || '',
      nome_fantasia_emitente: configuracoes.nome_fantasia || '',
      logradouro_emitente: configuracoes.logradouro || '',
      numero_emitente: configuracoes.numero || '',
      complemento_emitente: configuracoes.complemento || '',
      bairro_emitente: configuracoes.bairro || '',
      municipio_emitente: configuracoes.municipio || '',
      uf_emitente: configuracoes.uf || '',
      cep_emitente: configuracoes.cep ? configuracoes.cep.replace(/\D/g, '') : '',
      telefone_emitente: configuracoes.telefone ? configuracoes.telefone.replace(/\D/g, '') : '',
      inscricao_estadual_emitente: configuracoes.inscricao_estadual || '',
      regime_tributario_emitente: regimeEmitente,

      // Recipient — só entra no payload se tiver CPF ou CNPJ (ver nota acima
      // sobre temDestinatario). NUNCA mandar um CPF placeholder (tipo
      // "00000000000") pra SEFAZ — isso sempre é rejeitado por dígito
      // verificador inválido (foi o que causou a rejeição 237 do pedido #33).
      ...(temDestinatario ? {
        cpf_destinatario: cpfLimpo || null,
        cnpj_destinatario: cnpjLimpo || null,
        nome_destinatario: nomeDestinatario,
      } : {}),

      // Items
      itens: itens,

      // Global Totals (tax nullifiers)
      icms_base_calculo: "0",
      icms_valor_total: "0",
      icms_valor_total_desonerado: "0",
      fcp_valor_total: "0",
      icms_base_calculo_st: "0",
      icms_valor_total_st: "0",
      fcp_valor_total_st: "0",
      fcp_valor_total_retido_st: "0",
      valor_produtos: valorTotalProdutos.toFixed(2),
      valor_frete: "0.00",
      valor_outras_despesas: "0",
      valor_seguro: "0",
      valor_desconto: descontoTotalDistribuir > 0 ? descontoTotalDistribuir.toFixed(2) : "0.00",
      valor_total_ii: "0",
      valor_ipi: "0",
      valor_ipi_devolvido: "0",
      valor_pis: "0",
      valor_cofins: "0",
      valor_total: totalVenda.toFixed(2),
      modalidade_frete: "9", // 9=Sem Frete

      // Payments
      formas_pagamento: formasPagamento,

      // Extra
      informacoes_adicionais_contribuinte: configuracoes.informacoes_adicionais_contribuinte || "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL",
      cnpj_responsavel_tecnico: null,
      contato_responsavel_tecnico: null,
      email_responsavel_tecnico: null,
      telefone_responsavel_tecnico: null
    };

    return payload;
  },

  /**
   * Logs emission attempts for debugging
   */
  logEmissaoNFCe(venda_id, status, detalhes) {
    console.log(`[NFC-e Log] Venda: ${venda_id} | Status: ${status}`, detalhes);
  },

  /**
   * Main function that orchestrates the emission.
   */
  async emitirNFCe(venda, empresaId) {
    try {
      this.logEmissaoNFCe(venda.id, 'iniciando', { empresaId });
      
      const config = await this.obterConfiguracoesEmpresa(empresaId);
      if (!config) {
        throw new Error('Configurações fiscais não encontradas. Configure primeiro no painel.');
      }

      const url_api = await this.getConfiguredAPIUrl(empresaId);

      if (!venda.items || venda.items.length === 0) {
        throw new Error('Venda não possui itens para emitir nota.');
      }

      const payload = this.construirPayloadNFCe(venda, config);

      // Verify validation before sending to edge function
      const validation = validateNFcePayload(payload);
      if (!validation.valid) {
        throw new Error(`Falha na validação do Payload: \n${validation.errors.join('\n')}`);
      }

      // Invoke secure Edge Function
      const { data, error } = await supabase.functions.invoke('emit-nfce', {
        body: {
          venda_id: venda.id,
          empresa_id: empresaId,
          payload,
          url_api
        }
      });

      if (error) {
        throw new Error(error.message || 'Falha na comunicação com a Edge Function');
      }

      // Handle Edge Function Response
      const result = data || {};
      const statusFiscal = result.success ? 'emitido' : 'erro';
      const errorMessage = result.success ? null : (result.erro || 'Erro desconhecido ao emitir nota.');

      // Update the venda record in database
      const updatePayload = {
        status_fiscal: statusFiscal,
        nfe_id: result.nfe_id || null,
        nfe_chave: result.nfe_chave || null,
        nfe_url_pdf: result.nfe_url_pdf || null,
        nfe_erro_mensagem: errorMessage
      };
      
      if (venda.cpf_cliente) {
        updatePayload.cpf_cliente = venda.cpf_cliente.replace(/\D/g, '');
      }

      await supabase.from('vendas').update(updatePayload).eq('id', venda.id);
      this.logEmissaoNFCe(venda.id, statusFiscal, result);

      return result;

    } catch (err) {
      this.logEmissaoNFCe(venda.id, 'falha_interna', { erro: err.message });
      
      if (venda?.id) {
        await supabase.from('vendas').update({
          status_fiscal: 'erro',
          nfe_erro_mensagem: err.message
        }).eq('id', venda.id);
      }

      return { success: false, erro: err.message };
    }
  },

  /**
   * Queries the status of an already-emitted NFC-e.
   */
  async consultarStatusNFCe(nfe_id, empresaId) {
    try {
      const config = await this.obterConfiguracoesEmpresa(empresaId);
      if (!config) throw new Error('Configuração fiscal ausente');

      const url_api = await this.getConfiguredAPIUrl(empresaId);
      const url = `${url_api}/${nfe_id}`;
      
      const authString = btoa(`${config.token_api_focus}:`);
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${authString}` }
      });

      return await response.json();
    } catch (err) {
      console.error('[fiscalService] Erro ao consultar NFC-e:', err);
      throw err;
    }
  }
};