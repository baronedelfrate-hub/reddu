import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Package, RefreshCw, TrendingUp, PackageX, Snowflake, BarChart3,
  ChevronDown, ChevronUp, MapPin
} from 'lucide-react';

export default function RelatorioConsolidadoProdutoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [produtos, setProdutos] = useState([]);
  const [pendenteBaixa, setPendenteBaixa] = useState({ total: 0, mercados: [] });
  const [expandedProduto, setExpandedProduto] = useState(null);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtN = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);

  const loadDados = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      // Danificado continua vindo da auditoria — é dado operacional, não
      // precisa esperar pagamento pra aparecer.
      const { data: auditItens } = await supabase
        .from('auditoria_mercado_itens')
        .select(`
          produto_id, quantidade_danificada, valor_unitario,
          auditorias_mercado!inner(local_id, data_auditoria, empresa_id)
        `)
        .eq('auditorias_mercado.empresa_id', empresaId)
        .gte('auditorias_mercado.data_auditoria', `${dataInicio}T00:00:00`)
        .lte('auditorias_mercado.data_auditoria', `${dataFim}T23:59:59`);

      // Mercados com o modelo de negócio, pra saber quais precisam esperar
      // a baixa (Consignado) e quais contam na hora (Venda Direta).
      const { data: locaisMercado } = await supabase
        .from('locais').select('id, modelo_negocio').eq('empresa_id', empresaId).eq('tipo', 'Mercado');
      const modeloNegocioMap = {};
      (locaisMercado || []).forEach(l => { modeloNegocioMap[l.id] = l.modelo_negocio; });

      // Vendido vem de movimentacoes (a movimentação real de venda) — não da
      // estimativa da auditoria, pra poder checar se já foi baixado.
      const { data: movVendas } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, subtotal, total_final, local_origem_id, venda_id')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'venda_mercado')
        .eq('canal_venda', 'MERCADO')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      const vendaIdsPresentes = [...new Set((movVendas || []).map(m => m.venda_id).filter(Boolean))];
      let baixadoMap = {};
      if (vendaIdsPresentes.length > 0) {
        const { data: vendasData } = await supabase.from('vendas').select('id, financeiro_baixado').in('id', vendaIdsPresentes);
        (vendasData || []).forEach(v => { baixadoMap[v.id] = v.financeiro_baixado; });
      }

      const movVendasValidas = (movVendas || []).filter(m => {
        const modelo = modeloNegocioMap[m.local_origem_id];
        return modelo !== 'consignado' || (m.venda_id && baixadoMap[m.venda_id]);
      });

      // O que ficou de fora (consignado ainda não baixado) — pra mostrar
      // quanto e quais mercados estão pendentes nesse período.
      const movVendasPendentes = (movVendas || []).filter(m => {
        const modelo = modeloNegocioMap[m.local_origem_id];
        return modelo === 'consignado' && !(m.venda_id && baixadoMap[m.venda_id]);
      });
      const pendenteMap = {};
      movVendasPendentes.forEach(m => {
        if (!pendenteMap[m.local_origem_id]) pendenteMap[m.local_origem_id] = { valor: 0, qtd: 0 };
        pendenteMap[m.local_origem_id].valor += Number(m.subtotal || m.total_final || 0);
        pendenteMap[m.local_origem_id].qtd += Number(m.quantidade || 0);
      });
      const mercadoIdsPendentes = Object.keys(pendenteMap);
      let nomesMercadosPendentes = {};
      if (mercadoIdsPendentes.length > 0) {
        const { data: locaisPendentes } = await supabase.from('locais').select('id, nome').in('id', mercadoIdsPendentes);
        (locaisPendentes || []).forEach(l => { nomesMercadosPendentes[l.id] = l.nome; });
      }
      const pendenteBaixaLista = Object.entries(pendenteMap).map(([localId, d]) => ({
        nome: nomesMercadosPendentes[localId] || 'Mercado', ...d,
      })).sort((a, b) => b.valor - a.valor);
      const totalPendenteBaixa = pendenteBaixaLista.reduce((s, m) => s + m.valor, 0);

      // Estoque atual (freezer) em todos os mercados, agora — não é limitado ao período
      const { data: mercadosData } = await supabase
        .from('locais').select('id').eq('empresa_id', empresaId).eq('tipo', 'Mercado');
      const mercadoIds = (mercadosData || []).map(m => m.id);

      const { data: estoqueAtual } = mercadoIds.length > 0
        ? await supabase
            .from('estoque_por_local')
            .select('produto_id, quantidade_atual, local_id')
            .eq('empresa_id', empresaId)
            .in('local_id', mercadoIds)
            .gt('quantidade_atual', 0)
        : { data: [] };

      // Nomes dos produtos
      const prodIds = [...new Set([
        ...(auditItens || []).map(i => i.produto_id),
        ...movVendasValidas.map(i => i.produto_id),
        ...(estoqueAtual || []).map(i => i.produto_id),
      ])];
      const { data: produtosData } = prodIds.length > 0
        ? await supabase.from('produtos').select('id, nome').in('id', prodIds)
        : { data: [] };
      const prodMap = {};
      (produtosData || []).forEach(p => { prodMap[p.id] = p.nome; });

      // Consolida por produto
      const map = {};
      movVendasValidas.forEach(i => {
        const key = i.produto_id;
        if (!map[key]) {
          map[key] = {
            produto_id: key,
            nome: prodMap[key] || 'Produto',
            totalVendidoQtd: 0,
            totalVendidoValor: 0,
            totalDanificadoQtd: 0,
            totalDanificadoValor: 0,
            totalFreezerAtual: 0,
            mercadosComVenda: new Set(),
            mercadosComDano: new Set(),
          };
        }
        map[key].totalVendidoQtd += Number(i.quantidade || 0);
        map[key].totalVendidoValor += Number(i.subtotal || i.total_final || 0);
        map[key].mercadosComVenda.add(i.local_origem_id);
      });

      (auditItens || []).forEach(i => {
        if (!(i.quantidade_danificada > 0)) return;
        const key = i.produto_id;
        if (!map[key]) {
          map[key] = {
            produto_id: key,
            nome: prodMap[key] || 'Produto',
            totalVendidoQtd: 0,
            totalVendidoValor: 0,
            totalDanificadoQtd: 0,
            totalDanificadoValor: 0,
            totalFreezerAtual: 0,
            mercadosComVenda: new Set(),
            mercadosComDano: new Set(),
          };
        }
        map[key].totalDanificadoQtd += Number(i.quantidade_danificada || 0);
        map[key].totalDanificadoValor += Number(i.quantidade_danificada || 0) * Number(i.valor_unitario || 0);
        map[key].mercadosComDano.add(i.auditorias_mercado?.local_id);
      });

      (estoqueAtual || []).forEach(e => {
        const key = e.produto_id;
        if (!map[key]) {
          map[key] = {
            produto_id: key,
            nome: prodMap[key] || 'Produto',
            totalVendidoQtd: 0,
            totalVendidoValor: 0,
            totalDanificadoQtd: 0,
            totalDanificadoValor: 0,
            totalFreezerAtual: 0,
            mercadosComVenda: new Set(),
            mercadosComDano: new Set(),
          };
        }
        map[key].totalFreezerAtual += Number(e.quantidade_atual || 0);
      });

      const lista = Object.values(map)
        .map(p => ({
          ...p,
          mercadosComVenda: p.mercadosComVenda.size,
          mercadosComDano: p.mercadosComDano.size,
        }))
        .sort((a, b) => b.totalVendidoValor - a.totalVendidoValor);

      setProdutos(lista);
      setPendenteBaixa({ total: totalPendenteBaixa, mercados: pendenteBaixaLista });
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, dataInicio, dataFim, toast]);

  useEffect(() => { loadDados(); }, [loadDados]);

  const totalGeralVendido = produtos.reduce((s, p) => s + p.totalVendidoValor, 0);
  const totalGeralVendidoQtd = produtos.reduce((s, p) => s + p.totalVendidoQtd, 0);
  const totalGeralDanificado = produtos.reduce((s, p) => s + p.totalDanificadoValor, 0);
  const totalGeralFreezer = produtos.reduce((s, p) => s + p.totalFreezerAtual, 0);

  return (
    <>
      <Helmet><title>Relatório Consolidado por Produto - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Consolidado por Produto</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Visão única por produto, somando todos os mercados — a mesma lógica que vocês usam pra
                confrontar com o relatório do mercadinho, agora numa tela só.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <TrendingUp className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Mercados marcados como <strong>Consignado</strong> só entram no "Total Vendido" depois que o
              pagamento é confirmado (baixa do Pedido Consignado). Mercados de Venda Direta contam na hora,
              sem esperar. Danificado e Freezer não são afetados por isso.
            </p>
          </div>

          {pendenteBaixa.total > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-amber-800">Pendente de Baixa (Consignado) nesse período</p>
                <p className="text-sm font-black text-amber-700">{fmt(pendenteBaixa.total)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendenteBaixa.mercados.map((m, i) => (
                  <span key={i} className="text-xs bg-white text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 font-medium">
                    {m.nome} — {fmt(m.valor)} ({m.qtd} un.)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <Button onClick={loadDados} className="gap-2 bg-teal-600 hover:bg-teal-700 h-10">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-gray-500 uppercase">Total Vendido</p>
              <p className="text-xl font-black text-teal-600 mt-1">{fmt(totalGeralVendido)}</p>
              <p className="text-xs text-gray-400 mt-1">{fmtN(totalGeralVendidoQtd)} un.</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-gray-500 uppercase">Produtos no Período</p>
              <p className="text-xl font-black text-gray-900 mt-1">{produtos.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-blue-500 uppercase">Total no Freezer Agora</p>
              <p className="text-xl font-black text-blue-600 mt-1">{fmtN(totalGeralFreezer)} un.</p>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-red-400 uppercase">Total Danificado</p>
              <p className="text-xl font-black text-red-600 mt-1">{fmt(totalGeralDanificado)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Nenhum dado no período selecionado.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-teal-500" /> Produtos (todos os mercados)
                </h4>
              </div>
              <div className="divide-y divide-gray-50">
                {produtos.map(p => (
                  <div key={p.produto_id}>
                    <button
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                      onClick={() => setExpandedProduto(expandedProduto === p.produto_id ? null : p.produto_id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{p.nome}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                            <TrendingUp className="h-3 w-3" /> {fmtN(p.totalVendidoQtd)} vendidos em {p.mercadosComVenda} mercado(s)
                          </span>
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                            <Snowflake className="h-3 w-3" /> {fmtN(p.totalFreezerAtual)} no freezer agora
                          </span>
                          {p.totalDanificadoQtd > 0 && (
                            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                              <PackageX className="h-3 w-3" /> {fmtN(p.totalDanificadoQtd)} danificados
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <p className="font-black text-teal-600">{fmt(p.totalVendidoValor)}</p>
                          {p.totalDanificadoValor > 0 && (
                            <p className="text-xs text-red-500">-{fmt(p.totalDanificadoValor)} dano</p>
                          )}
                        </div>
                        {expandedProduto === p.produto_id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>
                    {expandedProduto === p.produto_id && (
                      <div className="px-5 pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-teal-50 rounded-xl p-3 text-center border border-teal-100">
                            <p className="text-xs font-bold text-teal-600 uppercase">Vendido</p>
                            <p className="text-lg font-black text-teal-700">{fmtN(p.totalVendidoQtd)}</p>
                            <p className="text-xs text-teal-500">{fmt(p.totalVendidoValor)}</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                            <p className="text-xs font-bold text-blue-600 uppercase">No Freezer</p>
                            <p className="text-lg font-black text-blue-700">{fmtN(p.totalFreezerAtual)}</p>
                            <p className="text-xs text-blue-500">agora, todos mercados</p>
                          </div>
                          <div className={`rounded-xl p-3 text-center border ${p.totalDanificadoQtd > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className={`text-xs font-bold uppercase ${p.totalDanificadoQtd > 0 ? 'text-red-500' : 'text-gray-500'}`}>Danificado</p>
                            <p className={`text-lg font-black ${p.totalDanificadoQtd > 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmtN(p.totalDanificadoQtd)}</p>
                            <p className={`text-xs ${p.totalDanificadoQtd > 0 ? 'text-red-400' : 'text-gray-400'}`}>{fmt(p.totalDanificadoValor)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                            <p className="text-xs font-bold text-gray-500 uppercase">Mercados</p>
                            <p className="text-lg font-black text-gray-700">{p.mercadosComVenda}</p>
                            <p className="text-xs text-gray-400 flex items-center justify-center gap-1"><MapPin className="h-3 w-3" /> venderam</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}