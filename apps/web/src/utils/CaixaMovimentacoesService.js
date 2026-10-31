export const calculateTotalRetiradas = (movimentacoes = []) => {
  return movimentacoes
    .filter(m => m.tipo === 'RETIRADA')
    .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
};

export const calculateFinalBalance = (valor_inicial = 0, total_vendas = 0, total_retiradas = 0) => {
  return Number(valor_inicial) + Number(total_vendas) - Number(total_retiradas);
};

export const formatCurrencyBR = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0);
};

export const validateRetiradaAmount = (valor, saldo_atual) => {
  const numValor = Number(valor);
  if (isNaN(numValor) || numValor <= 0) {
    return { valid: false, error: 'O valor da retirada deve ser maior que zero.' };
  }
  if (saldo_atual !== undefined && numValor > saldo_atual) {
    return { valid: true, warning: 'Aviso: O valor da retirada é maior que o saldo atual em caixa.' };
  }
  return { valid: true };
};