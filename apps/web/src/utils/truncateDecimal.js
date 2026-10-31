/**
 * CRITICAL: This function truncates for data validation purposes ONLY.
 * DO NOT use this function for display formatting.
 * For display, use formatTruncatedCurrency() or formatCurrencyWith3Decimals().
 * 
 * Truncates a numeric value to exactly 2 decimal places WITHOUT rounding.
 * This function uses Math.trunc(value * 100) / 100, with a tiny epsilon
 * added first to cancel out floating-point representation noise (ex:
 * 2 * 19.4 is stored internally as 38.79999999999999715783, not exactly
 * 38.8 — without the epsilon this would wrongly truncate to 38.79).
 * The epsilon is small enough (1e-9) that it never affects genuinely
 * fractional values like 4.995, which still truncates to 4.99 as intended.
 * 
 * Examples:
 * - truncateToTwoDecimals(4.995) returns 4.99 (NOT 5.00)
 * - truncateToTwoDecimals(9.999) returns 9.99 (NOT 10.00)
 * - truncateToTwoDecimals(19.896) returns 19.89 (NOT 19.90)
 * - truncateToTwoDecimals(2 * 19.4) returns 38.8 (NOT 38.79 — floating-point noise fix)
 * 
 * @param {number|string|null|undefined} value - The value to truncate
 * @returns {number} The truncated value with exactly 2 decimal places
 */

const FLOAT_NOISE_EPSILON = 1e-9;

export function truncateToTwoDecimals(value) {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.trunc((num + FLOAT_NOISE_EPSILON) * 100) / 100;
}

/**
 * CRITICAL: Passthrough unit prices WITHOUT truncation (preserves 3 decimals).
 * 
 * This function preserves the exact raw value.
 * Use this for valor_unitario columns where 3 decimals are required.
 * 
 * Examples:
 * - truncateValorUnitario(0.999) returns 0.999
 * - truncateValorUnitario(1.199) returns 1.199
 * - truncateValorUnitario(2.345) returns 2.345
 * 
 * Returns numeric value (NOT formatted string)
 * 
 * @param {number|string|null|undefined} valor - The unit price
 * @returns {number} The raw unit price
 */
export function truncateValorUnitario(valor) {
  const num = Number(valor);
  if (isNaN(num) || valor === null || valor === undefined) {
    console.log('[truncateValorUnitario] Invalid input:', valor, '-> 0');
    return 0;
  }
  
  // CRITICAL: Raw value passthrough to preserve 3 decimals
  console.log(`[truncateValorUnitario] Passthrough unit price: ${num}`);
  return num;
}

/**
 * CRITICAL: Truncates financial totals (292.517 → 292.51, 4.995 → 4.99)
 * 
 * This function uses Math.trunc(value * 100) / 100 to truncate financial totals,
 * with the same floating-point noise guard as truncateToTwoDecimals (see above).
 * Use this for subtotal, desconto, taxa_motoboy, total_final columns when saving to DB.
 * 
 * Returns numeric value (NOT formatted string)
 * 
 * @param {number|string|null|undefined} value - The financial total to truncate
 * @returns {number} The truncated financial total
 */
export const formatMoney = (value) => {
  if (value === null || value === undefined) return 0;
  
  const num = Number(value);
  if (isNaN(num)) return 0;

  return Math.trunc((num + FLOAT_NOISE_EPSILON) * 100) / 100;
};

/**
 * CRITICAL: Formats already-processed values (truncated) to currency string.
 * 
 * Does NOT truncate or round - only formats the input value.
 * 
 * Examples:
 * - formatTruncatedCurrency(0.99) displays as "R$ 0,99"
 * - formatTruncatedCurrency(292.52) displays as "R$ 292,52"
 * - formatTruncatedCurrency(5.00) displays as "R$ 5,00"
 * 
 * @param {number|string|null|undefined} value - The value to format (already truncated/rounded)
 * @param {number} decimals - Minimum/Maximum fraction digits
 * @returns {string} The formatted currency string (e.g., "R$ 0,99")
 */
export function formatTruncatedCurrency(value, decimals = 2) {
  const num = Number(value);
  if (isNaN(num) || value === null || value === undefined) {
    return 'R$ 0,00';
  }
  
  const fator = Math.pow(10, decimals);
  const truncado = Math.round(num * fator) / fator;  // Math.round corrige floating point (19.899... → 19.90)
  
  const formatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals
  }).format(truncado);
  
  return formatado;
}