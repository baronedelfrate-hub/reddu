import { supabase } from '@/lib/customSupabaseClient';

/**
 * List of all operational and cache tables that should be empty after a reset.
 */
export const OPERATIONAL_TABLES = [
  'logs_auditoria',
  'pedido_itens',
  'movimentacoes',
  'lotes',
  'pedidos',
  'caixas',
  'relatorio_producao',
  'estoque_por_local',
  'alertas_estoque',
  'dashboard_producao_venda_diaria',
  'dashboard_ranking_produtos',
  'dashboard_distribuicao_local',
  'dashboard_produtos_criticos',
  'dashboard_alertas_resumo',
  'dashboard_total_itens',
  'dashboard_lotes_vencendo'
];

/**
 * Queries all operational tables to get current record counts.
 * Returns an object with table names and their current counts.
 * 
 * @param {string} empresaId - The company ID to filter records by
 * @returns {Promise<{counts: Object, allEmpty: boolean, hasErrors: boolean}>}
 */
export const verifyResetResults = async (empresaId) => {
  if (!empresaId) throw new Error("Empresa ID is required for verification");
  
  console.log(`[VerifyResetResults] Starting verification for empresa: ${empresaId}`);
  
  const results = {};
  let allEmpty = true;
  let hasErrors = false;

  for (const table of OPERATIONAL_TABLES) {
    try {
      let count = 0;
      
      // Special case for pedido_itens as it doesn't have empresa_id directly
      if (table === 'pedido_itens') {
        const { count: c, error } = await supabase
          .from('pedido_itens')
          .select('id, pedidos!inner(empresa_id)', { count: 'exact', head: true })
          .eq('pedidos.empresa_id', empresaId);
          
        if (error) throw error;
        count = c || 0;
      } else {
        // Standard case for tables with empresa_id
        const { count: c, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId);
          
        if (error) throw error;
        count = c || 0;
      }
      
      results[table] = count;
      if (count > 0) allEmpty = false;
      
    } catch (error) {
      console.error(`[VerifyResetResults] Error verifying table ${table}:`, error);
      results[table] = -1; // -1 indicates an error occurred while counting
      allEmpty = false;
      hasErrors = true;
    }
  }

  console.log('[VerifyResetResults] Verification completed:', results);
  return { counts: results, allEmpty, hasErrors };
};