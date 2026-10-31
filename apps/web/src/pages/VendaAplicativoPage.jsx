import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useVendaAplicativo } from '@/hooks/useVendaAplicativo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Loader2, Smartphone, Plus, Minus, Trash2, ShoppingBag,
  CheckCircle2, MapPin, Tag, AlertCircle, DollarSign,
  Banknote, QrCode, CreditCard, RotateCcw, Package
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast as useToastHook } from '@/hooks/use-toast';
import { validatePaymentMethodStrict, getPaymentMethodDisplay, VALID_PAYMENT_METHODS } from '@/utils/validatePaymentMethod';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';
import { isValidTipoLote, formatTipoLoteDisplay } from '@/utils/tipoLoteValidation';

const fmt3 = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(v) || 0);
const fmt2 = (v) => { const t = Math.trunc((Number(v) || 0) * 100) / 100; return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t); };
// Exibe 3 casas só quando o terceiro decimal é não-zero (ex: 0,999), senão usa 2 casas (ex: 18,00)
const fmtPreco = (v) => { const num = Number(v) || 0; const tem3 = Math.round(num * 1000) % 10 !== 0; return tem3 ? fmt3(num) : fmt2(num); };

export default function VendaAplicativoPage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();

  const { cart, isSubmitting, fetchProdutosClassicos, fetchProdutosComerciais, addToCart, updateQuantity, removeFromCart, clearCart, saveSale } = useVendaAplicativo();

  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('');
  const [appName, setAppName] = useState('');
  const [numeroPedidoApp, setNumeroPedidoApp] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [produtosComerciais, setProdutosComerciais] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formaPagamento, setFormaPagamento] = useState('nao_informado');
  const [desconto, setDesconto] = useState('');
  const [selectedComercialId, setSelectedComercialId] = useState('custom');
  const [customCommercialName, setCustomCommercialName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedLoteId, setSelectedLoteId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [allLotes, setAllLotes] = useState([]);
  const [successData, setSuccessData] = useState(null);

  const getPriceByLoteType = (produto, tipoLote) => {
    if (!produto) return 0;
    const tipo = String(tipoLote || '').toLowerCase().trim();
    if (tipo === 'bandeja') {
      if (produto.preco_bandeja && Number(produto.preco_bandeja) > 0) return Number(produto.preco_bandeja);
      if (produto.preco_unitario && Number(produto.preco_unitario) > 0) return Number(produto.preco_unitario);
      return Number(produto.preco_venda || 0);
    }
    if (produto.preco_unitario && Number(produto.preco_unitario) > 0) return Number(produto.preco_unitario);
    return Number(produto.preco_venda || 0);
  };

  const loadLotes = async () => {
    const { products } = await fetchProdutosClassicos(empresaId);
    const extracted = [];
    products.forEach(p => p.lotes.forEach(l => extracted.push({ ...l, produto_id: p.id, produto_nome: p.nome, produto: p })));
    const filtered = extracted.filter(l => l.local_nome === 'ESTOQUE CLÁSSICOS' && l.quantidade_disponivel > 0 && l.ativo !== false && !l.lote_devolvido);
    setAllLotes(filtered);
    setProdutos(products || []);
    return filtered;
  };

  useEffect(() => {
    const init = async () => {
      if (!empresaId) return;
      setIsLoading(true);
      try {
        const { data: appData } = await supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'APP').order('nome');
        setApps(appData || []);
        if (appData?.length > 0) { setAppId(appData[0].id); setAppName(appData[0].nome); }
        await loadLotes();
        const coms = await fetchProdutosComerciais(empresaId);
        setProdutosComerciais(coms || []);
      } catch (err) {
        toast({ title: 'Erro ao inicializar', description: err.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [empresaId]);

  const handleAppChange = (val) => { setAppId(val); const a = apps.find(x => x.id === val); if (a) setAppName(a.nome); };
  const handleComercialChange = (val) => { setSelectedComercialId(val); if (val !== 'custom') { const p = produtosComerciais.find(x => x.id === val); if (p) setCustomCommercialName(p.nome); } };
  const handleProductChange = (id) => { setSelectedProductId(id); setSelectedLoteId(''); setQuantidade('1'); };

  const availableLotes = useMemo(() => selectedProductId ? allLotes.filter(l => l.produto_id === selectedProductId) : [], [allLotes, selectedProductId]);
  const productsWithLotes = useMemo(() => { const ids = new Set(allLotes.map(l => l.produto_id)); return Array.from(ids).map(id => allLotes.find(l => l.produto_id === id)?.produto).filter(Boolean); }, [allLotes]);
  const selectedLoteObj = useMemo(() => allLotes.find(l => l.lote_id === selectedLoteId), [allLotes, selectedLoteId]);
  const currentPrice = useMemo(() => selectedLoteObj?.produto ? getPriceByLoteType(selectedLoteObj.produto, selectedLoteObj.tipo_lote) : 0, [selectedLoteObj]);

  const handleAdd = () => {
    if (!selectedLoteObj?.produto) return toast({ title: 'Erro', description: 'Selecione produto e lote', variant: 'destructive' });
    if (!isValidTipoLote(selectedLoteObj.tipo_lote)) return toast({ title: 'Lote inválido', variant: 'destructive' });
    addToCart(selectedLoteObj.produto, { lote_id: selectedLoteObj.lote_id, numero_lote: selectedLoteObj.numero_lote, quantidade_disponivel: selectedLoteObj.quantidade_disponivel, local_id: selectedLoteObj.local_id, local_nome: selectedLoteObj.local_nome, tipo_lote: selectedLoteObj.tipo_lote }, parseInt(quantidade) || 1);
    setSelectedProductId(''); setSelectedLoteId(''); setQuantidade('1');
  };

  const subtotalRaw = useMemo(() => cart.reduce((s, i) => s + i.preco * i.quantidade, 0), [cart]);
  const totalMontado = useMemo(() => cart.reduce((s, i) => s + i.quantidade, 0), [cart]);
  const descontoNum = useMemo(() => { const p = parseFloat(desconto); return isNaN(p) ? 0 : Math.abs(p); }, [desconto]);
  const isDescontoInvalido = Math.trunc(descontoNum * 100) / 100 > Math.trunc(subtotalRaw * 100) / 100;
  const totalFinal = useMemo(() => Math.max(0, subtotalRaw - descontoNum), [subtotalRaw, descontoNum]);
  const paymentValid = validatePaymentMethodStrict(formaPagamento);
  const hasInvalidTipo = useMemo(() => cart.some(i => !isValidTipoLote(i.tipo_lote)), [cart]);
  const hasZeroPrice = useMemo(() => cart.some(i => !i.preco || i.preco === 0), [cart]);

  const canCheckout = cart.length > 0 && !isSubmitting && appId && appName && !isDescontoInvalido && paymentValid.isValid && !hasInvalidTipo && !hasZeroPrice;

  const executeCheckout = async () => {
    if (!canCheckout) return;
    const vp = validateAndFixPaymentData(formaPagamento);
    if (!validatePaymentMethodStrict(vp).isValid) return toast({ title: 'Forma de pagamento inválida', variant: 'destructive' });
    try {
      const res = await saveSale(empresaId, appName, vp, totalFinal, { subtotal: subtotalRaw, descontoValor: descontoNum, numero_pedido_app: numeroPedidoApp || null });
      if (res.success) {
        setSuccessData({ appName, total: totalFinal, itens: cart.length, pedido: numeroPedidoApp });
        setTimeout(async () => {
          clearCart(); setDesconto(''); setNumeroPedidoApp(''); setFormaPagamento('nao_informado');
          setSelectedProductId(''); setSelectedLoteId(''); setQuantidade('1');
          await loadLotes();
        }, 500);
      } else {
        toast({ title: 'Erro ao finalizar', description: res.error, variant: 'destructive', duration: 8000 });
      }
    } catch (err) {
      toast({ title: 'Erro crítico', description: err.message, variant: 'destructive', duration: 10000 });
    }
  };

  const PAYMENT_OPTS = [
    { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
    { value: 'pix', label: 'PIX', icon: QrCode },
    { value: 'cartao_debito', label: 'Débito', icon: CreditCard },
    { value: 'cartao_credito', label: 'Crédito', icon: CreditCard },
    { value: 'nao_informado', label: 'Não Inf.', icon: Smartphone },
  ];

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    </DashboardLayout>
  );

  return (
    <>
      <Helmet><title>Venda Aplicativo - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-6xl mx-auto space-y-6 pb-10">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Venda por Aplicativo</h1>
                <p className="text-gray-500 text-sm mt-0.5">Registre vendas de apps de delivery — Estoque Clássicos.</p>
              </div>
            </div>
            {cart.length > 0 && (
              <Button variant="outline" onClick={() => { clearCart(); setSuccessData(null); }} className="gap-2 text-red-500 border-red-200 hover:bg-red-50 text-sm">
                <RotateCcw className="h-4 w-4" /> Limpar carrinho
              </Button>
            )}
          </div>

          {/* Success banner */}
          {successData && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-800">Venda registrada com sucesso!</p>
                <p className="text-sm text-green-700 mt-0.5">
                  <strong>{successData.appName}</strong> · {successData.itens} produto(s) · {fmt2(successData.total)}
                  {successData.pedido && ` · Pedido: ${successData.pedido}`}
                </p>
              </div>
              <button onClick={() => setSuccessData(null)} className="text-green-400 hover:text-green-600 text-lg">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* LEFT — formulário */}
            <div className="lg:col-span-2 space-y-5">

              {/* Dados da venda */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-blue-500" /> Dados da Venda
                  </p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">Canal (APP)</label>
                      <Select value={appId} onValueChange={handleAppChange} disabled={isSubmitting}>
                        <SelectTrigger className="h-9 bg-gray-50 border-gray-200 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{apps.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">Produto Comercial APP</label>
                      <Select value={selectedComercialId} onValueChange={handleComercialChange} disabled={isSubmitting}>
                        <SelectTrigger className="h-9 bg-gray-50 border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Personalizado</SelectItem>
                          {produtosComerciais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">Nº Pedido APP</label>
                      <Input placeholder="Ex: IFD-45892" value={numeroPedidoApp} onChange={e => setNumeroPedidoApp(e.target.value)} disabled={isSubmitting} className="h-9 bg-gray-50 border-gray-200 text-sm" style={{ fontSize: '14px' }} />
                    </div>
                  </div>
                  {selectedComercialId === 'custom' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">Nome do Produto APP</label>
                      <Input placeholder="Ex: COMBO FESTA..." value={customCommercialName} onChange={e => setCustomCommercialName(e.target.value)} className="h-9 bg-gray-50 border-gray-200 text-sm" style={{ fontSize: '14px' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Adicionar produto */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" /> Adicionar Produto ao Carrinho
                  </p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-4 space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">1. Produto</label>
                      <Select value={selectedProductId} onValueChange={handleProductChange}>
                        <SelectTrigger className="h-9 bg-gray-50 border-gray-200 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{productsWithLotes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-5 space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">2. Lote</label>
                      <Select value={selectedLoteId} onValueChange={setSelectedLoteId} disabled={!selectedProductId}>
                        <SelectTrigger className="h-9 bg-gray-50 border-gray-200 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {availableLotes.map(l => (
                            <SelectItem key={l.lote_id} value={l.lote_id}>
                              {l.numero_lote} — {formatTipoLoteDisplay(l.tipo_lote)} ({l.quantidade_disponivel} disp.)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-3 space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600">3. Qtd.</label>
                      <div className="flex gap-1">
                        <button onClick={() => setQuantidade(q => String(Math.max(1, parseInt(q) - 1)))} disabled={!selectedLoteId}
                          className="w-8 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <Input type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)}
                          className="w-12 h-9 text-center text-sm bg-gray-50 border-gray-200 p-0 font-bold" disabled={!selectedLoteId} style={{ fontSize: '14px' }} />
                        <button onClick={() => setQuantidade(q => String(parseInt(q) + 1))} disabled={!selectedLoteId}
                          className="w-8 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <Button onClick={handleAdd} disabled={!selectedLoteId || currentPrice === 0}
                          className="flex-1 h-9 gap-1 bg-blue-600 hover:bg-blue-700 text-sm px-3">
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Info do lote selecionado */}
                  {selectedLoteObj && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: <Tag className="h-3.5 w-3.5"/>, label: 'Tipo', value: formatTipoLoteDisplay(selectedLoteObj.tipo_lote), color: !isValidTipoLote(selectedLoteObj.tipo_lote) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200' },
                        { icon: <MapPin className="h-3.5 w-3.5"/>, label: 'Local', value: selectedLoteObj.local_nome, color: 'bg-gray-50 text-gray-700 border-gray-200' },
                        { icon: <DollarSign className="h-3.5 w-3.5"/>, label: 'Preço', value: fmtPreco(currentPrice), color: currentPrice === 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      ].map((info, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${info.color}`}>
                          {info.icon}
                          <div>
                            <p className="opacity-60 text-xs">{info.label}</p>
                            <p className="font-bold">{info.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {currentPrice === 0 && selectedLoteId && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <p className="text-xs text-red-600 font-medium">Produto com preço R$ 0,00. Não é possível adicionar ao carrinho.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Carrinho */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-blue-500" /> Carrinho
                    {cart.length > 0 && <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{cart.length}</span>}
                  </p>
                </div>
                <div className="p-5">
                  {cart.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingBag className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-400 text-sm">Carrinho vazio</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map(item => {
                        const sub = item.preco * item.quantidade;
                        const invalid = !item.preco || item.preco === 0;
                        return (
                          <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${invalid ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate">{item.produto_nome}</p>
                              <p className="text-xs text-gray-500 mt-0.5 font-mono">{item.numero_lote} · <span className={invalid ? 'text-red-600 font-bold' : ''}>{fmtPreco(item.preco)}/un</span></p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantidade - 1))}
                                className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100">
                                <Minus className="h-3 w-3" />
                              </button>
                              <Input type="number" min="1" max={item.max_quantidade} value={item.quantidade}
                                onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                                className="w-12 h-7 text-center text-sm font-bold p-0 bg-white border-gray-200" style={{ fontSize: '13px' }} />
                              <button onClick={() => updateQuantity(item.id, item.quantidade + 1)}
                                className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <div className={`text-right w-20 flex-shrink-0 font-black text-sm ${invalid ? 'text-red-600' : 'text-blue-700'}`}>
                              {fmt2(sub)}
                            </div>
                            <button onClick={() => removeFromCart(item.id)}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT — resumo */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm sticky top-6 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <p className="font-bold text-gray-800">Resumo da Venda</p>
                </div>
                <div className="p-5 space-y-5">

                  {/* Valores */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Itens</span>
                      <span className="font-semibold text-gray-900">{totalMontado} un.</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-semibold text-gray-900">{fmt2(subtotalRaw)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-600">Desconto (R$)</span>
                      <Input type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(e.target.value)}
                        placeholder="0,00"
                        className={`w-24 h-8 text-right text-sm bg-gray-50 ${isDescontoInvalido ? 'border-red-400' : 'border-gray-200'}`}
                        style={{ fontSize: '13px' }} />
                    </div>
                    {isDescontoInvalido && <p className="text-xs text-red-500 text-right">Desconto maior que subtotal</p>}
                    <div className="border-t border-gray-100 pt-2.5 flex justify-between items-center">
                      <span className="font-bold text-gray-900">Total Final</span>
                      <span className="text-2xl font-black text-blue-700">{fmt2(totalFinal)}</span>
                    </div>
                  </div>

                  {/* Pagamento */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Forma de Pagamento</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PAYMENT_OPTS.map(({ value, label, icon: Icon }) => (
                        <button key={value} onClick={() => setFormaPagamento(value)}
                          className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition-all ${formaPagamento === value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{label}</span>
                          {formaPagamento === value && <CheckCircle2 className="h-3 w-3 ml-auto flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alertas */}
                  {hasZeroPrice && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <p className="text-xs text-red-600 font-medium">Item com preço R$ 0,00 no carrinho</p>
                    </div>
                  )}

                  {/* Botão */}
                  <Button onClick={executeCheckout} disabled={!canCheckout}
                    className="w-full h-12 gap-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                    Confirmar Venda APP
                  </Button>

                  {cart.length === 0 && <p className="text-xs text-gray-400 text-center">Adicione produtos ao carrinho</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}