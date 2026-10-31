import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import LotesFilterBar from '@/components/lotes/LotesFilterBar';
import ConfirmInactivateLoteModal from '@/components/lotes/ConfirmInactivateLoteModal';
import EditLoteModal from '@/components/lotes/EditLoteModal';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { emitLoteUpdated } from '@/hooks/useEditLoteSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Plus, AlertCircle, ArrowLeft, RefreshCw,
  CalendarX, CalendarClock, CheckCircle2, PackageMinus,
  PackageCheck, Pencil, Boxes, AlertTriangle, TrendingDown, Search
} from 'lucide-react';
import { ordenarLotes } from '@/lib/getLotesOrdenados';
import { formatDateBR } from '@/utils/dateFormatter';

export default function LotesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const { inactivateLote, reactivateLote } = useLoteManagement();

  const [dataCombinada, setDataCombinada] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [locais, setLocais] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState('list');
  const [selectedLote, setSelectedLote] = useState(null);
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const [isInactivating, setIsInactivating] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [togglingPDV, setTogglingPDV] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [loteToEdit, setLoteToEdit] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ativo');
  const [quickSearch, setQuickSearch] = useState('');

  const defaultFilters = {
    produto_id: 'all', local_id: 'all', status_validade: 'todos',
    saldo: 'todos', data_producao_de: '', data_producao_ate: '', loteOrigemSearch: ''
  };
  const [filters, setFilters] = useState(defaultFilters);

  const [formData, setFormData] = useState({
    produto_id: '', numero_lote: '', data_validade: '', quantidade: '', local_id: 'none',
  });

  useEffect(() => {
    if (empresaId && view === 'list') fetchData();
    else if (!empresaId) setIsLoading(false);
  }, [empresaId, view, filterStatus]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      let lotesQuery = supabase.from('lotes').select('*').eq('empresa_id', empresaId).limit(5000);
      if (filterStatus === 'ativo') lotesQuery = lotesQuery.eq('ativo', true);
      else if (filterStatus === 'inativo') lotesQuery = lotesQuery.eq('ativo', false);
      const { data: lotesFetchData, error: fetchError } = await lotesQuery;
      
      // Temporary log for debugging as requested
      console.log('fetchLotes retornou:', lotesFetchData?.length, 'lotes');
      
      if (fetchError) throw new Error(fetchError.message || fetchError);

      const [eplRes, prodRes, locRes, lotesExtraRes] = await Promise.all([
        supabase.from('estoque_por_local').select('*').eq('empresa_id', empresaId),
        supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('lotes').select('id, numero_lote, liberado_pdv, created_at, lote_origem_id, tipo_lote').eq('empresa_id', empresaId).limit(5000)
      ]);

      if (eplRes.error) throw eplRes.error;
      setProdutos(prodRes.data || []);
      setLocais(locRes.data || []);

      const allLotesMap = (lotesExtraRes.data || []).reduce((acc, l) => { acc[l.id] = l; return acc; }, {});

      // Mesmo problema já corrigido em EstoqueLocalPage: bandeja pode vir de
      // outra bandeja (que veio de outra bandeja...) antes de chegar no lote
      // base de verdade. Subir só um nível mostrava outra bandeja no meio do
      // caminho em vez do lote base (numérico) — sobe a cadeia toda até achar
      // um lote que não seja do tipo bandeja.
      const resolverLoteBaseDeOrigem = (loteId, visitados = new Set()) => {
        if (!loteId || visitados.has(loteId)) return null;
        visitados.add(loteId);
        const atual = allLotesMap[loteId];
        if (!atual) return null;
        if (atual.tipo_lote !== 'bandeja') return atual;
        if (!atual.lote_origem_id) return atual;
        return resolverLoteBaseDeOrigem(atual.lote_origem_id, visitados) || atual;
      };

      const lotesMap = (lotesFetchData || []).reduce((acc, lote) => {
        const extraInfo = allLotesMap[lote.id] || {};
        const origemBase = extraInfo.lote_origem_id ? resolverLoteBaseDeOrigem(extraInfo.lote_origem_id) : null;
        acc[lote.id] = {
          data_validade: lote.data_validade, tipo_lote: lote.tipo_lote,
          unidades_por_bandeja: lote.unidades_por_bandeja, lote_devolvido: lote.lote_devolvido,
          ativo: lote.ativo !== false, liberado_pdv: extraInfo.liberado_pdv !== false,
          created_at: extraInfo.created_at,
          lote_origem_numero: origemBase ? origemBase.numero_lote : null
        };
        return acc;
      }, {});

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const combinada = (eplRes.data || []).filter(item => lotesMap[item.lote_id]).map(item => {
        const loteInfo = lotesMap[item.lote_id];
        const dataValidade = loteInfo.data_validade;
        let status = 'OK', diasParaVencer = null;
        if (dataValidade) {
          const [year, month, day] = dataValidade.split('-');
          const diffTime = new Date(year, month - 1, day).getTime() - today.getTime();
          diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diasParaVencer < 0) status = 'Vencido';
          else if (diasParaVencer <= 7) status = 'Vencendo';
        }
        return {
          id: `${item.lote_id}-${item.local_id}`, lote_id: item.lote_id,
          numero_lote: item.numero_lote, produto_id: item.produto_id,
          produto_nome: item.produto_nome, local_id: item.local_id, local_nome: item.local_nome,
          quantidade_atual: item.quantidade_atual, data_validade: dataValidade,
          created_at: loteInfo.created_at, tipo_lote: loteInfo.tipo_lote,
          unidades_por_bandeja: loteInfo.unidades_por_bandeja, lote_devolvido: loteInfo.lote_devolvido,
          ativo: loteInfo.ativo, liberado_pdv: loteInfo.liberado_pdv,
          lote_origem_numero: loteInfo.lote_origem_numero, status, diasParaVencer
        };
      });
      setDataCombinada(ordenarLotes(combinada, true));
    } catch (err) {
      setError('Falha ao carregar os dados. ' + err.message);
      toast({ title: 'Erro ao carregar dados', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return dataCombinada.filter(item => {
      if (filters.produto_id !== 'all' && item.produto_id !== filters.produto_id) return false;
      if (filters.local_id !== 'all' && item.local_id !== filters.local_id) return false;
      if (filters.saldo === 'positivo' && item.quantidade_atual <= 0) return false;
      if (filters.status_validade === 'vencidos' && item.status !== 'Vencido') return false;
      if (filters.status_validade === 'vencendo' && item.status !== 'Vencendo') return false;
      if (filters.loteOrigemSearch?.trim()) {
        const s = filters.loteOrigemSearch.toLowerCase();
        if (!(item.lote_origem_numero || '').toLowerCase().includes(s) && !(item.numero_lote || '').toLowerCase().includes(s)) return false;
      }
      if (quickSearch.trim()) {
        const s = quickSearch.toLowerCase();
        if (!(item.produto_nome || '').toLowerCase().includes(s) && !(item.numero_lote || '').toLowerCase().includes(s) && !(item.local_nome || '').toLowerCase().includes(s)) return false;
      }
      if (item.created_at && (filters.data_producao_de || filters.data_producao_ate)) {
        const itemDate = new Date(item.created_at);
        if (filters.data_producao_de && itemDate < new Date(filters.data_producao_de + 'T00:00:00')) return false;
        if (filters.data_producao_ate && itemDate > new Date(filters.data_producao_ate + 'T23:59:59.999')) return false;
      }
      return true;
    });
  }, [dataCombinada, filters, quickSearch]);

  const totals = useMemo(() => filteredData.reduce((acc, curr) => {
    acc.quantidade += (curr.quantidade_atual || 0);
    if (curr.tipo_lote === 'bandeja') acc.unidadesBandeja += (curr.unidades_por_bandeja || 0);
    return acc;
  }, { quantidade: 0, unidadesBandeja: 0 }), [filteredData]);

  // KPIs
  const kpis = useMemo(() => ({
    total: dataCombinada.length,
    vencidos: dataCombinada.filter(i => i.status === 'Vencido').length,
    vencendo: dataCombinada.filter(i => i.status === 'Vencendo').length,
    totalQtd: dataCombinada.reduce((s, i) => s + (i.quantidade_atual || 0), 0),
  }), [dataCombinada]);

  const handleClearFilters = () => { setFilters(defaultFilters); setQuickSearch(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId) return;
    if (!formData.produto_id || !formData.numero_lote || formData.quantidade === '') {
      toast({ title: 'Campos obrigatórios', variant: 'destructive' }); return;
    }
    try {
      setIsSubmitting(true);
      const { error: insertError } = await supabase.from('lotes').insert({
        empresa_id: empresaId, produto_id: formData.produto_id,
        numero_lote: formData.numero_lote, data_validade: formData.data_validade || null,
        quantidade: parseInt(formData.quantidade, 10),
        local_id: formData.local_id === 'none' ? null : formData.local_id,
        tipo_lote: 'base', ativo: true, liberado_pdv: true
      });
      if (insertError) throw insertError;
      toast({ title: 'Lote registrado com sucesso!', className: 'bg-green-600 text-white border-none' });
      setView('list');
      setFormData({ produto_id: '', numero_lote: '', data_validade: '', quantidade: '', local_id: 'none' });
    } catch (err) {
      toast({ title: 'Erro ao registrar lote', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (lote) => { setLoteToEdit(lote); setShowEditModal(true); };
  const handleSaveEdit = () => { setShowEditModal(false); emitLoteUpdated(); fetchData(); };
  const handleInactivateClick = (lote) => { setSelectedLote(lote); setShowInactivateModal(true); };

  const handleConfirmInactivate = async () => {
    if (!selectedLote || !empresaId) return;
    setIsInactivating(true);
    try {
      const response = await inactivateLote(selectedLote.lote_id, empresaId);
      if (response.success) { toast({ title: 'Lote inativado', className: 'bg-green-600 text-white border-none' }); setShowInactivateModal(false); fetchData(); }
      else toast({ title: 'Erro', description: response.error, variant: 'destructive' });
    } catch { toast({ title: 'Erro inesperado', variant: 'destructive' }); }
    finally { setIsInactivating(false); }
  };

  const handleReactivateClick = async (lote) => {
    setIsReactivating(true);
    try {
      const response = await reactivateLote(lote.lote_id, empresaId);
      if (response.success) { toast({ title: 'Lote reativado', className: 'bg-green-600 text-white border-none' }); fetchData(); }
      else toast({ title: 'Erro', description: response.error, variant: 'destructive' });
    } catch { toast({ title: 'Erro inesperado', variant: 'destructive' }); }
    finally { setIsReactivating(false); }
  };

  const handleToggleLiberadoPDV = async (item) => {
    const newValue = !item.liberado_pdv;
    setTogglingPDV(prev => ({ ...prev, [item.id]: true }));
    try {
      const { error } = await supabase.from('lotes').update({ liberado_pdv: newValue }).eq('id', item.lote_id).eq('empresa_id', empresaId);
      if (error) throw error;
      setDataCombinada(prev => prev.map(row => row.id === item.id ? { ...row, liberado_pdv: newValue } : row));
      toast({ title: newValue ? 'Liberado no PDV' : 'Bloqueado no PDV', className: newValue ? 'bg-green-600 text-white border-none' : 'bg-amber-600 text-white border-none' });
      emitLoteUpdated();
    } catch (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); }
    finally { setTogglingPDV(prev => ({ ...prev, [item.id]: false })); }
  };

  const formatDate = (d) => { if (!d) return '—'; const date = new Date(d); const tz = date.getTimezoneOffset() * 60000; return new Date(date.getTime() + tz).toLocaleDateString('pt-BR'); };
  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  const renderStatusBadge = (status, dias) => {
    if (status === 'Vencido') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
        <CalendarX className="h-3 w-3" /> Vencido {dias !== null ? `(${Math.abs(dias)}d)` : ''}
      </span>
    );
    if (status === 'Vencendo') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <CalendarClock className="h-3 w-3" /> {dias}d
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  };

  const rowBg = (item) => {
    if (!item.ativo) return 'bg-gray-50 opacity-70';
    if (item.status === 'Vencido') return 'bg-red-50 hover:bg-red-100';
    if (item.status === 'Vencendo') return 'bg-amber-50 hover:bg-amber-100';
    return 'hover:bg-gray-50';
  };

  if (!empresaId) return <DashboardLayout><div className="p-12 text-center"><AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" /><h2 className="text-xl font-bold">Nenhuma empresa associada</h2></div></DashboardLayout>;

  return (
    <>
      <Helmet><title>Lotes e Validades - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-5 max-w-7xl mx-auto pb-12">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Boxes className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  Lotes e Validades
                  {view === 'list' && (
                    <span className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-0.5 rounded-full">
                      {filteredData.length} registros
                    </span>
                  )}
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">Acompanhe lotes por local e prazos de validade.</p>
              </div>
            </div>
            {view === 'list' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchData} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                </Button>
                <Button onClick={() => setView('form')} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4" /> Novo Lote
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setView('list')} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
          </div>

          {/* KPI cards — só na list view */}
          {view === 'list' && !isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Total de Lotes</p>
                <p className="text-3xl font-black text-gray-900 mt-1">{kpis.total}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtNum(kpis.totalQtd)} unidades</p>
              </div>
              <div className={`rounded-2xl border shadow-sm p-4 ${kpis.vencidos > 0 ? 'bg-red-600 border-red-500' : 'bg-white border-gray-100'}`}>
                <p className={`text-xs font-semibold uppercase ${kpis.vencidos > 0 ? 'text-red-100' : 'text-gray-500'}`}>Vencidos</p>
                <p className={`text-3xl font-black mt-1 ${kpis.vencidos > 0 ? 'text-white' : 'text-gray-900'}`}>{kpis.vencidos}</p>
                <p className={`text-xs mt-0.5 ${kpis.vencidos > 0 ? 'text-red-200' : 'text-gray-400'}`}>
                  {kpis.vencidos > 0 ? 'Ação imediata!' : 'Nenhum vencido'}
                </p>
              </div>
              <div className={`rounded-2xl border shadow-sm p-4 ${kpis.vencendo > 0 ? 'bg-amber-500 border-amber-400' : 'bg-white border-gray-100'}`}>
                <p className={`text-xs font-semibold uppercase ${kpis.vencendo > 0 ? 'text-amber-100' : 'text-gray-500'}`}>Vencendo em breve</p>
                <p className={`text-3xl font-black mt-1 ${kpis.vencendo > 0 ? 'text-white' : 'text-gray-900'}`}>{kpis.vencendo}</p>
                <p className={`text-xs mt-0.5 ${kpis.vencendo > 0 ? 'text-amber-100' : 'text-gray-400'}`}>próximos 7 dias</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Total Filtrado</p>
                <p className="text-3xl font-black text-blue-600 mt-1">{fmtNum(totals.quantidade)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{filteredData.length} lotes visíveis</p>
              </div>
            </div>
          )}

          {/* Status tabs + busca rápida */}
          {view === 'list' && (
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1 flex gap-1">
                {[['todos','Todos'],['ativo','Ativos'],['inativo','Inativos']].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterStatus(val)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${filterStatus === val ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text" placeholder="Buscar produto, lote ou local..."
                  value={quickSearch} onChange={e => setQuickSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none bg-white"
                  style={{ fontSize: '14px' }}
                />
              </div>
            </div>
          )}

          {/* Filtros avançados */}
          {view === 'list' && (
            <LotesFilterBar produtos={produtos} locais={locais} filters={filters} setFilters={setFilters} onClearFilters={handleClearFilters} />
          )}

          {/* Conteúdo principal */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-16">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
                <span className="text-gray-500">Carregando lotes...</span>
              </div>
            ) : error && view === 'list' ? (
              <div className="flex flex-col items-center justify-center p-16">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-gray-500 mb-4">{error}</p>
                <Button onClick={fetchData} className="gap-2"><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
              </div>
            ) : view === 'list' ? (
              <>
                {/* Alertas visuais */}
                {kpis.vencidos > 0 && (
                  <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-700 font-semibold">
                      {kpis.vencidos} lote(s) vencido(s) — verifique e inative-os ou descarte o produto.
                    </p>
                  </div>
                )}
                {kpis.vencendo > 0 && kpis.vencidos === 0 && (
                  <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <p className="text-sm text-amber-700 font-semibold">
                      {kpis.vencendo} lote(s) vencendo nos próximos 7 dias.
                    </p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                        <th className="px-4 py-3 text-left">Lote Origem</th>
                        <th className="px-4 py-3 text-left">Lote Bandeja</th>
                        <th className="px-4 py-3 text-left">Dt. Produção</th>
                        <th className="px-4 py-3 text-left">Produto</th>
                        <th className="px-4 py-3 text-left">Local</th>
                        <th className="px-4 py-3 text-right">Qtd</th>
                        <th className="px-4 py-3 text-center">Un/Bdj</th>
                        <th className="px-4 py-3 text-center">Validade</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Ativo</th>
                        <th className="px-4 py-3 text-center">PDV</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="text-center py-16">
                            <Boxes className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 font-medium">Nenhum lote encontrado</p>
                            {(Object.values(filters).some(v => v !== defaultFilters[Object.keys(defaultFilters)[0]]) || quickSearch) && (
                              <button onClick={handleClearFilters} className="text-xs text-blue-600 hover:text-blue-800 underline mt-2">Limpar filtros</button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        <>
                          {filteredData.map((item) => {
                            const isBandeja = item.tipo_lote === 'bandeja';
                            const displayOrigem = isBandeja && item.lote_origem_numero ? item.lote_origem_numero : item.numero_lote;
                            const displayBandeja = isBandeja ? item.numero_lote : null;
                            return (
                              <tr key={item.id} className={`border-b border-gray-50 transition-colors ${rowBg(item)}`}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`font-semibold font-mono text-xs ${!item.ativo ? 'text-gray-400' : 'text-gray-900'}`}>{displayOrigem}</span>
                                    {isBandeja && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold">BDJ</span>}
                                    {item.lote_devolvido && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-semibold">DEV</span>}
                                  </div>
                                </td>
                                <td className={`px-4 py-3 font-mono text-xs ${!item.ativo ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {displayBandeja || '—'}
                                </td>
                                <td className={`px-4 py-3 text-xs whitespace-nowrap ${!item.ativo ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {formatDateBR(item.created_at)}
                                </td>
                                <td className={`px-4 py-3 font-medium ${!item.ativo ? 'text-gray-400' : 'text-gray-900'}`}>{item.produto_nome}</td>
                                <td className="px-4 py-3">
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.local_nome}</span>
                                </td>
                                <td className={`px-4 py-3 text-right font-black text-base ${!item.ativo ? 'text-gray-400' : item.quantidade_atual <= 0 ? 'text-red-500' : 'text-blue-700'}`}>
                                  {fmtNum(item.quantidade_atual)}
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600 font-medium">
                                  {item.tipo_lote === 'bandeja' && item.unidades_por_bandeja ? fmtNum(item.unidades_por_bandeja) : '—'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-xs font-mono ${item.status === 'Vencido' ? 'text-red-600 font-bold' : item.status === 'Vencendo' ? 'text-amber-600 font-bold' : 'text-gray-600'}`}>
                                    {formatDate(item.data_validade)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">{renderStatusBadge(item.status, item.diasParaVencer)}</td>
                                <td className="px-4 py-3 text-center">
                                  {item.ativo
                                    ? <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">Ativo</span>
                                    : <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-semibold">Inativo</span>
                                  }
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Switch checked={item.liberado_pdv} onCheckedChange={() => handleToggleLiberadoPDV(item)} disabled={togglingPDV[item.id] || !item.ativo} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => handleEditClick(item)} title="Editar"
                                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    {item.ativo ? (
                                      <button onClick={() => handleInactivateClick(item)} title="Inativar"
                                        className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                                        <PackageMinus className="h-4 w-4" />
                                      </button>
                                    ) : (
                                      <button onClick={() => handleReactivateClick(item)} disabled={isReactivating} title="Reativar"
                                        className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors">
                                        <PackageCheck className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {/* Totais */}
                          <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                            <td colSpan={5} className="px-4 py-3 text-sm font-bold text-blue-800">
                              TOTAL — {filteredData.length} lotes
                            </td>
                            <td className="px-4 py-3 text-right text-xl font-black text-blue-700">{fmtNum(totals.quantidade)}</td>
                            <td className="px-4 py-3 text-center text-sm font-bold text-blue-700">{totals.unidadesBandeja > 0 ? fmtNum(totals.unidadesBandeja) : '—'}</td>
                            <td colSpan={5} />
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label>Produto <span className="text-red-500">*</span></Label>
                      <Select value={formData.produto_id} onValueChange={v => setFormData({ ...formData, produto_id: v })}>
                        <SelectTrigger className="bg-gray-50 h-11"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Número do Lote <span className="text-red-500">*</span></Label>
                      <Input value={formData.numero_lote} onChange={e => setFormData({ ...formData, numero_lote: e.target.value })} placeholder="Ex: LOTE-2024-01" className="h-11 bg-gray-50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade <span className="text-red-500">*</span></Label>
                      <Input type="number" min="0" value={formData.quantidade} onChange={e => setFormData({ ...formData, quantidade: e.target.value })} placeholder="0" className="h-11 bg-gray-50" />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Validade</Label>
                      <Input type="date" value={formData.data_validade} onChange={e => setFormData({ ...formData, data_validade: e.target.value })} className="h-11 bg-gray-50" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Local de Armazenamento</Label>
                      <Select value={formData.local_id} onValueChange={v => setFormData({ ...formData, local_id: v })}>
                        <SelectTrigger className="bg-gray-50 h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {locais.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <Button type="button" variant="outline" onClick={() => setView('list')} disabled={isSubmitting}>Cancelar</Button>
                    <Button type="submit" disabled={isSubmitting} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8">
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar Lote
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        <ConfirmInactivateLoteModal isOpen={showInactivateModal} onClose={() => setShowInactivateModal(false)} onConfirmInactivate={handleConfirmInactivate} lote={selectedLote} isInactivating={isInactivating} />
        <EditLoteModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} onSave={handleSaveEdit} lote={loteToEdit} />
      </DashboardLayout>
    </>
  );
}