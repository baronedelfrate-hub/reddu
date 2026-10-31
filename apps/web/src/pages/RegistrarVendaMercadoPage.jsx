import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, ArrowLeft, CheckCircle2, Clock, MapPin, Package, Layers, ChevronRight, Search, Banknote, QrCode, CreditCard, Calendar, RotateCcw } from 'lucide-react';
import { withEstoqueBandejas, STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';
import { recordMarketplaceSale } from '@/services/salesService';
import { VALID_PAYMENT_METHODS, getPaymentMethodDisplay } from '@/utils/validatePaymentMethod';
import { validateAndFixPaymentData } from '@/utils/paymentMethodDataValidator';
import { formatDateBR } from '@/utils/dateFormatter';

export default function RegistrarVendaMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Steps: 1=mercado, 2=produto, 3=lote, 4=detalhes+tipo
  const [step, setStep] = useState(1);

  const [mercados, setMercados] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [lotes, setLotes] = useState([]);

  const [mercadoId, setMercadoId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [formaPagamento, setFormaPagamento] = useState('dinheiro');
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10));

  const [searchProduto, setSearchProduto] = useState('');
  const [searchMercado, setSearchMercado] = useState('');
  const [carrinho, setCarrinho] = useState([]); // [{produto, lote, quantidade}]
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false);
  const [isLoadingLotes, setIsLoadingLotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Load mercados
  useEffect(() => {
    if (!empresaId) return;
    setIsLoading(true);
    supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome')
      .then(({ data }) => { setMercados(data || []); setIsLoading(false); });
  }, [empresaId]);

  // Load produtos when mercado selected
  const loadProdutos = useCallback(async (mId) => {
    if (!mId || !empresaId) return;
    setIsLoadingProdutos(true);
    const { data } = await supabase.from('estoque_por_local')
      .select('produto_id, produto_nome').eq('empresa_id', empresaId)
      .eq('local_id', mId).gt('quantidade_atual', 0);
    const map = new Map();
    (data || []).forEach(r => { if (!map.has(r.produto_id)) map.set(r.produto_id, { id: r.produto_id, nome: r.produto_nome }); });
    setProdutos(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    setIsLoadingProdutos(false);
  }, [empresaId]);

  // Load lotes when produto selected
  const loadLotes = useCallback(async (mId, pId) => {
    if (!mId || !pId || !empresaId) return;
    setIsLoadingLotes(true);
    const { data: estoqueData } = await supabase.from('estoque_por_local')
      .select('lote_id, numero_lote, quantidade_atual, tipo_lote')
      .eq('empresa_id', empresaId).eq('local_id', mId).eq('produto_id', pId).gt('quantidade_atual', 0);
    if (!estoqueData?.length) { setLotes([]); setIsLoadingLotes(false); return; }
    const loteIds = estoqueData.map(r => r.lote_id);
    const { data: lotesData } = await supabase.from('lotes').select('id, data_validade').in('id', loteIds).eq('ativo', true).eq('lote_devolvido', false);
    const lotesMap = new Map((lotesData || []).map(l => [l.id, l.data_validade]));
    setLotes(estoqueData.map(r => ({
      id: r.lote_id, numero_lote: r.numero_lote,
      quantidade_disponivel: Number(r.quantidade_atual),
      tipo_lote: r.tipo_lote,
      data_validade: lotesMap.get(r.lote_id) || null
    })));
    setIsLoadingLotes(false);
  }, [empresaId]);

  const selectedMercado = mercados.find(m => m.id === mercadoId);
  const selectedProduto = produtos.find(p => p.id === produtoId);
  const selectedLote = lotes.find(l => l.id === loteId);
  const maxQtd = selectedLote?.quantidade_disponivel || 0;

  const handleSaleTypeSelection = async (saleType) => {
    if (!selectedMercado || carrinho.length === 0) return;
    if (mercadoId === STATIC_ESTOQUE_BANDEJAS_ID) return;

    // Validate all items
    for (const item of carrinho) {
      if (!item.lote_id) { toast({ title: 'Atenção', description: `Selecione o lote para: ${item.produto_nome}`, variant: 'destructive' }); return; }
      const qtd = Number(item.quantidade);
      if (!qtd || qtd <= 0 || qtd > item.maxQtd) { toast({ title: 'Quantidade inválida', description: `Verifique a quantidade de: ${item.produto_nome} (máx: ${item.maxQtd})`, variant: 'destructive' }); return; }
    }

    setIsSubmitting(true);
    const validatedPayment = validateAndFixPaymentData(formaPagamento);
    const status = saleType === 'DIRETA' ? 'CONCILIADO' : 'PENDENTE';
    const financeiro_baixado = saleType === 'DIRETA';
    const isoDate = new Date(`${dataVenda}T12:00:00.000Z`).toISOString();

    try {
      // Step 1: busca preços de todos os produtos
      const itensComPreco = await Promise.all(carrinho.map(async (item) => {
        const qtd = Number(item.quantidade);
        const { data: loteData } = await supabase.from('lotes').select('quantidade, tipo_lote').eq('id', item.lote_id).single();
        const { data: prodData } = await supabase.from('produtos').select('preco_venda, preco_unitario, preco_bandeja, preco_bandeja_mercado').eq('id', item.produto_id).single();
        const precoVenda = loteData.tipo_lote === 'bandeja' ? Number(prodData.preco_bandeja_mercado || prodData.preco_bandeja || 0) : Number(prodData.preco_venda || prodData.preco_unitario || 0);
        return { ...item, qtd, loteData, precoVenda, subtotal: qtd * precoVenda };
      }));

      const totalGeral = itensComPreco.reduce((s, i) => s + i.subtotal, 0);

      // Step 2: cria UMA ÚNICA venda com o total geral
      const { venda_id, cliente_referencia, canal_venda } = await recordMarketplaceSale(
        empresaId, mercadoId, selectedMercado.nome,
        { total_final: totalGeral },
        { forma_pagamento: validatedPayment },
        { status, financeiro_baixado, data_venda: dataVenda }
      );

      // Step 3: registra movimentação e atualiza lote para cada item
      const erros = [];
      for (const item of itensComPreco) {
        try {
          const { data: movData, error: movError } = await supabase.from('movimentacoes').insert({
            empresa_id: empresaId, tipo: 'venda',
            produto_id: item.produto_id, lote_id: item.lote_id,
            local_origem_id: mercadoId, quantidade: item.qtd,
            data_movimentacao: isoDate,
            observacao: `Venda no Mercado (${saleType === 'DIRETA' ? 'Venda Direta' : 'Consignado'})`,
            venda_id, canal_venda, cliente_referencia,
            forma_pagamento: validatedPayment,
            status, financeiro_baixado,
            data_baixa: saleType === 'DIRETA' ? isoDate : null,
            valor_unitario: item.precoVenda,
            subtotal: item.subtotal,
            total_final: item.subtotal
          }).select().single();

          if (movError) throw new Error(movError.message);

          const { error: updateError } = await supabase.from('lotes')
            .update({ quantidade: item.loteData.quantidade - item.qtd }).eq('id', item.lote_id);
          if (updateError) {
            await supabase.from('movimentacoes').delete().eq('id', movData.id);
            throw new Error(updateError.message);
          }
        } catch (err) {
          erros.push({ nome: item.produto_nome, erro: err.message });
        }
      }

      if (window.navigator.vibrate) window.navigator.vibrate(100);

      setSuccessData({
        saleType, itens: carrinho, total: totalGeral,
        mercado: selectedMercado.nome, pagamento: getPaymentMethodDisplay(formaPagamento),
        erros
      });

    } catch (error) {
      if (window.navigator.vibrate) window.navigator.vibrate([200, 50, 200]);
      toast({ title: 'Erro ao registrar', description: error.message || 'Erro inesperado.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep(1); setMercadoId(''); setProdutoId(''); setLoteId('');
    setQuantidade('1'); setFormaPagamento('dinheiro');
    setDataVenda(new Date().toISOString().slice(0, 10));
    setSearchProduto(''); setSearchMercado(''); setSuccessData(null); setCarrinho([]);
  };

  const novaVendaMesmoMercado = () => {
    setProdutoId(''); setLoteId(''); setQuantidade('1');
    setFormaPagamento('dinheiro'); setSearchProduto(''); setSuccessData(null); setCarrinho([]);
    setStep(2);
  };

  const isNoCarrinho = (produto_id) => carrinho.some(c => c.produto_id === produto_id);

  const addToCarrinho = (produto) => {
    if (isNoCarrinho(produto.id)) return;
    setCarrinho(prev => [...prev, {
      produto_id: produto.id,
      produto_nome: produto.nome,
      lote_id: null,
      numero_lote: null,
      data_validade: null,
      tipo_lote: null,
      quantidade: '1',
      maxQtd: 0,
      loadingLotes: false,
      lotes: []
    }]);
  };

  const removeFromCarrinho = (produto_id) => {
    setCarrinho(prev => prev.filter(c => c.produto_id !== produto_id));
  };

  const updateItemCarrinho = (produto_id, updates) => {
    setCarrinho(prev => prev.map(c => c.produto_id === produto_id ? { ...c, ...updates } : c));
  };

  const loadLotesCarrinho = async (produto_id) => {
    updateItemCarrinho(produto_id, { loadingLotes: true });
    const { data: estoqueData } = await supabase.from('estoque_por_local')
      .select('lote_id, numero_lote, quantidade_atual, tipo_lote')
      .eq('empresa_id', empresaId).eq('local_id', mercadoId)
      .eq('produto_id', produto_id).gt('quantidade_atual', 0);
    if (!estoqueData?.length) { updateItemCarrinho(produto_id, { loadingLotes: false, lotes: [] }); return; }
    const loteIds = estoqueData.map(r => r.lote_id);
    const { data: lotesData } = await supabase.from('lotes').select('id, data_validade').in('id', loteIds).eq('ativo', true).eq('lote_devolvido', false);
    const lotesMap = new Map((lotesData || []).map(l => [l.id, l.data_validade]));
    const lotes = estoqueData.map(r => ({
      id: r.lote_id, numero_lote: r.numero_lote,
      quantidade_disponivel: Number(r.quantidade_atual),
      tipo_lote: r.tipo_lote,
      data_validade: lotesMap.get(r.lote_id) || null
    }));
    // Auto-select first lote (oldest)
    const firstLote = lotes[0];
    updateItemCarrinho(produto_id, {
      loadingLotes: false, lotes,
      lote_id: firstLote.id,
      numero_lote: firstLote.numero_lote,
      data_validade: firstLote.data_validade,
      tipo_lote: firstLote.tipo_lote,
      maxQtd: firstLote.quantidade_disponivel,
      quantidade: '1'
    });
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  // Step indicators
  const stepLabels = ['Mercado', 'Produtos', 'Finalizar'];
  const stepIcons = [MapPin, Package, ShoppingCart];

  return (
    <>
      <Helmet><title>Venda no Mercado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Venda no Mercado</h1>
                <p className="text-gray-500 text-sm mt-0.5">Registre vendas nos pontos de venda.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {/* Success */}
          {successData ? (
            <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
              <div className={`p-6 text-center ${successData.saleType === 'DIRETA' ? 'bg-green-50' : 'bg-amber-50'}`}>
                {successData.saleType === 'DIRETA'
                  ? <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                  : <Clock className="h-14 w-14 text-amber-500 mx-auto mb-3" />
                }
                <h2 className="text-xl font-bold text-gray-800">
                  {successData.saleType === 'DIRETA' ? 'Venda Direta Registrada!' : 'Venda Consignado Registrada!'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{successData.mercado}</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {successData.itens?.map((item, i) => (
                    <div key={i} className="col-span-2 bg-gray-50 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                        <p className="text-xs text-gray-500">Lote: {item.numero_lote}</p>
                      </div>
                      <p className="text-lg font-black text-blue-600">{item.quantidade} <span className="text-xs font-normal text-gray-500">un.</span></p>
                    </div>
                  ))}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Total</p>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{formatCurrency(successData.total)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Status</p>
                    <p className="font-bold text-gray-900 mt-0.5 text-sm">{successData.saleType === 'DIRETA' ? '✅ Conciliado' : '⏳ Pendente'}</p>
                  </div>
                  {successData.erros?.length > 0 && (
                    <div className="col-span-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-red-600 mb-1">⚠ {successData.erros.length} item(s) com erro:</p>
                      {successData.erros.map((e, i) => <p key={i} className="text-xs text-red-500">{e.nome}: {e.erro}</p>)}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button variant="outline" onClick={novaVendaMesmoMercado} className="gap-2">
                    <ShoppingCart className="h-4 w-4" /> Outra Venda
                  </Button>
                  <Button onClick={resetAll} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    <RotateCcw className="h-4 w-4" /> Novo Mercado
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Step indicators */}
              <div className="border-b border-gray-100 px-6 py-4">
                <div className="flex items-center justify-between">
                  {stepLabels.map((label, idx) => {
                    const Icon = stepIcons[idx];
                    const n = idx + 1;
                    const done = step > n;
                    const active = step === n;
                    return (
                      <React.Fragment key={n}>
                        <button onClick={() => done && setStep(n)} className={`flex flex-col items-center gap-1 ${done ? 'cursor-pointer' : 'cursor-default'}`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all ${active ? 'bg-purple-600 text-white shadow-md' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                          </div>
                          <span className={`text-xs font-semibold ${active ? 'text-purple-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
                        </button>
                        {idx < stepLabels.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${step > n ? 'bg-green-400' : 'bg-gray-100'}`} />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="p-6">

                {/* Resumo */}
                {(mercadoId || produtoId || loteId) && (
                  <div className="flex flex-wrap gap-2 mb-5">
                    {mercadoId && <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-purple-200"><MapPin className="h-3 w-3" />{selectedMercado?.nome}</span>}
                    {produtoId && <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-200"><Package className="h-3 w-3" />{selectedProduto?.nome}</span>}
                    {loteId && <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-200"><Layers className="h-3 w-3" />{selectedLote?.numero_lote} ({maxQtd} un.)</span>}
                  </div>
                )}

                {/* STEP 1: Mercado */}
                {step === 1 && (
                  <div className="space-y-3">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-purple-500" /> Selecione o mercado
                    </h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" placeholder="Buscar mercado..." value={searchMercado}
                        onChange={e => setSearchMercado(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none"
                        style={{ fontSize: '16px' }} />
                    </div>
                    {isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                        {mercados.filter(m => !searchMercado || m.nome.toLowerCase().includes(searchMercado.toLowerCase())).map(m => (
                          <button key={m.id} onClick={() => { setMercadoId(m.id); loadProdutos(m.id); setSearchMercado(''); setStep(2); }}
                            className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-purple-300 hover:bg-purple-50 transition-all text-left">
                            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <MapPin className="h-4 w-4 text-purple-600" />
                            </div>
                            <span className="font-semibold text-gray-800 flex-1">{m.nome}</span>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: Produtos — multi-select com carrinho */}
                {step === 2 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-500" /> Selecione os produtos
                      </h3>
                      {carrinho.length > 0 && (
                        <Button onClick={() => setStep(4)} className="gap-2 bg-purple-600 hover:bg-purple-700 h-9 text-sm">
                          Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Carrinho */}
                    {carrinho.length > 0 && (
                      <div className="bg-blue-50 rounded-xl p-3 space-y-2 border border-blue-100">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Selecionados ({carrinho.length})</p>
                        {carrinho.map(item => (
                          <div key={item.produto_id} className="bg-white rounded-lg p-3 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                              <button onClick={() => removeFromCarrinho(item.produto_id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                            {item.loadingLotes ? (
                              <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3 w-3 animate-spin" /> Carregando lotes...</div>
                            ) : item.lotes.length === 0 ? (
                              <p className="text-xs text-red-500">Sem lotes disponíveis</p>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select value={item.lote_id || ''} onChange={e => {
                                  const lote = item.lotes.find(l => l.id === e.target.value);
                                  if (lote) updateItemCarrinho(item.produto_id, { lote_id: lote.id, numero_lote: lote.numero_lote, data_validade: lote.data_validade, tipo_lote: lote.tipo_lote, maxQtd: lote.quantidade_disponivel, quantidade: '1' });
                                }} className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none" style={{ fontSize: '14px' }}>
                                  {item.lotes.map(l => (
                                    <option key={l.id} value={l.id}>{l.numero_lote} · {l.quantidade_disponivel} un · Val: {formatDateBR(l.data_validade)}</option>
                                  ))}
                                </select>
                                <input type="number" value={item.quantidade}
                                  onChange={e => updateItemCarrinho(item.produto_id, { quantidade: e.target.value })}
                                  min={1} max={item.maxQtd}
                                  className="w-16 h-8 text-center font-bold border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                                  style={{ fontSize: '14px' }} />
                                <span className="text-xs text-gray-400 whitespace-nowrap">/{item.maxQtd}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" placeholder="Buscar produto..." value={searchProduto}
                        onChange={e => setSearchProduto(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none"
                        style={{ fontSize: '16px' }} />
                    </div>

                    {isLoadingProdutos ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                    ) : produtos.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium text-gray-500">Nenhum produto com estoque neste mercado.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                        {produtos.filter(p => !searchProduto || p.nome.toLowerCase().includes(searchProduto.toLowerCase())).map(p => {
                          const noCarrinho = isNoCarrinho(p.id);
                          return (
                            <button key={p.id} onClick={() => { if (!noCarrinho) { addToCarrinho(p); loadLotesCarrinho(p.id); } }}
                              disabled={noCarrinho}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${noCarrinho ? 'border-green-200 bg-green-50 opacity-70 cursor-default' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${noCarrinho ? 'bg-green-500' : 'bg-blue-100'}`}>
                                {noCarrinho ? <CheckCircle2 className="h-4 w-4 text-white" /> : <Package className="h-4 w-4 text-blue-600" />}
                              </div>
                              <span className="font-semibold text-gray-800 text-sm flex-1">{p.nome}</span>
                              {!noCarrinho && <ChevronRight className="h-4 w-4 text-gray-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => { setStep(1); setCarrinho([]); }} className="text-sm text-gray-500 hover:text-gray-700">← Voltar</button>
                  </div>
                )}



                {/* STEP 4: Detalhes + Tipo de Venda */}
                {step === 4 && (
                  <div className="space-y-5">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-purple-500" /> Finalize a venda
                    </h3>

                    {/* Resumo do carrinho */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resumo da Venda</p>
                        <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          {carrinho.length} produto(s)
                        </span>
                      </div>
                      {carrinho.map((item, i) => (
                        <div key={i} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-gray-900 text-sm truncate">{item.produto_nome}</p>
                            <p className="text-xs text-gray-500">Lote: {item.numero_lote} · Val: {formatDateBR(item.data_validade)}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <span className="text-xl font-black text-blue-600">{item.quantidade}</span>
                            <span className="text-xs text-gray-400">un.</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Forma de pagamento */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-700">Forma de Pagamento</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: 'emerald' },
                          { value: 'pix', label: 'PIX', icon: QrCode, color: 'sky' },
                          { value: 'cartao_debito', label: 'Débito', icon: CreditCard, color: 'violet' },
                          { value: 'cartao_credito', label: 'Crédito', icon: CreditCard, color: 'violet' },
                          { value: 'nao_informado', label: 'Não Informado', icon: ShoppingCart, color: 'gray' },
                        ].map(({ value, label, icon: Icon, color }) => (
                          <button key={value} onClick={() => setFormaPagamento(value)}
                            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                              formaPagamento === value
                                ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                                : 'border-gray-100 hover:border-gray-300 text-gray-600'
                            }`}>
                            <Icon className="h-4 w-4" />{label}
                            {formaPagamento === value && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Data */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Calendar className="h-4 w-4" />Data da Venda</p>
                      <input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)}
                        className="w-full h-10 px-3 border border-gray-200 rounded-xl focus:border-purple-400 focus:outline-none text-sm"
                        style={{ fontSize: '16px' }} />
                    </div>

                    {/* Tipo de Venda — integrado */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <p className="text-sm font-semibold text-gray-700">Como deseja registrar?</p>
                      <div className="grid grid-cols-1 gap-3">
                        <button onClick={() => handleSaleTypeSelection('DIRETA')} disabled={isSubmitting}
                          className="flex items-start gap-4 p-4 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 active:scale-95 transition-all text-left disabled:opacity-50">
                          {isSubmitting ? <Loader2 className="h-7 w-7 text-green-600 animate-spin flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="h-7 w-7 text-green-600 flex-shrink-0 mt-0.5" />}
                          <div>
                            <p className="font-bold text-green-800 text-base">Venda Direta</p>
                            <p className="text-sm text-green-600 mt-0.5">Pagamento recebido agora. Conciliada automaticamente.</p>
                          </div>
                        </button>
                        <button onClick={() => handleSaleTypeSelection('CONSIGNADO')} disabled={isSubmitting}
                          className="flex items-start gap-4 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 active:scale-95 transition-all text-left disabled:opacity-50">
                          {isSubmitting ? <Loader2 className="h-7 w-7 text-amber-600 animate-spin flex-shrink-0 mt-0.5" /> : <Clock className="h-7 w-7 text-amber-600 flex-shrink-0 mt-0.5" />}
                          <div>
                            <p className="font-bold text-amber-800 text-base">Venda Consignado</p>
                            <p className="text-sm text-amber-600 mt-0.5">Pagamento posterior. Registrada como pendente.</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">← Voltar</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}