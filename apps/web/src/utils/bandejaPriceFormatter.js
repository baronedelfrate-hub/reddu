/**
 * Utility functions for formatting Bandeja prices with exactly 2 decimal places
 * Bandeja prices use 2 decimals while Unitário prices use up to 3 decimals
 */

/**
 * Formats a Bandeja price for display with exactly 2 decimal places
 * @param {number|string} value - The price value to format
 * @returns {string} Formatted price string (e.g., "R$ 10,55")
 */
export const formatBandejaPriceForDisplay = (value) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

/**
 * Parses user input and converts to number with exactly 2 decimal places for storage
 * @param {string|number} value - The input value to parse
 * @returns {number} Parsed number with exactly 2 decimal places
 */
export const parseBandejaPriceForStorage = (value) => {
  if (!value || value === '') return 0;
  const num = parseFloat(String(value).replace(',', '.')) || 0;
  return parseFloat(num.toFixed(2));
};

/**
 * Validates that a Bandeja price input has no more than 2 decimal places
 * @param {string|number} value - The value to validate
 * @returns {Object} { isValid: boolean, message: string }
 */
export const validateBandejaPriceInput = (value) => {
  if (!value || value === '') {
    return { isValid: true, message: '' };
  }
  
  // Convert to string and replace comma with period for decimal check
  const numStr = String(value).replace(',', '.');
  
  // Split by decimal point
  const parts = numStr.split('.');
  
  // Check if there are more than 2 decimal places
  if (parts.length > 1 && parts[1].length > 2) {
    return {
      isValid: false,
      message: 'Preço Bandeja deve ter no máximo 2 casas decimais'
    };
  }
  
  // Check if value is a valid number
  const num = parseFloat(numStr);
  if (isNaN(num)) {
    return {
      isValid: false,
      message: 'Valor inválido'
    };
  }
  
  // Check if value is positive
  if (num < 0) {
    return {
      isValid: false,
      message: 'Preço deve ser positivo'
    };
  }
  
  return { isValid: true, message: '' };
};