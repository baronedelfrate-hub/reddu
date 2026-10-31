import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { pagamentoCardapioService } from '@/services/pagamentoCardapioService';

// Nome da categoria "oculta" usada só pra guardar os itens de cardápio criados
// automaticamente a partir do estoque (produtos). Fica com ativo=false pra
// nunca aparecer no cardápio público (CardapioPublicoPage só lista categorias
// com ativo=true), mas os itens dentro dela continuam ativo=true, que é
// exigido pela rpc_criar_pedido_cardapio pra aceitar o pedido.
const CATEGORIA_INTERNA_NOME = 'Balcão (uso interno)';

// Hook do "PDV Pedidos Balcão": NÃO toca em nada do PDV Rápido (usePDVRapido,
// vendas, rpc_venda_mercado). Ele lê o mesmo estoque (produtos/lotes) pra
// montar o catálogo, mas grava o pedido através do mesmo caminho que o
// cardápio digital público já usa (rpc_criar_pedido_cardapio), pra cair
// direto na fila de preparo (PedidosCardapioPage) sem nenhum código novo lá.
export function usePDVPedidosBalcao() {
  const [cart, setCart] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchProdutosBalcao = useCallback(async (empresaId, localId) => {
    if (!empresaId || !localId) return [];
    try {
      const { data: lotes, error } = await supabase
        .from('lotes')
        .select(`
          id,
          quantidade,
          produto_id,
          local_id,
          ativo,
          lote_devolvido,
          liberado_pdv,
          produtos (
            id,
            nome,
            preco_unitario,
            imagem_url,
            estoque_minimo
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('local_id', localId);

      if (error) throw error;

      const liberados = (lotes || []).filter(
        (lote) => lote.ativo === true && lote.lote_devolvido !== true && lote.liberado_pdv === true && lote.quantidade > 0
      );

      const produtosMap = new Map();
      liberados.forEach((lote) => {
        const produto = lote.produtos;
        if (!produto) return;
        if (!produtosMap.has(produto.id)) {
          produtosMap.set(produto.id, {
            id: produto.id,
            nome: produto.nome,
            preco: parseFloat(Number(produto.preco_unitario || 0).toFixed(2)),
            imagem_url: produto.imagem_url || null,
            estoque_minimo: produto.estoque_minimo || 0,
            total_estoque: 0,
          });
        }
        produtosMap.get(produto.id).total_estoque += lote.quantidade;
      });

      return Array.from(produtosMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    } catch (error) {
      console.error('[usePDVPedidosBalcao] fetchProdutosBalcao error:', error);
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
      return [];
    }
  }, [toast]);

  const addToCart = useCallback((produto) => {
    if (!produto || produto.total_estoque <= 0) return;
    setCart((prev) => {
      const existente = prev.find((i) => i.produto_id === produto.id);
      if (existente) {
        if (existente.quantidade >= produto.total_estoque) {
          toast({ title: 'Estoque insuficiente', description: `Máximo disponível: ${produto.total_estoque}`, variant: 'destructive' });
          return prev;
        }
        return prev.map((i) => (i.produto_id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [
        ...prev,
        {
          id: `${produto.id}-${Date.now()}`,
          produto_id: produto.id,
          nome: produto.nome,
          preco: produto.preco,
          quantidade: 1,
          max_quantidade: produto.total_estoque,
        },
      ];
    });
  }, [toast]);

  const updateQuantity = useCallback((itemId, novaQuantidade) => {
    setCart((prev) => {
      if (novaQuantidade <= 0) return prev.filter((i) => i.id !== itemId);
      return prev.map((i) => (i.id === itemId ? { ...i, quantidade: Math.round(novaQuantidade) } : i));
    });
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // Garante (cria se preciso) a categoria interna oculta pra essa empresa.
  const obterCategoriaInterna = useCallback(async (empresaId) => {
    const { data: existente, error: buscaError } = await supabase
      .from('cardapio_categorias')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('nome', CATEGORIA_INTERNA_NOME)
      .maybeSingle();
    if (buscaError) throw buscaError;
    if (existente) return existente.id;

    const { data: nova, error: criarError } = await supabase
      .from('cardapio_categorias')
      .insert({ empresa_id: empresaId, nome: CATEGORIA_INTERNA_NOME, ativo: false, ordem: 999 })
      .select('id')
      .single();
    if (criarError) throw criarError;
    return nova.id;
  }, []);

  // Pra cada item do carrinho, acha o cardapio_itens já vinculado a esse
  // produto+local; se não existir, cria um automaticamente (copiando nome e
  // preço do produto) dentro da categoria interna oculta. Assim o pedido pode
  // ser criado pela mesma rpc_criar_pedido_cardapio que o cardápio público usa.
  const resolverCardapioItens = useCallback(async (empresaId, localId, itensCarrinho) => {
    const produtoIds = itensCarrinho.map((i) => i.produto_id);

    const { data: existentes, error: buscaError } = await supabase
      .from('cardapio_itens')
      .select('id, produto_id')
      .eq('empresa_id', empresaId)
      .eq('local_id', localId)
      .in('produto_id', produtoIds);
    if (buscaError) throw buscaError;

    const mapa = new Map((existentes || []).map((c) => [c.produto_id, c.id]));
    const faltantes = itensCarrinho.filter((i) => !mapa.has(i.produto_id));

    if (faltantes.length > 0) {
      const categoriaId = await obterCategoriaInterna(empresaId);
      const novosRegistros = faltantes.map((i) => ({
        empresa_id: empresaId,
        categoria_id: categoriaId,
        produto_id: i.produto_id,
        local_id: localId,
        nome: i.nome,
        preco: i.preco,
        ativo: true,
      }));
      const { data: criados, error: criarError } = await supabase
        .from('cardapio_itens')
        .insert(novosRegistros)
        .select('id, produto_id');
      if (criarError) throw criarError;
      (criados || []).forEach((c) => mapa.set(c.produto_id, c.id));
    }

    return mapa;
  }, [obterCategoriaInterna]);

  // Cria o pedido chamando a MESMA rpc que o cardápio público usa — não há
  // nenhuma lógica financeira nova aqui, só a montagem do payload.
  const criarPedidoBalcao = useCallback(async ({ empresaId, localId, cliente, tipoEntrega, endereco, observacao, taxaEntrega, dataAgendamento, pagamento }) => {
    if (cart.length === 0) throw new Error('Carrinho vazio.');
    if (!cliente?.nome?.trim() || !cliente?.telefone?.trim()) throw new Error('Informe nome e telefone do cliente.');
    if (tipoEntrega === 'entrega' && !endereco?.trim()) throw new Error('Informe o endereço de entrega.');
    if (!localId) throw new Error('Selecione o local do pedido.');

    setIsSubmitting(true);
    try {
      const mapaCardapioItens = await resolverCardapioItens(empresaId, localId, cart);

      const p_itens = cart.map((i) => ({
        cardapio_item_id: mapaCardapioItens.get(i.produto_id),
        quantidade: i.quantidade,
      }));

      const { data, error } = await supabase.rpc('rpc_criar_pedido_cardapio', {
        p_empresa_id: empresaId,
        p_cliente_nome: cliente.nome.trim(),
        p_cliente_telefone: cliente.telefone.trim(),
        p_tipo_entrega: tipoEntrega,
        p_endereco_entrega: tipoEntrega === 'entrega' ? endereco.trim() : null,
        p_observacao: observacao?.trim() || null,
        p_itens,
        p_data_agendamento: dataAgendamento || null,
        p_cupom_codigo: null,
        p_taxa_entrega: tipoEntrega === 'entrega' ? Number(taxaEntrega || 0) : 0,
      });

      if (error) throw error;

      // Confirmação por WhatsApp: dispara e esquece, igual ao cardápio público.
      supabase.functions
        .invoke('enviar-confirmacao-pedido', { body: { pedido_id: data.id } })
        .catch((e) => console.error('[usePDVPedidosBalcao] Erro ao notificar pedido por WhatsApp:', e));

      // Registra a forma de pagamento na venda que a RPC já criou (só
      // metadado, nenhum total é recalculado aqui). Se algo falhar nessa
      // parte, o pedido já foi criado e cai na fila mesmo assim — só o
      // registro do pagamento pode ser corrigido depois no próprio quadro
      // de pedidos.
      let vendaId = null;
      let formaPagamentoFinal = null;
      try {
        vendaId = await pagamentoCardapioService.buscarVendaDoPedido(data.id);
        if (vendaId && pagamento) {
          const resultado = pagamento.momento === 'agora'
            ? await pagamentoCardapioService.registrarPagamento(vendaId, {
                payments: pagamento.payments,
                cpfCliente: pagamento.cpfCliente,
                financeiroBaixado: true,
              })
            : await pagamentoCardapioService.registrarPagamentoPrevisto(vendaId, {
                metodoEsperado: pagamento.formaPagamentoEsperada,
                cpfCliente: pagamento.cpfCliente,
              });
          formaPagamentoFinal = resultado.forma_pagamento;
        }
      } catch (pagamentoError) {
        console.error('[usePDVPedidosBalcao] Erro ao registrar pagamento na venda:', pagamentoError);
      }

      clearCart();
      return { success: true, id: data.id, numero_pedido: data.numero_pedido, venda_id: vendaId, forma_pagamento: formaPagamentoFinal };
    } finally {
      setIsSubmitting(false);
    }
  }, [cart, resolverCardapioItens, clearCart]);

  return {
    cart,
    isSubmitting,
    fetchProdutosBalcao,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    criarPedidoBalcao,
  };
}