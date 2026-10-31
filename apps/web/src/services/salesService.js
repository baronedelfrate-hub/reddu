import { supabase } from '@/lib/customSupabaseClient';

// Validation utility (Task 4)
export const validateSaleData = (data) => {
  const issues = [];
  if (!data.canal_venda) issues.push('canal_venda is missing');
  if (!data.cliente_referencia) issues.push('cliente_referencia is missing');

  if (issues.length > 0) {
    console.error('[SalesService Validation Error]:', issues.join(', '), data);
    return false;
  }

  console.log('[SalesService Validation Success]:', `Canal: ${data.canal_venda}, Ref: ${data.cliente_referencia}`);
  return true;
};

export async function generateClientReference(canal, empresaId, localName = null) {
  if (canal === 'MERCADO' && localName) return localName;

  let prefix = canal === 'PDV' ? 'BALCAO-' : (canal === 'APP' ? 'APP-' : 'REF-');

  try {
    const { data, error } = await supabase
      .from('vendas')
      .select('cliente_referencia')
      .eq('empresa_id', empresaId)
      .eq('canal_venda', canal)
      .ilike('cliente_referencia', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0 && data[0].cliente_referencia) {
      const lastRef = data[0].cliente_referencia;
      const numPart = lastRef.replace(prefix, '');
      const parsedNum = parseInt(numPart, 10);
      if (!isNaN(parsedNum)) {
        nextNumber = parsedNum + 1;
      }
    }

    const result = `${prefix}${nextNumber.toString().padStart(6, '0')}`;
    console.log(`[SalesService] Generated Client Reference: ${result} for canal: ${canal}`);
    return result;
  } catch (err) {
    console.error('[SalesService] Error generating sequential reference:', err);
    return `${prefix}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
  }
}

export async function recordPDVSale(empresa_id, totals, paymentInfo) {
  const canal_venda = 'PDV';
  const cliente_referencia = await generateClientReference(canal_venda, empresa_id);

  validateSaleData({ canal_venda, cliente_referencia });

  const { data, error } = await supabase.from('vendas').insert({
    empresa_id,
    canal_venda,
    cliente_referencia,
    total_final: totals?.total_final || 0,
    forma_pagamento: paymentInfo?.forma_pagamento || null
  }).select('id').single();

  if (error) {
    console.error('[SalesService] Error recording PDV sale in vendas table:', error);
    throw error;
  }

  console.log(`[SalesService] Successfully recorded PDV sale in vendas table. ID: ${data.id}, Ref: ${cliente_referencia}`);
  return { venda_id: data.id, cliente_referencia, canal_venda };
}

/**
 * TASK 2: Updated recordMarketplaceSale to accept and use dynamic status from vendaData
 * @param {string} empresa_id - Company ID
 * @param {string} mercado_id - Market location ID
 * @param {string} mercado_name - Market name (used as cliente_referencia)
 * @param {object} totals - Object containing total_final
 * @param {object} paymentInfo - Object containing forma_pagamento
 * @param {object} vendaData - Object containing status, financeiro_baixado, data_venda
 * @returns {object} { venda_id, cliente_referencia, canal_venda }
 */
export async function recordMarketplaceSale(empresa_id, mercado_id, mercado_name, totals, paymentInfo = {}, vendaData = {}) {
  if (!mercado_name) throw new Error("Nome do mercado é obrigatório para registrar venda de mercado.");

  const canal_venda = 'MERCADO';
  const cliente_referencia = mercado_name;

  validateSaleData({ canal_venda, cliente_referencia });

  // TASK 2: Extract status from vendaData, default to 'PENDENTE' if not provided
  const status = vendaData.status || 'PENDENTE';
  const financeiro_baixado = vendaData.financeiro_baixado !== undefined ? vendaData.financeiro_baixado : false;
  const data_venda = vendaData.data_venda || new Date().toISOString();

  console.log(`[SalesService] Recording Marketplace sale with status='${status}', financeiro_baixado=${financeiro_baixado}, data_venda=${data_venda}`);

  // TASK 2: Use dynamic status value instead of hardcoded 'CONCILIADO'
  const { data, error } = await supabase.from('vendas').insert({
    empresa_id,
    canal_venda,
    cliente_referencia,
    data_venda,
    total_final: totals?.total_final || 0,
    forma_pagamento: paymentInfo?.forma_pagamento || null,
    status,                        // TASK 2: Dynamic status from vendaData parameter
    financeiro_baixado,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('id').single();

  if (error) {
    console.error('[SalesService] Error recording Marketplace sale in vendas table:', error);
    throw error;
  }

  console.log(`[SalesService] Successfully recorded Marketplace sale in vendas table. ID: ${data.id}, Ref: ${cliente_referencia}, Status: ${status}, Financeiro: ${financeiro_baixado}`);
  return { venda_id: data.id, cliente_referencia, canal_venda };
}