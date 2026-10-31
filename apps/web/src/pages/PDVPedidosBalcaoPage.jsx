import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import GridProdutosBalcao from '@/components/pdv-balcao/GridProdutosBalcao';
import CarrinhoBalcao from '@/components/pdv-balcao/CarrinhoBalcao';
import FormaEntregaModal from '@/components/pdv-balcao/FormaEntregaModal';
import { useAuth } from '@/contexts/AuthContext';
import { usePDVPedidosBalcao } from '@/hooks/usePDVPedidosBalcao';
import { useNFCeEmission } from '@/hooks/useNFCeEmission';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { formatUnit } from '@/utils/currencyFormatter';
import { ShoppingBag, Store, Loader2, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import NFCeStatusBadge from '@/components/fiscal/NFCeStatusBadge';

// Página nova, separada do PDV Rápido: monta um pedido a partir do mesmo
// estoque (produtos/lotes), mas grava através da rpc_criar_pedido_cardapio
// (o mesmo caminho que o cardápio digital público usa), então o pedido cai
// direto na fila de preparo em /dashboard/cardapio/pedidos. Nenhum código do
// PDV Rápido (usePDVRapido, vendas, rpc_venda_mercado) é usado ou alterado
// aqui.
export default function PDVPedidosBalcaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const {
    cart,
    isSubmitting,
    fetchProdutosBalcao,
    addToCart,
    updateQuantity,
    removeFromCart,
    criarPedidoBalcao,
  } = usePDVPedidosBalcao();

  // Emissão de NFC-e — mesmo hook e mesma edge function que o PDV Rápido já
  // usa (useNFCeEmission/fiscalService); aqui só é chamado com os dados desse
  // pedido, nenhuma lógica fiscal nova.
  const { emitirNFCeHook, retry } = useNFCeEmission();
  const [nfceStatusData, setNfceStatusData] = useState(null);

  const [locais, setLocais] = useState([]);
  const [localId, setLocalId] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false);
  const [showEntregaModal, setShowEntregaModal] = useState(false);
  const [lastPedidoSuccess, setLastPedidoSuccess] = useState(null);

  const total = useMemo(
    () => cart.reduce((acc, item) => acc + Number(item.preco) * Number(item.quantidade), 0),
    [cart]
  );

  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from('locais')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('mostrar_no_pdv', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) return;
        setLocais(data || []);
        if ((data || []).length > 0) {
          setLocalId((prev) => (prev && data.some((l) => l.id === prev) ? prev : data[0].id));
        }
      });
  }, [empresaId]);

  useEffect(() => {
    let isMounted = true;
    if (empresaId && localId) {
      setIsLoadingProdutos(true);
      fetchProdutosBalcao(empresaId, localId).then((lista) => {
        if (isMounted) setProdutos(lista);
      }).finally(() => {
        if (isMounted) setIsLoadingProdutos(false);
      });
    }
    return () => { isMounted = false; };
  }, [empresaId, localId, fetchProdutosBalcao]);

  const handleConfirmarPedido = async (dadosEntrega) => {
    // Snapshot do carrinho ANTES de chamar criarPedidoBalcao, porque o hook
    // limpa o carrinho assim que o pedido é criado com sucesso.
    const cartSnapshot = [...cart];
    const totalComTaxa = total + (dadosEntrega.tipoEntrega === 'entrega' ? Number(dadosEntrega.taxaEntrega || 0) : 0);

    try {
      const res = await criarPedidoBalcao({
        empresaId,
        localId,
        ...dadosEntrega,
      });
      if (res?.success) {
        setShowEntregaModal(false);
        setLastPedidoSuccess(res.numero_pedido);
        const agendado = dadosEntrega.dataAgendamento
          ? new Date(dadosEntrega.dataAgendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : null;
        toast({
          title: `Pedido #${res.numero_pedido} enviado!`,
          description: agendado ? `Agendado para ${agendado}.` : 'Já está na fila de preparo do cardápio digital.',
          className: 'bg-emerald-600 text-white border-none',
        });
        setTimeout(() => setLastPedidoSuccess(null), 3500);

        // NFC-e: só dispara se um CPF/CNPJ válido foi informado, exatamente
        // como o PDV Rápido faz — mesmo hook, mesma edge function.
        const cpfCliente = dadosEntrega.pagamento?.cpfCliente || null;
        const docDigits = cpfCliente ? cpfCliente.replace(/\D/g, '').length : 0;
        if (res.venda_id && cpfCliente && (docDigits === 11 || docDigits === 14)) {
          setNfceStatusData({ status_fiscal: 'pendente' });
          const vendaSnapshotData = {
            id: res.venda_id,
            cliente_referencia: dadosEntrega.cliente?.nome || null,
            items: cartSnapshot.map((i) => ({
              produto_id: i.produto_id,
              quantidade: i.quantidade,
              preco: i.preco,
              valor_unitario: i.preco,
              tipo_item: 'NORMAL',
            })),
            total_final: totalComTaxa,
            taxa_motoboy: dadosEntrega.tipoEntrega === 'entrega' ? Number(dadosEntrega.taxaEntrega || 0) : 0,
            desconto: 0,
            forma_pagamento: res.forma_pagamento,
            forma_pagamento_detalhes: dadosEntrega.pagamento?.momento === 'agora' ? dadosEntrega.pagamento.payments : [],
            cpf_cliente: cpfCliente,
          };
          emitirNFCeHook(vendaSnapshotData, empresaId).then((emissaoRes) => {
            if (emissaoRes?.success) {
              setNfceStatusData({ status_fiscal: 'emitido', nfe_chave: emissaoRes.nfe_chave, nfe_id: emissaoRes.nfe_id });
              if (emissaoRes.nfe_url_pdf) window.open(emissaoRes.nfe_url_pdf, '_blank');
            } else {
              setNfceStatusData({ status_fiscal: 'erro', nfe_erro_mensagem: emissaoRes?.erro || 'Falha ao emitir', nfe_id: emissaoRes?.nfe_id });
            }
          });
        } else {
          setNfceStatusData(null);
        }
      }
    } catch (error) {
      toast({ title: 'Erro ao criar pedido', description: error.message, variant: 'destructive' });
    }
  };

  const handleRetryNFCe = () => {
    setNfceStatusData({ status_fiscal: 'pendente' });
    retry()?.then((emissaoRes) => {
      if (emissaoRes?.success) {
        setNfceStatusData({ status_fiscal: 'emitido', nfe_chave: emissaoRes.nfe_chave, nfe_id: emissaoRes.nfe_id });
        if (emissaoRes.nfe_url_pdf) window.open(emissaoRes.nfe_url_pdf, '_blank');
      } else {
        setNfceStatusData({ status_fiscal: 'erro', nfe_erro_mensagem: emissaoRes?.erro || 'Falha ao emitir', nfe_id: emissaoRes?.nfe_id });
      }
    });
  };

  return (
    <>
      <Helmet><title>Pedidos Balcão - Reddu</title></Helmet>
      <DashboardLayout>
        <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] -m-4 md:-m-6 lg:-m-8 bg-gray-100">

          <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-20">
            <div className="flex items-center gap-3">
              <div className="bg-[var(--color-primary)] p-2 rounded-lg text-white shadow-sm">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg md:text-xl font-black text-gray-900 leading-none">Pedidos Balcão</h1>
                  {nfceStatusData && <NFCeStatusBadge {...nfceStatusData} onRetry={handleRetryNFCe} />}
                </div>
                <span className="text-xs text-gray-500 mt-1">Monta o pedido e envia direto pra fila do cardápio digital</span>
              </div>
            </div>

            <Select value={localId} onValueChange={setLocalId} disabled={isSubmitting}>
              <SelectTrigger className="w-[180px] md:w-[240px] h-10 bg-white font-semibold border-gray-200 text-foreground">
                <SelectValue placeholder="Selecione o Local" />
              </SelectTrigger>
              <SelectContent>
                {locais.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="font-medium text-foreground">
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </header>

          <div className="flex-1 flex flex-col relative min-h-0">
            {lastPedidoSuccess && (
              <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none bg-black/5 backdrop-blur-[1px]">
                <div className="bg-emerald-600 text-white px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="w-10 h-10" />
                  <div>
                    <h2 className="text-2xl font-black">Pedido #{lastPedidoSuccess} enviado!</h2>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 p-4 flex-1 h-full min-h-0">
              <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Store className="w-4 h-4 text-gray-500" /> Catálogo
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-2 relative flex flex-col">
                  <GridProdutosBalcao
                    produtos={produtos}
                    isLoading={isLoadingProdutos}
                    onAddToCart={addToCart}
                  />
                </div>
              </div>

              <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <CarrinhoBalcao
                  items={cart}
                  onUpdateQuantidade={updateQuantity}
                  onRemoveItem={removeFromCart}
                  total={total}
                />
                <div className="border-t border-gray-200 p-3 shrink-0 bg-white">
                  <Button
                    className="w-full h-12 text-base font-bold bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white gap-2"
                    disabled={cart.length === 0 || isSubmitting}
                    onClick={() => setShowEntregaModal(true)}
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Continuar ({formatUnit(total)})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <FormaEntregaModal
          isOpen={showEntregaModal}
          onClose={() => setShowEntregaModal(false)}
          empresaId={empresaId}
          total={total}
          onConfirm={handleConfirmarPedido}
          isSubmitting={isSubmitting}
        />
      </DashboardLayout>
    </>
  );
}
