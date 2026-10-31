import { VALID_MOVIMENTACAO_TIPOS, isMovimentacaoTipoValido } from '@/lib/movimentacaoTiposValidos';

/**
 * Utilitário centralizado para validação de tipos de movimentação.
 * Previne violações de constraint no banco de dados.
 */

export const isValidMovimentacaoTipo = (tipo) => {
  return isMovimentacaoTipoValido(tipo);
};

export const getValidMovimentacaoTipos = () => {
  return [...VALID_MOVIMENTACAO_TIPOS];
};

export const validateMovimentacaoData = (data) => {
  if (!data || !data.tipo) {
    return { 
      valid: false, 
      error: 'Tipo de movimentação não especificado.' 
    };
  }

  if (!isValidMovimentacaoTipo(data.tipo)) {
    return { 
      valid: false, 
      error: `Tipo de movimentação inválido: '${data.tipo}'. Tipos permitidos: ${VALID_MOVIMENTACAO_TIPOS.join(', ')}` 
    };
  }

  // Adicionar outras validações genéricas de movimentação se necessário (ex: quantidade > 0)
  if (data.quantidade !== undefined && data.quantidade < 0) {
    return {
      valid: false,
      error: 'A quantidade da movimentação não pode ser negativa.'
    };
  }

  return { valid: true };
};