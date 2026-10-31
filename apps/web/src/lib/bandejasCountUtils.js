/**
 * Utility functions for standardizing bandeja (tray) identification and counting
 * across the application to ensure consistency.
 */

/**
 * Checks if a given item (lote or estoque record) is of type 'bandeja'.
 * Handles null/undefined and different property names used across the app.
 * 
 * @param {Object} item - The item to check (must have tipo_lote or tipo)
 * @returns {boolean} True if the item is a bandeja
 */
export const isBandeja = (item) => {
  if (!item) return false;
  const tipo = (item.tipo_lote || item.tipo || 'base').toLowerCase();
  return tipo === 'bandeja';
};

/**
 * Filters an array of items to return only active bandejas.
 * 
 * @param {Array} items - Array of lotes or estoque items
 * @param {boolean} includeZero - Whether to include items with 0 or negative quantity
 * @returns {Array} Filtered array of bandejas
 */
export const filterBandejas = (items, includeZero = false) => {
  if (!Array.isArray(items)) return [];
  
  return items.filter(item => {
    if (!isBandeja(item)) return false;
    
    // Ignore explicitly inactive items (if the property exists)
    if (item.ativo === false) return false;
    
    // Determine quantity (handles both lotes and estoque_por_local structures)
    const qty = Number(item.quantidade_atual !== undefined ? item.quantidade_atual : (item.quantidade || 0));
    
    if (!includeZero && qty <= 0) return false;
    
    return true;
  });
};

/**
 * Counts the total number of bandejas (summing quantities) in an array of items.
 * 
 * @param {Array} items - Array of lotes or estoque items
 * @param {boolean} includeZero - Whether to include items with 0 or negative quantity in the sum
 * @returns {number} Total count of bandejas
 */
export const countBandejas = (items, includeZero = false) => {
  const bandejas = filterBandejas(items, includeZero);
  
  return bandejas.reduce((total, item) => {
    const qty = Number(item.quantidade_atual !== undefined ? item.quantidade_atual : (item.quantidade || 0));
    return total + qty;
  }, 0);
};

/**
 * Counts the total number of units inside all bandejas in an array of items.
 * 
 * @param {Array} items - Array of lotes or estoque items
 * @param {boolean} includeZero - Whether to include items with 0 or negative quantity in the sum
 * @returns {number} Total count of units inside bandejas
 */
export const countUnidadesInBandejas = (items, includeZero = false) => {
  const bandejas = filterBandejas(items, includeZero);
  
  return bandejas.reduce((total, item) => {
    const qty = Number(item.quantidade_atual !== undefined ? item.quantidade_atual : (item.quantidade || 0));
    const unids = Number(item.unidades_por_bandeja || 0);
    return total + (qty * unids);
  }, 0);
};