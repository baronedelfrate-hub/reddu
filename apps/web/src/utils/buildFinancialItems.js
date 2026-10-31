export function buildFinancialItems(order) {
  const itensArray = order.itens || [];

  // 1. Mapear itens reais (Produtos, Brindes, Perdas)
  const itensReais = itensArray.map(item => ({
    ...item,
    valor_unitario: item.valor_unitario ?? item.produtos?.preco_venda ?? 0,
    subtotal: Number(item.subtotal || 0),
    total_final: (item.tipo_item === 'BRINDE' || item.tipo_item === 'PERDA') ? 0 : Number(item.total_final ?? item.subtotal ?? 0)
  }));

  // 2. BUSCA GLOBAL: Procura taxa e desconto em QUALQUER linha da venda
  const taxaGlobal = Math.max(...itensArray.map(i => Number(i.taxa_motoboy || 0)), 0);
  const descontoGlobal = Math.max(...itensArray.map(i => Number(i.desconto_valor || i.desconto || 0)), 0);

  const financeiros = [];

  // Adiciona Taxa se encontrada em algum lugar
  if (taxaGlobal > 0) {
    financeiros.push({
      tipo_item: 'TAXA',
      produtos: { nome: 'Taxa de Entrega' },
      valor_unitario: taxaGlobal,
      total_final: taxaGlobal,
      quantidade: null
    });
  }

  // Adiciona Desconto se encontrado em algum lugar
  if (descontoGlobal > 0) {
    financeiros.push({
      tipo_item: 'DESCONTO',
      produtos: { nome: 'Desconto' },
      valor_unitario: 0,
      total_final: descontoGlobal,
      quantidade: null
    });
  }

  return [...itensReais, ...financeiros];
}