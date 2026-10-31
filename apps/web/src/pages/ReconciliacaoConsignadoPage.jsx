import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, AlertCircle, RefreshCw, ClipboardList, Plus, Trash2, Save,
  ChevronDown, ChevronRight, CheckCircle2, TrendingDown, TrendingUp, Minus as MinusIcon
} from 'lucide-react';

// ─── Reconciliação com Consignado ───────────────────────────────────────────
// Compara, por mercado consignado e por período, a quantidade que a
// Auditoria de Mercado calculou como vendida (mesma fonte que o Faturamento
// de Reabastecimento/Pedido Consignado usa: movimentacoes tipo='venda_mercado')
// com a quantidade que o próprio mercadinho reportou ter vendido — digitada
// manualmente aqui a partir do print/relatório que ele manda, já que não há
// acesso ao sistema deles. Cada reconciliação salva fica no histórico do
// mercado, pra dar pra enxergar um padrão ao longo de várias visitas, em vez
// de julgar cada print isoladamente.
export default function ReconciliacaoConsignadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [mercados, setMercados] = useState([]);
  const [produtosEmpresa, setProdutosEmpresa] = useState([]);
  const [mercadoId, setMercadoId] = useState('');

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10));

  const [isBuscando, setIsBuscando] = useState(false);
  const [isSalvando, setIsSalvando] = useState(false);
  const [error, setError] = useState(null);
  const [itens, setItens] = useState([]); // { produto_id, produto_nome, quantidade_calculada, valor_calculado, quantidade_reportada, valor_reportado }
  const [observacao, setObservacao] = useState('');
  const [buscou, setBuscou] = useState(false);

  const [historico, setHistorico] = useState([]);
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false);
  const [historicoExpandido, setHistoricoExpandido] = useState({});

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'Mercado')
      .eq('modelo_negocio', 'consignado')
      .order('nome')
      .then(({ data }) => setMercados(data || []));
    supabase.from('produtos')
      .select('id, nome, preco_bandeja_mercado, preco_bandeja')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data }) => setProdutosEmpresa(data || []));
  }, [empresaId]);

  const carregarHistorico = useCallback(async () => {
    if (!mercadoId) { setHistorico([]); return; }
    setIsLoadingHistorico(true);
    try {
      const { data, error: err } = await supabase
        .from('reconciliacoes_consignado')
        .select('id, data_inicio, data_fim, observacao, created_at, reconciliacoes_consignado_itens(id, produto_nome, quantidade_calculada, valor_calculado, quantidade_reportada, valor_reportado)')
        .eq('empresa_id', empresaId)
        .eq('local_id', mercadoId)
        .order('data_fim', { ascending: false })
        .limit(24);
      if (err) throw err;
      setHistorico(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar histórico', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingHistorico(false);
    }
  }, [empresaId, mercadoId, toast]);

  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDateBR = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  const buscarCalculado = async () => {
    if (!mercadoId) return;
    setIsBuscando(true);
    setError(null);
    setBuscou(false);
    try {
      const mercado = mercados.find(m => m.id === mercadoId);
      if (!mercado) throw new Error('Mercado não encontrado.');

      // Mesma fonte/filtro usado no Faturamento de Reabastecimento (Pedido
      // Consignado) pra calcular o que foi vendido nesse mercado — assim a
      // reconciliação nunca diverge do valor que efetivamente vai pra fatura.
      const { data: movs, error: movErr } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, valor_unitario, subtotal, total_final, produtos(nome)')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'venda_mercado')
        .eq('canal_venda', 'MERCADO')
        .eq('cliente_referencia', mercado.nome)
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);
      if (movErr) throw movErr;

      const porProduto = {};
      (movs || []).forEach(m => {
        if (!porProduto[m.produto_id]) {
          porProduto[m.produto_id] = {
            produto_id: m.produto_id,
            produto_nome: m.produtos?.nome || 'Produto',
            quantidade_calculada: 0,
            valor_calculado: 0,
          };
        }
        porProduto[m.produto_id].quantidade_calculada += Number(m.quantidade || 0);
        porProduto[m.produto_id].valor_calculado += Number(m.total_final || m.subtotal || 0);
      });

      const lista = Object.values(porProduto)
        .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome))
        .map(p => ({ ...p, quantidade_reportada: '', valor_reportado: '' }));

      setItens(lista);
      setBuscou(true);
      if (lista.length === 0) {
        toast({ title: 'Nada vendido nesse período', description: 'A auditoria não calculou nenhuma venda para esse mercado nesse intervalo de datas.' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBuscando(false);
    }
  };

  const atualizarItem = (produtoId, campo, valor) => {
    setItens(prev => prev.map(i => i.produto_id === produtoId ? { ...i, [campo]: valor } : i));
  };

  const removerItem = (produtoId) => {
    setItens(prev => prev.filter(i => i.produto_id !== produtoId));
  };

  const adicionarProdutoManual = (produtoId) => {
    if (!produtoId || itens.some(i => i.produto_id === produtoId)) return;
    const produto = produtosEmpresa.find(p => p.id === produtoId);
    if (!produto) return;
    setItens(prev => [...prev, {
      produto_id: produto.id,
      produto_nome: produto.nome,
      quantidade_calculada: 0,
      valor_calculado: 0,
      quantidade_reportada: '',
      valor_reportado: '',
    }].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)));
  };

  const totalCalculado = itens.reduce((s, i) => s + Number(i.quantidade_calculada || 0), 0);
  const totalReportado = itens.reduce((s, i) => s + Number(i.quantidade_reportada || 0), 0);
  const totalDiferenca = totalCalculado - totalReportado;

  const salvarReconciliacao = async () => {
    if (!mercadoId || itens.length === 0) return;
    setIsSalvando(true);
    try {
      const { data: recon, error: reconErr } = await supabase
        .from('reconciliacoes_consignado')
        .insert({
          empresa_id: empresaId,
          local_id: mercadoId,
          data_inicio: dataInicio,
          data_fim: dataFim,
          observacao: observacao || null,
        })
        .select().single();
      if (reconErr) throw reconErr;

      const itensParaSalvar = itens.map(i => ({
        reconciliacao_id: recon.id,
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        quantidade_calculada: Number(i.quantidade_calculada || 0),
        valor_calculado: Number(i.valor_calculado || 0),
        quantidade_reportada: Number(i.quantidade_reportada || 0),
        valor_reportado: i.valor_reportado === '' ? null : Number(i.valor_reportado),
      }));
      const { error: itensErr } = await supabase.from('reconciliacoes_consignado_itens').insert(itensParaSalvar);
      if (itensErr) throw itensErr;

      toast({ title: 'Reconciliação salva', description: 'Ficou registrada no histórico deste mercado.', className: 'bg-green-600 text-white border-none' });
      setObservacao('');
      carregarHistorico();
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSalvando(false);
    }
  };

  const toggleHistoricoItem = (id) => setHistoricoExpandido(prev => ({ ...prev, [id]: !prev[id] }));

  if (!empresaId) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-red-100 mt-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
      </div>
    </DashboardLayout>
  );

  return (
    <>
      <Helmet><title>Reconciliação com Consignado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-6xl mx-auto">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-red-500" /> Reconciliação com Consignado
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Compare o que a auditoria calculou como vendido com o que o mercadinho reportou (do print que ele manda) — e mantenha o histórico pra enxergar o padrão ao longo do tempo.
            </p>
          </div>

          {/* Filtros */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Mercado (consignado)</Label>
                <Select value={mercadoId} onValueChange={(val) => { setMercadoId(val); setItens([]); setBuscou(false); }}>
                  <SelectTrigger className="bg-white h-9"><SelectValue placeholder="Selecione o mercado" /></SelectTrigger>
                  <SelectContent>
                    {mercados.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {mercados.length === 0 && (
                  <p className="text-xs text-gray-400">Nenhum mercado com modelo "consignado" encontrado.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-white h-9" style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data fim</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-white h-9" style={{ fontSize: '14px' }} />
              </div>
            </div>
            <Button onClick={buscarCalculado} disabled={!mercadoId || isBuscando} className="gap-2">
              {isBuscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Buscar vendas calculadas da auditoria
            </Button>
            <p className="text-[11px] text-gray-500">
              Dica: peça pro mercadinho enviar o print com o período/filtro de data visível, e use o mesmo intervalo aqui — senão a comparação não é justa.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">{error}</div>
          )}

          {buscou && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  Calculado pela auditoria: {formatDateBR(dataInicio)} a {formatDateBR(dataFim)}
                </span>
                <div className="flex items-center gap-2">
                  <Select onValueChange={adicionarProdutoManual}>
                    <SelectTrigger className="bg-white h-8 text-xs w-56"><SelectValue placeholder="+ produto do print (manual)" /></SelectTrigger>
                    <SelectContent>
                      {produtosEmpresa.filter(p => !itens.some(i => i.produto_id === p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-gray-100">
                      <TableHead className="text-xs font-bold text-gray-500 uppercase">Produto</TableHead>
                      <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Calculado (auditoria)</TableHead>
                      <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Reportado (print)</TableHead>
                      <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Valor reportado</TableHead>
                      <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Diferença</TableHead>
                      <TableHead className="text-right text-xs font-bold text-gray-500 uppercase"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                          Nenhum produto vendido nesse período (segundo a auditoria). Use "+ produto do print" pra lançar manualmente o que o mercadinho reportou.
                        </TableCell>
                      </TableRow>
                    ) : itens.map(item => {
                      const qtdReportada = item.quantidade_reportada === '' ? null : Number(item.quantidade_reportada);
                      const diferenca = qtdReportada === null ? null : Number(item.quantidade_calculada) - qtdReportada;
                      return (
                        <TableRow key={item.produto_id} className="border-b border-gray-50">
                          <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
                          <TableCell className="text-right">
                            <div>{formatNumber(item.quantidade_calculada)}</div>
                            <div className="text-[11px] text-gray-400">{fmt(item.valor_calculado)}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} value={item.quantidade_reportada}
                              onChange={e => atualizarItem(item.produto_id, 'quantidade_reportada', e.target.value)}
                              placeholder="0" className="w-20 h-8 text-right ml-auto" style={{ fontSize: '14px' }} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} step="0.01" value={item.valor_reportado}
                              onChange={e => atualizarItem(item.produto_id, 'valor_reportado', e.target.value)}
                              placeholder="opcional" className="w-24 h-8 text-right ml-auto" style={{ fontSize: '14px' }} />
                          </TableCell>
                          <TableCell className="text-right">
                            {diferenca === null ? (
                              <span className="text-gray-300 text-sm">—</span>
                            ) : diferenca === 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3" /> bate
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${diferenca > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {diferenca > 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                {diferenca > 0 ? `${formatNumber(diferenca)} a menos reportado` : `${formatNumber(Math.abs(diferenca))} a mais reportado`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <button onClick={() => removerItem(item.produto_id)} title="Remover linha"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {itens.length > 0 && (
                <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-gray-700">
                    Total: {formatNumber(totalCalculado)} calculado × {formatNumber(totalReportado)} reportado
                  </span>
                  <span className={`font-bold ${totalDiferenca === 0 ? 'text-green-600' : totalDiferenca > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {totalDiferenca === 0 ? 'Bateu certinho' : totalDiferenca > 0 ? `${formatNumber(totalDiferenca)} un. a menos no relatório do mercadinho` : `${formatNumber(Math.abs(totalDiferenca))} un. a mais no relatório do mercadinho`}
                  </span>
                </div>
              )}

              <div className="p-5 border-t border-gray-100 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Input value={observacao} onChange={e => setObservacao(e.target.value)}
                    placeholder="Ex: print sem data visível, período pode não bater exatamente"
                    className="bg-white h-9" style={{ fontSize: '14px' }} />
                </div>
                <Button onClick={salvarReconciliacao} disabled={itens.length === 0 || isSalvando} className="gap-2 bg-red-600 hover:bg-red-700">
                  {isSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar reconciliação
                </Button>
              </div>
            </div>
          )}

          {/* Histórico */}
          {mercadoId && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-700">Histórico de reconciliações deste mercado</p>
              </div>
              {isLoadingHistorico ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-red-500" />
                </div>
              ) : historico.length === 0 ? (
                <p className="text-sm text-gray-400 p-6 text-center">Nenhuma reconciliação salva ainda pra esse mercado.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {historico.map(h => {
                    const itensH = h.reconciliacoes_consignado_itens || [];
                    const totalCalc = itensH.reduce((s, i) => s + Number(i.quantidade_calculada || 0), 0);
                    const totalRep = itensH.reduce((s, i) => s + Number(i.quantidade_reportada || 0), 0);
                    const diff = totalCalc - totalRep;
                    const isOpen = !!historicoExpandido[h.id];
                    return (
                      <div key={h.id}>
                        <button onClick={() => toggleHistoricoItem(h.id)} className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{formatDateBR(h.data_inicio)} a {formatDateBR(h.data_fim)}</p>
                              {h.observacao && <p className="text-xs text-gray-400">{h.observacao}</p>}
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${diff === 0 ? 'bg-green-100 text-green-700' : diff > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {diff === 0 ? 'bateu' : diff > 0 ? `-${formatNumber(diff)} un.` : `+${formatNumber(Math.abs(diff))} un.`}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-4 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-white hover:bg-white">
                                  <TableHead className="text-xs font-bold text-gray-500 uppercase">Produto</TableHead>
                                  <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Calculado</TableHead>
                                  <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Reportado</TableHead>
                                  <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Diferença</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {itensH.map(i => {
                                  const d = Number(i.quantidade_calculada) - Number(i.quantidade_reportada);
                                  return (
                                    <TableRow key={i.id} className="border-b border-gray-50">
                                      <TableCell className="text-sm text-gray-700">{i.produto_nome}</TableCell>
                                      <TableCell className="text-right text-sm">{formatNumber(i.quantidade_calculada)}</TableCell>
                                      <TableCell className="text-right text-sm">{formatNumber(i.quantidade_reportada)}</TableCell>
                                      <TableCell className={`text-right text-sm font-semibold ${d === 0 ? 'text-green-600' : d > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                        {d === 0 ? <MinusIcon className="h-3.5 w-3.5 inline" /> : (d > 0 ? `-${formatNumber(d)}` : `+${formatNumber(Math.abs(d))}`)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}