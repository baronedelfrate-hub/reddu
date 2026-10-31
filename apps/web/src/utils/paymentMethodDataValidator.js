import { VALID_PAYMENT_METHODS } from './validatePaymentMethod';

export function validateAndFixPaymentData(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'string') return 'nao_informado';
  
  const trimmed = data.trim().toLowerCase();
  
  if (trimmed === '') return null;
  
  if (VALID_PAYMENT_METHODS.includes(trimmed)) {
    return trimmed;
  }
  
  return 'nao_informado';
}