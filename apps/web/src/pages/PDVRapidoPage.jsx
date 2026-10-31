import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import PedidosCardapioMiniKanban from '@/components/PedidosCardapioMiniKanban';
import GridProdutos from '@/components/pdv-rapido/GridProdutos';
import ListaItemsVenda from '@/components/pdv-rapido/ListaItemsVenda';
import FinalizacaoRapida from '@/components/pdv-rapido/FinalizacaoRapida';
import AbrirCaixaModal from '@/components/pdv/AbrirCaixaModal';
import FecharCaixaModal from '@/components/pdv/FecharCaixaModal';
import PrintReceiptDialog from '@/components/pdv/PrintReceiptDialog';
import RetiradaModal from '@/components/pdv/RetiradaModal';
import { useAuth } from '@/contexts/AuthContext';
import { useCaixaManagement } from '@/hooks/useCaixaManagement';
import { useCaixaMovimentacoes } from '@/hooks/useCaixaMovimentacoes';
import { usePDVRapido } from '@/hooks/usePDVRapido';
import { useNFCeEmission } from '@/hooks/useNFCeEmission';
import NFCeStatusBadge from '@/components/fiscal/NFCeStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { formatUnit } from '@/utils/currencyFormatter';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';
import {
  Zap,
  LockKeyhole as LockKeyholeOpen,
  DoorClosed,
  Store,
  Loader2,
  CheckCircle2,
  Search,
  ArrowDownCircle,
  Receipt
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export default function PDVRapidoPage() {
  const { empresaId, empresaNome, user, isLoading: isAuthLoading, isAuthenticated, refreshSessionTokens } = useAuth();
  const { caixaState, verificarCaixaAberto } = useCaixaManagement();
  const { calculateCaixaBalance } = useCaixaMovimentacoes();
  const { toast } = useToast();

  const {
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
  } = usePDVRapido();

  // Integration for NFCe Background Emission
  const { emitirNFCeHook, retry } = useNFCeEmission();

  const [caixaAberto, setCaixaAberto] = useState(null);
  const [showAbrirModal, setShowAbrirModal] = useState(false);
  const [showFecharModal, setShowFecharModal] = useState(false);
  const [showRetiradaModal, setShowRetiradaModal] = useState(false);
  const [saldoAtual, setSaldoAtual] = useState(0);

  const [mercados, setMercados] = useState([]);
  const [mercadoId, setMercadoId] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false);
  const [debugStats, setDebugStats] = useState({ rawLotes: 0, lotesLiberados: 0, lotesTipoCorreto: 0 });

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSaleSuccess, setLastSaleSuccess] = useState(false);

  const [descontoValor, setDescontoValor] = useState(0);
  const [taxaMotoboy, setTaxaMotoboy] = useState(0);
  const [observacoes, setObservacoes] = useState('');

  const [empresaLogo, setEmpresaLogo] = useState(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleData, setLastSaleData] = useState(null);

  // Status for NFCe visual feedback in the top bar
  const [nfceStatusData, setNfceStatusData] = useState(null);

  // Raw Total calculation (NO ROUNDING)
  const totalGlobal = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => {
      if (item.tipo_item !== 'NORMAL') return acc;
      return acc + Math.round(item.preco * item.quantidade * 100) / 100;
    }, 0);

    const descontoRaw = Number(descontoValor || 0);
    const taxaRaw = Number(taxaMotoboy || 0);
    const totalRaw = subtotal - descontoRaw + taxaRaw;

    return Math.round(totalRaw * 100) / 100;
  }, [cart, descontoValor, taxaMotoboy]);

  const filteredProdutos = useMemo(() => {
    if (!searchTerm.trim()) return produtos;
    const term = searchTerm.toLowerCase();
    return produtos.filter(p => p.nome.toLowerCase().includes(term));
  }, [produtos, searchTerm]);

  const updateSaldo = useCallback(async (caixa) => {
    if (!caixa) return;
    try {
      const result = await calculateCaixaBalance(caixa.id, caixa.valor_inicial);
      setSaldoAtual(result.saldo_atual);
    } catch (err) {
      console.error("Erro ao atualizar saldo:", err);
    }
  }, [calculateCaixaBalance]);

  useEffect(() => {
    if (empresaId) {
      supabase.from('empresas').select('logo_url').eq('id', empresaId).single()
        .then(({ data, error }) => {
          if (!error && data) {
            setEmpresaLogo(data.logo_url);
          }
        });
    }
  }, [empresaId]);

  useEffect(() => {
    const validateSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          toast({ title: "Sessão expirada", description: "Por favor, faça login novamente.", variant: "destructive" });
          window.location.href = '/login?error=session_expired';
          return;
        }
        await refreshSessionTokens();
      } catch (err) {
        console.error("Session validation error:", err);
        window.location.href = '/login?error=session_expired';
      }
    };
    if (!isAuthLoading) {
      validateSession();
    }
  }, [isAuthLoading, refreshSessionTokens, toast]);

  const handleAddToCart = async (produto, lote) => {
    try {
      if (!empresaId || !mercadoId) throw new Error("Selecione um local antes de adicionar produtos.");
      await addToCart(produto, lote);
    } catch (error) {
      toast({ title: "Erro ao adicionar", description: error.message || "Ocorreu um erro inesperado.", variant: "destructive" });
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkCaixa = async () => {
      if (isAuthLoading || !isAuthenticated || !empresaId || !user?.id) return;
      try {
        const caixa = await verificarCaixaAberto(empresaId, user.id);
        if (!isMounted) return;
        if (caixa) {
          setCaixaAberto(caixa);
          await updateSaldo(caixa);
        }
      } catch (error) {
        console.error("Erro ao checar caixa:", error);
      }
    };
    checkCaixa();
    return () => { isMounted = false; };
  }, [isAuthLoading, isAuthenticated, empresaId, user?.id, updateSaldo]);

  useEffect(() => {
    if (empresaId) {
      const fetchLocaisProprios = async () => {
        try {
          let { data: allLocations, error } = await supabase
            .from('locais')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('mostrar_no_pdv', true)
            .order('nome');

          if (error) throw error;

          const filteredLocations = allLocations || [];

          setMercados(filteredLocations);

          if (filteredLocations.length > 0) {
            setMercadoId(prev => {
              if (prev && filteredLocations.some(l => l.id === prev)) return prev;
              return filteredLocations[0].id;
            });
          }
        } catch (error) {
          console.error("[PDVRapidoPage] Erro ao carregar locais:", error);
        }
      };
      fetchLocaisProprios();
    }
  }, [empresaId]);

  useEffect(() => {
    let isMounted = true;
    if (empresaId && mercadoId) {
      setIsLoadingProdutos(true);
      fetchProdutosRapido(empresaId, mercadoId, tipoVenda).then(({ products, debugStats }) => {
        if (isMounted) {
          setProdutos(products || []);
          setDebugStats(debugStats || { rawLotes: 0, lotesLiberados: 0, lotesTipoCorreto: 0 });
        }
      }).finally(() => {
        if (isMounted) setIsLoadingProdutos(false);
      });
    }
    return () => { isMounted = false; };
  }, [empresaId, mercadoId, tipoVenda, fetchProdutosRapido]);

  const clearForm = () => {
    clearCart();
    setDescontoValor(0);
    setTaxaMotoboy(0);
    setObservacoes('');
    setSearchTerm('');
    clearPayments();
  };

  const handleFinalize = async (finalizeData = {}) => {
    const { cpfCliente } = finalizeData;

    if (!caixaAberto) {
      setShowAbrirModal(true);
      return { success: false, error: "Abra o caixa primeiro." };
    }

    const subtotal = cart.reduce((acc, item) => {
      if (item.tipo_item !== 'NORMAL') return acc;
      return acc + Math.round(item.preco * item.quantidade * 100) / 100;
    }, 0);

    const taxaRaw = Number(taxaMotoboy || 0);
    const descontoRaw = Number(descontoValor || 0);
    const totalPaidRaw = getTotalPaid();
    const trocoRaw = Math.max(0, totalPaidRaw - totalGlobal);
    const truncatedPayments = payments.map(p => ({
      ...p,
      value: Math.round((p.value || 0) * 100) / 100
    }));
    const computedFormaPagamento = payments.length === 0 ? 'CORTESIA' : (payments.length > 1 ? 'Múltiplo' : validateAndFixPaymentData(payments[0]?.method || 'dinheiro'));

    // Copy the current cart for background NFC-e
    const vendaItemsSnapshot = [...cart];

    const saleDataToPrint = {
      items: vendaItemsSnapshot,
      subtotal: subtotal,
      taxa_motoboy: taxaRaw,
      desconto_valor: descontoRaw,
      total_final: totalGlobal,
      forma_pagamento: computedFormaPagamento,
      forma_pagamento_detalhes: truncatedPayments,
      valor_recebido: totalPaidRaw,
      troco: trocoRaw,
      data: new Date(),
      venda_id: Math.random().toString(36).substring(2, 10).toUpperCase()
    };

    setIsProcessing(true);
    try {
      const extras = {
        taxaMotoboy: taxaRaw,
        observacoes,
        descontoAplicadoValor: descontoRaw,
        subtotalGlobal: subtotal
      };

      const res = await saveSale(empresaId, mercadoId, caixaAberto.id, truncatedPayments, extras);

      if (res && res.success) {
        toast({
          title: "Venda realizada com sucesso!",
          className: "bg-emerald-600 text-white border-none",
        });

        // Setup immediate pending state for Badge
        setNfceStatusData({ status_fiscal: 'pendente' });

        // Trigger background NFC-e Emission (non-blocking) with cpf_cliente support
        const vendaSnapshotData = {
          id: res.venda_id,
          cliente_referencia: res.cliente_referencia,
          items: vendaItemsSnapshot.filter(i => i.tipo_item === 'NORMAL'), // ← só produtos reais
          total_final: totalGlobal,
          taxa_motoboy: Number(taxaMotoboy || 0),       // ← taxa de entrega
          desconto: Number(descontoValor || 0),          // ← desconto
          forma_pagamento: payments.length > 1 ? 'multiplo' : validateAndFixPaymentData(payments[0]?.method || 'dinheiro'),
          forma_pagamento_detalhes: truncatedPayments,   // ← todos os pagamentos
          cpf_cliente: cpfCliente || null
        };

        const docDigits = cpfCliente ? cpfCliente.replace(/\D/g, '').length : 0;
        if (cpfCliente && (docDigits === 11 || docDigits === 14)) {
          emitirNFCeHook(vendaSnapshotData, empresaId)
            .then((emissaoRes) => {
              if (emissaoRes?.success) {
                setNfceStatusData({
                  status_fiscal: 'emitido',
                  nfe_chave: emissaoRes.nfe_chave,
                  nfe_id: emissaoRes.nfe_id
                });

                toast({
                  title: "Sucesso!",
                  description: "Cupom Fiscal emitido com sucesso!",
                  className: "bg-emerald-600 text-white border-none",
                });

                if (emissaoRes.nfe_url_pdf) {
                  window.open(emissaoRes.nfe_url_pdf, '_blank');
                }
              } else {
                setNfceStatusData({
                  status_fiscal: 'erro',
                  nfe_erro_mensagem: emissaoRes?.erro || 'Falha ao emitir',
                  nfe_id: emissaoRes?.nfe_id
                });
              }
            });
        } else {
          setNfceStatusData(null);
        }

        clearForm();

        if (res.cliente_referencia) {
          saleDataToPrint.venda_id = res.cliente_referencia.replace('PDV-', '');
          saleDataToPrint.cliente_referencia = res.cliente_referencia;
        }
        setLastSaleData(saleDataToPrint);
        setShowPrintDialog(true);

        await updateSaldo(caixaAberto);
      }
      return res;
    } catch (err) {
      toast({ title: "Erro na Venda", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaleSuccess = () => {
    setLastSaleSuccess(true);
    if (empresaId && mercadoId) {
      fetchProdutosRapido(empresaId, mercadoId, tipoVenda).then(({ products, debugStats }) => {
        setProdutos(products || []);
        setDebugStats(debugStats || { rawLotes: 0, lotesLiberados: 0, lotesTipoCorreto: 0 });
      });
    }
    setTimeout(() => setLastSaleSuccess(false), 3000);
  };

  const handleSaleError = (errorMsg) => {
    setLastSaleSuccess(false);
  };

  const handleRetryNFCe = () => {
    setNfceStatusData({ status_fiscal: 'pendente' });
    retry()?.then((emissaoRes) => {
      if (emissaoRes?.success) {
        setNfceStatusData({
          status_fiscal: 'emitido',
          nfe_chave: emissaoRes.nfe_chave,
          nfe_id: emissaoRes.nfe_id
        });

        toast({
          title: "Sucesso!",
          description: "Cupom Fiscal emitido com sucesso na retentativa!",
          className: "bg-emerald-600 text-white border-none",
        });

        if (emissaoRes.nfe_url_pdf) {
          window.open(emissaoRes.nfe_url_pdf, '_blank');
        }
      } else {
        setNfceStatusData({
          status_fiscal: 'erro',
          nfe_erro_mensagem: emissaoRes?.erro || 'Falha ao emitir',
          nfe_id: emissaoRes?.nfe_id
        });
      }
    });
  };

  if (isAuthLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[80vh] items-center justify-center flex-col gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet><title>PDV Rápido - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] -m-4 md:-m-6 lg:-m-8 bg-gray-100">

          <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-20">
            <div className="flex items-center gap-3">
              <div className="bg-[var(--color-primary)] p-2 rounded-lg text-white shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg md:text-xl font-black text-gray-900 leading-none">PDV Rápido</h1>
                  {nfceStatusData && (
                    <NFCeStatusBadge
                      {...nfceStatusData}
                      onRetry={handleRetryNFCe}
                    />
                  )}
                </div>
                {caixaState.loading ? (
                  <span className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Loader2 className="w-3 h-3 animate-spin" /> Verificando caixa...</span>
                ) : caixaAberto ? (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      <LockKeyholeOpen className="w-3 h-3" /> Aberto
                    </span>
                    <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      Saldo: {formatUnit(saldoAtual)}
                    </span>
                    <button
                      onClick={() => setShowRetiradaModal(true)}
                      className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold hover:bg-amber-100 transition-colors flex items-center gap-1 border border-amber-200"
                    >
                      <ArrowDownCircle className="w-3 h-3" /> Retirada
                    </button>
                    <button
                      onClick={() => setShowFecharModal(true)}
                      className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded font-bold hover:bg-red-100 transition-colors border border-red-200"
                    >
                      Fechar Caixa
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-red-600 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                      <DoorClosed className="w-3 h-3" /> Fechado
                    </span>
                    <button
                      onClick={() => setShowAbrirModal(true)}
                      className="text-xs bg-emerald-500 text-white px-3 py-0.5 rounded font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                    >
                      Abrir Caixa
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pedidos do cardápio (tela fica sempre aberta): clique leva ao quadro completo */}
            <PedidosCardapioMiniKanban />

            <div className="flex items-center gap-3">
              <Select value={mercadoId} onValueChange={(val) => setMercadoId(val)} disabled={isProcessing || isSubmitting}>
                <SelectTrigger className="w-[180px] md:w-[240px] h-10 bg-white font-semibold border-gray-200 text-foreground">
                  <SelectValue placeholder="Selecione o Local" />
                </SelectTrigger>
                <SelectContent>
                  {mercados.map(m => (
                    <SelectItem key={m.id} value={m.id} className="font-medium text-foreground">
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="bg-gray-100 p-1 rounded-md flex border border-gray-200 shrink-0">
                <button
                  className={`px-4 py-1.5 text-sm font-bold rounded transition-all ${tipoVenda === 'unitario' ? 'bg-white shadow text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setTipoVenda('unitario')}
                >
                  Unitário
                </button>
                <button
                  className={`px-4 py-1.5 text-sm font-bold rounded transition-all ${tipoVenda === 'bandeja' ? 'bg-white shadow text-[var(--color-primary)]' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setTipoVenda('bandeja')}
                >
                  Bandeja
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col relative min-h-0">
            {lastSaleSuccess && (
              <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none bg-black/5 backdrop-blur-[1px]">
                <div className="bg-emerald-600 text-white px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="w-10 h-10" />
                  <div>
                    <h2 className="text-2xl font-black">Venda Realizada!</h2>
                  </div>
                </div>
              </div>
            )}

            {(isProcessing || isSubmitting) && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center m-4 rounded-xl border border-gray-200 shadow-sm">
                <Loader2 className="w-12 h-12 text-[var(--color-primary)] animate-spin mb-4" />
                <p className="font-black text-gray-900 text-lg">Processando Venda...</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_350px] xl:grid-cols-[1.2fr_1fr_380px] gap-4 p-4 flex-1 h-full min-h-0">

              <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Store className="w-4 h-4 text-gray-500" /> Catálogo
                  </h2>
                </div>
                <div className="p-3 bg-white border-b border-gray-100 shrink-0 relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar produto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 h-10 bg-gray-50 border-gray-200 rounded-lg text-foreground"
                  />
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-2 relative flex flex-col">
                  <GridProdutos
                    produtos={filteredProdutos}
                    cart={cart}
                    tipoVenda={tipoVenda}
                    onAddToCart={handleAddToCart}
                    isLoading={isLoadingProdutos}
                  />
                </div>
              </div>

              <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <ListaItemsVenda
                  items={cart}
                  produtos={produtos}
                  onUpdateQuantidade={updateQuantity}
                  onUpdateItemLote={updateItemLote}
                  onRemoveItem={removeFromCart}
                  total={totalGlobal}
                />
              </div>

              <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <FinalizacaoRapida
                  cart={cart}
                  subtotal={totalGlobal}
                  desconto={descontoValor}
                  onDescontoChange={setDescontoValor}
                  taxaMotoboy={taxaMotoboy}
                  onTaxaChange={setTaxaMotoboy}
                  observacoes={observacoes}
                  onObservacoesChange={setObservacoes}
                  total={totalGlobal}
                  onFinalize={handleFinalize}
                  isSubmitting={isSubmitting || isProcessing}
                  clearCart={clearForm}
                  onSaleSuccess={handleSaleSuccess}
                  onSaleError={handleSaleError}
                  payments={payments}
                  addPayment={addPayment}
                  removePayment={removePayment}
                  getTotalPaid={getTotalPaid}
                  getRemainingBalance={getRemainingBalance}
                  validatePaymentComplete={validatePaymentComplete}
                />
              </div>

            </div>
          </div>
        </div>

        <AbrirCaixaModal
          isOpen={showAbrirModal && !caixaAberto}
          onCaixaAberto={(c) => {
            setCaixaAberto(c);
            setShowAbrirModal(false);
            updateSaldo(c);
          }}
          onClose={() => setShowAbrirModal(false)}
        />

        {caixaAberto && (
          <RetiradaModal
            isOpen={showRetiradaModal}
            onClose={() => setShowRetiradaModal(false)}
            caixaAberto={caixaAberto}
            saldoAtual={saldoAtual}
            onSuccess={() => updateSaldo(caixaAberto)}
          />
        )}

        {caixaAberto && (
          <FecharCaixaModal
            isOpen={showFecharModal}
            onClose={() => setShowFecharModal(false)}
            caixaAberto={caixaAberto}
            onSuccess={() => {
              setShowFecharModal(false);
              setCaixaAberto(null);
              setShowAbrirModal(true);
            }}
          />
        )}

        <PrintReceiptDialog
          isOpen={showPrintDialog}
          onClose={() => setShowPrintDialog(false)}
          saleData={lastSaleData}
          empresaNome={empresaNome}
          empresaLogo={empresaLogo}
        />
      </DashboardLayout>
    </>
  );
}