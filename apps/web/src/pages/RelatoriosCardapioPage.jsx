import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  BarChart3, Wallet, Receipt, ShoppingBag, Users, Clock, MapPin, Download,
  Banknote, QrCode, CreditCard, HelpCircle, Search, ArrowUpRight, Loader2, AlertCircle, Trophy,
} from 'lucide-react';

const STATUS_LABEL = {
  PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', EM_PREPARO: 'Em preparo',
  PRONTO: 'Pronto', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const ICONE_PAGAMENTO = { dinheiro: Banknote, pix: QrCode, cartao_debito: CreditCard, cartao_credito: CreditCard };

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function diasAtrasISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function formatarDataLabel(dataIso) {
  const [, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}`;
}
function formatPreco(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function capitalizar(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ABAS_VALIDAS = ['visao-geral', 'pedidos', 'itens', 'entradas', 'clientes', 'areas'];

export default function RelatoriosCardapioPage() {
  const { empresaId } = useAuth();
  const { aba } = useParams();
  const navigate = useNavigate();
  const abaAtiva = ABAS_VALIDAS.includes(aba) ? aba : 'visao-geral';
  const irParaAba = (novaAba) => {
    navigate(novaAba === 'visao-geral' ? '/dashboard/cardapio/relatorios' : `/dashboard/cardapio/relatorios/${novaAba}`);
  };

  const [dataInicio, setDataInicio] = useState(diasAtrasISO(29));
  const [dataFim, setDataFim] = useState(hojeISO());
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [clientes, setClientes] = useState([]);

  const fetchDados = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const inicioISO = `${dataInicio}T00:00:00.000Z`;
      const fimISO = `${dataFim}T23:59:59.999Z`;
      const [{ data: pedidosData, error: pedidosError }, { data: clientesData, error: clientesError }] = await Promise.all([
        supabase
          .from('pedidos_cardapio')
          .select('*, pedidos_cardapio_itens(*), vendas(forma_pagamento)')
          .eq('empresa_id', empresaId)
          .gte('created_at', inicioISO)
          .lte('created_at', fimISO)
          .order('created_at', { ascending: true }),
        supabase
          .from('cardapio_clientes')
          .select('*')
          .eq('empresa_id', empresaId),
      ]);
      if (pedidosError) throw pedidosError;
      if (clientesError) throw clientesError;
      setPedidos(pedidosData || []);
      setClientes(clientesData || []);
    } catch (error) {
      console.error('Erro ao carregar relatórios do cardápio:', error);
    } finally {
      setLoading(false);
    }
  }, [empresaId, dataInicio, dataFim]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  const aplicarPeriodoRapido = (dias) => {
    setDataInicio(diasAtrasISO(dias - 1));
    setDataFim(hojeISO());
  };

  // ─── Derivados compartilhados ───────────────────────────────────────────
  const pedidosValidos = useMemo(() => pedidos.filter((p) => p.status !== 'CANCELADO'), [pedidos]);
  const pedidosCancelados = useMemo(() => pedidos.filter((p) => p.status === 'CANCELADO'), [pedidos]);

  const kpis = useMemo(() => {
    const totalVendas = pedidosValidos.reduce((s, p) => s + Number(p.total || 0), 0);
    const totalPedidos = pedidosValidos.length;
    const ticketMedio = totalPedidos ? totalVendas / totalPedidos : 0;
    return { totalVendas, totalPedidos, ticketMedio };
  }, [pedidosValidos]);

  const { clientesAtivos, clientesInativos } = useMemo(() => {
    const ativos = []; const inativos = [];
    clientes.forEach((c) => {
      const dias = c.ultimo_pedido_em
        ? Math.floor((Date.now() - new Date(c.ultimo_pedido_em).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      if (dias !== null && dias <= 30) ativos.push(c); else inativos.push(c);
    });
    return { clientesAtivos: ativos, clientesInativos: inativos };
  }, [clientes]);

  const topClientes = useMemo(
    () => [...clientes].sort((a, b) => (b.total_pedidos || 0) - (a.total_pedidos || 0)).slice(0, 10),
    [clientes]
  );

  const dadosPorDia = useMemo(() => {
    const mapa = {};
    pedidos.forEach((p) => {
      const dia = p.created_at?.slice(0, 10);
      if (!dia) return;
      if (!mapa[dia]) mapa[dia] = { data: dia, Pedidos: 0, Entregues: 0, Vendas: 0 };
      if (p.status !== 'CANCELADO') {
        mapa[dia].Pedidos += 1;
        mapa[dia].Vendas += Number(p.total || 0);
      }
      if (p.status === 'ENTREGUE') mapa[dia].Entregues += 1;
    });
    return Object.values(mapa)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ ...d, label: formatarDataLabel(d.data), Vendas: Math.round(d.Vendas * 100) / 100 }));
  }, [pedidos]);

  const formasPagamento = useMemo(() => {
    const mapa = {};
    pedidosValidos.forEach((p) => {
      const forma = p.vendas?.forma_pagamento;
      const chave = !forma || forma.toLowerCase() === 'a combinar' ? 'a_combinar' : forma.toLowerCase();
      const label = chave === 'a_combinar' ? 'A combinar / pendente' : capitalizar(forma);
      if (!mapa[chave]) mapa[chave] = { chave, label, valor: 0, pedidos: 0 };
      mapa[chave].valor += Number(p.total || 0);
      mapa[chave].pedidos += 1;
    });
    return Object.values(mapa).sort((a, b) => b.valor - a.valor);
  }, [pedidosValidos]);

  const horariosPico = useMemo(() => {
    const mapa = {};
    pedidosValidos.forEach((p) => {
      const h = new Date(p.created_at).getHours();
      mapa[h] = (mapa[h] || 0) + 1;
    });
    return Object.keys(mapa)
      .map((h) => Number(h))
      .sort((a, b) => a - b)
      .map((h) => ({ hora: `${h}h`, Pedidos: mapa[h] }));
  }, [pedidosValidos]);

  const areasEntrega = useMemo(() => {
    const mapa = {};
    pedidosValidos.forEach((p) => {
      if (p.tipo_entrega !== 'entrega') return;
      const bairro = p.bairro?.trim() || null;
      const chave = bairro || '__sem_bairro__';
      if (!mapa[chave]) mapa[chave] = { bairro: bairro || 'Sem bairro registrado', pedidos: 0, faturamento: 0, taxas: 0 };
      mapa[chave].pedidos += 1;
      mapa[chave].faturamento += Number(p.total || 0);
      mapa[chave].taxas += Number(p.taxa_entrega || 0);
    });
    return Object.values(mapa).sort((a, b) => b.pedidos - a.pedidos);
  }, [pedidosValidos]);
  const temBairroRegistrado = areasEntrega.some((a) => a.bairro !== 'Sem bairro registrado');

  // ─── Visão Geral: alterna o gráfico ─────────────────────────────────────
  const [subviewDashboard, setSubviewDashboard] = useState('pedidos');

  // ─── Itens: ranking por dia da semana ───────────────────────────────────
  const [filtroDiaItens, setFiltroDiaItens] = useState('GERAL');
  const itensRanking = useMemo(() => {
    const idsCancelados = new Set(pedidosCancelados.map((p) => p.id));
    const mapa = {};
    let totalUnidades = 0;
    pedidos.forEach((p) => {
      if (idsCancelados.has(p.id)) return;
      (p.pedidos_cardapio_itens || []).forEach((item) => {
        if (item.nome_item?.startsWith('+ ')) return; // adicionais não entram no ranking
        if (filtroDiaItens !== 'GERAL') {
          const dia = new Date(item.created_at || p.created_at).getDay();
          if (String(dia) !== String(filtroDiaItens)) return;
        }
        if (!mapa[item.nome_item]) mapa[item.nome_item] = 0;
        mapa[item.nome_item] += Number(item.quantidade || 0);
        totalUnidades += Number(item.quantidade || 0);
      });
    });
    return Object.entries(mapa)
      .map(([nome, qtd]) => ({ nome, qtd, pct: totalUnidades ? (qtd / totalUnidades) * 100 : 0 }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [pedidos, pedidosCancelados, filtroDiaItens]);
  const totalUnidadesVendidas = useMemo(() => itensRanking.reduce((s, i) => s + i.qtd, 0), [itensRanking]);

  // ─── Pedidos: tabela com filtros ────────────────────────────────────────
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroEntrega, setFiltroEntrega] = useState('all');
  const [buscaPedidos, setBuscaPedidos] = useState('');
  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter((p) => (filtroStatus === 'all' ? true : p.status === filtroStatus))
      .filter((p) => (filtroEntrega === 'all' ? true : p.tipo_entrega === filtroEntrega))
      .filter((p) => {
        const termo = buscaPedidos.trim().toLowerCase();
        if (!termo) return true;
        return (
          p.cliente_nome?.toLowerCase().includes(termo) ||
          p.cliente_telefone?.includes(termo) ||
          String(p.numero_pedido || '').includes(termo)
        );
      })
      .slice()
      .reverse();
  }, [pedidos, filtroStatus, filtroEntrega, buscaPedidos]);

  const handleExportarExcel = () => {
    const linhas = pedidosFiltrados.map((p) => ({
      'Nº Pedido': p.numero_pedido,
      Cliente: p.cliente_nome,
      Telefone: p.cliente_telefone,
      Data: new Date(p.created_at).toLocaleString('pt-BR'),
      Entrega: p.tipo_entrega === 'entrega' ? 'Entrega' : 'Retirada',
      Pagamento: p.vendas?.forma_pagamento || 'A combinar',
      Status: STATUS_LABEL[p.status] || p.status,
      Valor: Number(p.total || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `pedidos_cardapio_${dataInicio}_a_${dataFim}.xlsx`);
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet><title>Relatórios - Cardápio Digital - Reddu</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-primary" /> Relatórios do Cardápio Digital
              </h1>
              <p className="text-gray-600 mt-1 text-sm">Faturamento, pedidos, itens mais vendidos e clientes da sua loja online.</p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex gap-1">
                {[{ l: '7d', d: 7 }, { l: '30d', d: 30 }, { l: '90d', d: 90 }].map((p) => (
                  <button
                    key={p.l}
                    onClick={() => aplicarPeriodoRapido(p.d)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  >
                    {p.l}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">De</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-white text-gray-900 border-gray-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Até</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-white text-gray-900 border-gray-300" />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center flex flex-col items-center bg-white rounded-lg shadow border border-gray-200">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-3" />
              <p className="text-gray-600">Carregando relatórios...</p>
            </div>
          ) : (
            <>
              {/* KPIs sempre visíveis */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-emerald-100 text-emerald-700 rounded-lg p-2.5"><Wallet className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{formatPreco(kpis.totalVendas)}</p>
                      <p className="text-xs text-gray-500">Total das vendas</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-sky-100 text-sky-700 rounded-lg p-2.5"><Receipt className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{formatPreco(kpis.ticketMedio)}</p>
                      <p className="text-xs text-gray-500">Ticket médio</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-violet-100 text-violet-700 rounded-lg p-2.5"><ShoppingBag className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{kpis.totalPedidos}</p>
                      <p className="text-xs text-gray-500">Total de pedidos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-rose-100 text-rose-700 rounded-lg p-2.5"><Users className="h-5 w-5" /></div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{clientesAtivos.length}</p>
                      <p className="text-xs text-gray-500">Clientes ativos (30d)</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Tabs value={abaAtiva} onValueChange={irParaAba}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
                  <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                  <TabsTrigger value="itens">Itens</TabsTrigger>
                  <TabsTrigger value="entradas">Entradas</TabsTrigger>
                  <TabsTrigger value="clientes">Clientes</TabsTrigger>
                  <TabsTrigger value="areas">Áreas de entrega</TabsTrigger>
                </TabsList>

                {/* ── Visão Geral ───────────────────────────────────────── */}
                <TabsContent value="visao-geral">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { v: 'pedidos', l: 'Pedidos e Entregas' },
                          { v: 'vendas', l: 'Total das vendas' },
                          { v: 'pagamento', l: 'Formas de pagamento' },
                        ].map((o) => (
                          <button
                            key={o.v}
                            onClick={() => setSubviewDashboard(o.v)}
                            className={`px-3 py-1.5 rounded-full text-sm border ${subviewDashboard === o.v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {dadosPorDia.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-12">Sem pedidos no período selecionado.</p>
                      ) : subviewDashboard === 'pedidos' ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={dadosPorDia} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="Pedidos" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Entregues" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : subviewDashboard === 'vendas' ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={dadosPorDia} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                            <Tooltip formatter={(v) => formatPreco(v)} />
                            <Bar dataKey="Vendas" fill="#059669" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="space-y-3 py-2">
                          {formasPagamento.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">Sem vendas no período selecionado.</p>
                          ) : formasPagamento.map((f) => {
                            const pct = kpis.totalVendas ? Math.round((f.valor / kpis.totalVendas) * 100) : 0;
                            return (
                              <div key={f.chave}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-gray-700">{f.label} <span className="text-gray-400">· {f.pedidos} pedido{f.pedidos !== 1 ? 's' : ''}</span></span>
                                  <span className="text-gray-900 font-medium">{formatPreco(f.valor)} ({pct}%)</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Pedidos ───────────────────────────────────────────── */}
                <TabsContent value="pedidos">
                  <Card>
                    <CardHeader className="flex-row items-start justify-between space-y-0 flex-wrap gap-3">
                      <div>
                        <CardTitle className="text-lg">Relatório de Pedidos</CardTitle>
                        <CardDescription>{pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''} no período selecionado.</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleExportarExcel} disabled={pedidosFiltrados.length === 0} className="gap-2">
                        <Download className="h-4 w-4" /> Exportar Excel
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <Input placeholder="Buscar por cliente, telefone ou nº" className="pl-9" value={buscaPedidos} onChange={(e) => setBuscaPedidos(e.target.value)} />
                        </div>
                        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                          <SelectTrigger className="w-44 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={filtroEntrega} onValueChange={setFiltroEntrega}>
                          <SelectTrigger className="w-40 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="Entrega" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Entrega e retirada</SelectItem>
                            <SelectItem value="entrega">Entrega</SelectItem>
                            <SelectItem value="retirada">Retirada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {pedidosFiltrados.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-12">Nenhum pedido encontrado com esses filtros.</p>
                      ) : (
                        <div className="overflow-x-auto max-h-[520px] overflow-y-auto border rounded-lg">
                          <Table>
                            <TableHeader className="bg-gray-50 sticky top-0">
                              <TableRow>
                                <TableHead>Nº</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Entrega</TableHead>
                                <TableHead>Pagamento</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pedidosFiltrados.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium text-gray-900">#{p.numero_pedido}</TableCell>
                                  <TableCell className="text-gray-700">{p.cliente_nome}</TableCell>
                                  <TableCell className="text-gray-500 text-sm">{new Date(p.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                                  <TableCell className="text-gray-600 text-sm">{p.tipo_entrega === 'entrega' ? 'Entrega' : 'Retirada'}</TableCell>
                                  <TableCell className="text-gray-600 text-sm">{p.vendas?.forma_pagamento && p.vendas.forma_pagamento.toLowerCase() !== 'a combinar' ? capitalizar(p.vendas.forma_pagamento) : 'A combinar'}</TableCell>
                                  <TableCell><Badge variant="outline">{STATUS_LABEL[p.status] || p.status}</Badge></TableCell>
                                  <TableCell className="text-right font-medium text-gray-900">{formatPreco(p.total)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Itens ─────────────────────────────────────────────── */}
                <TabsContent value="itens">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Itens mais vendidos</CardTitle>
                      <CardDescription>Total de unidades vendidas: {totalUnidadesVendidas}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => setFiltroDiaItens('GERAL')}
                          className={`px-3 py-1.5 rounded-full text-sm border ${filtroDiaItens === 'GERAL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                          Geral
                        </button>
                        {DIAS_SEMANA_ABREV.map((d, idx) => (
                          <button
                            key={d}
                            onClick={() => setFiltroDiaItens(String(idx))}
                            className={`px-3 py-1.5 rounded-full text-sm border ${filtroDiaItens === String(idx) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                      {itensRanking.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-12">Nenhum item vendido nesse recorte.</p>
                      ) : (
                        <div className="space-y-3">
                          {itensRanking.map((item, idx) => (
                            <div key={item.nome}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-700"><span className="text-gray-400 mr-1.5">{idx + 1}º</span>{item.nome}</span>
                                <span className="text-gray-900 font-medium">{item.qtd} un. ({item.pct.toFixed(1)}%)</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500" style={{ width: `${item.pct}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Entradas ──────────────────────────────────────────── */}
                <TabsContent value="entradas">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-muted-foreground" /> Horários com mais pedidos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {horariosPico.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-12">Sem pedidos no período selecionado.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={horariosPico} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="hora" tick={{ fontSize: 12 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                              <Tooltip />
                              <Bar dataKey="Pedidos" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Formas de pagamento</CardTitle>
                        <CardDescription>{kpis.totalPedidos} pedido{kpis.totalPedidos !== 1 ? 's' : ''} · {formatPreco(kpis.totalVendas)}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {formasPagamento.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-12">Sem vendas no período selecionado.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {formasPagamento.map((f) => {
                              const Icone = ICONE_PAGAMENTO[f.chave] || HelpCircle;
                              return (
                                <div key={f.chave} className="border rounded-lg p-3 flex flex-col gap-1">
                                  <Icone className="h-4 w-4 text-gray-400" />
                                  <p className="font-bold text-gray-900 text-sm">{formatPreco(f.valor)}</p>
                                  <p className="text-xs text-gray-500">{f.pedidos} pedido{f.pedidos !== 1 ? 's' : ''}</p>
                                  <p className="text-xs text-gray-400 truncate">{f.label}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ── Clientes ──────────────────────────────────────────── */}
                <TabsContent value="clientes">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-5">
                          <p className="text-2xl font-bold text-gray-900">{clientes.length}</p>
                          <p className="text-xs text-gray-500">Clientes cadastrados</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-5">
                          <p className="text-2xl font-bold text-emerald-600">{clientesAtivos.length}</p>
                          <p className="text-xs text-gray-500">Ativos (pediram nos últimos 30d)</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-5">
                          <p className="text-2xl font-bold text-gray-400">{clientesInativos.length}</p>
                          <p className="text-xs text-gray-500">Inativos (30d ou mais sem pedir)</p>
                        </CardContent>
                      </Card>
                    </div>
                    <Card>
                      <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-lg">Top 10 clientes</CardTitle>
                        <Button variant="outline" size="sm" asChild className="gap-1.5">
                          <Link to="/dashboard/cardapio/clientes">Ver todos os clientes <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </CardHeader>
                      <CardContent className="p-0">
                        {topClientes.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-12">Nenhum cliente cadastrado ainda.</p>
                        ) : (
                          <Table>
                            <TableHeader className="bg-gray-50">
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead className="text-center">Pedidos</TableHead>
                                <TableHead className="text-right">Total gasto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {topClientes.map((c, idx) => (
                                <TableRow key={c.id}>
                                  <TableCell className="text-gray-400">{idx + 1}º</TableCell>
                                  <TableCell className="font-medium text-gray-900">{c.nome}</TableCell>
                                  <TableCell className="text-center text-gray-600">{c.total_pedidos}</TableCell>
                                  <TableCell className="text-right text-gray-900">{formatPreco(c.total_gasto)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ── Áreas de entrega ──────────────────────────────────── */}
                <TabsContent value="areas">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-muted-foreground" /> Áreas de entrega</CardTitle>
                      <CardDescription>Pedidos por bairro, no período selecionado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!temBairroRegistrado && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-3">
                          O bairro passou a ser capturado automaticamente a partir de agora, nos pedidos com entrega. Pedidos feitos antes disso aparecem como "Sem bairro registrado".
                        </div>
                      )}
                      {areasEntrega.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-12">Nenhum pedido com entrega no período selecionado.</p>
                      ) : (
                        <Table>
                          <TableHeader className="bg-gray-50">
                            <TableRow>
                              <TableHead>Bairro</TableHead>
                              <TableHead className="text-center">Pedidos</TableHead>
                              <TableHead className="text-right">Faturamento</TableHead>
                              <TableHead className="text-right">Taxas de entrega</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {areasEntrega.map((a) => (
                              <TableRow key={a.bairro}>
                                <TableCell className={`font-medium ${a.bairro === 'Sem bairro registrado' ? 'text-gray-400 italic' : 'text-gray-900'}`}>{a.bairro}</TableCell>
                                <TableCell className="text-center text-gray-600">{a.pedidos}</TableCell>
                                <TableCell className="text-right text-gray-900">{formatPreco(a.faturamento)}</TableCell>
                                <TableCell className="text-right text-gray-600">{formatPreco(a.taxas)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}