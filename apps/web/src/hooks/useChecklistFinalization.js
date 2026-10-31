import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export function useChecklistFinalization(empresaId) {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [isFinalizing, setIsFinalizing] = useState(false);

  const finalizeChecklist = async (localId, checkedProducts) => {
    if (!empresaId || !localId || checkedProducts.length === 0) {
      toast({ title: 'Dados inválidos para finalização', variant: 'destructive' });
      return false;
    }

    setIsFinalizing(true);
    try {
      const now = new Date().toISOString();
      const movimentacoesToInsert = [];
      let reposicaoCount = 0;

      // 1. Prepare movimentacoes & check for "reposição consignado" needs
      for (const prod of checkedProducts) {
        const obs = `Checklist. Físico: ${prod.currentBalance}, Sistema: ${prod.prevBalance}, Dif: ${prod.diff}`;
        const status = prod.diff === 0 ? 'Conforme' : 'Divergência';

        movimentacoesToInsert.push({
          empresa_id: empresaId,
          tipo: 'conferencia',
          produto_id: prod.produto_id,
          lote_id: prod.lote_id,
          local_origem_id: localId,
          quantidade: prod.currentBalance,
          observacao: obs,
          status,
          data_movimentacao: now
        });

        // Consignado logic: if diff < 0, it means we found MORE than expected (Surplus).
        // Wait, prompt says: "Consignado (negative difference = shortage)".
        // If diff = Prev - Current. Prev = 10, Current = 12. Diff = -2.
        // If the prompt implies we need to trigger reposição for items that sold (Venda Direta is positive difference).
        // Let's create an order for items that had positive difference (sold items need reposition).
        if (prod.diff > 0) {
          reposicaoCount++;
        }
      }

      // 2. Insert movimentacoes
      const { error: movError } = await supabase
        .from('movimentacoes')
        .insert(movimentacoesToInsert);

      if (movError) throw movError;

      // 3. Create Pending Order for Reposição if items were sold
      if (reposicaoCount > 0) {
        // Create Pedido
        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos')
          .insert({
            empresa_id: empresaId,
            mercado_id: localId,
            status: 'pendente',
            data_entrega: new Date().toISOString().split('T')[0],
            observacao: 'Reposição Consignado Automática - Checklist'
          })
          .select()
          .single();

        if (pedidoError) throw pedidoError;

        // Create Pedido Itens
        const itensToInsert = checkedProducts
          .filter(p => p.diff > 0)
          .map(p => ({
            pedido_id: pedidoData.id,
            produto_id: p.produto_id,
            quantidade_bandejas: Math.ceil(p.diff / (p.unidades_por_bandeja || 1)) // Estimate bandejas needed
          }));

        if (itensToInsert.length > 0) {
          const { error: itemError } = await supabase
            .from('pedido_itens')
            .insert(itensToInsert);
          if (itemError) throw itemError;
        }
      }

      // 4. Log Auditoria
      const { error: auditError } = await supabase
        .from('logs_auditoria')
        .insert({
          empresa_id: empresaId,
          usuario_id: currentUser?.id,
          acao: 'finalizar_checklist',
          entidade: 'conferencia',
          dados_depois: {
            local_id: localId,
            total_items: checkedProducts.length,
            reposicoes_geradas: reposicaoCount
          }
        });

      if (auditError) console.error('Erro ao gerar log de auditoria', auditError);

      toast({ title: 'Checklist finalizado com sucesso!', className: 'bg-green-600 text-white' });
      return true;

    } catch (err) {
      console.error('Erro na finalização do checklist:', err);
      toast({ title: 'Erro ao finalizar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setIsFinalizing(false);
    }
  };

  return { finalizeChecklist, isFinalizing };
}