import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import FilterBar from '@/components/estoque/FilterBar';
import { useEditLoteSync } from '@/hooks/useEditLoteSync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, RefreshCw, Package, Layers, ChevronRight, ChevronDown,
  Download, AlertTriangle, MapPin, Search, CalendarX,
  PackageMinus, ArrowRightLeft, Pencil
} from 'lucide-react';
import ConfirmInactivateLoteModal from '@/components/lotes/ConfirmInactivateLoteModal';
import EditLoteModal from '@/components/lotes/EditLoteModal';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { emitLoteUpdated } from '@/hooks/useEditLoteSync';
import { ordenarLotes } from '@/lib/getLotesOrdenados';
import { isBandeja, countBandejas } from '@/lib/bandejasCountUtils';
import { formatDateBR } from '@/utils/dateFormatter';
import { withEstoqueBandejas } from '@/lib/staticLocais';
import * as XLSX from 'xlsx';

export default function EstoqueLocalPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [estoque, setEstoque] = useState([]);
  const [locais, setLocais] = useState([]);
  const [produtosMinimo, setProdutosMinimo] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const defaultFilters = {
    local_id: '', product_name: '', prazo_validade: 'todos',
    saldo_positivo: false, saldo_negativo: false, abaixo_minimo: false
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [agruparProduto, setAgruparProduto] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [quickSearch, setQuickSearch] = useState('');
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLote, setSelectedLote] = useState(null);
  const [isInactivating, setIsInactivating] = useState(false);
  const { inactivateLote } = useLoteManagement();

  useEffect(() => {
    if (empresaId) fetchData();
    else setIsLoading(false);
  }, [empresaId]);

  useEditLoteSync(() => { if (empresaId) fetchData(); });

  const fetchData = async () => {
    try {
      setIsLoading(true); setError(null);
      const [{ data: locaisData }, { data: produtosData }, { data: estoqueData }, { data: lotesData }] = await Promise.all([
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('produtos').select('id, estoque_minimo').eq('empresa_id', empresaId),
        supabase.from('estoque_por_local')
          .select('empresa_id, produto_id, produto_nome, lote_id, numero_lote, local_id, local_nome, quantidade_atual, tipo_lote, unidades_por_bandeja')
          .eq('empresa_id', empresaId).order('produto_nome').order('local_nome'),
        supabase.from('lotes').select('id, data_validade, lote_devolvido, lote_origem_id, numero_lote, ativo, created_at, tipo_lote').eq('empresa_id', empresaId)
      ]);
      setLocais(locaisData || []);
      const minMap = {};
      (produtosData || []).forEach(p => minMap[p.id] = p.estoque_minimo || 0);
      setProdutosMinimo(minMap);
      const lotesMap = (lotesData || []).reduce((acc, l) => { acc[l.id] = l; return acc; }, {});

      // Bandeja pode vir de outra bandeja (que veio de outra bandeja...) antes
      // de chegar no lote base de verdade — subir só um nível mostrava uma
      // outra bandeja no meio do caminho, em vez do lote base (numérico,
      // 5-6 dígitos) que é o que realmente importa mostrar como origem.
      // Sobe a cadeia toda até achar um lote que não seja do tipo bandeja.
      const resolverLoteBaseDeOrigem = (loteId, visitados = new Set()) => {
        if (!loteId || visitados.has(loteId)) return null; // corta em loop, por segurança
        visitados.add(loteId);
        const atual = lotesMap[loteId];
        if (!atual) return null;
        if (atual.tipo_lote !== 'bandeja') return atual;
        if (!atual.lote_origem_id) return atual;
        return resolverLoteBaseDeOrigem(atual.lote_origem_id, visitados) || atual;
      };

      const estoqueComValidade = (estoqueData || [])
        .filter(item => { const l = lotesMap[item.lote_id]; return l && l.ativo !== false; })
        .map(item => {
          const loteInfo = lotesMap[item.lote_id] || {};
          const origemBase = loteInfo.lote_origem_id ? resolverLoteBaseDeOrigem(loteInfo.lote_origem_id) : null;
          return { ...item, data_validade: loteInfo.data_validade || null, created_at: loteInfo.created_at || null, lote_devolvido: loteInfo.lote_devolvido || false, lote_origem_numero: origemBase ? origemBase.numero_lote : null, ativo: loteInfo.ativo };
        });
      setEstoque(ordenarLotes(estoqueComValidade) || []);
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInactivateClick = (item) => {
    setSelectedLote(item);
    setShowInactivateModal(true);
  };

  const handleConfirmInactivate = async () => {
    if (!selectedLote || !empresaId) return;
    setIsInactivating(true);
    try {
      const response = await inactivateLote(selectedLote.lote_id, empresaId);
      if (response.success) {
        toast({ title: 'Lote inativado!', className: 'bg-green-600 text-white border-none' });
        setShowInactivateModal(false);
        emitLoteUpdated();
        fetchData();
      } else {
        toast({ title: 'Erro ao inativar', description: response.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro inesperado', variant: 'destructive' });
    } finally {
      setIsInactivating(false);
    }
  };

  const handleEditClick = (item) => {
    setSelectedLote(item);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    setShowEditModal(false);
    emitLoteUpdated();
    fetchData();
  };

  const handleTransferirClick = (item) => {
    window.location.href = `/transferencia-estoque?lote_id=${item.lote_id}&local_id=${item.local_id}`;
  };

  const handleClearFilters = () => { setFilters(defaultFilters); setTipoFiltro('todos'); setAgruparProduto(false); setExpandedGroups({}); setQuickSearch(''); };

  const getDaysToExpiry = (dateString) => {
    if (!dateString) return null;
    try {
      const [year, month, day] = dateString.split('T')[0].split('-');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.ceil((new Date(year, month - 1, day).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } catch { return null; }
  };

  const locaisFiltrados = useMemo(() => {
    const locaisBase = withEstoqueBandejas(locais);
    const activeLocalIds = new Set(estoque.filter(i => i.lote_id != null).map(i => i.local_id));
    return locaisBase.filter(l => activeLocalIds.has(l.id));
  }, [estoque, locais]);

  const filteredEstoque = useMemo(() => {
    return estoque.filter(item => {
      if (tipoFiltro !== 'todos' && (item.tipo_lote || 'base') !== tipoFiltro) return false;
      if (filters.local_id && item.local_id !== filters.local_id) return false;
      if (filters.product_name) {
        const term = filters.product_name.toLowerCase();
        if (!(item.produto_nome || '').toLowerCase().includes(term) && !(item.numero_lote || '').toLowerCase().includes(term)) return false;
      }
      if (quickSearch) {
        const s = quickSearch.toLowerCase();
        if (!(item.produto_nome || '').toLowerCase().includes(s) && !(item.numero_lote || '').toLowerCase().includes(s) && !(item.local_nome || '').toLowerCase().includes(s)) return false;
      }
      const qtd = Number(item.quantidade_atual);
      const min = Number(produtosMinimo[item.produto_id] || 0);
      if (filters.saldo_positivo && qtd <= 0) return false;
      if (filters.saldo_negativo && qtd >= 0) return false;
      if (filters.abaixo_minimo && qtd >= min) return false;
      if (!filters.saldo_positivo && !filters.saldo_negativo && !filters.abaixo_minimo && qtd === 0) return false;
      if (filters.prazo_validade && filters.prazo_validade !== 'todos') {
        const days = getDaysToExpiry(item.data_validade);
        if (days === null) return false;
        if (filters.prazo_validade === '7d' && days > 7) return false;
        if (filters.prazo_validade === '15d' && days > 15) return false;
      }
      return true;
    });
  }, [estoque, filters, produtosMinimo, tipoFiltro, quickSearch]);

  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const formatDate = (d) => { if (!d) return '—'; try { const [y,m,dd] = d.split('T')[0].split('-'); return `${dd}/${m}/${y}`; } catch { return d; } };

  const formatQuantityLabel = (tipo, qtd) => {
    const isB = isBandeja({ tipo_lote: tipo });
    return isB ? `${fmtNum(qtd)} bandeja${Math.abs(qtd) === 1 ? '' : 's'}` : `${fmtNum(qtd)} unidade${Math.abs(qtd) === 1 ? '' : 's'}`;
  };

  const calculateTotalUnidades = (tipo, qtd, unid) => isBandeja({ tipo_lote: tipo }) ? Number(qtd) * Number(unid || 0) : Number(qtd);

  const renderValidade = (dateString) => {
    if (!dateString) return <span className="text-gray-400 text-xs">—</span>;
    const days = getDaysToExpiry(dateString);
    const formatted = formatDate(dateString);
    if (days !== null && days < 0) return <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{formatted}</span>;
    if (days !== null && days <= 7) return <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{formatted}</span>;
    return <span className="text-xs text-gray-600">{formatted}</span>;
  };

  const totals = useMemo(() => {
    const totalBandejas = countBandejas(filteredEstoque, true);
    const totalUnidades = filteredEstoque.reduce((acc, curr) => acc + calculateTotalUnidades(curr.tipo_lote || 'base', curr.quantidade_atual, curr.unidades_por_bandeja), 0);
    return { totalUnidades, totalBandejas };
  }, [filteredEstoque]);

  // KPIs gerais
  const kpis = useMemo(() => ({
    locaisAtivos: new Set(filteredEstoque.map(i => i.local_id)).size,
    vencidos: filteredEstoque.filter(i => { const d = getDaysToExpiry(i.data_validade); return d !== null && d < 0; }).length,
    vencendo: filteredEstoque.filter(i => { const d = getDaysToExpiry(i.data_validade); return d !== null && d >= 0 && d <= 7; }).length,
  }), [filteredEstoque]);

  const groupedData = useMemo(() => {
    if (!agruparProduto) return [];
    const groups = {};
    filteredEstoque.forEach(item => {
      if (!groups[item.produto_nome]) groups[item.produto_nome] = { produto_nome: item.produto_nome, items: [], subtotalUnidades: 0, subtotalBandejas: 0 };
      groups[item.produto_nome].items.push(item);
      groups[item.produto_nome].subtotalUnidades += calculateTotalUnidades(item.tipo_lote || 'base', item.quantidade_atual, item.unidades_por_bandeja);
      if (isBandeja(item)) groups[item.produto_nome].subtotalBandejas += Number(item.quantidade_atual || 0);
    });
    return Object.values(groups).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
  }, [filteredEstoque, agruparProduto]);

  const toggleGroup = (nome) => setExpandedGroups(prev => ({ ...prev, [nome]: !prev[nome] }));

  const rowBg = (item) => {
    const days = getDaysToExpiry(item.data_validade);
    if (days !== null && days < 0) return 'bg-red-50 hover:bg-red-100';
    if (days !== null && days <= 7) return 'bg-amber-50 hover:bg-amber-100';
    return 'hover:bg-gray-50';
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredEstoque.map(item => {
        const tipo = item.tipo_lote || 'base';
        const isB = isBandeja(item);
        const days = getDaysToExpiry(item.data_validade);
        let alertStatus = '';
        if (days !== null) { if (days < 0) alertStatus = 'VENCIDO'; else if (days <= 3) alertStatus = 'CRÍTICO'; else if (days <= 7) alertStatus = 'Atenção'; else if (days <= 15) alertStatus = 'Aviso'; }
        return {
          'Produto': item.produto_nome,
          'Lote': item.numero_lote || '-',
          'Lote Origem': item.lote_origem_numero || '-',
          'Data Produção': formatDateBR(item.created_at),
          'Local': item.local_nome,
          'Tipo': tipo.toUpperCase(),
          'Unid. por Bandeja': isB && item.unidades_por_bandeja ? item.unidades_por_bandeja : '-',
          'Quantidade': formatQuantityLabel(tipo, item.quantidade_atual),
          'Total em Unidades': calculateTotalUnidades(tipo, item.quantidade_atual, item.unidades_por_bandeja),
          'Validade': formatDate(item.data_validade),
          'Alerta': alertStatus
        };
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Estoque");
      XLSX.writeFile(wb, `estoque_local_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast({ title: 'Exportado com sucesso!' });
    } catch { toast({ title: 'Erro na exportação', variant: 'destructive' }); }
  };

  const renderRow = (item, indent = false) => {
    const itemTipo = item.tipo_lote || 'base';
    const totalUnid = calculateTotalUnidades(itemTipo, item.quantidade_atual, item.unidades_por_bandeja);
    // A coluna "Lote" agora mostra sempre o número do próprio lote — a
    // substituição pelo lote de origem (que getLotDisplayValue fazia)
    // deixou de fazer sentido depois que ganhamos a coluna "Lote Origem"
    // dedicada; mostrar os dois iguais em colunas separadas é redundante.
    const displayNum = item.numero_lote || '-';
    const itemIsBandeja = isBandeja(item);
    return (
      <tr key={`${item.lote_id}-${item.local_id}`} className={`border-b border-gray-50 transition-colors ${rowBg(item)}`}>
        <td className={`px-4 py-3 font-semibold text-gray-900 ${indent ? 'pl-10 text-sm text-gray-600' : ''}`}>
          {indent ? `↳ ${item.produto_nome}` : item.produto_nome}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs text-gray-700">{displayNum}</span>
            {item.lote_devolvido && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">DEV</span>}
            {itemIsBandeja && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">BDJ</span>}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-gray-500">{item.lote_origem_numero || '—'}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">{formatDateBR(item.created_at)}</td>
        <td className="px-4 py-3">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.local_nome}</span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${itemIsBandeja ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
            {itemTipo.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">
          {itemIsBandeja && item.unidades_por_bandeja ? fmtNum(item.unidades_por_bandeja) : '—'}
        </td>
        <td className={`px-4 py-3 text-right font-semibold text-sm ${Number(item.quantidade_atual) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
          {formatQuantityLabel(itemTipo, item.quantidade_atual)}
        </td>
        <td className={`px-4 py-3 text-right font-black text-base ${Number(item.quantidade_atual) < 0 ? 'text-red-600' : 'text-blue-700'}`}>
          {fmtNum(totalUnid)}
        </td>
        <td className="px-4 py-3 text-center">{renderValidade(item.data_validade)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleEditClick(item); }}
              title="Editar lote"
              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleTransferirClick(item); }}
              title="Transferir lote"
              className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </button>
            {(() => { const d = getDaysToExpiry(item.data_validade); const vencido = d !== null && d < 0; return (
              <button onClick={(e) => { e.stopPropagation(); handleInactivateClick(item); }}
                title="Inativar lote"
                className={`p-1.5 rounded-lg transition-colors ${vencido ? 'text-red-600 hover:text-red-800 hover:bg-red-100 ring-1 ring-red-300' : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'}`}>
                <PackageMinus className="h-3.5 w-3.5" />
              </button>
            ); })()}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <Helmet><title>Estoque por Local - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-5 max-w-7xl mx-auto pb-10">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Estoque por Local</h1>
                <p className="text-gray-500 text-sm mt-0.5">Distribuição de lotes por local com validades.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportToExcel} variant="outline" className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-9 text-sm">
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button onClick={fetchData} variant="outline" className="gap-2 h-9 text-sm">
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          </div>

          {/* KPI cards */}
          {!isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-1"><Package className="h-4 w-4 text-blue-500"/><p className="text-xs font-bold text-gray-500 uppercase">Total Unidades</p></div>
                <p className="text-3xl font-black text-blue-700">{fmtNum(totals.totalUnidades)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{filteredEstoque.length} lotes</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-1"><Layers className="h-4 w-4 text-green-500"/><p className="text-xs font-bold text-gray-500 uppercase">Total Bandejas</p></div>
                <p className="text-3xl font-black text-green-700">{fmtNum(totals.totalBandejas)}</p>
                <p className="text-xs text-gray-400 mt-0.5">em estoque</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-1"><MapPin className="h-4 w-4 text-gray-400"/><p className="text-xs font-bold text-gray-500 uppercase">Locais Ativos</p></div>
                <p className="text-3xl font-black text-gray-900">{kpis.locaisAtivos}</p>
                <p className="text-xs text-gray-400 mt-0.5">com estoque</p>
              </div>
              <div className={`rounded-2xl border shadow-sm p-4 ${kpis.vencidos > 0 ? 'bg-red-600 border-red-500' : kpis.vencendo > 0 ? 'bg-amber-500 border-amber-400' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarX className={`h-4 w-4 ${kpis.vencidos > 0 || kpis.vencendo > 0 ? 'text-white opacity-80' : 'text-gray-400'}`}/>
                  <p className={`text-xs font-bold uppercase ${kpis.vencidos > 0 || kpis.vencendo > 0 ? 'text-white opacity-80' : 'text-gray-500'}`}>Alertas Validade</p>
                </div>
                <p className={`text-3xl font-black ${kpis.vencidos > 0 || kpis.vencendo > 0 ? 'text-white' : 'text-gray-900'}`}>{kpis.vencidos + kpis.vencendo}</p>
                <p className={`text-xs mt-0.5 ${kpis.vencidos > 0 || kpis.vencendo > 0 ? 'text-white opacity-70' : 'text-gray-400'}`}>
                  {kpis.vencidos > 0 ? `${kpis.vencidos} vencido(s)` : `${kpis.vencendo} vencendo`}
                </p>
              </div>
            </div>
          )}

          {/* Banner de alerta */}
          {!isLoading && kpis.vencidos > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0"/>
              <p className="text-sm text-red-700 font-semibold">{kpis.vencidos} lote(s) vencido(s) com saldo em estoque — verifique na página de Lotes.</p>
            </div>
          )}

          {/* Controles — tipo + agrupar + busca rápida */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-wrap gap-4 items-center">
            {/* Tipo tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {[['todos','Todos'],['base','Base'],['bandeja','Bandeja']].map(([v,l]) => (
                <button key={v} onClick={() => setTipoFiltro(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tipoFiltro === v ? 'bg-white text-blue-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Agrupar */}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <Checkbox id="agruparProduto" checked={agruparProduto} onCheckedChange={setAgruparProduto}/>
              <Label htmlFor="agruparProduto" className="text-sm font-medium text-gray-700 cursor-pointer">Agrupar por Produto</Label>
            </div>

            {/* Busca rápida */}
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"/>
              <input type="text" placeholder="Buscar produto, lote ou local..." value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                className="h-8 pl-8 pr-4 border border-gray-200 rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-gray-50 w-56"
                style={{ fontSize: '13px' }}/>
            </div>
          </div>

          {/* Filtros avançados */}
          <FilterBar locais={locaisFiltrados} filters={filters} setFilters={setFilters} onClearFilters={handleClearFilters}/>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500"/>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-12">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={fetchData} variant="outline" className="gap-2"><RefreshCw className="h-4 w-4"/> Tentar novamente</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                      <th className="px-4 py-3 text-left">Produto</th>
                      <th className="px-4 py-3 text-left">Lote</th>
                      <th className="px-4 py-3 text-left">Lote Origem</th>
                      <th className="px-4 py-3 text-left">Dt. Produção</th>
                      <th className="px-4 py-3 text-left">Local</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-center">Un/Bdj</th>
                      <th className="px-4 py-3 text-right">Quantidade</th>
                      <th className="px-4 py-3 text-right text-blue-600">Total Un.</th>
                      <th className="px-4 py-3 text-center">Validade</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEstoque.length === 0 ? (
                      <tr><td colSpan={10} className="py-16 text-center">
                        <Package className="h-10 w-10 mx-auto text-gray-300 mb-3"/>
                        <p className="text-gray-500 font-medium">Nenhum registro encontrado.</p>
                        <button onClick={handleClearFilters} className="text-xs text-blue-600 hover:underline mt-2">Limpar filtros</button>
                      </td></tr>
                    ) : agruparProduto ? (
                      <>
                        {groupedData.map(group => {
                          const isExp = expandedGroups[group.produto_nome];
                          return (
                            <React.Fragment key={group.produto_nome}>
                              <tr className="bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleGroup(group.produto_nome)}>
                                <td colSpan={7} className="px-4 py-3 font-bold text-gray-900">
                                  <div className="flex items-center gap-2">
                                    {isExp ? <ChevronDown className="h-4 w-4 text-gray-500"/> : <ChevronRight className="h-4 w-4 text-gray-500"/>}
                                    {group.produto_nome}
                                    <span className="text-xs font-normal text-gray-400">({group.items.length} lote{group.items.length !== 1 ? 's' : ''})</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">
                                  {group.subtotalBandejas > 0 ? `${fmtNum(group.subtotalBandejas)} bdj` : ''}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-blue-700 text-base">{fmtNum(group.subtotalUnidades)}</td>
                                <td/>
                              </tr>
                              {isExp && group.items.map(item => renderRow(item, true))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : filteredEstoque.map(item => renderRow(item))}

                    {/* Linha de totais */}
                    {filteredEstoque.length > 0 && (
                      <tr className="bg-blue-50 border-t-2 border-blue-200">
                        <td colSpan={8} className="px-4 py-3 text-sm font-bold text-blue-800">
                          TOTAL — {filteredEstoque.length} lotes · {fmtNum(totals.totalBandejas)} bandejas
                        </td>
                        <td className="px-4 py-3 text-right font-black text-xl text-blue-700">{fmtNum(totals.totalUnidades)}</td>
                        <td/>
                        <td/>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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