import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateDescontoProduct } from '@/utils/getOrCreateDescontoProduct';

export function useVendaAplicativo() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [cart, setCart] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProdutosClassicos = useCallback(async (empresaId) => {
    if (!empresaId) return { products: [] };

    try {
      const { data: produtos, error: produtosError } = await supabase
        .from('produtos')
        .select('id, nome, preco_venda, tem_bandeja, unidades_por_bandeja, barcode')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (produtosError) throw produtosError;

      const produtosComLotes = await Promise.all(
        (produtos || []).map(async (produto) => {
          // CORRECAO: a view estoque_por_local nao expoe ativo/lote_devolvido,
          // entao lotes inativos apareciam mesmo com filtro no front.
          // Solucao: busca lote_ids com estoque, depois filtra na tabela lotes
          // com ativo=true e lote_devolvido=false diretamente no banco.

          const { data: estoqueRows, error: estoqueError } = await supabase
            .from('estoque_por_local')
            .select('lote_id, local_id, local_nome, quantidade_atual')
            .eq('empresa_id', empresaId)
            .eq('produto_id', produto.id)
            .eq('local_nome', 'ESTOQUE CLÁSSICOS')
            .gt('quantidade_atual', 0);

          if (estoqueError) console.error('Error fetching estoque:', estoqueError);

          const loteIds = (estoqueRows || []).map(r => r.lote_id).filter(Boolean);

          let lotesAtivos = [];
          if (loteIds.length > 0) {
            const { data: lotesData, error: lotesError } = await supabase
              .from('lotes')
              .select('id, numero_lote, tipo_lote, unidades_por_bandeja, ativo, lote_devolvido')
              .in('id', loteIds)
              .eq('ativo', true)
              .eq('lote_devolvido', false);

            if (lotesError) console.error('Error fetching lotes:', lotesError);
            lotesAtivos = lotesData || [];
          }

          const precoFinal = Number(produto.preco_venda || 0);

          const lotesFinais = lotesAtivos.map(l => {
            const estoqueInfo = (estoqueRows || []).find(e => e.lote_id === l.id);
            return {
              lote_id: l.id,
              numero_lote: l.numero_lote,
              local_id: estoqueInfo?.local_id,
              local_nome: estoqueInfo?.local_nome,
              quantidade_disponivel: estoqueInfo?.quantidade_atual || 0,
              quantidade_atual: estoqueInfo?.quantidade_atual || 0,
              tipo_lote: 'base',
              preco_venda: precoFinal,
              preco_unitario: precoFinal,
              unidades_por_bandeja: 1,
              ativo: l.ativo,
              lote_devolvido: l.lote_devolvido,
            };
          });

          return {
            ...produto,
            tem_bandeja: false,
            unidades_por_bandeja: 1,
            preco: precoFinal,
            preco_venda: precoFinal,
            preco_unitario: precoFinal,
            valor_unitario: precoFinal,
            lotes: lotesFinais,
          };
        })
      );

      return { products: produtosComLotes.filter(p => p.lotes.length > 0) };
    } catch (error) {
      console.error('[useVendaAplicativo] Erro no fetch:', error);
      return { products: [] };
    }
  }, []);

  const fetchProdutosComerciais = useCallback(async (empresaId) => {
    if (!empresaId) return [];
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (error) throw error;
      return data || [];
    } catch (error) {
      return [];
    }
  }, []);

  const addToCart = useCallback((produto, lote, quantidade) => {
    if (!produto || !lote || quantidade <= 0) return;
    const precoFinal = Number(produto.preco_venda || produto.preco || 0);
    const newItem = {
      id: lote.lote_id + '-' + Date.now(),
      produto_id: produto.id,
      produto_nome: produto.nome,
      lote_id: lote.lote_id,
      numero_lote: lote.numero_lote,
      local_id: lote.local_id,
      local_nome: lote.local_nome,
      tipo_lote: 'base',
      quantidade: quantidade,
      max_quantidade: lote.quantidade_disponivel,
      preco: precoFinal,
    };
    setCart(prev => [...prev, newItem]);
  }, []);

  const updateQuantity = useCallback((itemId, novaQuantidade) => {
    setCart(prev => prev.map(item => item.id === itemId
      ? { ...item, quantidade: Math.min(Math.max(1, novaQuantidade), item.max_quantidade) }
      : item
    ));
  }, []);

  const removeFromCart = useCallback((itemId) => setCart(prev => prev.filter(item => item.id !== itemId)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const saveSale = useCallback(async (empresaId, canalVenda, formaPagamento, totalFinal, additionalData = {}) => {
    if (!empresaId || !user || cart.length === 0) {
      return { success: false, error: 'Dados invalidos' };
    }
    setIsSubmitting(true);
    try {
      const descontoTotalInformado = Math.trunc(Math.abs(Number(additionalData.descontoValor || 0)) * 100) / 100;
      const totalFinalTruncado = Math.trunc(Number(totalFinal) * 100) / 100;

      const normalItems = cart.map((item) => {
        const subtotalItem = item.preco * item.quantidade;
        const totalFinalItem = Math.trunc(subtotalItem * 100) / 100;
        return {
          tipo: 'venda',
          empresa_id: empresaId,
          produto_id: item.produto_id,
          lote_id: item.lote_id,
          local_origem_id: item.local_id,
          quantidade: item.quantidade,
          valor_unitario: item.preco,
          subtotal: subtotalItem,
          desconto_tipo: null,
          desconto_valor: 0,
          total_final: totalFinalItem,
          canal_venda: 'APP',
          cliente_referencia: canalVenda,
          tipo_item: 'NORMAL',
          status: 'FINALIZADO',
          financeiro_baixado: false,
          forma_pagamento: formaPagamento,
          numero_pedido_app: additionalData.numero_pedido_app || null,
          data_movimentacao: new Date().toISOString(),
        };
      });

      const allItems = [...normalItems];

      if (descontoTotalInformado > 0) {
        const produtoDescontoId = await getOrCreateDescontoProduct(empresaId);
        allItems.push({
          tipo: 'venda',
          empresa_id: empresaId,
          produto_id: produtoDescontoId,
          lote_id: null,
          local_origem_id: null,
          quantidade: 1,
          valor_unitario: 0,
          subtotal: 0,
          desconto_tipo: null,
          desconto_valor: descontoTotalInformado,
          total_final: -descontoTotalInformado,
          canal_venda: 'APP',
          cliente_referencia: canalVenda,
          tipo_item: null,
          status: 'FINALIZADO',
          financeiro_baixado: false,
          forma_pagamento: formaPagamento,
          numero_pedido_app: additionalData.numero_pedido_app || null,
          observacao: 'Desconto da venda',
          data_movimentacao: new Date().toISOString(),
        });
      }

      const { data: venda, error: vendaError } = await supabase
        .from('vendas')
        .insert([{
          empresa_id: empresaId,
          canal_venda: 'APP',
          cliente_referencia: canalVenda,
          forma_pagamento: formaPagamento,
          total_final: totalFinalTruncado,
          status: 'PENDENTE',
          financeiro_baixado: false,
          numero_pedido_app: additionalData.numero_pedido_app || null,
          data_venda: new Date().toISOString(),
        }])
        .select().single();
      if (vendaError) throw vendaError;

      const { error: movError } = await supabase
        .from('movimentacoes')
        .insert(allItems.map(item => ({ ...item, venda_id: venda.id })));
      if (movError) throw movError;

      await Promise.all(cart.map(async (item) => {
        const { data: currentLote } = await supabase
          .from('lotes')
          .select('quantidade')
          .eq('id', item.lote_id)
          .single();
        if (currentLote) {
          await supabase
            .from('lotes')
            .update({ quantidade: currentLote.quantidade - item.quantidade })
            .eq('id', item.lote_id);
        }
      }));

      return { success: true, venda };
    } catch (error) {
      console.error('[useVendaAplicativo] Error:', error);
      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  }, [cart, user]);

  return { cart, isSubmitting, fetchProdutosClassicos, fetchProdutosComerciais, addToCart, updateQuantity, removeFromCart, clearCart, saveSale };
}