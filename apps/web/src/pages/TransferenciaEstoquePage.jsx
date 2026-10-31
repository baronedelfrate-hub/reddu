import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRightLeft, ArrowLeft, CheckCircle2, RotateCcw, MapPin, Package, MoveRight, Plus, Minus, Trash2, ShoppingCart, ChevronRight, Search, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { withEstoqueBandejas, STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';

export default function TransferenciaEstoquePage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Steps: 1=origem, 2=carrinho, 3=destino, 4=confirmacao
  const [step, setStep] = useState(1);

  const [todosLocais, setTodosLocais] = useState([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [carrinho, setCarrinho] = useState([]); // [{produto, lote, quantidade, maxQtd}]
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchProduto, setSearchProduto] = useState('');
  const [searchDestino, setSearchDestino] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  // Load locais
  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais').select('id, nome, tipo')
      .eq('empresa_id', empresaId).order('nome')
      .then(({ data }) => setTodosLocais(withEstoqueBandejas(data || [])));
  }, [empresaId]);

  // Load produtos with stock at origem (oldest lote first = FIFO)
  const loadProdutos = useCallback(async (localId) => {
    if (!localId || !empresaId) return;
    setLoadingProdutos(true);
    try {
      // Step 1: busca estoque_por_local com produtos
      const { data: estoqueData } = await supabase
        .from('estoque_por_local')
        .select('produto_id, quantidade_atual, lote_id, produtos(id, nome)')
        .eq('empresa_id', empresaId)
        .eq('local_id', localId)
        .gt('quantidade_atual', 0);

      if (!estoqueData || estoqueData.length === 0) {
        setProdutosDisponiveis([]);
        setLoadingProdutos(false);
        return;
      }

      // Step 2: busca dados dos lotes separadamente
      const loteIds = [...new Set(estoqueData.map(r => r.lote_id).filter(Boolean))];
      const { data: lotesData } = await supabase
        .from('lotes')
        .select('id, numero_lote, data_validade, tipo_lote, unidades_por_bandeja')
        .in('id', loteIds)
        .eq('ativo', true)
        .eq('lote_devolvido', false);

      const lotesMap = {};
      (lotesData || []).forEach(l => { lotesMap[l.id] = l; });

      // Group by produto — store all lotes sorted FIFO (oldest first)
      const map = {};
      (estoqueData || []).forEach(r => {
        if (!r.produtos) return;
        const pid = r.produto_id;
        const lote = lotesMap[r.lote_id];
        if (!lote) return;

        if (!map[pid]) {
          map[pid] = {
            produto_id: pid,
            produto_nome: r.produtos.nome,
            lotes: []
          };
        }
        map[pid].lotes.push({
          lote_id: lote.id,
          numero_lote: lote.numero_lote,
          data_validade: lote.data_validade,
          tipo_lote: lote.tipo_lote,
          unidades_por_bandeja: lote.unidades_por_bandeja,
          quantidade_atual: r.quantidade_atual,
        });
      });

      // Sort each produto's lotes FIFO (oldest validade first)
      Object.values(map).forEach(p => {
        p.lotes.sort((a, b) => new Date(a.data_validade || '9999') - new Date(b.data_validade || '9999'));
        // Set default to first lote (oldest)
        const first = p.lotes[0];
        p.lote_id = first.lote_id;
        p.numero_lote = first.numero_lote;
        p.data_validade = first.data_validade;
        p.tipo_lote = first.tipo_lote;
        p.unidades_por_bandeja = first.unidades_por_bandeja;
        p.quantidade_atual = first.quantidade_atual;
      });

      setProdutosDisponiveis(Object.values(map).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)));
    } finally {
      setLoadingProdutos(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (origemId) loadProdutos(origemId);
  }, [origemId, loadProdutos]);

  const selectedOrigem = todosLocais.find(l => l.id === origemId);
  const selectedDestino = todosLocais.find(l => l.id === destinoId);

  const isNoCarrinho = (produto_id) => carrinho.some(c => c.produto_id === produto_id);

  const addToCarrinho = (produto) => {
    if (isNoCarrinho(produto.produto_id)) return;
    setCarrinho(prev => [...prev, { ...produto, quantidade: 1 }]);
  };

  const removeFromCarrinho = (produto_id) => {
    setCarrinho(prev => prev.filter(c => c.produto_id !== produto_id));
  };

  const updateItemLote = (produto_id, lote) => {
    setCarrinho(prev => prev.map(c => c.produto_id !== produto_id ? c : {
      ...c,
      lote_id: lote.lote_id,
      numero_lote: lote.numero_lote,
      data_validade: lote.data_validade,
      tipo_lote: lote.tipo_lote,
      unidades_por_bandeja: lote.unidades_por_bandeja,
      quantidade_atual: lote.quantidade_atual,
      quantidade: Math.min(Number(c.quantidade), lote.quantidade_atual)
    }));
  };

  const updateQuantidade = (produto_id, value) => {
    setCarrinho(prev => prev.map(c => {
      if (c.produto_id !== produto_id) return c;
      const max = c.quantidade_atual;
      const qtd = Math.min(max, Math.max(1, parseInt(value) || 1));
      return { ...c, quantidade: qtd };
    }));
  };

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return d.split('T')[0].split('-').reverse().join('/');
  };

  const handleConfirmar = async () => {
    if (origemId === destinoId) { setSubmitError('Origem e destino não podem ser iguais.'); return; }
    if (origemId === STATIC_ESTOQUE_BANDEJAS_ID || destinoId === STATIC_ESTOQUE_BANDEJAS_ID) {
      setSubmitError('Local estático não pode ser usado nesta operação.'); return;
    }

    // Pra Estoque Móvel, não transfere na hora — cria um carregamento
    // pendente que só libera de verdade depois que alguém conferir
    // fisicamente o que foi carregado (tela "Conferência de Carregamento").
    const ehParaEstoqueMovel = (selectedDestino?.nome || '').trim().toUpperCase() === 'ESTOQUE MÓVEL';

    if (ehParaEstoqueMovel) {
      setIsSubmitting(true); setSubmitError(null);
      try {
        const { data: carregamento, error: erroCarregamento } = await supabase
          .from('carregamentos_pendentes')
          .insert({
            empresa_id: empresaId,
            origem_id: origemId,
            destino_id: destinoId,
            status: 'pendente',
            criado_por: currentUser?.id || null,
          })
          .select('id')
          .single();
        if (erroCarregamento) throw erroCarregamento;

        const itensPara = carrinho.map(item => ({
          carregamento_id: carregamento.id,
          produto_id: item.produto_id,
          lote_id: item.lote_id,
          numero_lote: item.numero_lote,
          tipo_lote: item.tipo_lote || 'base',
          unidades_por_bandeja: item.unidades_por_bandeja || null,
          quantidade_esperada: item.quantidade,
        }));
        const { error: erroItens } = await supabase.from('carregamentos_pendentes_itens').insert(itensPara);
        if (erroItens) throw erroItens;

        setSuccessData({
          sucessos: carrinho, origem: selectedOrigem?.nome, destino: selectedDestino?.nome,
          pendente: true,
        });
        toast({ title: 'Carregamento registrado!', description: 'Aguardando conferência antes de liberar no Estoque Móvel.', className: 'bg-amber-600 text-white border-none' });
      } catch (err) {
        setSubmitError(`Erro ao registrar carregamento: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true); setSubmitError(null);
    const erros = [];
    const sucessos = [];

    for (const item of carrinho) {
      try {
        const { error } = await supabase.rpc('transferir_estoque_rpc', {
          p_empresa_id: empresaId,
          p_lote_id: item.lote_id,
          p_local_origem_id: origemId,
          p_local_destino_id: destinoId,
          p_quantidade: item.quantidade,
          p_produto_id: item.produto_id,
          p_tipo_lote: item.tipo_lote || 'base',
          p_unidades_por_bandeja: item.unidades_por_bandeja || null
        });
        if (error) throw error;
        sucessos.push(item);
      } catch (err) {
        erros.push({ item, erro: err.message });
      }
    }

    setIsSubmitting(false);

    if (erros.length === 0) {
      setSuccessData({ sucessos, origem: selectedOrigem?.nome, destino: selectedDestino?.nome });
      toast({ title: `${sucessos.length} item(s) transferido(s) com sucesso!`, className: 'bg-green-600 text-white border-none' });
    } else if (sucessos.length > 0) {
      setSubmitError(`${sucessos.length} transferido(s) com sucesso. ${erros.length} com erro: ${erros.map(e => e.item.produto_nome).join(', ')}`);
    } else {
      setSubmitError(`Erro: ${erros[0]?.erro || 'Falha ao transferir.'}`);
    }
  };

  const resetAll = () => {
    setStep(1); setOrigemId(''); setDestinoId('');
    setCarrinho([]); setSuccessData(null); setSubmitError(null);
  };

  // Step indicators
  const stepLabels = ['Origem', 'Carrinho', 'Destino', 'Confirmar'];
  const stepIcons = [MapPin, ShoppingCart, MoveRight, CheckCircle2];

  return (
    <>
      <Helmet><title>Transferência - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <ArrowRightLeft className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Transferência de Estoque</h1>
                <p className="text-gray-500 text-sm mt-0.5">Mova múltiplos produtos entre locais.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {/* Success screen */}
          {successData ? (
            <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${successData.pendente ? 'border-amber-200' : 'border-green-200'}`}>
              <div className={`p-6 text-center ${successData.pendente ? 'bg-amber-50' : 'bg-green-50'}`}>
                {successData.pendente
                  ? <ClipboardList className="h-14 w-14 text-amber-500 mx-auto mb-3" />
                  : <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                }
                <h2 className={`text-xl font-bold ${successData.pendente ? 'text-amber-800' : 'text-green-800'}`}>
                  {successData.pendente ? 'Carregamento Registrado — Aguardando Conferência' : 'Transferência Concluída!'}
                </h2>
                {successData.pendente && (
                  <p className="text-amber-700 text-sm mt-1 max-w-md mx-auto">
                    O estoque ainda não foi movido. Vá em "Conferência de Carregamento" pra conferir item por item
                    e liberar de verdade pro Estoque Móvel.
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${successData.pendente ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>{successData.origem}</span>
                  <ArrowRightLeft className={`h-4 w-4 ${successData.pendente ? 'text-amber-500' : 'text-green-500'}`} />
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${successData.pendente ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>{successData.destino}</span>
                </div>
              </div>
              <div className="p-6 space-y-2">
                {successData.sucessos.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                      <p className="text-xs text-gray-500">Lote: {item.numero_lote}</p>
                    </div>
                    <span className="text-lg font-black text-blue-600">{item.quantidade} <span className="text-xs font-normal text-gray-500">un.</span></span>
                  </div>
                ))}
                {successData.pendente && (
                  <Button onClick={() => navigate('/dashboard/conferencia-carregamento')} className="w-full gap-2 mt-4 bg-amber-600 hover:bg-amber-700">
                    <ClipboardList className="h-4 w-4" /> Ir pra Conferência de Carregamento
                  </Button>
                )}
                <Button onClick={resetAll} variant={successData.pendente ? 'outline' : 'default'} className="w-full gap-2 mt-2">
                  <RotateCcw className="h-4 w-4" /> Nova Transferência
                </Button>
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
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${active ? 'bg-blue-600 text-white shadow-md' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                          </div>
                          <span className={`text-xs font-semibold ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
                        </button>
                        {idx < stepLabels.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${step > n ? 'bg-green-400' : 'bg-gray-100'}`} />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="p-6">

                {/* Resumo selecionado */}
                {(origemId || carrinho.length > 0 || destinoId) && (
                  <div className="flex flex-wrap gap-2 mb-5">
                    {origemId && (
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-200">
                        <MapPin className="h-3 w-3" />{selectedOrigem?.nome}
                      </span>
                    )}
                    {carrinho.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-purple-200">
                        <ShoppingCart className="h-3 w-3" />{carrinho.length} produto(s)
                      </span>
                    )}
                    {destinoId && (
                      <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200">
                        <MoveRight className="h-3 w-3" />{selectedDestino?.nome}
                      </span>
                    )}
                  </div>
                )}

                {/* STEP 1: Origem */}
                {step === 1 && (
                  <div className="space-y-3">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-500" /> De qual local você quer transferir?
                    </h3>
                    <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
                      {todosLocais.map(local => (
                        <button key={local.id} onClick={() => { setOrigemId(local.id); setCarrinho([]); setStep(2); }}
                          className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-4 w-4 text-blue-600" />
                          </div>
                          <span className="font-semibold text-gray-800 flex-1">{local.nome}</span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 2: Carrinho */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-purple-500" /> Selecione os produtos
                      </h3>
                      {carrinho.length > 0 && (
                        <Button onClick={() => setStep(3)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                          Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Carrinho atual */}
                    {carrinho.length > 0 && (
                      <div className="bg-purple-50 rounded-xl p-3 space-y-2 border border-purple-100">
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Carrinho ({carrinho.length})</p>
                        {carrinho.map(item => (
                          <div key={item.produto_id} className="bg-white rounded-lg p-3 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                              <button onClick={() => removeFromCarrinho(item.produto_id)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            {/* Lote select */}
                            {item.lotes && item.lotes.length > 0 && (
                              <select
                                value={item.lote_id || ''}
                                onChange={e => {
                                  const lote = item.lotes.find(l => l.lote_id === e.target.value);
                                  if (lote) updateItemLote(item.produto_id, lote);
                                }}
                                className="w-full h-9 px-2 border border-gray-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none"
                                style={{ fontSize: '14px' }}
                              >
                                {item.lotes.map(l => (
                                  <option key={l.lote_id} value={l.lote_id}>
                                    {l.numero_lote} · {l.quantidade_atual} un · Val: {formatDate(l.data_validade)}
                                  </option>
                                ))}
                              </select>
                            )}
                            {/* Quantidade */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuantidade(item.produto_id, item.quantidade - 1)}
                                disabled={item.quantidade <= 1}
                                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center font-bold text-gray-600 hover:bg-gray-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent flex-shrink-0"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                value={item.quantidade}
                                onChange={e => updateQuantidade(item.produto_id, e.target.value)}
                                min={1}
                                max={item.quantidade_atual}
                                className="w-16 h-8 text-center font-bold border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none"
                                style={{ fontSize: '14px' }}
                              />
                              <button
                                type="button"
                                onClick={() => updateQuantidade(item.produto_id, item.quantidade + 1)}
                                disabled={item.quantidade >= item.quantidade_atual}
                                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center font-bold text-gray-600 hover:bg-gray-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent flex-shrink-0"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-xs text-gray-400">de {item.quantidade_atual} disponíveis</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Lista de produtos disponíveis */}
                    {/* Busca de produto */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar produto ou lote..."
                        value={searchProduto}
                        onChange={e => setSearchProduto(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none"
                        style={{ fontSize: '16px' }}
                      />
                    </div>

                    {loadingProdutos ? (
                      <div className="flex items-center justify-center py-8 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <span className="text-gray-500">Carregando produtos...</span>
                      </div>
                    ) : produtosDisponiveis.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl">
                        <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium">Nenhum produto com estoque neste local.</p>
                        <button onClick={() => setStep(1)} className="text-blue-600 text-sm mt-2 hover:underline">← Escolher outro local</button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Produtos disponíveis</p>
                        {produtosDisponiveis
                        .filter(p => !searchProduto || 
                          p.produto_nome.toLowerCase().includes(searchProduto.toLowerCase()) ||
                          p.numero_lote?.toLowerCase().includes(searchProduto.toLowerCase()))
                        .map(p => {
                          const noCarrinho = isNoCarrinho(p.produto_id);
                          return (
                            <button key={p.produto_id} onClick={() => addToCarrinho(p)} disabled={noCarrinho}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                noCarrinho ? 'border-green-200 bg-green-50 opacity-70 cursor-default' : 'border-gray-100 hover:border-purple-300 hover:bg-purple-50'
                              }`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${noCarrinho ? 'bg-green-500' : 'bg-gray-100'}`}>
                                {noCarrinho ? <CheckCircle2 className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4 text-gray-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-sm truncate">{p.produto_nome}</p>
                                <p className="text-xs text-gray-500">Lote: {p.numero_lote} · Val: {formatDate(p.data_validade)} · {p.quantidade_atual} un.</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <button onClick={() => { setStep(1); setSearchProduto(''); }} className="text-sm text-gray-500 hover:text-gray-700">← Voltar</button>
                  </div>
                )}

                {/* STEP 3: Destino */}
                {step === 3 && (
                  <div className="space-y-3">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <MoveRight className="h-5 w-5 text-green-500" /> Para qual local deseja transferir?
                    </h3>
                    {/* Busca de destino */}
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar local..."
                        value={searchDestino}
                        onChange={e => setSearchDestino(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none"
                        style={{ fontSize: '16px' }}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                      {todosLocais.filter(l => l.id !== origemId && (!searchDestino || l.nome.toLowerCase().includes(searchDestino.toLowerCase()))).map(local => (
                        <button key={local.id} onClick={() => { setDestinoId(local.id); setStep(4); }}
                          className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-green-300 hover:bg-green-50 transition-all text-left">
                          <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-4 w-4 text-green-600" />
                          </div>
                          <span className="font-semibold text-gray-800 flex-1">{local.nome}</span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setStep(2); setSearchDestino(''); }} className="text-sm text-gray-500 hover:text-gray-700">← Voltar</button>
                  </div>
                )}

                {/* STEP 4: Confirmação */}
                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" /> Confirme a transferência
                    </h3>

                    {/* Origem → Destino */}
                    <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
                      <div className="flex-1 text-center">
                        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Origem</p>
                        <p className="font-bold text-gray-900">{selectedOrigem?.nome}</p>
                      </div>
                      <ArrowRightLeft className="h-6 w-6 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 text-center">
                        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Destino</p>
                        <p className="font-bold text-green-700">{selectedDestino?.nome}</p>
                      </div>
                    </div>

                    {/* Itens do carrinho */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{carrinho.length} produto(s) a transferir</p>
                      {carrinho.map(item => (
                        <div key={item.produto_id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                            <p className="text-xs text-gray-500">Lote: {item.numero_lote} · Val: {formatDate(item.data_validade)}</p>
                          </div>
                          <span className="text-xl font-black text-blue-600">{item.quantidade}<span className="text-xs font-normal text-gray-500 ml-1">un.</span></span>
                        </div>
                      ))}
                    </div>

                    {submitError && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">{submitError}</div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700 px-4">← Voltar</button>
                      <Button onClick={handleConfirmar} disabled={isSubmitting}
                        className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl gap-2">
                        {isSubmitting ? (
                          <><Loader2 className="h-5 w-5 animate-spin" /> Transferindo {carrinho.length} item(s)...</>
                        ) : (
                          <><ArrowRightLeft className="h-5 w-5" /> Confirmar {carrinho.length} Transferência(s)</>
                        )}
                      </Button>
                    </div>
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