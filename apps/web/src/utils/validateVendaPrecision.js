import { supabase } from '@/lib/customSupabaseClient';
import { truncateToTwoDecimals } from '@/utils/truncateDecimal';

/**
 * CRITICAL - Precision Validation Utility
 * 
 * Audits stored venda records for decimal precision loss by:
 * 1. Fetching vendas with their movimentacoes
 * 2. Recalculating expected total_final = subtotal - desconto + taxa
 * 3. Comparing calculated vs. stored total_final
 * 4. Identifying and logging discrepancies
 * 
 * IMPORTANT: Discount is stored in movimentacoes table, NOT in vendas table
 * - vendas table does NOT have desconto or desconto_valor columns
 * - Each movimentacao may have desconto_valor (item-level discount)
 * - Total discount = sum of all movimentacoes.desconto_valor for a venda
 */

export async function auditVendaPrecision(empresaId, startDate, endDate, sampleSize = 50) {
  if (!empresaId) {
    return { 
      success: false, 
      error: 'empresa_id is required' 
    };
  }

  try {
    console.log('[validateVendaPrecision] Starting precision audit...', {
      empresaId,
      startDate,
      endDate,
      sampleSize
    });

    // CRITICAL FIX: Fetch vendas WITHOUT desconto column (does not exist in vendas table)
    let query = supabase
      .from('vendas')
      .select(`
        id,
        canal_venda,
        cliente_referencia,
        total_final,
        created_at
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(sampleSize);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: vendas, error: vendasError } = await query;

    if (vendasError) throw vendasError;

    console.log('[validateVendaPrecision] Fetched vendas:', vendas?.length || 0);

    const auditResults = [];
    let totalDiscrepancies = 0;
    let totalPrecisionLoss = 0;

    // Audit each venda
    for (const venda of (vendas || [])) {
      // Fetch movimentacoes for this venda
      const { data: movimentacoes, error: movError } = await supabase
        .from('movimentacoes')
        .select(`
          id,
          quantidade,
          valor_unitario,
          subtotal,
          total_final,
          desconto_valor,
          tipo_item,
          taxa_motoboy
        `)
        .eq('venda_id', venda.id);

      if (movError) {
        console.error('[validateVendaPrecision] Error fetching movimentacoes:', movError);
        continue;
      }

      // Calculate expected values
      const calculatedSubtotal = (movimentacoes || []).reduce((sum, item) => {
        const isTaxa = item.tipo_item === 'TAXA';
        const isDesconto = item.tipo_item === 'DESCONTO';
        const isPerda = item.tipo_item === 'PERDA';
        const isBrinde = item.tipo_item === 'BRINDE';

        if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

        const quantidade = Number(item.quantidade || 0);
        const valorUnit = Number(item.valor_unitario || 0);
        return sum + truncateToTwoDecimals(valorUnit * quantidade);
      }, 0);

      // CRITICAL FIX: Get discount from movimentacoes.desconto_valor (sum all items)
      const storedDiscount = (movimentacoes || []).reduce((sum, item) => {
        const descontoItem = Number(item.desconto_valor || 0);
        return sum + descontoItem;
      }, 0);

      // Fallback: if no desconto_valor, calculate from subtotal - total_final
      let discountFinal = storedDiscount;
      if (storedDiscount === 0) {
        const totalItens = (movimentacoes || []).reduce((sum, item) => {
          const isTaxa = item.tipo_item === 'TAXA';
          const isDesconto = item.tipo_item === 'DESCONTO';
          const isPerda = item.tipo_item === 'PERDA';
          const isBrinde = item.tipo_item === 'BRINDE';

          if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

          return sum + Number(item.total_final || 0);
        }, 0);

        const subtotalItens = (movimentacoes || []).reduce((sum, item) => {
          const isTaxa = item.tipo_item === 'TAXA';
          const isDesconto = item.tipo_item === 'DESCONTO';
          const isPerda = item.tipo_item === 'PERDA';
          const isBrinde = item.tipo_item === 'BRINDE';

          if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

          return sum + Number(item.subtotal || 0);
        }, 0);

        discountFinal = Math.max(0, subtotalItens - totalItens);
      }

      // Get delivery tax from items
      const canalUpper = (venda.canal_venda || '').toUpperCase();
      const calculatedTaxa = canalUpper.includes('APP') ? 0 : (movimentacoes || []).reduce((sum, item) => {
        if (item.tipo_item === 'TAXA') {
          const quantidade = Number(item.quantidade || 0);
          const valorUnit = Number(item.valor_unitario || 0);
          return sum + Math.abs(truncateToTwoDecimals(valorUnit * quantidade));
        }
        return sum;
      }, 0);

      // Calculate expected total (with truncation)
      const expectedTotal = truncateToTwoDecimals(
        Math.max(0, calculatedSubtotal - discountFinal + calculatedTaxa)
      );

      const storedTotal = Number(venda.total_final || 0);

      // Calculate discrepancy
      const difference = truncateToTwoDecimals(storedTotal - expectedTotal);

      if (Math.abs(difference) > 0.001) { // More than 0.1 cent difference
        totalDiscrepancies++;
        totalPrecisionLoss += Math.abs(difference);

        auditResults.push({
          vendaId: venda.id,
          vendaIdShort: venda.id.split('-')[0],
          clienteReferencia: venda.cliente_referencia,
          canalVenda: venda.canal_venda,
          calculatedSubtotal,
          storedDiscount: discountFinal,
          calculatedTaxa,
          expectedTotal,
          storedTotal,
          difference,
          percentageError: expectedTotal > 0 ? ((difference / expectedTotal) * 100).toFixed(4) : 0,
          created_at: venda.created_at
        });
      }
    }

    console.log('[validateVendaPrecision] Audit complete:', {
      totalVendas: vendas?.length || 0,
      discrepanciesFound: totalDiscrepancies,
      totalPrecisionLoss: truncateToTwoDecimals(totalPrecisionLoss)
    });

    return {
      success: true,
      summary: {
        totalVendas: vendas?.length || 0,
        discrepanciesFound: totalDiscrepancies,
        totalPrecisionLoss: truncateToTwoDecimals(totalPrecisionLoss),
        averagePrecisionLoss: totalDiscrepancies > 0 
          ? truncateToTwoDecimals(totalPrecisionLoss / totalDiscrepancies) 
          : 0
      },
      discrepancies: auditResults.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    };

  } catch (error) {
    console.error('[validateVendaPrecision] Audit error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format audit results for display in UI
 */
export function formatAuditResults(auditData) {
  if (!auditData.success) {
    return {
      title: 'Erro na Auditoria',
      description: auditData.error,
      variant: 'destructive'
    };
  }

  const { summary, discrepancies } = auditData;

  if (summary.discrepanciesFound === 0) {
    return {
      title: 'Auditoria Concluída ✓',
      description: `Todas as ${summary.totalVendas} vendas analisadas estão corretas (sem perda de precisão).`,
      variant: 'success',
      details: summary
    };
  }

  return {
    title: `Discrepâncias Detectadas (${summary.discrepanciesFound}/${summary.totalVendas})`,
    description: `Perda total de precisão: R$ ${summary.totalPrecisionLoss.toFixed(2)} (média R$ ${summary.averagePrecisionLoss.toFixed(4)} por venda)`,
    variant: 'warning',
    details: summary,
    discrepancies
  };
}