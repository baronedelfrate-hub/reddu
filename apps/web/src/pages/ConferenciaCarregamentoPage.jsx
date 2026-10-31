import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ClipboardList, ArrowLeft, ArrowRightLeft, CheckCircle2, Loader2,
  Package, Calendar, AlertTriangle, ChevronDown, ChevronUp, ChevronRight, Truck,
} from 'lucide-react';

export default function ConferenciaCarregamentoPage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [carregamentos, setCarregamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [carregamentoAberto, setCarregamentoAberto] = useState(null);
  const [detalheHistorico, setDetalheHistorico] = useState(null);
  const [itemChecado, setItemChecado] = useState({}); // { item_id: true } — checklist visual, não bloqueia nada
  const [conferenciaAtual, setConferenciaAtual] = useState({}); // { item_id: quantidade_conferida }
  const [decisaoSobra, setDecisaoSobra] = useState({}); // { item_id: 'levar_tudo' | 'devolver' }
  const [completarFalta, setCompletarFalta] = useState({}); // { item_id: { lote_id, quantidade, lotesDisponiveis } }
  const [carregandoLotes, setCarregandoLotes] = useState({});
  const [isSalvando, setIsSalvando] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [historico, setHistorico] = useState([]);

  const formatDateTime = (d) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return d.split('T')[0].split('-').reverse().join('/');
  };

  const carregarPendentes = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('carregamentos_pendentes')
        .select(`
          id, origem_id, destino_id, status, criado_em, criado_por,
          locais_origem:locais!carregamentos_pendentes_origem_id_fkey(nome),
          locais_destino:locais!carregamentos_pendentes_destino_id_fkey(nome),
          carregamentos_pendentes_itens(
            id, produto_id, lote_id, numero_lote, tipo_lote, unidades_por_bandeja,
            quantidade_esperada, quantidade_conferida, conferido,
            produtos(nome)
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('status', 'pendente')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Validade e lote de origem são buscados à parte, de forma protegida —
      // se algo der errado aqui, a tela continua abrindo normalmente, só sem
      // essas duas informações extras.
      try {
        const todosItens = (data || []).flatMap(c => c.carregamentos_pendentes_itens || []);
        const loteIds = [...new Set(todosItens.map(i => i.lote_id).filter(Boolean))];

        if (loteIds.length > 0) {
          const { data: lotesInfo } = await supabase.from('lotes')
            .select('id, data_validade, lote_origem_id, tipo_lote')
            .in('id', loteIds);
          const loteInfoMap = {};
          (lotesInfo || []).forEach(l => { loteInfoMap[l.id] = l; });

          // Sobe a cadeia até achar o lote tipo 'base' — mesmo raciocínio já
          // usado na Auditoria de Mercado (bandeja pode ter como origem
          // outra bandeja, não só o lote base direto).
          let idsParaResolver = [...new Set(
            Object.values(loteInfoMap).map(l => l.lote_origem_id).filter(Boolean)
          )];
          let nivelMap = {};
          let tentativas = 0;
          while (idsParaResolver.length > 0 && tentativas < 5) {
            const { data: nivelData } = await supabase.from('lotes')
              .select('id, numero_lote, tipo_lote, lote_origem_id')
              .in('id', idsParaResolver);
            (nivelData || []).forEach(l => { nivelMap[l.id] = l; });
            idsParaResolver = [...new Set(
              (nivelData || [])
                .filter(l => l.tipo_lote !== 'base' && l.lote_origem_id)
                .map(l => l.lote_origem_id)
            )];
            tentativas++;
          }

          todosItens.forEach(item => {
            const infoLote = loteInfoMap[item.lote_id];
            item.data_validade = infoLote?.data_validade || null;

            let atual = infoLote?.lote_origem_id ? nivelMap[infoLote.lote_origem_id] : null;
            let safety = 0;
            while (atual && atual.tipo_lote !== 'base' && atual.lote_origem_id && safety < 5) {
              atual = nivelMap[atual.lote_origem_id];
              safety++;
            }
            item.lote_origem_numero = atual ? atual.numero_lote : null;
          });
        }
      } catch (errExtra) {
        console.error('Erro ao buscar validade/origem dos lotes (não bloqueia a tela):', errExtra);
      }

      setCarregamentos(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, toast]);

  const carregarHistorico = useCallback(async () => {
    if (!empresaId) return;
    try {
      const { data, error } = await supabase
        .from('carregamentos_pendentes')
        .select(`
          id, criado_em, conferido_em, status,
          locais_origem:locais!carregamentos_pendentes_origem_id_fkey(nome),
          locais_destino:locais!carregamentos_pendentes_destino_id_fkey(nome),
          carregamentos_pendentes_itens(
            id, produto_id, lote_id, numero_lote, tipo_lote,
            quantidade_esperada, quantidade_conferida,
            produtos(nome)
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('status', 'conferido')
        .order('conferido_em', { ascending: false })
        .limit(20);
      if (error) throw error;
      setHistorico(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar histórico', description: err.message, variant: 'destructive' });
    }
  }, [empresaId, toast]);

  useEffect(() => { carregarPendentes(); }, [carregarPendentes]);

  const abrirConferencia = (carregamento) => {
    setCarregamentoAberto(carregamento);
    const inicial = {};
    (carregamento.carregamentos_pendentes_itens || []).forEach(item => {
      inicial[item.id] = item.quantidade_esperada; // já vem preenchido com o esperado, só ajusta se for diferente
    });
    setConferenciaAtual(inicial);
    setDecisaoSobra({});
    setCompletarFalta({});
    setItemChecado({});
  };

  const alternarCheckItem = (itemId) => {
    setItemChecado(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const alterarConferencia = (itemId, valor) => {
    const qtd = Math.max(0, parseInt(valor) || 0);
    setConferenciaAtual(prev => ({ ...prev, [itemId]: qtd }));
  };

  const abrirCompletarFalta = async (item) => {
    setCarregandoLotes(prev => ({ ...prev, [item.id]: true }));
    try {
      const { data: estoqueLocal, error } = await supabase
        .from('estoque_por_local')
        .select('lote_id, quantidade_atual, lotes(id, numero_lote, data_validade)')
        .eq('empresa_id', empresaId)
        .eq('local_id', carregamentoAberto.origem_id)
        .eq('produto_id', item.produto_id)
        .gt('quantidade_atual', 0)
        .neq('lote_id', item.lote_id);
      if (error) throw error;

      const lotesDisponiveis = (estoqueLocal || [])
        .filter(e => e.lotes)
        .map(e => ({ lote_id: e.lote_id, numero_lote: e.lotes.numero_lote, data_validade: e.lotes.data_validade, disponivel: e.quantidade_atual }));

      setCompletarFalta(prev => ({
        ...prev,
        [item.id]: { ativo: true, loteId: '', quantidade: 0, lotesDisponiveis },
      }));
    } catch (err) {
      toast({ title: 'Erro ao buscar lotes', description: err.message, variant: 'destructive' });
    } finally {
      setCarregandoLotes(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const fecharCompletarFalta = (itemId) => {
    setCompletarFalta(prev => {
      const novo = { ...prev };
      delete novo[itemId];
      return novo;
    });
  };

  const alterarCompletarFalta = (itemId, campo, valor) => {
    setCompletarFalta(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [campo]: valor },
    }));
  };

  const finalizarConferencia = async () => {
    if (!carregamentoAberto) return;
    setIsSalvando(true);
    try {
      const itens = carregamentoAberto.carregamentos_pendentes_itens || [];
      let devolucoesRegistradas = 0;
      let completamentosRegistrados = 0;

      for (const item of itens) {
        const qtdConferida = conferenciaAtual[item.id] ?? item.quantidade_esperada;
        const sobra = qtdConferida > item.quantidade_esperada;
        const decisao = decisaoSobra[item.id] || 'devolver';

        // Sobra: se "devolver", só libera o esperado (o excedente nunca saiu
        // da origem, então fica lá — só registramos que sobrou). Se "levar
        // tudo", libera o total contado de verdade.
        const qtdParaTransferirLoteOriginal = sobra && decisao === 'devolver'
          ? item.quantidade_esperada
          : qtdConferida;

        if (qtdParaTransferirLoteOriginal > 0) {
          const { error } = await supabase.rpc('transferir_estoque_rpc', {
            p_empresa_id: empresaId,
            p_lote_id: item.lote_id,
            p_local_origem_id: carregamentoAberto.origem_id,
            p_local_destino_id: carregamentoAberto.destino_id,
            p_quantidade: qtdParaTransferirLoteOriginal,
            p_produto_id: item.produto_id,
            p_tipo_lote: item.tipo_lote || 'base',
            p_unidades_por_bandeja: item.unidades_por_bandeja || null,
          });
          if (error) throw error;
        }
        if (sobra && decisao === 'devolver') devolucoesRegistradas++;

        // Falta completada com outro lote da origem: transferência extra,
        // separada, do lote escolhido.
        const completar = completarFalta[item.id];
        if (completar?.loteId && completar.quantidade > 0) {
          const { error: erroCompletar } = await supabase.rpc('transferir_estoque_rpc', {
            p_empresa_id: empresaId,
            p_lote_id: completar.loteId,
            p_local_origem_id: carregamentoAberto.origem_id,
            p_local_destino_id: carregamentoAberto.destino_id,
            p_quantidade: completar.quantidade,
            p_produto_id: item.produto_id,
            p_tipo_lote: item.tipo_lote || 'base',
            p_unidades_por_bandeja: item.unidades_por_bandeja || null,
          });
          if (erroCompletar) throw erroCompletar;
          completamentosRegistrados++;
        }

        await supabase.from('carregamentos_pendentes_itens').update({
          quantidade_conferida: qtdConferida + (completar?.quantidade || 0),
          conferido: true,
        }).eq('id', item.id);
      }

      await supabase.from('carregamentos_pendentes').update({
        status: 'conferido',
        conferido_por: currentUser?.id || null,
        conferido_em: new Date().toISOString(),
      }).eq('id', carregamentoAberto.id);

      const divergencias = itens.filter(item => (conferenciaAtual[item.id] ?? item.quantidade_esperada) !== item.quantidade_esperada);

      let descricao = 'Liberado no Estoque Móvel, tudo conferido certinho.';
      if (divergencias.length > 0) {
        const partes = [`${divergencias.length} item(ns) com diferença`];
        if (devolucoesRegistradas > 0) partes.push(`${devolucoesRegistradas} devolvido(s) à origem`);
        if (completamentosRegistrados > 0) partes.push(`${completamentosRegistrados} completado(s) com outro lote`);
        descricao = `Liberado no Estoque Móvel. ${partes.join(', ')}.`;
      }

      toast({
        title: 'Conferência concluída!',
        description: descricao,
        className: divergencias.length > 0 ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white',
      });

      setCarregamentoAberto(null);
      setConferenciaAtual({});
      setDecisaoSobra({});
      setCompletarFalta({});
      carregarPendentes();
    } catch (err) {
      toast({ title: 'Erro ao finalizar conferência', description: err.message, variant: 'destructive' });
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <>
      <Helmet><title>Conferência de Carregamento - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 text-amber-600 p-3 rounded-xl">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Conferência de Carregamento</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  Confira item por item antes de liberar pro Estoque Móvel.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {!carregamentoAberto ? (
            <>
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
              ) : carregamentos.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhum carregamento pendente de conferência. 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {carregamentos.map(c => (
                    <button
                      key={c.id}
                      onClick={() => abrirConferencia(c)}
                      className="w-full bg-white rounded-2xl border border-amber-200 shadow-sm p-5 text-left hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Truck className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 flex items-center gap-1.5">
                              {c.locais_origem?.nome} <ArrowRightLeft className="h-3.5 w-3.5 text-gray-400" /> {c.locais_destino?.nome}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="h-3 w-3" /> {formatDateTime(c.criado_em)} · {(c.carregamentos_pendentes_itens || []).length} item(ns)
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full">
                          Conferir
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => { setMostrarHistorico(!mostrarHistorico); if (!mostrarHistorico) carregarHistorico(); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  {mostrarHistorico ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {mostrarHistorico ? 'Esconder' : 'Ver'} histórico de conferências
                </button>
                {mostrarHistorico && (
                  <div className="mt-3 space-y-2">
                    {historico.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">Nenhuma conferência ainda.</p>
                    ) : historico.map(h => {
                      const itens = h.carregamentos_pendentes_itens || [];
                      const comDivergencia = itens.some(i => i.quantidade_conferida !== i.quantidade_esperada);
                      return (
                        <button
                          key={h.id}
                          onClick={() => setDetalheHistorico(h)}
                          className="w-full bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                              {h.locais_origem?.nome} <ArrowRightLeft className="h-3 w-3 text-gray-400" /> {h.locais_destino?.nome}
                            </p>
                            <p className="text-xs text-gray-400">Conferido em {formatDateTime(h.conferido_em)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {comDivergencia ? (
                              <span className="text-xs font-semibold bg-amber-50 text-amber-600 px-2 py-1 rounded-full flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Divergência
                              </span>
                            ) : (
                              <span className="text-xs font-semibold bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full">OK</span>
                            )}
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5 text-amber-500" /> Conferindo carregamento
                  </h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5">
                    {carregamentoAberto.locais_origem?.nome} <ArrowRightLeft className="h-3.5 w-3.5" /> {carregamentoAberto.locais_destino?.nome}
                  </p>
                  <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                    {Object.values(itemChecado).filter(Boolean).length} de {(carregamentoAberto.carregamentos_pendentes_itens || []).length} itens marcados como conferidos
                  </p>
                </div>
                <button onClick={() => { setCarregamentoAberto(null); setConferenciaAtual({}); setItemChecado({}); }} className="text-sm text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                <Package className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Confira fisicamente cada item. O número já vem preenchido com o que era esperado —
                  se achar diferente, ajuste pra quantidade real que está aí. Se tiver <strong>a mais</strong>,
                  escolha se leva tudo ou devolve o excedente. Se tiver <strong>a menos</strong>, dá pra
                  completar com outro lote do mesmo produto na origem.
                </p>
              </div>

              <div className="space-y-2">
                {(carregamentoAberto.carregamentos_pendentes_itens || []).map(item => {
                  const qtdConferida = conferenciaAtual[item.id] ?? item.quantidade_esperada;
                  const divergente = qtdConferida !== item.quantidade_esperada;
                  const sobra = qtdConferida > item.quantidade_esperada;
                  const falta = qtdConferida < item.quantidade_esperada;
                  const decisao = decisaoSobra[item.id] || 'devolver';
                  const completar = completarFalta[item.id];
                  const faltaRestante = Math.max(0, item.quantidade_esperada - qtdConferida - (completar?.quantidade || 0));

                  const checado = !!itemChecado[item.id];

                  return (
                    <div key={item.id} className={`rounded-xl p-4 border-2 ${checado ? 'bg-emerald-50 border-emerald-200' : divergente ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => alternarCheckItem(item.id)}
                            title="Marcar como conferido"
                            className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              checado ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 hover:border-emerald-400'
                            }`}
                          >
                            {checado && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </button>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{item.produtos?.nome}</p>
                            <p className="text-xs font-mono text-gray-500 flex items-center gap-1.5 flex-wrap">
                              <span>Lote: {item.numero_lote}</span>
                              {item.tipo_lote && (
                                <span className="font-sans bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold">
                                  {item.tipo_lote}
                                </span>
                              )}
                              <span>· Val: {formatDate(item.data_validade)}</span>
                            </p>
                            {item.lote_origem_numero && (
                              <p className="text-xs font-mono text-purple-500 mt-0.5">↳ Origem: {item.lote_origem_numero}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">Esperado: <strong>{item.quantidade_esperada}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-600 w-28 flex-shrink-0">Achei de verdade:</span>
                        <input
                          type="number"
                          min={0}
                          value={qtdConferida}
                          onChange={e => alterarConferencia(item.id, e.target.value)}
                          className={`w-20 h-9 text-center font-bold border-2 rounded-xl focus:outline-none ${divergente ? 'border-amber-400 text-amber-700' : 'border-gray-200 focus:border-teal-400'}`}
                          style={{ fontSize: '16px' }}
                        />
                        {divergente && (
                          <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" /> {sobra ? 'A mais que o esperado' : 'A menos que o esperado'}
                          </span>
                        )}
                      </div>

                      {/* Sobra: escolher se leva tudo ou devolve o excedente */}
                      {sobra && (
                        <div className="mt-3 pt-3 border-t border-amber-200 space-y-1.5">
                          <p className="text-xs font-semibold text-amber-700">
                            Tem {qtdConferida - item.quantidade_esperada} a mais. O que fazer?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDecisaoSobra(prev => ({ ...prev, [item.id]: 'devolver' }))}
                              className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border-2 transition-colors ${
                                decisao === 'devolver' ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-700'
                              }`}
                            >
                              Devolver o excedente ({item.quantidade_esperada} vai)
                            </button>
                            <button
                              onClick={() => setDecisaoSobra(prev => ({ ...prev, [item.id]: 'levar_tudo' }))}
                              className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border-2 transition-colors ${
                                decisao === 'levar_tudo' ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-700'
                              }`}
                            >
                              Levar tudo ({qtdConferida} vai)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Falta: opção de completar com outro lote da origem */}
                      {falta && (
                        <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                          {!completar ? (
                            <button
                              onClick={() => abrirCompletarFalta(item)}
                              disabled={carregandoLotes[item.id]}
                              className="text-xs font-semibold px-3 py-2 rounded-lg border-2 border-amber-300 text-amber-700 bg-white hover:bg-amber-50 flex items-center gap-1.5"
                            >
                              {carregandoLotes[item.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                              Completar com outro lote da origem
                            </button>
                          ) : (
                            <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-amber-700">Completar falta de {faltaRestante} un.</p>
                                <button onClick={() => fecharCompletarFalta(item.id)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                              </div>
                              {completar.lotesDisponiveis.length === 0 ? (
                                <p className="text-xs text-gray-500">Nenhum outro lote desse produto disponível na origem.</p>
                              ) : (
                                <>
                                  <select
                                    value={completar.loteId}
                                    onChange={e => alterarCompletarFalta(item.id, 'loteId', e.target.value)}
                                    className="w-full h-9 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                  >
                                    <option value="">Selecione o lote...</option>
                                    {completar.lotesDisponiveis.map(l => (
                                      <option key={l.lote_id} value={l.lote_id}>{l.numero_lote} · {l.disponivel} disponíveis</option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Quantidade:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={item.quantidade_esperada - qtdConferida}
                                      value={completar.quantidade}
                                      onChange={e => alterarCompletarFalta(item.id, 'quantidade', Math.max(0, Math.min(item.quantidade_esperada - qtdConferida, parseInt(e.target.value) || 0)))}
                                      className="w-16 h-8 text-center font-bold border border-gray-200 rounded-lg text-sm focus:outline-none"
                                      style={{ fontSize: '14px' }}
                                    />
                                    <span className="text-xs text-gray-400">de até {item.quantidade_esperada - qtdConferida}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                onClick={finalizarConferencia}
                disabled={isSalvando}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-2"
              >
                {isSalvando ? <><Loader2 className="h-5 w-5 animate-spin" /> Liberando...</> : <><CheckCircle2 className="h-5 w-5" /> Confirmar Conferência e Liberar</>}
              </Button>
            </div>
          )}
        </div>

        {detalheHistorico && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetalheHistorico(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 flex items-center gap-1.5">
                    {detalheHistorico.locais_origem?.nome} <ArrowRightLeft className="h-3.5 w-3.5 text-gray-400" /> {detalheHistorico.locais_destino?.nome}
                  </p>
                  <p className="text-xs text-gray-500">Conferido em {formatDateTime(detalheHistorico.conferido_em)}</p>
                </div>
                <button onClick={() => setDetalheHistorico(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto p-5 space-y-2">
                {(detalheHistorico.carregamentos_pendentes_itens || []).map(item => {
                  const divergente = item.quantidade_conferida !== item.quantidade_esperada;
                  return (
                    <div key={item.id} className={`rounded-xl p-3 border ${divergente ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{item.produtos?.nome}</p>
                          <p className="text-xs font-mono text-gray-500 flex items-center gap-1.5">
                            <span>Lote: {item.numero_lote}</span>
                            {item.tipo_lote && (
                              <span className="font-sans bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold">
                                {item.tipo_lote}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-500">Esperado: <strong>{item.quantidade_esperada}</strong></p>
                          <p className={`text-sm font-bold ${divergente ? 'text-amber-700' : 'text-emerald-700'}`}>
                            Conferido: {item.quantidade_conferida}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </>
  );
}