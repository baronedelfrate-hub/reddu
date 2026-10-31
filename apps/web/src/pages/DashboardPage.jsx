import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import AlertasOperacionaisSection from '@/components/dashboard/AlertasOperacionaisSection';
import ExecutiveSummaryCards from '@/components/dashboard/ExecutiveSummaryCards';
import ProductRankingTable from '@/components/dashboard/ProductRankingTable';
import OperationalDashboardCards from '@/components/dashboard/OperationalDashboardCards';
import OperationalDashboardTables from '@/components/dashboard/OperationalDashboardTables';
import { initializeDefaultLocais } from '@/lib/initializeDefaultLocais';
import { LayoutDashboard, Activity, TrendingUp, RefreshCw, DollarSign } from 'lucide-react';
import NewMetricsCards from '@/components/dashboard/NewMetricsCards';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { empresaId } = useAuth();
  
  const today = new Date();
  const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
  const formatDate = (date) => date.toISOString().split('T')[0];
  
  const [filters, setFilters] = useState({
    dataInicio: formatDate(inicioMes),
    dataFim: formatDate(today)
  });

  const [summaryData, setSummaryData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [rankingData, setRankingData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use callback for forced refresh
  const fetchDashboardData = useCallback(async (dataInicio, dataFim, forceRefresh = false) => {
    if (!empresaId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      console.log(`[Dashboard] Buscando dados... ${forceRefresh ? '(Refresh Forçado)' : ''}`);
      
      const { data: dailyData, error: dailyError } = await supabase
        .from('dashboard_producao_venda_diaria')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .order('data', { ascending: true });

      if (dailyError) throw dailyError;
      setChartData(dailyData || []);

      const { data: rankData, error: rankError } = await supabase
        .from('dashboard_ranking_produtos')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('data_referencia', dataInicio)
        .lte('data_referencia', dataFim);

      if (rankError) throw rankError;

      const { data: activeLotes, error: activeLotesError } = await supabase
        .from('lotes')
        .select('produto_id, quantidade')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('lote_devolvido', false);

      if (activeLotesError) throw activeLotesError;

      const activeStockMap = {};
      (activeLotes || []).forEach(l => {
        activeStockMap[l.produto_id] = (activeStockMap[l.produto_id] || 0) + (l.quantidade || 0);
      });

      const productMap = {};
      let totalProd = 0;
      let totalVend = 0;

      (rankData || []).forEach(row => {
        const pid = row.produto_id;
        if (!productMap[pid]) {
          productMap[pid] = {
            produto_id: pid,
            produto_nome: row.produto_nome,
            quantidade_produzida: 0,
            quantidade_vendida: 0,
            estoque_atual: activeStockMap[pid] || 0
          };
        }
        productMap[pid].quantidade_produzida += Number(row.quantidade_produzida || 0);
        productMap[pid].quantidade_vendida += Number(row.quantidade_vendida || 0);
        
        totalProd += Number(row.quantidade_produzida || 0);
        totalVend += Number(row.quantidade_vendida || 0);
      });

      // Complemento: vendas de mercado (bandeja) via movimentações reais —
      // a view de ranking pode não estar cobrindo esse canal (mesmo padrão
      // de bug já encontrado na Taxa de Conversão). Respeita a mesma regra
      // de baixa do Consignado usada no resto do sistema.
      const { data: locaisMercadoRanking } = await supabase
        .from('locais').select('id, modelo_negocio').eq('empresa_id', empresaId).eq('tipo', 'Mercado');
      const modeloNegocioPorLocalId = {};
      (locaisMercadoRanking || []).forEach(l => { modeloNegocioPorLocalId[l.id] = l.modelo_negocio; });

      const { data: movsMercado, error: movsMercadoError } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, local_origem_id, venda_id, produtos(nome)')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'venda_mercado')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      if (movsMercadoError) throw movsMercadoError;

      const vendaIdsMercado = [...new Set((movsMercado || []).map(m => m.venda_id).filter(Boolean))];
      let baixadoMapRanking = {};
      if (vendaIdsMercado.length > 0) {
        const { data: vendasBaixaRanking } = await supabase.from('vendas').select('id, financeiro_baixado').in('id', vendaIdsMercado);
        (vendasBaixaRanking || []).forEach(v => { baixadoMapRanking[v.id] = v.financeiro_baixado; });
      }

      (movsMercado || []).forEach(mov => {
        const modelo = modeloNegocioPorLocalId[mov.local_origem_id];
        const jaConta = modelo !== 'consignado' || (mov.venda_id && baixadoMapRanking[mov.venda_id]);
        if (!jaConta) return;

        const pid = mov.produto_id;
        if (!productMap[pid]) {
          productMap[pid] = {
            produto_id: pid,
            produto_nome: mov.produtos?.nome || 'Produto',
            quantidade_produzida: 0,
            quantidade_vendida: 0,
            estoque_atual: activeStockMap[pid] || 0
          };
        }
        const qtd = Number(mov.quantidade || 0);
        productMap[pid].quantidade_vendida += qtd;
        totalVend += qtd;
      });

      const aggregatedRanking = Object.values(productMap).sort((a, b) => b.quantidade_vendida - a.quantidade_vendida);
      setRankingData(aggregatedRanking);

      let prodMaisVendido = null;
      let maxVendas = -1;
      let prodMaiorEstoqueParado = null;
      let maxEstoqueParado = -1;

      aggregatedRanking.forEach(p => {
        if (p.quantidade_vendida > maxVendas) {
          maxVendas = p.quantidade_vendida;
          prodMaisVendido = p;
        }
        if (p.quantidade_vendida === 0 && p.estoque_atual > maxEstoqueParado) {
          maxEstoqueParado = p.estoque_atual;
          prodMaiorEstoqueParado = p;
        }
      });

      setSummaryData({
        total_produzido: totalProd,
        total_vendido: totalVend,
        produto_mais_vendido_nome: prodMaisVendido?.produto_nome,
        quantidade_mais_vendido: prodMaisVendido?.quantidade_vendida || 0,
        produto_maior_estoque_parado_nome: prodMaiorEstoqueParado?.produto_nome,
        quantidade_estoque_parado: prodMaiorEstoqueParado?.estoque_atual || 0,
      });

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (empresaId) {
      const ensureSystemLocals = async () => {
        try {
          await supabase.rpc('ensure_descarte_local_rpc', { p_empresa_id: empresaId });
        } catch (err) {
          console.error('Silent error ensuring DESCARTE local:', err);
        }
      };

      ensureSystemLocals().then(() => {
        initializeDefaultLocais(empresaId).then(() => {
          fetchDashboardData(filters.dataInicio, filters.dataFim);
        });
      });
    } else {
      setIsLoading(false);
    }
  }, [empresaId, filters, fetchDashboardData]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const forceRefresh = () => {
    fetchDashboardData(filters.dataInicio, filters.dataFim, true);
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-red-100 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard Completo - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[var(--color-primary-light)]/20 text-[var(--color-primary)] rounded-lg">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Visão Geral do Negócio</h1>
                <p className="text-gray-600 mt-1">
                  Acompanhe o desempenho executivo e a situação operacional em tempo real.
                </p>
              </div>
            </div>
            
            <Button variant="outline" onClick={forceRefresh} className="gap-2" disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar Dados
            </Button>
          </div>

          <AlertasOperacionaisSection empresaId={empresaId} />

          <div className="bg-white p-1 rounded-xl shadow-sm">
            <DashboardFilters onFilterChange={handleFilterChange} />
          </div>

          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-inner">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-4">
              <TrendingUp className="h-6 w-6 text-[var(--color-primary)]" />
              <h2 className="text-2xl font-bold text-slate-800">Bloco Executivo</h2>
              <span className="ml-2 text-sm text-slate-500 font-medium px-3 py-1 bg-slate-200 rounded-full">
                Período Selecionado
              </span>
            </div>
            
            <ExecutiveSummaryCards 
              data={summaryData} 
              isLoading={isLoading} 
              error={error} 
              rankingData={rankingData}
            />
            
            <ProductRankingTable 
              data={rankingData} 
              isLoading={isLoading} 
              error={error} 
            />
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
              <DollarSign className="h-6 w-6 text-green-500" />
              <h2 className="text-2xl font-bold text-gray-800">Indicadores Financeiros e Operacionais</h2>
              <span className="ml-2 text-sm text-gray-500 font-medium px-3 py-1 bg-gray-100 rounded-full">
                Período Selecionado
              </span>
            </div>
            <NewMetricsCards filters={filters} />
          </section>

          <section className="bg-[var(--color-primary-light)]/5 border border-[var(--color-primary-light)]/20 rounded-2xl p-6 shadow-inner">
            <div className="flex items-center gap-2 mb-6 border-b border-[var(--color-primary-light)]/20 pb-4">
              <Activity className="h-6 w-6 text-[var(--color-primary)]" />
              <h2 className="text-2xl font-bold text-[var(--color-primary-dark)]">Bloco Operacional</h2>
              <span className="ml-2 text-sm text-[var(--color-primary-dark)] font-medium px-3 py-1 bg-[var(--color-primary-light)]/20 rounded-full flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary-light)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary)]"></span>
                </span>
                Tempo Real (Auto-Refresh)
              </span>
            </div>

            <OperationalDashboardCards />
            <OperationalDashboardTables />
          </section>

        </div>
      </DashboardLayout>
    </>
  );
}