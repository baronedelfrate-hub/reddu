import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Search, XCircle, RefreshCw, ChevronLeft, ChevronRight, PackageOpen, Factory, Layers, TrendingUp } from 'lucide-react';

export default function RelatorioProdutosPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const defaultFilters = { dataInicio: '', dataFim: '', produtoFinalId: 'all' };
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;

  useEffect(() => { if (empresaId) fetchProdutos(); }, [empresaId]);

  const fetchProdutos = async () => {
    const { data } = await supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome');
    setProdutos(data || []);
  };

  const fetchRelatorio = useCallback(async (currentFilters = appliedFilters, currentPage = page) => {
    if (!empresaId) return;
    setIsLoading(true); setError(null);
    try {
      let query = supabase.from('movimentacoes').select(`
        id, tipo, data_movimentacao, quantidade, observacao, produto_id,
        produtos:produto_id(id, nome),
        lotes:lote_id(id, numero_lote, tipo_lote, unidades_por_bandeja),
        locais:local_destino_id(id, nome)
      `, { count: 'exact' })
        .eq('empresa_id', empresaId)
        .in('tipo', ['producao', 'bandeja', 'producao_bandeja'])
        .order('data_movimentacao', { ascending: false })
        .range(currentPage * limit, (currentPage + 1) * limit - 1);

      if (currentFilters.dataInicio) query = query.gte('data_movimentacao', `${currentFilters.dataInicio}T00:00:00.000Z`);
      if (currentFilters.dataFim) query = query.lte('data_movimentacao', `${currentFilters.dataFim}T23:59:59.999Z`);
      if (currentFilters.produtoFinalId && currentFilters.produtoFinalId !== 'all') query = query.eq('produto_id', currentFilters.produtoFinalId);

      const { data: reportData, error: reportError, count } = await query;
      if (reportError) throw reportError;
      setData(reportData || []);
      setTotalCount(count || 0);
    } catch (err) {
      setError('Falha ao carregar o relatório.');
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, appliedFilters, page, toast]);

  useEffect(() => { fetchRelatorio(appliedFilters, page); }, [fetchRelatorio, appliedFilters, page]);

  const handleApplyFilters = () => { setAppliedFilters(filters); setPage(0); };
  const handleClearFilters = () => { setFilters(defaultFilters); setAppliedFilters(defaultFilters); setPage(0); };
  const totalPages = Math.ceil(totalCount / limit);

  // KPIs da página atual
  const kpis = useMemo(() => {
    const totalUnidades = data.reduce((s, r) => s + (r.quantidade || 0), 0);
    const totalBandejas = data.reduce((s, r) => {
      const upb = r.lotes?.unidades_por_bandeja;
      if ((r.tipo === 'bandeja' || r.tipo === 'producao_bandeja' || r.lotes?.tipo_lote === 'bandeja') && upb > 0)
        return s + Math.floor(r.quantidade / upb);
      return s;
    }, 0);
    const produtosUnicos = new Set(data.map(r => r.produto_id)).size;
    return { totalUnidades, totalBandejas, produtosUnicos };
  }, [data]);

  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  const renderBandejas = (row) => {
    const isBandeja = row.tipo === 'bandeja' || row.tipo === 'producao_bandeja' || row.lotes?.tipo_lote === 'bandeja';
    const upb = row.lotes?.unidades_por_bandeja;
    if (isBandeja && upb > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-orange-600 font-bold">
          <PackageOpen className="h-3.5 w-3.5" /> {Math.floor(row.quantidade / upb)}
        </span>
      );
    }
    return <span className="text-gray-300">—</span>;
  };

  const renderTipo = (tipo) => {
    if (tipo === 'producao') return <span className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-semibold"><Factory className="h-3 w-3"/>Produção</span>;
    if (tipo === 'bandeja' || tipo === 'producao_bandeja') return <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-semibold"><Layers className="h-3 w-3"/>Bandeja</span>;
    return <span className="text-xs text-gray-400">{tipo}</span>;
  };

  return (
    <>
      <Helmet><title>Relatório de Produção - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-5 max-w-7xl mx-auto pb-10">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Relatório de Produção</h1>
                <p className="text-gray-500 text-sm mt-0.5">Histórico de produção e entrada de lotes no estoque.</p>
              </div>
            </div>
            <Button onClick={() => fetchRelatorio()} variant="outline" className="gap-2 self-start">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>

          {/* KPI cards */}
          {!isLoading && data.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 text-indigo-600 mb-1">
                  <Factory className="h-4 w-4" />
                  <p className="text-xs font-bold uppercase text-gray-500">Unidades produzidas</p>
                </div>
                <p className="text-3xl font-black text-indigo-700">{fmtNum(kpis.totalUnidades)}</p>
                <p className="text-xs text-gray-400 mt-0.5">nesta página</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <PackageOpen className="h-4 w-4 text-orange-500" />
                  <p className="text-xs font-bold uppercase text-gray-500">Bandejas</p>
                </div>
                <p className="text-3xl font-black text-orange-600">{fmtNum(kpis.totalBandejas)}</p>
                <p className="text-xs text-gray-400 mt-0.5">nesta página</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-bold uppercase text-gray-500">Total de registros</p>
                </div>
                <p className="text-3xl font-black text-gray-900">{fmtNum(totalCount)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpis.produtosUnicos} produto(s)</p>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Data Início</Label>
                <Input type="date" value={filters.dataInicio}
                  onChange={e => setFilters(p => ({ ...p, dataInicio: e.target.value }))}
                  className="h-9 bg-gray-50 border-gray-200 text-sm" style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Data Fim</Label>
                <Input type="date" value={filters.dataFim}
                  onChange={e => setFilters(p => ({ ...p, dataFim: e.target.value }))}
                  className="h-9 bg-gray-50 border-gray-200 text-sm" style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Produto</Label>
                <Select value={filters.produtoFinalId} onValueChange={v => setFilters(p => ({ ...p, produtoFinalId: v }))}>
                  <SelectTrigger className="h-9 bg-gray-50 border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos</SelectItem>
                    {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleApplyFilters} className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 h-9 text-sm">
                  <Search className="h-4 w-4" /> Aplicar
                </Button>
                <Button onClick={handleClearFilters} variant="outline" className="gap-2 h-9 text-sm">
                  <XCircle className="h-4 w-4" /> Limpar
                </Button>
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {error ? (
              <div className="flex flex-col items-center justify-center p-12">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={() => fetchRelatorio()} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                        <th className="px-4 py-3 text-left">Data / Hora</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-left">Produto</th>
                        <th className="px-4 py-3 text-left">Lote</th>
                        <th className="px-4 py-3 text-left">Local Destino</th>
                        <th className="px-4 py-3 text-right text-indigo-600">Qtd. Unidades</th>
                        <th className="px-4 py-3 text-right text-orange-600">Bandejas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={7} className="py-16 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-3" />
                          <p className="text-gray-400 text-sm">Carregando...</p>
                        </td></tr>
                      ) : data.length === 0 ? (
                        <tr><td colSpan={7} className="py-16 text-center">
                          <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                          <p className="text-gray-500 font-medium">Nenhum registro encontrado.</p>
                        </td></tr>
                      ) : (
                        <>
                          {data.map(row => (
                            <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(row.data_movimentacao).toLocaleString('pt-BR')}
                              </td>
                              <td className="px-4 py-3">{renderTipo(row.tipo)}</td>
                              <td className="px-4 py-3 font-semibold text-gray-900">{row.produtos?.nome || '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.lotes?.numero_lote || '—'}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{row.locais?.nome || '—'}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-black text-indigo-600 text-base">+{fmtNum(row.quantidade)}</td>
                              <td className="px-4 py-3 text-right">{renderBandejas(row)}</td>
                            </tr>
                          ))}
                          {/* Totais da página */}
                          <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                            <td colSpan={5} className="px-4 py-3 text-sm font-bold text-indigo-800">
                              TOTAL DA PÁGINA
                            </td>
                            <td className="px-4 py-3 text-right font-black text-indigo-700 text-base">+{fmtNum(kpis.totalUnidades)}</td>
                            <td className="px-4 py-3 text-right font-black text-orange-600">
                              {kpis.totalBandejas > 0 ? fmtNum(kpis.totalBandejas) : '—'}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {!isLoading && totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500">
                      Mostrando <strong>{page * limit + 1}</strong>–<strong>{Math.min((page + 1) * limit, totalCount)}</strong> de <strong>{fmtNum(totalCount)}</strong>
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="h-8 w-8 p-0">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-gray-600 font-semibold">{page + 1} / {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-8 w-8 p-0">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}