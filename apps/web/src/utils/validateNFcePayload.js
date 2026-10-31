export function validateNFcePayload(payload) {
  const errors = [];

  // Validate emitter data
  if (!payload.cnpj_emitente || payload.cnpj_emitente.replace(/\D/g, '').length !== 14) {
    errors.push('CNPJ do emitente inválido ou ausente. Deve conter 14 dígitos.');
  }
  if (!payload.nome_emitente) errors.push('Razão Social (nome_emitente) é obrigatória.');
  if (!payload.logradouro_emitente) errors.push('Logradouro do emitente é obrigatório.');
  if (!payload.numero_emitente) errors.push('Número do endereço do emitente é obrigatório.');
  if (!payload.bairro_emitente) errors.push('Bairro do emitente é obrigatório.');
  if (!payload.municipio_emitente) errors.push('Município do emitente é obrigatório.');
  if (!payload.uf_emitente || payload.uf_emitente.length !== 2) errors.push('UF do emitente é obrigatória e deve ter 2 caracteres.');
  if (!payload.cep_emitente) errors.push('CEP do emitente é obrigatório.');

  // Validate dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!payload.data_emissao || !dateRegex.test(payload.data_emissao)) {
    errors.push('Data de emissão inválida. Deve estar no formato ISO 8601.');
  }

  // Validate recipient
  if (payload.cpf_destinatario && payload.cpf_destinatario.replace(/\D/g, '').length !== 11) {
    errors.push('CPF do destinatário deve ter exatamente 11 dígitos.');
  }

  // Validate Items
  if (!payload.itens || payload.itens.length === 0) {
    errors.push('A NFC-e deve conter ao menos um item.');
  } else {
    payload.itens.forEach((item, index) => {
      const itemNum = index + 1;
      
      // Decimals validation
      if (!/^\d+\.\d{4}$/.test(item.quantidade_comercial)) {
        errors.push(`Item ${itemNum}: quantidade_comercial deve ter 4 casas decimais.`);
      }
      if (!/^\d+\.\d{10}$/.test(item.valor_unitario_comercial)) {
        errors.push(`Item ${itemNum}: valor_unitario_comercial deve ter 10 casas decimais.`);
      }
      if (!/^\d+\.\d{2}$/.test(item.valor_bruto)) {
        errors.push(`Item ${itemNum}: valor_bruto deve ter 2 casas decimais.`);
      }

      // Codes formatting
      if (!item.codigo_ncm || item.codigo_ncm.replace(/\D/g, '').length !== 8) {
        errors.push(`Item ${itemNum}: NCM deve conter exatamente 8 dígitos.`);
      }
      if (!item.cfop || item.cfop.replace(/\D/g, '').length !== 4) {
        errors.push(`Item ${itemNum}: CFOP deve conter exatamente 4 dígitos.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}