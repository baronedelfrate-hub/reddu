/**
 * Utility function to determine the correct lot number to display.
 * For 'bandeja' lots, it displays the parent (origin) lot number.
 * 
 * @param {string} numero_lote - The original lot number
 * @param {string} tipo_lote - The type of the lot (e.g., 'bandeja', 'base')
 * @param {string|null} lote_origem_numero - The parent lot number
 * @returns {string} The lot number to display
 */
export function getLotDisplayValue(numero_lote, tipo_lote, lote_origem_numero) {
  if (tipo_lote === 'bandeja') {
    if (lote_origem_numero) {
      return lote_origem_numero;
    }
    // Data integrity check: Log warning if a bandeja has no parent lot
    console.warn(`Data Integrity Warning: Bandeja lot ${numero_lote} is missing a parent origin lot.`);
  }
  return numero_lote || '-';
}