export const VALID_PAYMENT_METHODS = [
  'pix', 
  'dinheiro', 
  'cartao', 
  'cartao_credito', 
  'cartao_debito', 
  'transferencia', 
  'cheque', 
  'outros', 
  'nao_informado'
];

export function validatePaymentMethod(method) {
  if (!method) {
    return { isValid: false, error: "Forma de pagamento é obrigatória." };
  }
  
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    return { 
      isValid: false, 
      error: `Forma de pagamento inválida: '${method}'. Valores aceitos: ${VALID_PAYMENT_METHODS.join(', ')}.` 
    };
  }
  
  return { isValid: true, error: null };
}

export function validatePaymentMethodStrict(method) {
  if (!method) {
    console.warn("[Strict Validation] Forma de pagamento ausente.");
    return { isValid: false, value: null, error: "Forma de pagamento é obrigatória." };
  }

  const normalized = method.trim().toLowerCase();

  if (!VALID_PAYMENT_METHODS.includes(normalized)) {
    console.warn(`[Strict Validation] Tentativa de usar forma de pagamento inválida: '${method}' -> '${normalized}'`);
    return { 
      isValid: false, 
      value: null, 
      error: `Forma de pagamento inválida. Valores aceitos: ${VALID_PAYMENT_METHODS.join(', ')}` 
    };
  }

  return { isValid: true, value: normalized, error: null };
}

export function getPaymentMethodDisplay(method) {
  if (!method) return '-';
  const normalized = method.toLowerCase();
  
  if (normalized === 'cheque') return 'Pago na plataforma(APP)';
  if (normalized === 'pix') return 'PIX';
  if (normalized === 'dinheiro') return 'Dinheiro';
  if (normalized === 'cartao' || normalized === 'cartão') return 'Cartão';
  if (normalized === 'cartao_credito') return 'Cartão de Crédito';
  if (normalized === 'cartao_debito') return 'Cartão de Débito';
  if (normalized === 'transferencia') return 'Transferência';
  if (normalized === 'nao_informado') return 'Não Informado';
  if (normalized === 'outros') return 'Outros';
  
  return method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}