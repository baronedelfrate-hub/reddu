/**
 * Resolves the tipo_lote for an item using a strict fallback priority.
 * 
 * Priority order (no skipping levels):
 * 1. Return item.lotes?.tipo_lote if it exists and is truthy
 * 2. Else return item.tipo_lote if it exists and is truthy
 * 3. Else return item.tipo_item if it exists and is truthy
 * 4. Else return 'N/A'
 *
 * @param {Object} item - The data object containing lote/item information.
 * @returns {string} The resolved tipo_lote value.
 */
export const resolveTipoLote = (item) => {
  if (!item) return 'N/A';
  if (item.lotes?.tipo_lote) return item.lotes.tipo_lote;
  if (item.tipo_lote) return item.tipo_lote;
  if (item.tipo_item) return item.tipo_item;
  return 'N/A';
};