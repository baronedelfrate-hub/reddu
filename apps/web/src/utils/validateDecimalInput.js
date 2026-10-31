export function validateDecimalInput(value, maxDecimals = 3) {
  if (value === '' || value === null || value === undefined) {
    return { isValid: true, formattedValue: '', error: null };
  }

  // When using type="number", the browser returns a string with a dot as decimal separator
  const strValue = String(value);
  const numValue = parseFloat(strValue);

  if (isNaN(numValue)) {
    return { 
      isValid: false, 
      formattedValue: strValue, 
      error: 'Apenas números são permitidos' 
    };
  }

  if (numValue < 0) {
    return { 
      isValid: false, 
      formattedValue: strValue, 
      error: 'Preço não pode ser negativo' 
    };
  }

  if (numValue === 0) {
    return { 
      isValid: false, 
      formattedValue: strValue, 
      error: 'Preço deve ser maior que zero' 
    };
  }

  if (numValue > 0 && numValue < 0.001) {
    return { 
      isValid: false, 
      formattedValue: strValue, 
      error: 'Preço mínimo é R$ 0,001' 
    };
  }

  const decimalPart = strValue.split('.')[1];
  if (decimalPart && decimalPart.length > maxDecimals) {
    return { 
      isValid: false, 
      formattedValue: strValue, 
      error: `Máximo ${maxDecimals} casas decimais permitidas` 
    };
  }

  return { 
    isValid: true, 
    formattedValue: strValue, 
    error: null 
  };
}