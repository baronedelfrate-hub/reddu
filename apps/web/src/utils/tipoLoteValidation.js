export const isValidTipoLote = (tipo) => {
  if (!tipo) return false;
  const normalized = tipo.toLowerCase();
  return ['bandeja', 'unitario', 'base'].includes(normalized);
};

export const normalizeTipoLote = (tipo) => {
  if (!tipo) return 'indefinido';
  const normalized = tipo.toLowerCase();
  if (normalized === 'base') return 'unitario';
  return normalized;
};

export const formatTipoLoteDisplay = (tipo) => {
  const normalized = normalizeTipoLote(tipo);
  if (normalized === 'bandeja') return 'Bandeja';
  if (normalized === 'unitario') return 'Unitário';
  return 'Indefinido';
};