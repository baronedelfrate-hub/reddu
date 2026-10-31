import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, PackageSearch, AlertTriangle, AlertCircle, Clock, CheckCircle2, RefreshCw, TrendingDown, Boxes, ShoppingCart, BarChart3 } from 'lucide-react';
import ProductionSalesControlFilters from './ProductionSalesControlFilters';

export default function ProductionSalesControlTable({ empresaId }) {
  const [data, setData] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [locais, setLocais] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ produtoId: '', localId: '', somenteSaldoPositivo: true });

  const fetchData = async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [
        { data: prodData, error: prodError },
        { data: locData, error: locError },
        { data: lotesData, error: lotesError },
        { data: estoqueData, error: estError },
        { data: movsData, error: movsError }
      ] = await Promise.all([
        supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('lotes').select('id, numero_lote, produto_id, data_validade, tipo_lote')
          .eq('empresa_id', empresaId).eq('ativo', true).eq('lote_devolvido', false)
          .order('data_validade', { ascending: true, nullsFirst: false }),
        supabase.from('estoque_por_local').select('*').eq('empresa_id', empresaId),
        supabase.from('movimentacoes').select('lote_id, tipo, quantidade').eq('empresa_id', empresaId)
      ]);

      if (prodError) throw prodError;
      if (locError) throw locError;
      if (lotesError) throw lotesError;
      if (estError) throw estError;
      if (movsError) throw movsError;

      setProdutos(prodData || []);
      setLocais(locData || []);

      const produtosMap = {};
      (prodData || []).forEach(p => produtosMap[p.id] = p.nome);

      const movsMap = {};
      (movsData || []).forEach(m => {
        if (!movsMap[m.lote_id]) movsMap[m.lote_id] = { producao_bandeja: 0, saidas: 0 };
        if (m.tipo === 'producao_bandeja') movsMap[m.lote_id].producao_bandeja += m.quantidade;
        if (m.tipo === 'venda_mercado') movsMap[m.lote_id].saidas += m.quantidade;
      });

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const calcDias = (dv) => {
        if (!dv) return null;
        return Math.ceil((new Date(dv + 'T00:00:00').getTime() - today.getTime()) / (1000 * 3600 * 24));
      };

      const combinedData = [];
      (lotesData || []).forEach(lote => {
        const loteEstoque = (estoqueData || []).filter(e => e.lote_id === lote.id);
        const m = movsMap[lote.id] || { producao_bandeja: 0, saidas: 0 };
        const isBandeja = (lote.tipo_lote || '').toLowerCase() === 'bandeja';
        const bandejas_produzidas = isBandeja ? m.producao_bandeja : 0;

        if (loteEstoque.length === 0) {
          if (bandejas_produzidas > 0 || m.saidas > 0) {
            combinedData.push({
              produto_id: lote.produto_id, produto_nome: produtosMap[lote.produto_id] || '-',
              lote_id: lote.id, numero_lote: lote.numero_lote,
              local_id: null, local_nome: '—', quantidade_atual: 0,
              data_validade: lote.data_validade, dias_para_vencer: calcDias(lote.data_validade),
              bandejas_produzidas, saida_mercado: m.saidas,
            });
          }
        } else {
          loteEstoque.forEach(e => {
            combinedData.push({
              produto_id: e.produto_id, produto_nome: e.produto_nome,
              lote_id: e.lote_id, numero_lote: e.numero_lote,
              local_id: e.local_id, local_nome: e.local_nome,
              quantidade_atual: e.quantidade_atual, data_validade: lote.data_validade,
              dias_para_vencer: calcDias(lote.data_validade),
              bandejas_produzidas, saida_mercado: m.saidas,
            });
          });
        }
      });
      setData(combinedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [empresaId]);

  const filteredData = useMemo(() => {
    let result = data;
    if (filters.produtoId) result = result.filter(d => d.produto_id === filters.produtoId);
    if (filters.localId) result = result.filter(d => d.local_id === filters.localId);
    if (filters.somenteSaldoPositivo) result = result.filter(d => d.quantidade_atual > 0);
    return [...result].sort((a, b) => {
      if (!a.data_validade && !b.data_validade) return 0;
      if (!a.data_validade) return 1;
      if (!b.data_validade) return -1;
      return new Date(a.data_validade) - new Date(b.data_validade);
    });
  }, [data, filters]);

  // KPIs
  const kpis = useMemo(() => ({
    totalLotes: filteredData.length,
    totalSaldo: filteredData.reduce((s, r) => s + (r.quantidade_atual || 0), 0),
    totalProducao: filteredData.reduce((s, r) => s + (r.bandejas_produzidas || 0), 0),
    totalSaidas: filteredData.reduce((s, r) => s + (r.saida_mercado || 0), 0),
    vencidos: filteredData.filter(r => r.dias_para_vencer !== null && r.dias_para_vencer < 0 && r.quantidade_atual > 0).length,
    criticos: filteredData.filter(r => r.dias_para_vencer !== null && r.dias_para_vencer >= 0 && r.dias_para_vencer <= 7 && r.quantidade_atual > 0).length,
  }), [filteredData]);

  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const formatDate = (d) => { if (!d) return '—'; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };

  const renderStatusBadge = (dias) => {
    if (dias === null) return <span className="text-gray-400 text-xs">—</span>;
    if (dias < 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><AlertTriangle className="h-3 w-3"/>Vencido</span>;
    if (dias === 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200"><AlertCircle className="h-3 w-3"/>Hoje</span>;
    if (dias <= 7) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><Clock className="h-3 w-3"/>{dias}d</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3"/>OK</span>;
  };

  const rowBg = (row) => {
    if (row.dias_para_vencer !== null && row.dias_para_vencer < 0 && row.quantidade_atual > 0) return 'bg-red-50 hover:bg-red-100';
    if (row.dias_para_vencer !== null && row.dias_para_vencer >= 0 && row.dias_para_vencer <= 7 && row.quantidade_atual > 0) return 'bg-amber-50 hover:bg-amber-100';
    return 'hover:bg-gray-50';
  };

  return (
    <div className="space-y-5">

      {/* KPI Cards */}
      {!isLoading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Lotes', value: fmtNum(kpis.totalLotes), icon: <Boxes className="h-4 w-4"/>, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Saldo Total', value: fmtNum(kpis.totalSaldo), icon: <BarChart3 className="h-4 w-4"/>, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Produzidas', value: fmtNum(kpis.totalProducao), icon: <PackageSearch className="h-4 w-4"/>, color: 'text-indigo-700', bg: 'bg-indigo-50' },
            { label: 'Saídas', value: fmtNum(kpis.totalSaidas), icon: <ShoppingCart className="h-4 w-4"/>, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Vencidos', value: kpis.vencidos, icon: <AlertTriangle className="h-4 w-4"/>, color: kpis.vencidos > 0 ? 'text-white' : 'text-gray-400', bg: kpis.vencidos > 0 ? 'bg-red-600' : 'bg-white', border: kpis.vencidos > 0 ? '' : 'border border-gray-100' },
            { label: 'Críticos', value: kpis.criticos, icon: <Clock className="h-4 w-4"/>, color: kpis.criticos > 0 ? 'text-white' : 'text-gray-400', bg: kpis.criticos > 0 ? 'bg-amber-500' : 'bg-white', border: kpis.criticos > 0 ? '' : 'border border-gray-100' },
          ].map((k, i) => (
            <div key={i} className={`${k.bg} ${k.border || ''} rounded-2xl shadow-sm p-4`}>
              <div className={`flex items-center gap-1.5 ${k.color} mb-1 opacity-70`}>{k.icon}<p className="text-xs font-semibold uppercase tracking-wide">{k.label}</p></div>
              <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alertas */}
      {!isLoading && kpis.vencidos > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0"/>
          <p className="text-sm text-red-700 font-semibold">{kpis.vencidos} lote(s) vencido(s) com saldo em estoque — verifique e inative-os.</p>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Header com filtros */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-indigo-500"/>
            <span className="font-bold text-gray-800">Detalhamento por Lote</span>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">{filteredData.length} lotes</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 h-8 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}/> Atualizar
          </Button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <ProductionSalesControlFilters produtos={produtos} locais={locais} filters={filters} onFilterChange={setFilters}/>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500"/>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-16">
              <PackageSearch className="h-10 w-10 mx-auto text-gray-300 mb-3"/>
              <p className="text-gray-500 font-medium">Nenhum registro encontrado.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Lote</th>
                  <th className="px-4 py-3 text-left">Local Atual</th>
                  <th className="px-4 py-3 text-right">Bdj Produzidas</th>
                  <th className="px-4 py-3 text-right">Saída Mercado</th>
                  <th className="px-4 py-3 text-right">Saldo Atual</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Validade</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, idx) => (
                  <tr key={`${row.lote_id}-${row.local_id || 'un'}-${idx}`}
                    className={`border-b border-gray-50 transition-colors ${rowBg(row)}`}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.produto_nome}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.numero_lote}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.local_nome}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">{fmtNum(row.bandejas_produzidas)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmtNum(row.saida_mercado)}</td>
                    <td className={`px-4 py-3 text-right font-black text-lg ${row.quantidade_atual === 0 ? 'text-gray-300' : 'text-gray-900'}`}>
                      {fmtNum(row.quantidade_atual)}
                    </td>
                    <td className="px-4 py-3 text-center">{renderStatusBadge(row.dias_para_vencer)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-mono font-semibold ${
                        row.dias_para_vencer !== null && row.dias_para_vencer < 0 ? 'text-red-600' :
                        row.dias_para_vencer !== null && row.dias_para_vencer <= 7 ? 'text-amber-600' :
                        'text-gray-500'
                      }`}>{formatDate(row.data_validade)}</span>
                      {row.dias_para_vencer !== null && (
                        <p className="text-xs text-gray-400">{row.dias_para_vencer < 0 ? `${Math.abs(row.dias_para_vencer)}d atrás` : `${row.dias_para_vencer}d`}</p>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totais */}
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-indigo-800">TOTAL — {filteredData.length} lotes</td>
                  <td className="px-4 py-3 text-right font-black text-indigo-700">{fmtNum(kpis.totalProducao)}</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{fmtNum(kpis.totalSaidas)}</td>
                  <td className="px-4 py-3 text-right font-black text-xl text-gray-900">{fmtNum(kpis.totalSaldo)}</td>
                  <td colSpan={2}/>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}