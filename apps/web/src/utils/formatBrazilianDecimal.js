export const validateBrazilianDecimal = (value) => {
  if (value === '' || value === null || value === undefined) return true;
  // Permite números com ou sem uma única vírgula/ponto e até 3 casas decimais
  const regex = /^\d*([.,]\d{0,3})?$/;
  return regex.test(value);
};

export const parseBrazilianDecimal = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  // Substitui vírgula por ponto para conversão nativa do JS
  const normalized = String(value).replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatBrazilianDecimal = (value) => {
  if (value === null || value === undefined || value === '') return '';
  // Substitui ponto por vírgula para exibição no input
  return String(value).replace('.', ',');
};