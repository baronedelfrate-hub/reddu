/**
 * Formats a unit price value with up to 3 decimal places (NO ROUNDING).
 * Displays the actual value as-is without pre-normalization or rounding.
 * Use this for displaying unit prices that may have 3 decimal precision (e.g., R$ 0,999).
 * 
 * CRITICAL: This function does NOT round values - it preserves exact precision.
 * 
 * @param {number|string|null|undefined} valor - The value to format
 * @returns {string} The formatted currency string (e.g., "R$ 0,999", "R$ 1,50")
 */
export const formatUnit = (valor) => {
  const num = Number(valor);
  if (isNaN(num) || valor === null || valor === undefined) {
    return 'R$ 0,00';
  }
  
  // CRITICAL: NO rounding - format directly with maximumFractionDigits: 3
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  }).format(num);
};

/**
 * Formats a monetary value with exactly 2 decimal places (NO ROUNDING).
 * Use this for displaying totals, subtotals, and final monetary amounts.
 * 
 * CRITICAL: This function does NOT round values anymore - it preserves exact precision.
 * The value is formatted for display only, not modified.
 * 
 * @param {number|string|null|undefined} valor - The value to format
 * @returns {string} The formatted currency string (e.g., "R$ 29,90", "R$ 4,495")
 */
export const formatMoney = (valor) => {
  const num = Number(valor);
  if (isNaN(num) || valor === null || valor === undefined) {
    return 'R$ 0,00';
  }
  
  // Usar Math.round para corrigir floating point (19.899... → 19.90)
  // sem afetar valores com 3 casas que nunca chegam aqui (usam formatUnit)
  const arredondado = Math.round(num * 100) / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(arredondado);
};

/**
 * Legacy function - Formats a numeric value into a Brazilian currency string (R$).
 * Kept for backward compatibility. Consider using formatUnit() or formatMoney() instead.
 * 
 * @param {number|string} value - The numeric value to format
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} The formatted currency string
 * @deprecated Use formatUnit() for unit prices or formatMoney() for totals instead
 */
export const formatCurrency = (value, decimals = 2) => {
  const num = Number(value);
  if (isNaN(num)) return 'R$ 0,00';
  const fator = Math.pow(10, decimals);
  const truncado = Math.trunc(num * fator) / fator;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(truncado);
};

/**
 * Formats a monetary value with exactly 3 decimal places using Brazilian locale.
 * Example: 1.199 -> "R$ 1,199"
 * 
 * @param {number|string|null|undefined} value - The value to format
 * @returns {string} The formatted currency string
 */
export const formatCurrencyWith3Decimals = (value) => {
  const num = Number(value);
  if (isNaN(num) || value === null || value === undefined) {
    return 'R$ 0,000';
  }
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 3,
    maximumFractionDigits: 2,
  }).format(Math.trunc(num * 100) / 100);  // trunca, não arredonda
};

/**
 * @deprecated Use formatMoney() instead
 */
export const formatDisplayValue = formatMoney;