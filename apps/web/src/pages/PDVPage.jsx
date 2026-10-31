import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import FormularioVenda from '@/components/pdv/FormularioVenda';
import CarrinhoVenda from '@/components/pdv/CarrinhoVenda';
import AbrirCaixaModal from '@/components/pdv/AbrirCaixaModal';
import FecharCaixaModal from '@/components/pdv/FecharCaixaModal';
import PrintReceiptDialog from '@/components/pdv/PrintReceiptDialog';
import RetiradaModal from '@/components/pdv/RetiradaModal';
import { useAuth } from '@/contexts/AuthContext';
import { usePDVManagement } from '@/hooks/usePDVManagement';
import { useCaixaManagement } from '@/hooks/useCaixaManagement';
import { useCaixaMovimentacoes } from '@/hooks/useCaixaMovimentacoes';
import { useToast } from '@/hooks/use-toast';
import { formatUnit } from '@/utils/currencyFormatter';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';
import { supabase } from '@/lib/customSupabaseClient';
import { 
  Store, 
  AlertTriangle, 
  Receipt, 
  ArrowLeft, 
  LockKeyhole as LockKeyholeOpen, 
  DoorClosed, 
  Loader2, 
  PlayCircle,
  ArrowDownCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PDVPage() {
  const navigate = useNavigate();
  const { empresaId, empresaNome, user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  
  const { 
    finalizarVenda, 
    discount, 
    setDiscount, 
    calculateDiscountTotals, 
    validateDiscount 
  } = usePDVManagement();
  
  const { verificarCaixaAberto } = useCaixaManagement();
  const { calculateCaixaBalance } = useCaixaMovimentacoes();
  const { toast } = useToast();

  const [cart, setCart] = useState([]);
  const [mercadoId, setMercadoId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [locais, setLocais] = useState([]);
  const [empresaLogo, setEmpresaLogo] = useState(null);

  const [isCaixaLoading, setIsCaixaLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caixaAberto, setCaixaAberto] = useState(null);
  const [showAbrirModal, setShowAbrirModal] = useState(false);
  const [showFecharCaixa, setShowFecharCaixa] = useState(false);
  const [showRetiradaModal, setShowRetiradaModal] = useState(false);
  const [saldoAtual, setSaldoAtual] = useState(0);
  
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleData, setLastSaleData] = useState(null);

  const updateSaldo = useCallback(async (caixa) => {
    if (!caixa) return;
    const result = await calculateCaixaBalance(caixa.id, caixa.valor_inicial);
    setSaldoAtual(result.saldo_atual);
  }, [calculateCaixaBalance]);

  useEffect(() => {
    if (empresaId) {
      supabase.from('locais').select('*').eq('empresa_id', empresaId).eq('tipo', 'Estoque').order('nome')
        .then(({ data, error }) => {
          if (!error) {
            setLocais(data || []);
          }
        });
        
      supabase.from('empresas').select('logo_url').eq('id', empresaId).single()
        .then(({ data, error }) => {
          if (!error && data) {
            setEmpresaLogo(data.logo_url);
          }
        });
    }
  }, [empresaId]);

  useEffect(() => {
    let isMounted = true;

    const checkCaixaState = async () => {
      if (isAuthLoading) {
        return; 
      }

      if (!isAuthenticated || !empresaId || !user?.id) {
        if (isMounted) {
          setIsCaixaLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsCaixaLoading(true);
        setError(null);
      }

      const caixa = await verificarCaixaAberto(empresaId, user.id);

      if (!isMounted) return;

      if (caixa) {
        setCaixaAberto(caixa);
        setShowAbrirModal(false);
        await updateSaldo(caixa);
      } else {
        setCaixaAberto(null);
        setShowAbrirModal(true);
      }

      setIsCaixaLoading(false);
    };

    checkCaixaState();

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, isAuthenticated, empresaId, user?.id, updateSaldo]);

  const { total_final } = calculateDiscountTotals(cart);

  const handleAddToCart = (item) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(i => 
        i.produto_id === item.produto_id && 
        i.tipo === item.tipo && 
        (item.tipo === 'unitario' || i.lote_id === item.lote_id)
      );

      if (existingIndex >= 0) {
        const newCart = [...prev];
        const newQty = newCart[existingIndex].quantidade + item.quantidade;
        
        if (newQty > item.max_quantidade) {
          toast({
            title: "Quantidade Excedida",
            description: `Não é possível adicionar mais. Saldo máximo disponível é ${item.max_quantidade}.`,
            variant: "destructive"
          });
          return prev;
        }
        
        newCart[existingIndex].quantidade = newQty;
        toast({ title: "Carrinho atualizado", description: "Quantidade do item atualizada." });
        return newCart;
      }
      
      toast({ title: "Item adicionado", description: `${item.produto_nome} (${item.tipo}) adicionado.`, className: "bg-[var(--color-primary)] text-white border-none" });
      return [...prev, item];
    });
  };

  const handleRemoveFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setSubmitError(null);
    setDiscount('R$', 0);
  };

  const handleFinalize = async (formaPagamento, valorRecebido, troco) => {
    if (cart.length === 0) return;
    if (!caixaAberto) {
      toast({
        title: "Caixa Fechado",
        description: "Você precisa abrir o caixa antes de vender.",
        variant: "destructive"
      });
      setShowAbrirModal(true);
      return;
    }
    
    const validatedPayment = validateAndFixPaymentData(formaPagamento);
    if (!validatedPayment || validatedPayment === '') {
       toast({ title: "Erro na Forma de Pagamento", description: "Forma de pagamento inválida.", variant: "destructive" });
       return;
    }

    const { subtotal, desconto_valor, total_final: calculatedTotalFinal } = calculateDiscountTotals(cart);
    const validation = validateDiscount(subtotal);

    if (!validation.isValid) {
      toast({
        title: "Erro de Validação",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const discountParams = {
        desconto_tipo: discount.tipo,
        desconto_valor: desconto_valor,
        subtotal: subtotal,
        total_final: calculatedTotalFinal
      };

      const result = await finalizarVenda(empresaId, mercadoId, cart, discountParams, caixaAberto.id, validatedPayment, valorRecebido, troco);
      
      toast({
        title: "Venda finalizada com sucesso!",
        description: `${result.count} items processados. Total Final: ${formatUnit(calculatedTotalFinal)}.`,
        className: "bg-green-600 text-white border-none"
      });

      const saleDataToPrint = {
        items: [...cart],
        subtotal,
        desconto_valor,
        total_final: calculatedTotalFinal,
        forma_pagamento: validatedPayment,
        valor_recebido: valorRecebido,
        troco: troco,
        data: new Date(),
        venda_id: result?.venda_id || Math.random().toString(36).substring(2, 10).toUpperCase()
      };
      
      setLastSaleData(saleDataToPrint);
      setShowPrintDialog(true);
      
      setCart([]);
      setMercadoId(''); 
      setFormKey(prev => prev + 1); 
      setDiscount('R$', 0);
      
      await updateSaldo(caixaAberto);
    } catch (error) {
      setSubmitError(error.message);
      toast({
        title: "Erro na Finalização",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCaixaAberto = async (caixa) => {
    setCaixaAberto(caixa);
    setShowAbrirModal(false);
    await updateSaldo(caixa);
  };

  const onCaixaFechado = () => {
    setShowFecharCaixa(false);
    navigate('/dashboard');
  };

  const onRetiradaSuccess = async () => {
    await updateSaldo(caixaAberto);
  };

  return (
    <>
      <Helmet><title>PDV - Ponto de Venda - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto min-h-full">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate('/dashboard')} className="h-10 w-10 shrink-0 no-print">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="bg-red-50 p-2.5 rounded-lg shrink-0">
                <Store className="w-7 h-7 text-[var(--color-primary)]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">PDV Completo</h1>
                <p className="text-gray-500 mt-1 font-medium text-sm">Ponto de venda com carrinho detalhado</p>
              </div>
            </div>

            <div className="flex gap-4 items-center no-print flex-wrap justify-end">
              {caixaAberto && (
                <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg flex items-center gap-3 shadow-sm">
                  <div className="bg-amber-100 p-1.5 rounded-full text-amber-700">
                    <LockKeyholeOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Saldo Atual</p>
                    <p className="text-sm font-bold text-amber-900">{formatUnit(saldoAtual)}</p>
                  </div>
                  <div className="flex gap-1 ml-2 border-l pl-3 border-amber-200">
                    <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setShowRetiradaModal(true)}>
                      <ArrowDownCircle className="w-4 h-4 mr-1" /> Retirada
                    </Button>
                    <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => setShowFecharCaixa(true)}>
                      <DoorClosed className="w-4 h-4 mr-1" /> Fechar
                    </Button>
                  </div>
                </div>
              )}

              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 min-w-[200px]">
                <CardContent className="p-3 flex items-center gap-4">
                  <div className="bg-green-100 p-2.5 rounded-full text-green-700">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-green-800 uppercase tracking-wider">Total Carrinho</p>
                    <p className="text-xl font-black text-green-700">{formatUnit(total_final)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {error && !showAbrirModal && (
            <Alert variant="destructive" className="no-print">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => { setError(null); setIsCaixaLoading(true); }} className="ml-4">
                  Tentar Novamente
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isAuthLoading ? (
            <div className="flex flex-col min-h-[50vh] items-center justify-center p-12 text-gray-500 gap-4 no-print">
              <Loader2 className="w-12 h-12 animate-spin text-[var(--color-primary)]" />
              <p className="font-medium text-lg">Carregando autenticação...</p>
            </div>
          ) : isCaixaLoading && !showAbrirModal ? (
            <div className="flex flex-col min-h-[50vh] items-center justify-center p-12 text-gray-500 gap-4 no-print">
              <Loader2 className="w-12 h-12 animate-spin text-[var(--color-primary)]" />
              <p className="font-medium text-lg">Verificando status do caixa...</p>
            </div>
          ) : caixaAberto ? (
            <>
              {submitError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3 no-print">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <h3 className="text-red-800 font-bold text-sm">Falha na transação</h3>
                    <p className="text-red-700 text-sm mt-1">{submitError}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-8 no-print">
                <div className="lg:col-span-5 xl:col-span-4">
                  <FormularioVenda 
                    onAddToCart={handleAddToCart} 
                    currentMercadoId={mercadoId}
                    setMercadoId={setMercadoId}
                    formKey={formKey}
                    locais={locais}
                    disabled={!caixaAberto}
                  />
                </div>
                
                <div className="lg:col-span-7 xl:col-span-8">
                  <CarrinhoVenda 
                    cart={cart} 
                    onRemove={handleRemoveFromCart}
                    onClear={handleClearCart}
                    onFinalize={handleFinalize}
                    isSubmitting={isSubmitting}
                    discount={discount}
                    setDiscount={setDiscount}
                    calculateDiscountTotals={calculateDiscountTotals}
                    validateDiscount={validateDiscount}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col min-h-[50vh] items-center justify-center text-center p-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 no-print">
               <Store className="w-16 h-16 text-gray-300 mb-4" />
               <h2 className="text-xl font-bold text-gray-700 mb-2">Caixa Fechado</h2>
               <p className="text-gray-500 mb-6 max-w-md">Para iniciar as vendas no PDV, você precisa abrir o caixa do turno informando o valor inicial (troco).</p>
               <Button onClick={() => setShowAbrirModal(true)} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-lg px-8 py-6 h-auto text-white">
                 <PlayCircle className="w-6 h-6 mr-2" /> Abrir Caixa Agora
               </Button>
            </div>
          )}
        </div>

        <AbrirCaixaModal 
          isOpen={showAbrirModal} 
          onCaixaAberto={handleCaixaAberto} 
          onClose={() => setShowAbrirModal(false)}
        />
        
        {caixaAberto && (
          <FecharCaixaModal 
            isOpen={showFecharCaixa} 
            onClose={() => setShowFecharCaixa(false)} 
            onSuccess={onCaixaFechado}
            caixaAberto={caixaAberto}
          />
        )}

        {caixaAberto && (
          <RetiradaModal
            isOpen={showRetiradaModal}
            onClose={() => setShowRetiradaModal(false)}
            caixaAberto={caixaAberto}
            saldoAtual={saldoAtual}
            onSuccess={onRetiradaSuccess}
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