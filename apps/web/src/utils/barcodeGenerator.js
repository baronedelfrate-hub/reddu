/**
 * Generates a valid Code128 barcode string based on the lot number.
 * Ensures the string is sanitized and compatible with barcode scanners.
 * 
 * @param {string} loteNumber - The original lot number.
 * @returns {string} - A sanitized string suitable for Code128 barcode generation.
 */
export function generateBarcode(loteNumber) {
  if (!loteNumber) return '';
  // Sanitize to alphanumeric and hyphens to ensure maximum compatibility for Code128
  return String(loteNumber).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}