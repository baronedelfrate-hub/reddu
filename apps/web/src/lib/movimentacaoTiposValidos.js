/**
 * Lista de tipos de movimentação válidos com base nas constraints do banco de dados.
 * Atualizado para refletir as regras de negócio e triggers de auditoria (ex: log_movimentacao_trigger).
 */
export const VALID_MOVIMENTACAO_TIPOS = [
  'entrada', 
  'saida', 
  'saída', 
  'transferencia', 
  'transferência', 
  'devolucao', 
  'devolução', 
  'bandeja', 
  'producao', 
  'producao_bandeja', 
  'venda', 
  'ajuste', 
  'baixa', 
  'venda_mercado', 
  'venda_unitario', 
  'ajuste_manual', 
  'descarte', 
  'conferencia'
];

export const isMovimentacaoTipoValido = (tipo) => {
  if (!tipo) return false;
  return VALID_MOVIMENTACAO_TIPOS.includes(tipo.toLowerCase());
};