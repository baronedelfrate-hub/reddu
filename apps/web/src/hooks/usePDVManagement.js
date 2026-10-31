import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { generateClientReference } from '@/utils/generateClientReference';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';

export function usePDVManagement() {
  const [discount, setDiscountState] = useState({ tipo: 'R$', valor: 0 });

  const setDiscount = useCallback((tipo, valor) => {
    setDiscountState({ tipo, valor: Number(valor) || 0 });
  }, []);

  const validateDiscount = useCallback((subtotal) => {
    if (discount.valor <= 0 || discount.valor === '') {
      return { isValid: true, error: null };
    }

    if (discount.tipo === '%') {
      if (discount.valor > 100) {
        return { isValid: false, error: 'Desconto percentual não pode exceder 100%' };
      }
    } else {
      if (discount.valor > subtotal) {
        return { isValid: false, error: 'Desconto não pode ser maior que o subtotal' };
      }
    }

    return { isValid: true, error: null };
  }, [discount]);

  const calculateDiscountTotals = useCallback((cart) => {
    // CRITICAL: Only sum NORMAL items for subtotal
    const subtotal = cart
      .filter(item => item.tipo_item === 'NORMAL')
      .reduce((acc, item) => {
        // Use full precision preco
        const itemPrice = Number(item.preco) || 0;
        const itemQty = Number(item.quantidade) || 0;
        return acc + (itemPrice * itemQty);
      }, 0);

    let desconto_valor = 0;
    if (discount.tipo === '%') {
      desconto_valor = (subtotal * Number(discount.valor)) / 100;
    } else {
      desconto_valor = Number(discount.valor) || 0;
    }

    const total_final = Math.max(0, subtotal - desconto_valor);

    return { subtotal, desconto_valor, total_final };
  }, [discount]);

  const fetchProdutosComEstoque = useCallback(async (empresaId, mercadoId) => {
    if (!empresaId || !mercadoId) return [];

    try {
      const { data, error } = await supabase
        .from('lotes')
        .select(`
          id,
          numero_lote,
          data_validade,
          quantidade,
          tipo_lote,
          unidades_por_bandeja,
          ativo,
          lote_devolvido,
          liberado_pdv,
          produtos (
            id,
            nome,
            preco_unitario,
            preco_bandeja
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('local_id', mercadoId)
        .eq('ativo', true)
        .eq('lote_devolvido', false)
        .eq('liberado_pdv', true)
        .gt('quantidade', 0);

      if (error) throw error;

      const produtosMap = new Map();

      (data || []).forEach(lote => {
        const produto = lote.produtos;
        if (!produto) return;

        const prodId = produto.id;

        if (!produtosMap.has(prodId)) {
          produtosMap.set(prodId, {
            id: produto.id,
            nome: produto.nome,
            // CRITICAL: Store full precision
            preco_unitario: Number(produto.preco_unitario),
            preco_bandeja: Number(produto.preco_bandeja),
            lotes_bandeja: [],
            lotes_base: [],
            total_bandejas: 0,
            total_unidades: 0
          });
        }

        const prodData = produtosMap.get(prodId);

        const loteData = {
          id: lote.id,
          numero_lote: lote.numero_lote,
          data_validade: lote.data_validade,
          quantidade: lote.quantidade,
          tipo_lote: lote.tipo_lote,
          unidades_por_bandeja: lote.unidades_por_bandeja
        };

        if (lote.tipo_lote === 'bandeja') {
          prodData.lotes_bandeja.push(loteData);
          prodData.total_bandejas += lote.quantidade;
        } else {
          prodData.lotes_base.push(loteData);
          prodData.total_unidades += lote.quantidade;
        }
      });

      return Array.from(produtosMap.values());
    } catch (error) {
      console.error('[usePDVManagement] fetchProdutosComEstoque error:', error);
      throw error;
    }
  }, []);

  const finalizarVenda = useCallback(async (empresaId, mercadoId, cart, discountParams, caixaId, formaPagamento, valorRecebido, troco) => {
    if (!empresaId || !mercadoId) {
      throw new Error("Empresa ou mercado não informado.");
    }

    if (cart.length === 0) {
      throw new Error("Carrinho vazio.");
    }

    const validatedFormaPagamento = validateAndFixPaymentData(formaPagamento);
    if (!validatedFormaPagamento) {
      throw new Error("Forma de pagamento inválida.");
    }

    try {
      const clienteRef = generateClientReference('BALCAO');
      const vendaId = crypto.randomUUID();

      const { error: vendaError } = await supabase.from('vendas').insert({
        id: vendaId,
        empresa_id: empresaId,
        canal_venda: 'balcao',
        cliente_referencia: clienteRef,
        data_venda: new Date().toISOString(),
        total_final: discountParams.total_final,
        forma_pagamento: validatedFormaPagamento,
        status: 'confirmado',
        financeiro_baixado: true,
        data_baixa: new Date().toISOString()
      });

      if (vendaError) throw vendaError;

      // CRITICAL FIX: Calculate individual item subtotals and distribute discount proportionally
      let remainingDiscount = discountParams.desconto_valor || 0;
      const totalSubtotal = discountParams.subtotal;

      const movimentacoes = cart.map((item, index) => {
        // CRITICAL: Preserve full precision
        const valor_unitario_precision = item.tipo_item === 'NORMAL'
          ? (item.tipo === 'unitario' ? Number(item.original_preco || item.preco) : Number(item.preco))
          : 0;

        // Calculate individual item subtotal with full precision
        const subtotalItem = item.quantidade * valor_unitario_precision;

        // Distribute discount proportionally across items
        let itemDesconto = 0;
        if (remainingDiscount > 0 && totalSubtotal > 0) {
          if (index === cart.length - 1) {
            // Last item gets remaining discount to avoid rounding issues
            itemDesconto = remainingDiscount;
          } else {
            itemDesconto = (subtotalItem / totalSubtotal) * discountParams.desconto_valor;
            remainingDiscount -= itemDesconto;
          }
        }

        // Calculate individual item total_final
        const itemTotalFinal = subtotalItem - itemDesconto;

        return {
          empresa_id: empresaId,
          tipo: 'venda',
          produto_id: item.produto_id,
          lote_id: item.lote_id,
          local_origem_id: mercadoId,
          quantidade: item.quantidade,
          data_movimentacao: new Date().toISOString(),
          venda_id: vendaId,
          canal_venda: 'balcao',
          cliente_referencia: clienteRef,
          tipo_item: item.tipo_item,
          valor_unitario: valor_unitario_precision, // Full precision
          caixa_id: caixaId,
          desconto_tipo: discountParams.desconto_tipo,
          desconto_valor: itemDesconto, // Individual item discount
          desconto: itemDesconto, // Individual item discount
          subtotal: subtotalItem, // Individual item subtotal
          total_final: itemTotalFinal, // Individual item total_final
          forma_pagamento: validatedFormaPagamento,
          valor_recebido: valorRecebido,
          troco: troco
        };
      });

      const { error: movError } = await supabase.from('movimentacoes').insert(movimentacoes);
      if (movError) throw movError;

      for (const item of cart) {
        const { error: loteError } = await supabase.rpc('rpc_venda_mercado', {
          p_empresa_id: empresaId,
          p_lote_id: item.lote_id,
          p_quantidade: item.quantidade
        });
        if (loteError) throw loteError;
      }

      return { success: true, count: cart.length, venda_id: vendaId, cliente_referencia: clienteRef };
    } catch (error) {
      console.error('[usePDVManagement] finalizarVenda error:', error);
      throw error;
    }
  }, []);

  const calculateCartTotals = useCallback((cart) => {
    const totalItens = cart.length;
    const totalBandejas = cart.filter(item => item.tipo === 'bandeja').reduce((sum, item) => sum + item.quantidade, 0);
    const totalUnitarios = cart.filter(item => item.tipo === 'unitario').reduce((sum, item) => sum + item.quantidade, 0);
    
    return { totalItens, totalBandejas, totalUnitarios };
  }, []);

  const calculateItemTotal = useCallback((quantidade, preco, tipo_item) => {
    if (tipo_item !== 'NORMAL') return 0;
    // CRITICAL: Use full precision
    return Number(quantidade) * Number(preco);
  }, []);

  return {
    discount,
    setDiscount,
    validateDiscount,
    calculateDiscountTotals,
    fetchProdutosComEstoque,
    finalizarVenda,
    calculateCartTotals,
    calculateItemTotal
  };
}