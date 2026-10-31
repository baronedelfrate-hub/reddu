import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ShoppingCart, MapPin, Calendar, RefreshCw, Download,
  ChevronDown, ChevronUp, Package, BarChart3, TrendingUp
} from 'lucide-react';

export default function RelatorioVendasMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('consolidado');
  const [mercados, setMercados] = useState([]);
  const [mercadoSelecionado, setMercadoSelecionado] = useState('');
  const [consolidado, setConsolidado] = useState([]);
  const [pendenteBaixa, setPendenteBaixa] = useState({ total: 0, mercados: [] });
  const [detalhe, setDetalhe] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [produtoExpandido, setProdutoExpandido] = useState(null);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('T')[0].split('-').reverse().join('/'); };
  const formatDateTime = (d) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  // Consolida uma lista de movimentações (que vêm por lote) numa visão
  // única por produto — soma quantidade e valor, guarda os lotes originais
  // pra quem quiser abrir o detalhe.
  const consolidarPorProduto = (movs) => {
    const map = {};
    (movs || []).forEach(m => {
      const key = m.produto_id;
      if (!map[key]) {
        map[key] = { produto_id: key, produto_nome: m.produtos?.nome || '', quantidade: 0, valor: 0, movimentacoes: [] };
      }
      map[key].quantidade += Number(m.quantidade || 0);
      map[key].valor += Number(m.total_final || 0);
      map[key].movimentacoes.push(m);
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  };

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais').select('id, nome, modelo_negocio').eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome')
      .then(({ data }) => setMercados(data || []));
  }, [empresaId]);

  const fetchMovs = useCallback(async (filtros = {}) => {
    let query = supabase
      .from('movimentacoes')
      .select(`
        id, cliente_referencia, data_movimentacao, venda_id,
        produto_id, lote_id, quantidade, valor_unitario, subtotal, total_final,
        produtos:produto_id ( nome ),
        lotes:lote_id ( numero_lote, data_validade )
      `)
      .eq('empresa_id', empresaId)
      .eq('canal_venda', 'MERCADO')
      .eq('tipo', 'venda_mercado')
      .eq('tipo_item', 'NORMAL')
      .gte('data_movimentacao', `${dataInicio}T00:00:00`)
      .lte('data_movimentacao', `${dataFim}T23:59:59`)
      .order('data_movimentacao', { ascending: false });

    if (filtros.mercadoNome) {
      query = query.eq('cliente_referencia', filtros.mercadoNome);
    }

    const { data, error } = await query;
    if (error) throw error;
    let movs = data || [];

    // Mercados consignados: só conta o que já foi baixado (pagamento
    // confirmado). Venda Direta continua exatamente como sempre foi,
    // sem esse filtro.
    const mercadosConsignados = new Set(mercados.filter(m => m.modelo_negocio === 'consignado').map(m => m.nome));
    const movsDeConsignado = movs.filter(m => mercadosConsignados.has(m.cliente_referencia));
    if (movsDeConsignado.length > 0) {
      const vendaIds = [...new Set(movsDeConsignado.map(m => m.venda_id).filter(Boolean))];
      let baixadoMap = {};
      if (vendaIds.length > 0) {
        const { data: vendasData } = await supabase.from('vendas').select('id, financeiro_baixado').in('id', vendaIds);
        (vendasData || []).forEach(v => { baixadoMap[v.id] = v.financeiro_baixado; });
      }
      movs = movs.filter(m => {
        if (!mercadosConsignados.has(m.cliente_referencia)) return true; // venda direta: mantém
        return m.venda_id && baixadoMap[m.venda_id]; // consignado: só se já baixado
      });
    }

    return movs;
  }, [empresaId, dataInicio, dataFim, mercados]);

  const loadConsolidado = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const movs = await fetchMovs();

      // Reabastecimento líquido por mercado (bruto entregue menos dano) —
      // é isso que vale como faturamento pros mercados Venda Direta, não o
      // vendido. Mapeado por nome do mercado, já que esse relatório
      // trabalha com cliente_referencia (nome), não local_id.
      const nomeParaModelo = {};
      const idParaNome = {};
      mercados.forEach(m => { nomeParaModelo[m.nome] = m.modelo_negocio; idParaNome[m.id] = m.nome; });

      const precoOf = (p) => Number(p?.preco_bandeja_mercado || p?.preco_bandeja || 0);
      const idsVendaDireta = mercados.filter(m => m.modelo_negocio === 'venda_direta').map(m => m.id);
      const faturamentoPorMercado = {};

      if (idsVendaDireta.length > 0) {
        const { data: movsReab } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, local_destino_id, valor_desconto_substituicao, produtos(preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).eq('tipo', 'transferencia')
          .in('local_destino_id', idsVendaDireta)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);
        (movsReab || []).forEach(m => {
          const nome = idParaNome[m.local_destino_id];
          faturamentoPorMercado[nome] = (faturamentoPorMercado[nome] || 0) + Number(m.quantidade || 0) * precoOf(m.produtos);
        });

        const { data: movsDano } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).in('tipo', ['devolucao', 'descarte']).eq('motivo_devolucao', 'danificado')
          .in('local_origem_id', idsVendaDireta)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);
        (movsDano || []).forEach(m => {
          const nome = idParaNome[m.local_origem_id];
          if (faturamentoPorMercado[nome] != null) {
            faturamentoPorMercado[nome] = Math.max(0, faturamentoPorMercado[nome] - Number(m.quantidade || 0) * precoOf(m.produtos));
          }
        });

        // Toda retirada do mercado desconta sozinha o valor cheio (regra
        // Fernando, 02/10) -- mesma regra ja aplicada na Auditoria de
        // Mercado e no Faturamento de Reabastecimento. Exclui a perna de
        // saida de uma Substituicao de produto (motivo_devolucao
        // 'substituicao_produto'), porque essa ja e creditada abaixo via
        // valor_desconto_substituicao, no lado do produto que entrou --
        // sem excluir aqui, creditaria duas vezes a mesma troca.
        const { data: movsRetiradaRel } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).eq('tipo', 'transferencia')
          .in('local_origem_id', idsVendaDireta)
          .or('motivo_devolucao.is.null,motivo_devolucao.neq.substituicao_produto')
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);
        (movsRetiradaRel || []).forEach(m => {
          const nome = idParaNome[m.local_origem_id];
          if (faturamentoPorMercado[nome] != null) {
            faturamentoPorMercado[nome] = Math.max(0, faturamentoPorMercado[nome] - Number(m.quantidade || 0) * precoOf(m.produtos));
          }
        });

        // Credito de Substituicao de produto: o valor cheio do produto que
        // saiu na troca ja vem gravado em reais no produto que entrou, nao
        // precisa recalcular preco/quantidade aqui.
        (movsReab || []).forEach(m => {
          const valorDesconto = Number(m.valor_desconto_substituicao || 0);
          if (valorDesconto <= 0) return;
          const nome = idParaNome[m.local_destino_id];
          if (faturamentoPorMercado[nome] != null) {
            faturamentoPorMercado[nome] = Math.max(0, faturamentoPorMercado[nome] - valorDesconto);
          }
        });
      }

      const map = {};
      movs.forEach(m => {
        const key = m.cliente_referencia || 'Nao identificado';
        if (!map[key]) {
          map[key] = { mercado: key, total_unidades: 0, total_valor: 0, total_itens: 0, movimentacoes: [] };
        }
        map[key].total_unidades += Number(m.quantidade || 0);
        map[key].total_valor += Number(m.total_final || 0);
        map[key].total_itens++;
        map[key].movimentacoes.push(m);
      });

      // Garante que mercados Venda Direta com reabastecimento, mas sem
      // nenhuma venda registrada no período, também apareçam na lista.
      Object.keys(faturamentoPorMercado).forEach(nome => {
        if (!map[nome]) map[nome] = { mercado: nome, total_unidades: 0, total_valor: 0, total_itens: 0, movimentacoes: [] };
      });

      Object.values(map).forEach(m => {
        m.modeloNegocio = nomeParaModelo[m.mercado] || null;
        m.valorFaturamento = m.modeloNegocio === 'venda_direta'
          ? (faturamentoPorMercado[m.mercado] || 0)
          : m.total_valor;
      });

      // Agrupa por data dentro de cada mercado
      Object.values(map).forEach(m => {
        const porData = {};
        m.movimentacoes.forEach(mov => {
          const dataKey = mov.data_movimentacao?.split('T')[0] || '';
          if (!porData[dataKey]) porData[dataKey] = { data: mov.data_movimentacao, itens: [] };
          porData[dataKey].itens.push(mov);
        });
        m.visitas = Object.values(porData).sort((a, b) => b.data.localeCompare(a.data));
      });

      setConsolidado(Object.values(map).sort((a, b) => b.valorFaturamento - a.valorFaturamento));
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [fetchMovs]);

  const carregarPendenteBaixa = useCallback(async () => {
    if (!empresaId) return;
    try {
      const { data: movsBrutos } = await supabase
        .from('movimentacoes')
        .select('cliente_referencia, quantidade, subtotal, total_final, venda_id')
        .eq('empresa_id', empresaId)
        .eq('canal_venda', 'MERCADO')
        .eq('tipo', 'venda_mercado')
        .eq('tipo_item', 'NORMAL')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      const mercadosConsignados = new Set(mercados.filter(m => m.modelo_negocio === 'consignado').map(m => m.nome));
      const movsDeConsignado = (movsBrutos || []).filter(m => mercadosConsignados.has(m.cliente_referencia));

      const vendaIds = [...new Set(movsDeConsignado.map(m => m.venda_id).filter(Boolean))];
      let baixadoMap = {};
      if (vendaIds.length > 0) {
        const { data: vendasData } = await supabase.from('vendas').select('id, financeiro_baixado').in('id', vendaIds);
        (vendasData || []).forEach(v => { baixadoMap[v.id] = v.financeiro_baixado; });
      }

      const pendentes = movsDeConsignado.filter(m => !m.venda_id || !baixadoMap[m.venda_id]);
      const map = {};
      pendentes.forEach(m => {
        if (!map[m.cliente_referencia]) map[m.cliente_referencia] = { nome: m.cliente_referencia, valor: 0, qtd: 0 };
        map[m.cliente_referencia].valor += Number(m.total_final || m.subtotal || 0);
        map[m.cliente_referencia].qtd += Number(m.quantidade || 0);
      });
      const lista = Object.values(map).sort((a, b) => b.valor - a.valor);
      setPendenteBaixa({ total: lista.reduce((s, m) => s + m.valor, 0), mercados: lista });
    } catch (err) {
      console.error('Erro ao calcular pendente de baixa:', err);
    }
  }, [empresaId, dataInicio, dataFim, mercados]);

  const [detalheReab, setDetalheReab] = useState([]);

  const loadDetalhe = useCallback(async (mercadoNome) => {
    if (!empresaId || !mercadoNome) return;
    setIsLoading(true);
    try {
      const movs = await fetchMovs({ mercadoNome });

      const porProduto = {};
      movs.forEach(m => {
        const key = m.produto_id;
        if (!porProduto[key]) {
          porProduto[key] = { produto_nome: m.produtos?.nome || '', total_unidades: 0, total_valor: 0, movimentacoes: [] };
        }
        porProduto[key].total_unidades += Number(m.quantidade || 0);
        porProduto[key].total_valor += Number(m.total_final || 0);
        porProduto[key].movimentacoes.push(m);
      });

      setDetalhe(Object.values(porProduto).sort((a, b) => b.total_valor - a.total_valor));

      // Reabastecimento por produto — só faz sentido pra mercados Venda
      // Direta, já que é o que realmente conta pra cobrança deles (não o
      // vendido). Consignado continua só com a visão de Vendido acima.
      const mercado = mercados.find(m => m.nome === mercadoNome);
      if (mercado?.modelo_negocio === 'venda_direta') {
        const precoOf = (p) => Number(p?.preco_bandeja_mercado || p?.preco_bandeja || 0);
        const { data: movsReab } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).eq('tipo', 'transferencia').eq('local_destino_id', mercado.id)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`).lte('data_movimentacao', `${dataFim}T23:59:59`);

        const { data: movsDano } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).in('tipo', ['devolucao', 'descarte']).eq('motivo_devolucao', 'danificado')
          .eq('local_origem_id', mercado.id)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`).lte('data_movimentacao', `${dataFim}T23:59:59`);

        const { data: locaisDevolucaoDet } = await supabase.from('locais').select('id, nome').eq('empresa_id', empresaId);
        const idsDevolucaoDet = (locaisDevolucaoDet || [])
          .filter(l => (l.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('estoque devolucao'))
          .map(l => l.id);
        let movsDevolucaoDet = [];
        if (idsDevolucaoDet.length > 0) {
          const { data } = await supabase
            .from('movimentacoes')
            .select('produto_id, quantidade, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
            .eq('empresa_id', empresaId).eq('tipo', 'transferencia').eq('local_origem_id', mercado.id)
            .in('local_destino_id', idsDevolucaoDet)
            .gte('data_movimentacao', `${dataInicio}T00:00:00`).lte('data_movimentacao', `${dataFim}T23:59:59`);
          movsDevolucaoDet = data || [];
        }

        const porProdutoReab = {};
        (movsReab || []).forEach(m => {
          if (!porProdutoReab[m.produto_id]) {
            porProdutoReab[m.produto_id] = { produto_nome: m.produtos?.nome || '', total_unidades: 0, total_valor: 0 };
          }
          porProdutoReab[m.produto_id].total_unidades += Number(m.quantidade || 0);
          porProdutoReab[m.produto_id].total_valor += Number(m.quantidade || 0) * precoOf(m.produtos);
        });
        [...(movsDano || []), ...movsDevolucaoDet].forEach(m => {
          const p = porProdutoReab[m.produto_id];
          if (!p) return;
          const valorPerda = Number(m.quantidade || 0) * precoOf(m.produtos);
          p.total_valor = Math.max(0, p.total_valor - valorPerda);
        });

        setDetalheReab(Object.values(porProdutoReab).sort((a, b) => b.total_valor - a.total_valor));
      } else {
        setDetalheReab([]);
      }
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [fetchMovs, mercados, empresaId, dataInicio, dataFim]);

  useEffect(() => {
    if (activeTab === 'consolidado') { loadConsolidado(); carregarPendenteBaixa(); }
    else if (activeTab === 'mercado' && mercadoSelecionado) {
      const m = mercados.find(x => x.id === mercadoSelecionado);
      if (m) loadDetalhe(m.nome);
    }
  }, [activeTab, mercadoSelecionado, loadConsolidado, loadDetalhe, carregarPendenteBaixa]);

  const exportarCSV = () => {
    const bom = '\uFEFF';
    const linhas = [];

    if (activeTab === 'consolidado') {
      linhas.push(['Mercado', 'Data Baixa', 'Produto', 'Lote', 'Validade', 'Qtd', 'Preco Unit.', 'Total'].join(';'));
      consolidado.forEach(m => {
        m.visitas?.forEach(v => {
          v.itens?.forEach(item => {
            linhas.push([
              m.mercado,
              formatDateTime(item.data_movimentacao),
              item.produtos?.nome || '',
              item.lotes?.numero_lote || '',
              formatDate(item.lotes?.data_validade),
              item.quantidade,
              String(Number(item.valor_unitario || 0).toFixed(2)).replace('.', ','),
              String(Number(item.total_final || 0).toFixed(2)).replace('.', ','),
            ].join(';'));
          });
        });
      });
    } else {
      const m = mercados.find(x => x.id === mercadoSelecionado);
      linhas.push(['Mercado', 'Produto', 'Lote', 'Validade', 'Data Baixa', 'Qtd', 'Preco Unit.', 'Total'].join(';'));
      detalhe.forEach(prod => {
        prod.movimentacoes?.forEach(item => {
          linhas.push([
            m?.nome || '',
            prod.produto_nome,
            item.lotes?.numero_lote || '',
            formatDate(item.lotes?.data_validade),
            formatDateTime(item.data_movimentacao),
            item.quantidade,
            String(Number(item.valor_unitario || 0).toFixed(2)).replace('.', ','),
            String(Number(item.total_final || 0).toFixed(2)).replace('.', ','),
          ].join(';'));
        });
      });
    }

    const blob = new Blob([bom + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas_reais_mercado_${dataInicio}_${dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalGeral = consolidado.reduce((s, m) => s + m.valorFaturamento, 0);
  const totalUnidades = consolidado.reduce((s, m) => s + m.total_unidades, 0);

  return (
    <>
      <Helmet><title>Vendas Reais - Mercados - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Vendas Reais — Mercados</h1>
                <p className="text-gray-500 text-sm mt-0.5">Saidas reais de estoque — dados confirmados, nao estimados.</p>
              </div>
            </div>
            <Button onClick={exportarCSV} variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-emerald-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Ate</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-emerald-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <Button onClick={() => activeTab === 'consolidado' ? loadConsolidado() : loadDetalhe(mercados.find(x => x.id === mercadoSelecionado)?.nome)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 h-10">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { id: 'consolidado', label: 'Consolidado', icon: BarChart3 },
              { id: 'mercado', label: 'Por Mercado', icon: MapPin },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === tab.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <tab.icon className="h-4 w-4" />{tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'consolidado' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Total Vendido Real</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{fmt(totalGeral)}</p>
                  <p className="text-xs text-gray-400 mt-1">{consolidado.length} mercado(s) no periodo</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Total Unidades</p>
                  <p className="text-2xl font-black text-blue-600 mt-1">{totalUnidades}</p>
                  <p className="text-xs text-gray-400 mt-1">unidades saidas do estoque</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Ticket Medio por Mercado</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">
                    {fmt(consolidado.length > 0 ? totalGeral / consolidado.length : 0)}
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <TrendingUp className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700">
                  <strong>Dados reais de saida de estoque</strong> — cada visita mostra o total vendido por
                  produto (some os lotes automaticamente); abra um produto pra ver o detalhe por lote e horário.
                  Mercados marcados como <strong>Consignado</strong> só entram aqui depois que o pagamento é
                  confirmado (baixa do Pedido Consignado) — mercados de Venda Direta aparecem normalmente.
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

              {isLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
              ) : consolidado.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                  <ShoppingCart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhuma venda no periodo selecionado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {consolidado.map(m => (
                    <div key={m.mercado} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedId(expandedId === m.mercado ? null : m.mercado)}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-900">{m.mercado}</p>
                            <p className="text-xs text-gray-500">{m.total_itens} item(ns) · {m.total_unidades} unidades</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{m.modeloNegocio === 'venda_direta' ? 'Faturamento (reabastecimento)' : 'Total Real'}</p>
                            <p className="font-black text-emerald-600">{fmt(m.valorFaturamento)}</p>
                          </div>
                          {expandedId === m.mercado
                            ? <ChevronUp className="h-5 w-5 text-gray-400" />
                            : <ChevronDown className="h-5 w-5 text-gray-400" />
                          }
                        </div>
                      </button>

                      {expandedId === m.mercado && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {m.visitas?.map((v, vidx) => {
                            const produtosDaVisita = consolidarPorProduto(v.itens);
                            return (
                            <div key={vidx} className="p-4 space-y-2">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span className="font-semibold text-gray-800 text-sm">
                                  Baixa em: {formatDateTime(v.data)}
                                </span>
                                <span className="text-xs text-gray-400">
                                  · {produtosDaVisita.length} produto(s) · {fmt(v.itens.reduce((s, i) => s + Number(i.total_final || 0), 0))}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {produtosDaVisita.map((prod) => {
                                  const chave = `${m.mercado}-${v.data}-${prod.produto_id}`;
                                  const temMultiplosLotes = prod.movimentacoes.length > 1;
                                  return (
                                    <div key={prod.produto_id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                                      <button
                                        className="w-full flex items-center justify-between text-left"
                                        onClick={() => temMultiplosLotes && setProdutoExpandido(produtoExpandido === chave ? null : chave)}
                                      >
                                        <div>
                                          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                            {prod.produto_nome}
                                            {temMultiplosLotes && (
                                              <span className="text-[10px] bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                                                {prod.movimentacoes.length} lotes
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-xs text-gray-400">{prod.quantidade} un vendidas</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{fmt(prod.valor)}</span>
                                          {temMultiplosLotes && (
                                            produtoExpandido === chave
                                              ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                                              : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                          )}
                                        </div>
                                      </button>
                                      {temMultiplosLotes && produtoExpandido === chave && (
                                        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
                                          {prod.movimentacoes.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs pl-2">
                                              <span className="text-gray-500 font-mono">
                                                {item.lotes?.numero_lote || 'Sem lote'}
                                                {item.lotes?.data_validade && ' · Val: ' + formatDate(item.lotes.data_validade)}
                                                {' · '}{item.quantidade} un x {fmt(item.valor_unitario)}
                                              </span>
                                              <span className="font-semibold text-emerald-600">{fmt(item.total_final)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'mercado' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <label className="text-sm font-semibold text-gray-700 block mb-2">Selecione o Mercado</label>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {mercados.map(m => (
                    <button key={m.id} onClick={() => { setMercadoSelecionado(m.id); loadDetalhe(m.nome); }}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        mercadoSelecionado === m.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}>
                      <MapPin className={`h-4 w-4 flex-shrink-0 ${mercadoSelecionado === m.id ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-sm ${mercadoSelecionado === m.id ? 'text-emerald-800' : 'text-gray-700'}`}>{m.nome}</span>
                    </button>
                  ))}
                </div>
              </div>

              {mercadoSelecionado && (
                isLoading ? (
                  <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
                ) : (detalhe.length === 0 && detalheReab.length === 0) ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Nenhuma venda nesse mercado no periodo.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Vendido</p>
                        <p className="text-xl font-black text-emerald-600 mt-1">
                          {fmt(detalhe.reduce((s, p) => s + p.total_valor, 0))}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Unidades</p>
                        <p className="text-xl font-black text-blue-600 mt-1">
                          {detalhe.reduce((s, p) => s + p.total_unidades, 0)}
                        </p>
                      </div>
                    </div>

                    {detalheReab.length > 0 && (
                      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                        <p className="text-xs text-orange-700 mb-3">
                          Esse mercado é <strong>Venda Direta</strong> — o valor que conta pra cobrança é o
                          Reabastecimento (já descontando dano/devolução), não o Vendido acima.
                        </p>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-white rounded-xl p-3 text-center border border-orange-100">
                            <p className="text-xs font-semibold text-orange-600 uppercase">Total Reabastecimento</p>
                            <p className="text-lg font-black text-orange-700 mt-1">
                              {fmt(detalheReab.reduce((s, p) => s + p.total_valor, 0))}
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-3 text-center border border-orange-100">
                            <p className="text-xs font-semibold text-orange-600 uppercase">Total Unidades</p>
                            <p className="text-lg font-black text-orange-700 mt-1">
                              {detalheReab.reduce((s, p) => s + p.total_unidades, 0)}
                            </p>
                          </div>
                        </div>
                        <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
                          <div className="px-4 py-2 border-b border-orange-100 bg-orange-50">
                            <p className="text-xs font-bold text-orange-700">Reabastecimento por Produto</p>
                          </div>
                          <div className="divide-y divide-orange-50">
                            {detalheReab.map((prod, idx) => (
                              <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{prod.produto_nome}</p>
                                  <p className="text-xs text-gray-500">{prod.total_unidades} un. entregues</p>
                                </div>
                                <p className="font-bold text-orange-700 text-sm">{fmt(prod.total_valor)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                          <Package className="h-4 w-4 text-emerald-500" /> Vendas por Produto
                        </h4>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {detalhe.map((prod, idx) => (
                          <div key={idx}>
                            <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                              onClick={() => setExpandedId(expandedId === prod.produto_nome ? null : prod.produto_nome)}>
                              <div className="text-left">
                                <p className="font-bold text-gray-900">{prod.produto_nome}</p>
                                <p className="text-xs text-gray-500">{prod.total_unidades} unidades vendidas</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="font-black text-emerald-600">{fmt(prod.total_valor)}</p>
                                {expandedId === prod.produto_nome
                                  ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                  : <ChevronDown className="h-4 w-4 text-gray-400" />
                                }
                              </div>
                            </button>
                            {expandedId === prod.produto_nome && (
                              <div className="px-5 pb-4 space-y-2">
                                {prod.movimentacoes.map((mov, i) => (
                                  <div key={i} className="bg-gray-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-emerald-600 font-medium">
                                        Baixa: {formatDateTime(mov.data_movimentacao)}
                                      </p>
                                      <p className="text-xs font-mono text-gray-600">
                                        {mov.lotes?.numero_lote || 'Sem lote'}
                                        {mov.lotes?.data_validade && ' · Val: ' + formatDate(mov.lotes.data_validade)}
                                      </p>
                                      <p className="text-xs text-gray-400">{mov.quantidade} un x {fmt(mov.valor_unitario)}</p>
                                    </div>
                                    <span className="font-bold text-emerald-600 text-sm ml-2 flex-shrink-0">{fmt(mov.total_final)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}