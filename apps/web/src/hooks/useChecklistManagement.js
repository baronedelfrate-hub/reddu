import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

export function useChecklistManagement(empresaId) {
  const { toast } = useToast();
  const [checkedProducts, setCheckedProducts] = useState([]);
  const [marketProducts, setMarketProducts] = useState([]);
  const [lastChecklistDate, setLastChecklistDate] = useState(null);

  const fetchLastChecklist = useCallback(async (localId) => {
    if (!empresaId || !localId) return;
    try {
      const { data, error } = await supabase
        .from('movimentacoes')
        .select('data_movimentacao')
        .eq('empresa_id', empresaId)
        .eq('local_origem_id', localId)
        .eq('tipo', 'conferencia')
        .order('data_movimentacao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setLastChecklistDate(data ? data.data_movimentacao : null);
    } catch (err) {
      console.error('Erro ao buscar última conferência:', err);
    }
  }, [empresaId]);

  const fetchMarketProducts = useCallback(async (localId) => {
    if (!empresaId || !localId) return;
    try {
      const { data, error } = await supabase
        .from('estoque_por_local')
        .select('produto_id, produto_nome, quantidade_atual, numero_lote, lote_id, tipo_lote')
        .eq('empresa_id', empresaId)
        .eq('local_id', localId)
        .gt('quantidade_atual', 0);

      if (error) throw error;
      setMarketProducts(data || []);
    } catch (err) {
      console.error('Erro ao buscar estoque do mercado:', err);
    }
  }, [empresaId]);

  const addProductToChecklist = useCallback((productData, currentBalance) => {
    if (currentBalance < 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    
    // Check for duplicates
    const exists = checkedProducts.find(p => p.lote_id === productData.lote_id);
    if (exists) {
      toast({ title: 'Produto já adicionado', description: 'Edite a quantidade na lista abaixo.', variant: 'destructive' });
      return;
    }

    const diff = productData.quantidade_atual - currentBalance;
    const turnover = productData.quantidade_atual > 0 
      ? ((diff / productData.quantidade_atual) * 100).toFixed(1) 
      : 0;

    const newProduct = {
      ...productData,
      prevBalance: productData.quantidade_atual,
      currentBalance: parseInt(currentBalance, 10),
      diff,
      turnover
    };

    setCheckedProducts(prev => [...prev, newProduct]);
    toast({ title: 'Produto adicionado com sucesso', className: 'bg-green-600 text-white' });
  }, [checkedProducts, toast]);

  const updateProductQuantity = useCallback((loteId, newBalance) => {
    setCheckedProducts(prev => prev.map(p => {
      if (p.lote_id === loteId) {
        const diff = p.prevBalance - parseInt(newBalance, 10);
        const turnover = p.prevBalance > 0 ? ((diff / p.prevBalance) * 100).toFixed(1) : 0;
        return { ...p, currentBalance: parseInt(newBalance, 10), diff, turnover };
      }
      return p;
    }));
  }, []);

  const removeProduct = useCallback((loteId) => {
    setCheckedProducts(prev => prev.filter(p => p.lote_id !== loteId));
  }, []);

  const clearChecklist = useCallback(() => {
    setCheckedProducts([]);
  }, []);

  const generateReport = useCallback(() => {
    toast({ title: '🚧 Funcionalidade em desenvolvimento', description: 'A geração de relatórios será disponibilizada em breve! 🚀' });
  }, [toast]);

  return {
    checkedProducts,
    marketProducts,
    lastChecklistDate,
    fetchLastChecklist,
    fetchMarketProducts,
    addProductToChecklist,
    updateProductQuantity,
    removeProduct,
    clearChecklist,
    generateReport
  };
}