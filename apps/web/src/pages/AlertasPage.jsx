import React, { useState, useEffect } from 'react';
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
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Loader2, AlertCircle, RefreshCw, Bell, AlertOctagon, AlertTriangle, Search, Filter, TrendingDown, Clock, Package, PackageMinus, ArrowRightLeft, Pencil } from 'lucide-react';
import ConfirmInactivateLoteModal from '@/components/lotes/ConfirmInactivateLoteModal';
import EditLoteModal from '@/components/lotes/EditLoteModal';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { emitLoteUpdated } from '@/hooks/useEditLoteSync';

export default function AlertasPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [alertas, setAlertas] = useState([]);
  const [locais, setLocais] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCharts, setShowCharts] = useState(true);
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLote, setSelectedLote] = useState(null);
  const [isInactivating, setIsInactivating] = useState(false);
  const { inactivateLote } = useLoteManagement();

  const [filters, setFilters] = useState({
    alertType: 'todos',
    selectedLocal: 'todos',
    daysToExpire: 'todos',
    searchProduct: '',
  });

  useEffect(() => {
    if (empresaId) fetchAlertasELocais();
    else setIsLoading(false);
  }, [empresaId]);

  const handleInactivateClick = (item) => { setSelectedLote(item); setShowInactivateModal(true); };
  const handleEditClick = (item) => { setSelectedLote(item); setShowEditModal(true); };
  const handleTransferirClick = (item) => { window.location.href = `/transferencia-estoque?lote_id=${item.lote_id}&local_id=${item.local_id}`; };

  const handleConfirmInactivate = async () => {
    if (!selectedLote || !empresaId) return;
    setIsInactivating(true);
    try {
      const response = await inactivateLote(selectedLote.lote_id, empresaId);
      if (response.success) {
        toast({ title: 'Lote inativado!', className: 'bg-green-600 text-white border-none' });
        setShowInactivateModal(false);
        emitLoteUpdated();
        fetchAlertasELocais();
      } else {
        toast({ title: 'Erro ao inativar', description: response.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro inesperado', variant: 'destructive' });
    } finally {
      setIsInactivating(false);
    }
  };

  const handleSaveEdit = () => { setShowEditModal(false); emitLoteUpdated(); fetchAlertasELocais(); };

  const fetchAlertasELocais = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [alertasResponse, locaisResponse, lotesAtivosResponse] = await Promise.all([
        supabase.from('alertas_estoque').select('*').eq('empresa_id', empresaId),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('lotes').select('id').eq('empresa_id', empresaId).eq('ativo', true).eq('lote_devolvido', false),
      ]);
      if (alertasResponse.error) throw alertasResponse.error;
      if (locaisResponse.error) throw locaisResponse.error;

      // Filtra apenas lotes ativos e não devolvidos
      const lotesAtivosIds = new Set((lotesAtivosResponse.data || []).map(l => l.id));
      const alertasAtivos = (alertasResponse.data || []).filter(a => !a.lote_id || lotesAtivosIds.has(a.lote_id));

      const priority = { vencido: 1, vencendo: 2, estoque_minimo: 3 };
      const sorted = alertasAtivos.sort((a, b) => {
        if (priority[a.tipo_alerta] !== priority[b.tipo_alerta]) return priority[a.tipo_alerta] - priority[b.tipo_alerta];
        return a.produto_nome.localeCompare(b.produto_nome);
      });
      setAlertas(sorted);
      setLocais(locaisResponse.data || []);
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erro ao carregar dados', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);

  const getAlertStyles = (tipo) => {
    switch (tipo) {
      case 'vencido': return {
        row: 'bg-red-50 hover:bg-red-100',
        badge: 'bg-red-500 text-white',
        badgeSoft: 'bg-red-100 text-red-700 border border-red-200',
        label: 'Lote Vencido',
        icon: <AlertOctagon className="w-3.5 h-3.5" />
      };
      case 'vencendo': return {
        row: 'bg-amber-50 hover:bg-amber-100',
        badge: 'bg-amber-400 text-amber-900',
        badgeSoft: 'bg-amber-100 text-amber-700 border border-amber-200',
        label: 'Vencendo em Breve',
        icon: <Clock className="w-3.5 h-3.5" />
      };
      case 'estoque_minimo': return {
        row: 'bg-orange-50 hover:bg-orange-100',
        badge: 'bg-orange-500 text-white',
        badgeSoft: 'bg-orange-100 text-orange-700 border border-orange-200',
        label: 'Estoque Crítico',
        icon: <TrendingDown className="w-3.5 h-3.5" />
      };
      default: return {
        row: '',
        badge: 'bg-gray-100 text-gray-800',
        badgeSoft: 'bg-gray-100 text-gray-600 border border-gray-200',
        label: 'Alerta',
        icon: <Bell className="w-3.5 h-3.5" />
      };
    }
  };

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const filteredAlertas = alertas.filter((alerta) => {
    if (filters.alertType === 'vencimento' && !['vencido', 'vencendo'].includes(alerta.tipo_alerta)) return false;
    if (filters.alertType === 'critico' && alerta.tipo_alerta !== 'estoque_minimo') return false;
    if (filters.selectedLocal !== 'todos' && alerta.local_id !== filters.selectedLocal) return false;
    if (filters.alertType !== 'critico' && filters.daysToExpire !== 'todos') {
      if (['vencido', 'vencendo'].includes(alerta.tipo_alerta)) {
        if (alerta.dias_para_vencer > parseInt(filters.daysToExpire, 10)) return false;
      }
    }
    if (filters.searchProduct && !alerta.produto_nome.toLowerCase().includes(filters.searchProduct.toLowerCase())) return false;
    return true;
  });

  const isFiltered = filters.alertType !== 'todos' || filters.selectedLocal !== 'todos' || filters.daysToExpire !== 'todos' || filters.searchProduct !== '';

  // KPI counts
  const countVencidos = alertas.filter(a => a.tipo_alerta === 'vencido').length;
  const countVencendo = alertas.filter(a => a.tipo_alerta === 'vencendo').length;
  const countCritico = alertas.filter(a => a.tipo_alerta === 'estoque_minimo').length;
  const totalAlertas = alertas.length;

  // Chart data
  const pieData = [
    { name: 'Vencidos', value: countVencidos, color: '#ef4444' },
    { name: 'Vencendo', value: countVencendo, color: '#f59e0b' },
    { name: 'Est. Crítico', value: countCritico, color: '#f97316' },
  ].filter(d => d.value > 0);

  // Top 5 produtos com mais alertas
  const produtoMap = {};
  alertas.forEach(a => {
    if (!produtoMap[a.produto_nome]) produtoMap[a.produto_nome] = 0;
    produtoMap[a.produto_nome]++;
  });
  const topProdutos = Object.entries(produtoMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([nome, qtd]) => ({ nome: nome.length > 18 ? nome.slice(0, 16) + '…' : nome, alertas: qtd }));

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
      <Helmet><title>Alertas de Estoque - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-7 w-7 text-red-500" /> Alertas de Estoque
              </h1>
              <p className="text-gray-500 text-sm mt-1">Monitore lotes vencidos, vencendo e estoques críticos.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowCharts(!showCharts)} variant="outline" className="gap-2 text-sm">
                {showCharts ? 'Ocultar gráficos' : 'Ver gráficos'}
              </Button>
              <Button onClick={fetchAlertasELocais} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          </div>

          {!isLoading && !error && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total de Alertas', value: totalAlertas, color: 'bg-gray-900 text-white', icon: <Bell className="h-5 w-5 opacity-70" />, sub: 'ativos agora' },
                  { label: 'Lotes Vencidos', value: countVencidos, color: 'bg-red-600 text-white', icon: <AlertOctagon className="h-5 w-5 opacity-70" />, sub: 'ação imediata', urgent: countVencidos > 0 },
                  { label: 'Vencendo em Breve', value: countVencendo, color: 'bg-amber-500 text-white', icon: <Clock className="h-5 w-5 opacity-70" />, sub: 'nos próximos dias' },
                  { label: 'Estoque Crítico', value: countCritico, color: 'bg-orange-500 text-white', icon: <TrendingDown className="h-5 w-5 opacity-70" />, sub: 'abaixo do mínimo' },
                ].map((kpi, i) => (
                  <div key={i} className={`${kpi.color} rounded-2xl p-4 relative overflow-hidden ${kpi.urgent ? 'ring-2 ring-red-300 ring-offset-2 animate-pulse' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">{kpi.label}</p>
                      {kpi.icon}
                    </div>
                    <p className="text-3xl font-black">{kpi.value}</p>
                    <p className="text-xs opacity-70 mt-0.5">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* Charts */}
              {showCharts && totalAlertas > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Donut */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm font-bold text-gray-700 mb-4">Distribuição por Tipo</p>
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={120} height={120}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={3}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v, n) => [v, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {pieData.map((item, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
                              <span className="text-sm text-gray-600">{item.name}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{item.value}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                          <span className="text-sm text-gray-500">Total</span>
                          <span className="text-sm font-black text-gray-900">{totalAlertas}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bar chart - top produtos */}
                  {topProdutos.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <p className="text-sm font-bold text-gray-700 mb-4">Produtos com Mais Alertas</p>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={topProdutos} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                          <Tooltip cursor={{ fill: '#f9fafb' }} formatter={(v) => [v, 'Alertas']} />
                          <Bar dataKey="alertas" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* Filters */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Filter className="h-4 w-4" /> Filtros
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de Alerta</Label>
                    <Select value={filters.alertType} onValueChange={(val) => handleFilterChange('alertType', val)}>
                      <SelectTrigger className="bg-white h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="vencimento">Vencido / Vencendo</SelectItem>
                        <SelectItem value="critico">Estoque Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Local</Label>
                    <Select value={filters.selectedLocal} onValueChange={(val) => handleFilterChange('selectedLocal', val)}>
                      <SelectTrigger className="bg-white h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os Locais</SelectItem>
                        {locais.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {filters.alertType !== 'critico' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dias para Vencer</Label>
                      <Select value={filters.daysToExpire} onValueChange={(val) => handleFilterChange('daysToExpire', val)}>
                        <SelectTrigger className="bg-white h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          <SelectItem value="3">Até 3 dias</SelectItem>
                          <SelectItem value="7">Até 7 dias</SelectItem>
                          <SelectItem value="15">Até 15 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Buscar Produto</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input placeholder="Nome do produto..." value={filters.searchProduct}
                        onChange={(e) => handleFilterChange('searchProduct', e.target.value)}
                        className="pl-8 bg-white h-9 text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-16">
                <Loader2 className="h-10 w-10 animate-spin text-red-500 mb-4" />
                <span className="text-gray-500">Buscando alertas...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-16">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-gray-500 mb-4">{error}</p>
                <Button onClick={fetchAlertasELocais} className="gap-2"><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
              </div>
            ) : (
              <>
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-600">
                    {filteredAlertas.length} de {alertas.length} alertas
                    {isFiltered && <button onClick={() => setFilters({ alertType: 'todos', selectedLocal: 'todos', daysToExpire: 'todos', searchProduct: '' })} className="ml-3 text-xs text-blue-600 hover:text-blue-800 underline">Limpar filtros</button>}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-white hover:bg-white border-b border-gray-100">
                        <TableHead className="text-xs font-bold text-gray-500 uppercase">Tipo</TableHead>
                        <TableHead className="text-xs font-bold text-gray-500 uppercase">Produto</TableHead>
                        <TableHead className="text-xs font-bold text-gray-500 uppercase">Lote</TableHead>
                        <TableHead className="text-xs font-bold text-gray-500 uppercase">Local</TableHead>
                        <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Qtd. Atual</TableHead>
                        <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Vencimento</TableHead>
                        <TableHead className="text-right text-xs font-bold text-gray-500 uppercase">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlertas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-16">
                            <div className="flex flex-col items-center">
                              {isFiltered ? (
                                <>
                                  <Search className="h-10 w-10 text-gray-300 mb-3" />
                                  <p className="text-gray-500 font-medium">Nenhum alerta com esses filtros.</p>
                                </>
                              ) : (
                                <>
                                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-3">
                                    <Bell className="h-7 w-7 text-green-500" />
                                  </div>
                                  <p className="text-gray-700 font-semibold">Estoque saudável!</p>
                                  <p className="text-gray-400 text-sm mt-1">Nenhum alerta no momento.</p>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAlertas.map((item, idx) => {
                          const style = getAlertStyles(item.tipo_alerta);
                          return (
                            <TableRow key={`${item.tipo_alerta}-${item.produto_id}-${item.lote_id || idx}`} className={`${style.row} border-b border-gray-50`}>
                              <TableCell>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style.badgeSoft}`}>
                                  {style.icon} {style.label}
                                </span>
                              </TableCell>
                              <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
                              <TableCell className="text-gray-600 font-mono text-sm">
                                {item.numero_lote || <span className="text-gray-400 italic not-italic font-sans">Consolidado</span>}
                              </TableCell>
                              <TableCell>
                                {item.local_nome
                                  ? <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.local_nome}</span>
                                  : <span className="text-gray-400 text-xs">Geral</span>
                                }
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="font-bold text-gray-900">{formatNumber(item.quantidade_atual)}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                {item.dias_para_vencer !== null ? (
                                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${item.dias_para_vencer < 0 ? 'bg-red-100 text-red-700' :
                                      item.dias_para_vencer <= 7 ? 'bg-amber-100 text-amber-700' :
                                        'bg-yellow-50 text-yellow-700'
                                    }`}>
                                    {item.dias_para_vencer < 0
                                      ? `Venceu há ${Math.abs(item.dias_para_vencer)}d`
                                      : item.dias_para_vencer === 0 ? 'Vence hoje!'
                                        : `${item.dias_para_vencer} dias`}
                                  </span>
                                ) : <span className="text-gray-300 text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.lote_id && (
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => handleEditClick(item)}
                                      title="Editar lote"
                                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => handleTransferirClick(item)}
                                      title="Transferir lote"
                                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                                      <ArrowRightLeft className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => handleInactivateClick(item)}
                                      title="Inativar lote"
                                      className={`p-1.5 rounded-lg transition-colors ${item.tipo_alerta === 'vencido'
                                          ? 'text-red-600 hover:text-red-800 hover:bg-red-100 ring-1 ring-red-300'
                                          : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                        }`}>
                                      <PackageMinus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>
        <ConfirmInactivateLoteModal
          isOpen={showInactivateModal}
          onClose={() => setShowInactivateModal(false)}
          onConfirmInactivate={handleConfirmInactivate}
          lote={selectedLote}
          isInactivating={isInactivating}
        />
        <EditLoteModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          lote={selectedLote}
        />
      </DashboardLayout>
    </>
  );
}