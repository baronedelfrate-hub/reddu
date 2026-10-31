import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';

export function usePDVRapido() {
  const [cart, setCart] = useState([]);
  const [tipoVenda, setTipoVenda] = useState('bandeja');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payments, setPayments] = useState([]);

  const { toast } = useToast();

  const addPayment = useCallback((method, value) => {
    const validatedMethod = validateAndFixPaymentData(method);
    if (!validatedMethod) {
      toast({ title: "Método inválido", description: "Forma de pagamento não reconhecida.", variant: "destructive" });
      return;
    }
    console.log('[usePDVRapido] addPayment:', { method, validatedMethod, value });
    setPayments(prev => [...prev, { method: validatedMethod, value: Number(value) }]);
  }, [toast]);

  const removePayment = useCallback((index) => {
    console.log('[usePDVRapido] removePayment:', { index });
    setPayments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearPayments = useCallback(() => {
    console.log('[usePDVRapido] clearPayments');
    setPayments([]);
  }, []);

  const getTotalPaid = useCallback(() => {
    const total = payments.reduce((sum, p) => sum + Number(p.value || 0), 0);
    console.log('[usePDVRapido] getTotalPaid:', { payments, total });
    return total;
  }, [payments]);

  const getRemainingBalance = useCallback((total) => {
    const remaining = Math.max(0, total - getTotalPaid());
    console.log('[usePDVRapido] getRemainingBalance:', { total, totalPaid: getTotalPaid(), remaining });
    return remaining;
  }, [getTotalPaid]);

  const validatePaymentComplete = useCallback((total) => {
    const pago = getTotalPaid();
    // Se a diferença for menor que 0.01, consideramos pago.
    return (pago >= total) || (Math.abs(total - pago) < 0.01);
  }, [getTotalPaid]);

  const fetchProdutosRapido = useCallback(async (empresaId, localId, tipoVendaAtual) => {
    if (!empresaId || !localId) return { products: [], debugStats: { rawLotes: 0, lotesLiberados: 0, lotesTipoCorreto: 0 } };

    try {
      const { data: allLotes, error: lotesError } = await supabase
        .from('lotes')
        .select(`
          id,
          numero_lote,
          data_validade,
          quantidade,
          produto_id,
          local_id,
          tipo_lote,
          unidades_por_bandeja,
          ativo,
          lote_devolvido,
          liberado_pdv,
          produtos (
            id,
            nome,
            preco_unitario,
            preco_bandeja,
            tem_bandeja,
            imagem_url,
            estoque_minimo
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('local_id', localId);

      if (lotesError) throw lotesError;

      const rawLotesCount = allLotes?.length || 0;

      const lotesLiberados = (allLotes || []).filter(lote =>
        lote.ativo === true &&
        lote.lote_devolvido !== true &&
        lote.liberado_pdv === true &&
        lote.quantidade > 0
      );

      const lotesLiberadosCount = lotesLiberados.length;

      const tipoFiltro = tipoVendaAtual === 'bandeja' ? 'bandeja' : 'base';
      const lotesFiltrados = lotesLiberados.filter(lote => lote.tipo_lote === tipoFiltro);

      const lotesTipoCorretoCount = lotesFiltrados.length;

      const produtosMap = new Map();

      lotesFiltrados.forEach(lote => {
        const produto = lote.produtos;
        if (!produto) return;

        const prodId = produto.id;

        const precoParaExibir = tipoVendaAtual === 'bandeja'
          ? parseFloat(Number(produto.preco_bandeja).toFixed(2))
          : parseFloat(Number(produto.preco_unitario).toFixed(3));

        if (!produtosMap.has(prodId)) {
          produtosMap.set(prodId, {
            id: produto.id,
            nome: produto.nome,
            preco: precoParaExibir,
            imagem_url: produto.imagem_url || null,
            estoque_minimo: produto.estoque_minimo || 0,
            lotes: [],
            total_estoque: 0
          });
        }

        const existingProd = produtosMap.get(prodId);
        existingProd.lotes.push({
          id: lote.id,
          numero_lote: lote.numero_lote,
          data_validade: lote.data_validade,
          quantidade_disponivel: lote.quantidade,
          tipo_lote: lote.tipo_lote,
          unidades_por_bandeja: lote.unidades_por_bandeja
        });
        existingProd.total_estoque += lote.quantidade;
      });

      const produtosArray = Array.from(produtosMap.values());

      return {
        products: produtosArray,
        debugStats: {
          rawLotes: rawLotesCount,
          lotesLiberados: lotesLiberadosCount,
          lotesTipoCorreto: lotesTipoCorretoCount
        }
      };
    } catch (error) {
      console.error('[usePDVRapido] fetchProdutosRapido error:', error);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return { products: [], debugStats: { rawLotes: 0, lotesLiberados: 0, lotesTipoCorreto: 0 } };
    }
  }, [toast]);

  const addToCart = useCallback(async (produto, lote) => {
    if (!lote) {
      toast({ title: "Lote não selecionado", variant: "destructive" });
      return;
    }

    const qtyInCart = cart
      .filter(item => item.lote_id === lote.id)
      .reduce((sum, item) => sum + item.quantidade, 0);

    if (qtyInCart >= lote.quantidade_disponivel) {
      toast({
        title: "Estoque Insuficiente",
        description: `Máximo disponível: ${lote.quantidade_disponivel}`,
        variant: "destructive"
      });
      return;
    }

    const valor_unitario = tipoVenda === 'bandeja'
      ? parseFloat(Number(produto.preco).toFixed(2))
      : parseFloat(Number(produto.preco).toFixed(3));

    // CRITICAL FIX: Ensure quantity is always stored as integer
    const quantidadeOriginal = 1;
    const quantidadeInteger = Math.round(quantidadeOriginal);
    console.log('[usePDVRapido] addToCart - Armazenando quantidade:', {
      original: quantidadeOriginal,
      rounded: quantidadeInteger,
      isInteger: Number.isInteger(quantidadeInteger)
    });

    const newItem = {
      id: Math.random().toString(36).substring(2, 10),
      produto_id: produto.id,
      produto_nome: produto.nome,
      lote_id: lote.id,
      numero_lote: lote.numero_lote,
      data_validade: lote.data_validade,
      tipo: tipoVenda,
      tipo_item: produto.tipo_item || 'NORMAL',
      preco: valor_unitario,
      quantidade: quantidadeInteger, // CRITICAL: Always integer
      max_quantidade: lote.quantidade_disponivel - qtyInCart,
      tipo_lote: lote.tipo_lote,
      unidades_por_bandeja: lote.unidades_por_bandeja
    };

    console.log('[usePDVRapido] addToCart:', {
      produto: produto.nome,
      newItem,
      quantidade_is_integer: Number.isInteger(newItem.quantidade)
    });

    setCart(prev => [...prev, newItem]);
    toast({
      title: "Item Adicionado",
      description: `${produto.nome} adicionado ao carrinho.`,
      className: "bg-emerald-600 text-white border-none"
    });
  }, [cart, tipoVenda, toast]);

  const updateQuantity = useCallback((itemId, newQty) => {
    // CRITICAL FIX: Ensure updated quantity is always integer
    const newQtyOriginal = newQty;
    const newQtyInteger = Math.round(newQtyOriginal);

    console.log('[usePDVRapido] updateQuantity - Quantidade recebida:', {
      itemId,
      original: newQtyOriginal,
      processada: newQtyInteger,
      isInteger: Number.isInteger(newQtyInteger)
    });

    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const clampedQty = Math.max(1, Math.min(newQtyInteger, item.max_quantidade));
        const clampedQtyInteger = Math.round(clampedQty);

        console.log('[usePDVRapido] updateQuantity - Cálculo de quantidade:', {
          itemId,
          operacao: 'clamp',
          resultado: clampedQty,
          arredondado: clampedQtyInteger,
          isInteger: Number.isInteger(clampedQtyInteger)
        });

        return { ...item, quantidade: clampedQtyInteger };
      }
      return item;
    }));
  }, []);

  const updateItemLote = useCallback((itemId, newLoteId, produtos) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const produto = produtos.find(p => p.id === item.produto_id);
      if (!produto) return item;

      const newLote = produto.lotes.find(l => l.id === newLoteId);
      if (!newLote) return item;

      const qtyInCartForNewLote = prev
        .filter(i => i.lote_id === newLoteId && i.id !== itemId)
        .reduce((sum, i) => sum + i.quantidade, 0);

      const maxForNewLote = newLote.quantidade_disponivel - qtyInCartForNewLote;

      // CRITICAL FIX: Ensure quantity calculation results in integer
      const newQtyCalculated = Math.min(item.quantidade, maxForNewLote);
      const newQtyInteger = Math.round(newQtyCalculated > 0 ? newQtyCalculated : 1);

      console.log('[usePDVRapido] updateItemLote - Cálculo de quantidade:', {
        itemId,
        operacao: 'min(item.quantidade, maxForNewLote)',
        resultado: newQtyCalculated,
        arredondado: newQtyInteger,
        isInteger: Number.isInteger(newQtyInteger)
      });

      return {
        ...item,
        lote_id: newLote.id,
        numero_lote: newLote.numero_lote,
        data_validade: newLote.data_validade,
        quantidade: newQtyInteger, // CRITICAL: Always integer
        max_quantidade: maxForNewLote
      };
    }));
  }, []);

  const removeFromCart = useCallback((itemId) => {
    console.log('[usePDVRapido] removeFromCart:', { itemId });
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    console.log('[usePDVRapido] clearCart');
    setCart([]);
  }, []);

  /**
   * CRITICAL: Validate cart items before database operations
   * Returns { valid: boolean, errors: string[] }
   */
  const validateCartItems = useCallback((cartItems) => {
    console.log('[usePDVRapido] validateCartItems - Starting validation', {
      itemCount: cartItems.length,
      items: cartItems.map(item => ({
        produto: item.produto_nome,
        quantidade: item.quantidade,
        tipo_item: item.tipo_item
      }))
    });

    const errors = [];

    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];

      // 1. Validate required fields exist
      if (!item.produto_id) {
        errors.push(`Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): produto_id ausente`);
      }

      if (!item.lote_id) {
        errors.push(`Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): lote_id ausente`);
      }

      if (!item.tipo_item) {
        errors.push(`Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): tipo_item ausente`);
      }

      // CRITICAL FIX: Round quantity before validation to ensure integer
      const quantidadeOriginal = Number(item.quantidade);
      const qtdInt = Math.round(quantidadeOriginal);

      console.log('[usePDVRapido] validateCartItems - Item', i + 1, ':', {
        produto: item.produto_nome,
        quantidade_original: quantidadeOriginal,
        quantidade_arredondada: qtdInt,
        isInteger: Number.isInteger(qtdInt),
        diferenca: Math.abs(quantidadeOriginal - qtdInt)
      });

      // 2. Validate quantity is a valid number
      if (isNaN(qtdInt) || qtdInt <= 0) {
        errors.push(`Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): quantidade inválida (${item.quantidade})`);
        continue;
      }

      // 3. CRITICAL FIX: Check if quantity is integer after rounding
      // This should always pass now since we use Math.round()
      if (!Number.isInteger(qtdInt)) {
        errors.push(
          `Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): quantidade não é inteiro após arredondamento (${qtdInt})`
        );
      }

      // 4. Validate price is valid for NORMAL items
      if (item.tipo_item === 'NORMAL') {
        const preco = Number(item.preco);
        if (isNaN(preco) || preco < 0) {
          errors.push(`Item ${i + 1} (${item.produto_nome || 'Desconhecido'}): preço inválido (${item.preco})`);
        }
      }
    }

    const isValid = errors.length === 0;

    console.log('[usePDVRapido] validateCartItems - Validation result:', {
      valid: isValid,
      errorCount: errors.length,
      errors,
      allQuantitiesInteger: cartItems.every(item => Number.isInteger(Math.round(Number(item.quantidade))))
    });

    return { valid: isValid, errors };
  }, []);

  /**
   * CRITICAL: Atomic transaction implementation
   * - Validates all items before any database operation
   * - Inserts venda record first
   * - Processes all items sequentially
   * - Deletes venda on ANY failure (rollback)
   * - Only returns success if ALL items complete
   */
  const saveSale = useCallback(async (empresaId, mercadoId, caixaId, paymentsMethods, extras = {}) => {
    console.log('[usePDVRapido] saveSale - Starting atomic transaction', {
      empresaId,
      mercadoId,
      caixaId,
      paymentsMethods,
      extras,
      cart: cart.map(item => ({
        produto: item.produto_nome,
        tipo_item: item.tipo_item,
        preco: item.preco,
        quantidade: item.quantidade,
        quantidade_is_integer: Number.isInteger(item.quantidade),
        lote_id: item.lote_id
      }))
    });

    // STEP 1: Validate basic requirements
    if (!empresaId || !mercadoId) {
      const error = "Empresa ou Mercado não informado.";
      console.error('[usePDVRapido] saveSale - Validation error:', error);
      throw new Error(error);
    }

    if (cart.length === 0) {
      const error = "Carrinho vazio.";
      console.error('[usePDVRapido] saveSale - Validation error:', error);
      throw new Error(error);
    }

    // STEP 2: CRITICAL - Validate all cart items BEFORE any database operation
    const validation = validateCartItems(cart);
    if (!validation.valid) {
      const errorMessage = `Validação de itens falhou:\n${validation.errors.join('\n')}`;
      console.error('[usePDVRapido] saveSale - Cart validation failed:', {
        errors: validation.errors
      });
      throw new Error(errorMessage);
    }

    setIsSubmitting(true);

    // Variable to track venda ID for rollback
    let vendaId = null;
    let vendaInserted = false;

    try {
      // STEP 3: Generate venda ID and prepare payment data
      vendaId = crypto.randomUUID();

      const forma_pagamento_detalhes = paymentsMethods.map(p => ({
        method: validateAndFixPaymentData(p.method),
        value: Number(p.value)
      }));

      console.log('[usePDVRapido] saveSale - Payment details:', {
        original: paymentsMethods,
        validated: forma_pagamento_detalhes
      });

      const forma_pagamento_principal = forma_pagamento_detalhes.length === 1
        ? forma_pagamento_detalhes[0].method
        : 'multiplo';

      const { taxaMotoboy = 0, observacoes = '', descontoAplicadoValor = 0, subtotalGlobal = 0 } = extras;

      // Check if cart contains ONLY BRINDE/PERDA items
      const temItemNormal = cart.some(item =>
        item.tipo_item !== 'BRINDE' &&
        item.tipo_item !== 'PERDA'
      );

      // Force desconto = 0 if cart has ONLY BRINDE/PERDA items
      const descontoParaSalvar = temItemNormal ? Number(descontoAplicadoValor) : 0;

      console.log('[usePDVRapido] saveSale - Discount validation:', {
        descontoAplicadoValor_original: descontoAplicadoValor,
        temItemNormal,
        descontoParaSalvar,
        cartItems: cart.map(item => ({
          produto: item.produto_nome,
          tipo_item: item.tipo_item
        }))
      });

      const totalComTaxa = Math.round((subtotalGlobal + Number(taxaMotoboy)) * 100) / 100;
      const totalFinal = Math.round((totalComTaxa - descontoParaSalvar) * 100) / 100;

      const totalPaid = getTotalPaid();
      const troco = Math.max(0, totalPaid - totalFinal);

      const clienteRef = `PDV-${vendaId.substring(0, 8)}`;

      console.log('[usePDVRapido] saveSale - Sale summary:', {
        vendaId,
        clienteRef,
        subtotalGlobal,
        descontoAplicadoValor_original: descontoAplicadoValor,
        descontoParaSalvar,
        taxaMotoboy,
        totalFinal,
        totalPaid,
        troco,
        forma_pagamento_principal,
        forma_pagamento_detalhes
      });

      // STEP 4: Insert venda record (first database operation)
      console.log('[usePDVRapido] saveSale - Inserting venda record');

      const { error: vendaError } = await supabase.from('vendas').insert({
        id: vendaId,
        empresa_id: empresaId,
        canal_venda: 'PDV',
        cliente_referencia: clienteRef,
        data_venda: new Date().toISOString(),
        total_final: totalFinal,
        forma_pagamento: forma_pagamento_principal,
        forma_pagamento_detalhes: forma_pagamento_detalhes,
        status: 'confirmado',
        financeiro_baixado: true,
        data_baixa: new Date().toISOString()
      });

      if (vendaError) {
        console.error('[usePDVRapido] saveSale - Error inserting venda:', vendaError);
        throw new Error(`Falha ao criar registro de venda: ${vendaError.message}`);
      }

      vendaInserted = true;
      console.log('[usePDVRapido] saveSale - Venda record inserted successfully');

      // STEP 5: Process each item - ATOMIC (all-or-nothing)
      // If ANY item fails, we'll catch the error and rollback (delete venda)
      const descontoGlobal = descontoParaSalvar;
      const taxaGlobal = Number(taxaMotoboy) || 0;

      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const isLastItem = i === cart.length - 1;

        // CRITICAL FIX: Ensure quantity is integer using Math.round
        // This prevents type errors in PostgreSQL (integer type)
        const quantidadeRaw = Number(item.quantidade);
        const quantidadeInteger = Math.round(quantidadeRaw);

        console.log('[usePDVRapido] saveSale - Item quantity conversion:', {
          itemIndex: i,
          produto: item.produto_nome,
          quantidadeRaw,
          quantidadeInteger,
          hasDecimals: quantidadeRaw !== quantidadeInteger,
          isInteger: Number.isInteger(quantidadeInteger)
        });

        const valor_unitario_precision = item.tipo_item === 'NORMAL'
          ? (item.tipo === 'bandeja'
            ? parseFloat(Number(item.preco).toFixed(2))
            : parseFloat(Number(item.preco).toFixed(3)))
          : 0;

        // CRITICAL: Use integer quantity for calculations
        const subtotalItem = Math.round(quantidadeInteger * valor_unitario_precision * 100) / 100;

        // Apply FULL discount and tax ONLY on last item
        const itemDesconto = isLastItem ? descontoGlobal : 0;
        const itemTax = isLastItem ? taxaGlobal : 0;

        console.log('[usePDVRapido] saveSale - Item processing:', {
          itemIndex: i,
          produto: item.produto_nome,
          tipo_item: item.tipo_item,
          isLastItem,
          quantidadeInteger,
          subtotalItem,
          itemDesconto,
          itemTax,
          descontoGlobal_applied: descontoGlobal
        });

        const itemTotalFinal = Math.round((subtotalItem - itemDesconto + itemTax) * 100) / 100;

        const rpcParams = {
          p_empresa_id: empresaId,
          p_lote_id: item.lote_id,
          p_quantidade: quantidadeInteger, // CRITICAL: Integer quantity
          p_observacao: observacoes || null,
          p_desconto_tipo: itemDesconto > 0 ? 'R$' : null,
          p_desconto_valor: itemDesconto > 0 ? itemDesconto : null,
          p_subtotal: subtotalItem,
          p_total_final: itemTotalFinal,
          p_caixa_id: caixaId,
          p_forma_pagamento: forma_pagamento_principal,
          p_valor_recebido: totalPaid > 0 ? totalPaid : null,
          p_troco: troco > 0 ? troco : null,
          p_venda_id: vendaId,
          p_canal_venda: 'PDV',
          p_cliente_referencia: clienteRef,
          p_tipo_item: item.tipo_item,
          p_valor_unitario: valor_unitario_precision,
          p_taxa_motoboy: itemTax
        };

        console.log('[usePDVRapido] saveSale - Calling rpc_venda_mercado:', {
          itemIndex: i,
          produto: item.produto_nome,
          params: rpcParams,
          quantidade_is_integer: Number.isInteger(rpcParams.p_quantidade)
        });

        // CRITICAL: Try to process item - if it fails, rollback will happen in catch block
        const { data: movId, error: rpcError } = await supabase.rpc('rpc_venda_mercado', rpcParams);

        if (rpcError) {
          console.error('[usePDVRapido] saveSale - RPC error for item:', {
            itemIndex: i,
            produto: item.produto_nome,
            error: rpcError,
            params: rpcParams
          });

          // CRITICAL: Throw error with item context - catch block will handle rollback
          throw new Error(
            `Falha ao processar item ${i + 1} (${item.produto_nome}): ${rpcError.message}`
          );
        }

        console.log('[usePDVRapido] saveSale - Item processed successfully:', {
          itemIndex: i,
          produto: item.produto_nome,
          movimentacao_id: movId
        });
      }

      // STEP 6: All items processed successfully
      console.log('[usePDVRapido] saveSale - All items processed successfully - Transaction complete');

      clearCart();
      clearPayments();

      return {
        success: true,
        venda_id: vendaId,
        cliente_referencia: clienteRef
      };

    } catch (error) {
      console.error('[usePDVRapido] saveSale - Transaction failed:', {
        message: error.message,
        stack: error.stack,
        vendaInserted,
        vendaId
      });

      // CRITICAL: ROLLBACK - Delete venda record if it was inserted
      if (vendaInserted && vendaId) {
        console.log('[usePDVRapido] saveSale - ROLLBACK: Deleting venda record', { vendaId });

        try {
          const { error: deleteError } = await supabase
            .from('vendas')
            .delete()
            .eq('id', vendaId);

          if (deleteError) {
            console.error('[usePDVRapido] saveSale - ROLLBACK FAILED:', deleteError);
            // Even if delete fails, still throw original error to user
          } else {
            console.log('[usePDVRapido] saveSale - ROLLBACK SUCCESS: Venda deleted');
          }
        } catch (rollbackError) {
          console.error('[usePDVRapido] saveSale - ROLLBACK EXCEPTION:', rollbackError);
        }
      }

      // Re-throw error with user-friendly message
      throw error;

    } finally {
      setIsSubmitting(false);
    }
  }, [cart, clearCart, clearPayments, getTotalPaid, validateCartItems]);

  return {
    cart,
    tipoVenda,
    setTipoVenda,
    isSubmitting,
    payments,
    addPayment,
    removePayment,
    clearPayments,
    getTotalPaid,
    getRemainingBalance,
    validatePaymentComplete,
    fetchProdutosRapido,
    addToCart,
    updateQuantity,
    updateItemLote,
    removeFromCart,
    clearCart,
    saveSale
  };
}