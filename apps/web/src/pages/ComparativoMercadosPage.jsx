import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart3, RefreshCw, MapPin, TrendingUp, TrendingDown,
  Package, Trophy, AlertTriangle, Clock, Zap, ChevronDown, ChevronUp, PackageX
} from 'lucide-react';

export default function ComparativoMercadosPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [mercados, setMercados] = useState([]);
  const [expandedMercado, setExpandedMercado] = useState(null);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtN = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('T')[0].split('-').reverse().join('/'); };

  const loadDados = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      // 1. Busca todos os locais tipo Mercado
      const { data: locaisData } = await supabase
        .from('locais').select('id, nome, modelo_negocio')
        .eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome');
      if (!locaisData?.length) { setMercados([]); return; }

      // 2. Vendas via auditorias_mercado no período
      const { data: auditItens } = await supabase
        .from('auditoria_mercado_itens')
        .select(`
          produto_id, quantidade_calculada_vendida, valor_unitario, subtotal, quantidade_danificada,
          auditorias_mercado!inner(local_id, data_auditoria, empresa_id)
        `)
        .eq('auditorias_mercado.empresa_id', empresaId)
        .gte('auditorias_mercado.data_auditoria', `${dataInicio}T00:00:00`)
        .lte('auditorias_mercado.data_auditoria', `${dataFim}T23:59:59`);

      // 3. Vendas via movimentacoes (canal MERCADO) — é a fonte real e única
      // de "vendido" pra esse relatório (a estimativa da auditoria não é mais
      // somada aqui, senão conta a mesma venda duas vezes).
      const { data: movVendas } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, subtotal, total_final, local_origem_id, data_movimentacao, venda_id')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'venda_mercado')
        .eq('canal_venda', 'MERCADO')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      // 3b. Reabastecimento no período (o que realmente conta pra cobrança
      // dos mercados Venda Direta) e dano no mesmo período (que desconta
      // desse valor — mesma regra já aplicada na Auditoria de Mercado e no
      // Faturamento de Reabastecimento).
      const { data: movsReab } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, local_destino_id, observacao, valor_desconto_substituicao, produtos(preco_bandeja_mercado, preco_bandeja)')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'transferencia')
        .in('local_destino_id', locaisData.map(l => l.id))
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      const { data: movsDano } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
        .eq('empresa_id', empresaId)
        .in('tipo', ['devolucao', 'descarte'])
        .eq('motivo_devolucao', 'danificado')
        .in('local_origem_id', locaisData.map(l => l.id))
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      // Toda retirada do mercado desconta sozinha o valor cheio (regra
      // Fernando, 02/10) -- mesma regra ja aplicada na Auditoria de Mercado
      // e no Faturamento de Reabastecimento. Exclui a perna de saida de uma
      // Substituicao de produto (motivo_devolucao 'substituicao_produto'),
      // porque essa ja e creditada abaixo via valor_desconto_substituicao,
      // no lado do produto que entrou -- sem excluir aqui, creditaria duas
      // vezes a mesma troca.
      const { data: movsDevolucaoComp } = await supabase
        .from('movimentacoes')
        .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'transferencia')
        .in('local_origem_id', locaisData.map(l => l.id))
        .or('motivo_devolucao.is.null,motivo_devolucao.neq.substituicao_produto')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);

      // Status de baixa das vendas — só importa pros mercados Consignado
      // (Venda Direta conta na hora, sem esperar).
      const vendaIdsPresentes = [...new Set((movVendas || []).map(m => m.venda_id).filter(Boolean))];
      let baixadoMap = {};
      if (vendaIdsPresentes.length > 0) {
        const { data: vendasData } = await supabase.from('vendas').select('id, financeiro_baixado').in('id', vendaIdsPresentes);
        (vendasData || []).forEach(v => { baixadoMap[v.id] = v.financeiro_baixado; });
      }

      // 4. Auditorias (visitas) por mercado
      const { data: audits } = await supabase
        .from('auditorias_mercado')
        .select('id, local_id, data_auditoria')
        .eq('empresa_id', empresaId)
        .gte('data_auditoria', `${dataInicio}T00:00:00`)
        .lte('data_auditoria', `${dataFim}T23:59:59`);

      // 5. Estoque atual por mercado
      const { data: estoqueAtual } = await supabase
        .from('estoque_por_local')
        .select('local_id, produto_id, quantidade_atual')
        .eq('empresa_id', empresaId)
        .gt('quantidade_atual', 0)
        .in('local_id', locaisData.map(l => l.id));

      // 6. Produtos
      const prodIds = [...new Set([
        ...(auditItens || []).map(i => i.produto_id),
        ...(movVendas || []).map(i => i.produto_id),
        ...(estoqueAtual || []).map(i => i.produto_id),
      ])];
      let prodMap = {};
      if (prodIds.length > 0) {
        const { data: prods } = await supabase.from('produtos')
          .select('id, nome').in('id', prodIds);
        (prods || []).forEach(p => { prodMap[p.id] = p.nome; });
      }

      // 7. Lotes no mercado para giro
      const { data: lotesEstoque } = await supabase
        .from('estoque_por_local')
        .select('local_id, lote_id, quantidade_atual')
        .eq('empresa_id', empresaId)
        .in('local_id', locaisData.map(l => l.id));

      const loteIds = [...new Set((lotesEstoque || []).map(r => r.lote_id).filter(Boolean))];
      let lotesMap = {};
      if (loteIds.length > 0) {
        const { data: lotes } = await supabase.from('lotes')
          .select('id, data_validade, created_at')
          .in('id', loteIds);
        (lotes || []).forEach(l => { lotesMap[l.id] = l; });
      }

      // Monta dados por mercado
      const hoje = new Date();
      const mercadosData = locaisData.map(local => {
        const lid = local.id;

        // Vendas por produto — vem só de movimentacoes reais (não soma mais
        // a estimativa da auditoria, que contava a mesma venda duas vezes).
        // Consignado: só entra o que já foi baixado. Venda Direta: conta na
        // hora, sem esperar.
        const prodVendas = {};
        let pendenteBaixaQtd = 0;
        let pendenteBaixaValor = 0;
        (movVendas || [])
          .filter(i => i.local_origem_id === lid)
          .forEach(i => {
            const jaBaixado = local.modelo_negocio !== 'consignado' || (i.venda_id && baixadoMap[i.venda_id]);
            if (jaBaixado) {
              if (!prodVendas[i.produto_id]) prodVendas[i.produto_id] = { nome: prodMap[i.produto_id] || 'Produto', qtd: 0, valor: 0 };
              prodVendas[i.produto_id].qtd += Number(i.quantidade || 0);
              prodVendas[i.produto_id].valor += Number(i.subtotal || i.total_final || 0);
            } else {
              pendenteBaixaQtd += Number(i.quantidade || 0);
              pendenteBaixaValor += Number(i.subtotal || i.total_final || 0);
            }
          });

        const prodList = Object.entries(prodVendas)
          .map(([pid, d]) => ({ produto_id: pid, ...d }))
          .sort((a, b) => b.valor - a.valor);

        const totalVendido = prodList.reduce((s, p) => s + p.valor, 0);
        const totalQtd = prodList.reduce((s, p) => s + p.qtd, 0);

        // Reabastecimento líquido desse mercado no período (bruto entregue
        // menos o valor do que foi danificado) — é isso que vale como
        // faturamento pros mercados Venda Direta, não o vendido.
        const precoOf = (p) => Number(p?.preco_bandeja_mercado || p?.preco_bandeja || 0);
        const reabPorProduto = {};
        (movsReab || [])
          .filter(m => m.local_destino_id === lid)
          .forEach(m => {
            if (!reabPorProduto[m.produto_id]) reabPorProduto[m.produto_id] = 0;
            reabPorProduto[m.produto_id] += Number(m.quantidade || 0) * precoOf(m.produtos);
          });
        (movsDano || [])
          .filter(m => m.local_origem_id === lid)
          .forEach(m => {
            const valorDano = Number(m.quantidade || 0) * precoOf(m.produtos);
            if (reabPorProduto[m.produto_id] != null) {
              reabPorProduto[m.produto_id] = Math.max(0, reabPorProduto[m.produto_id] - valorDano);
            }
          });
        (movsDevolucaoComp || [])
          .filter(m => m.local_origem_id === lid)
          .forEach(m => {
            const valorDev = Number(m.quantidade || 0) * precoOf(m.produtos);
            if (reabPorProduto[m.produto_id] != null) {
              reabPorProduto[m.produto_id] = Math.max(0, reabPorProduto[m.produto_id] - valorDev);
            }
          });
        // Credito de Substituicao de produto: o valor cheio do produto que
        // saiu na troca ja vem gravado em reais no produto que entrou.
        (movsReab || [])
          .filter(m => m.local_destino_id === lid)
          .forEach(m => {
            const valorDesconto = Number(m.valor_desconto_substituicao || 0);
            if (valorDesconto <= 0) return;
            if (reabPorProduto[m.produto_id] != null) {
              reabPorProduto[m.produto_id] = Math.max(0, reabPorProduto[m.produto_id] - valorDesconto);
            }
          });
        const totalReabastecimentoLiquido = Object.values(reabPorProduto).reduce((s, v) => s + v, 0);

        // Quanto desse reabastecimento veio da ação rápida "Reabastecer
        // Mercado", sem passar pela Auditoria completa (visita com
        // contagem) — pra sinalizar isso pro time nos relatórios.
        const reabastecimentoForaDeAuditoria = (movsReab || [])
          .filter(m => m.local_destino_id === lid && m.observacao === 'Reabastecimento rápido — fora de Auditoria de Mercado')
          .reduce((s, m) => s + Number(m.quantidade || 0) * precoOf(m.produtos), 0);

        const valorFaturamento = local.modelo_negocio === 'venda_direta' ? totalReabastecimentoLiquido : totalVendido;

        const visitas = (audits || []).filter(a => a.local_id === lid).length;
        const ticketMedioVisita = visitas > 0 ? totalVendido / visitas : 0;
        const eficiencia = visitas > 0 ? totalQtd / visitas : 0; // bandejas por visita

        // Estoque atual do mercado
        const estoqueLocal = (estoqueAtual || []).filter(e => e.local_id === lid);
        const totalEstoqueQtd = estoqueLocal.reduce((s, e) => s + Number(e.quantidade_atual || 0), 0);

        // Giro de estoque: dias médios para vender baseado no estoque atual vs vendas/dia
        const diasPeriodo = Math.max(1, Math.ceil((new Date(dataFim) - new Date(dataInicio)) / (1000 * 60 * 60 * 24)));
        const vendasPorDia = totalQtd / diasPeriodo;
        const giroEstoque = vendasPorDia > 0 ? Math.round(totalEstoqueQtd / vendasPorDia) : null;

        // Risco vencimento: valor em estoque com lotes vencendo em 7 dias
        const lotesMercado = (lotesEstoque || []).filter(e => e.local_id === lid);
        let valorEmRisco = 0;
        lotesMercado.forEach(e => {
          const lote = lotesMap[e.lote_id];
          if (!lote?.data_validade) return;
          const dias = Math.ceil((new Date(lote.data_validade) - hoje) / (1000 * 60 * 60 * 24));
          if (dias <= 7 && dias >= 0) {
            const prod = estoqueLocal.find(es => es.lote_id === e.lote_id);
            valorEmRisco += Number(e.quantidade_atual || 0) * 20; // preço médio estimado
          }
        });

        // Produtos sem venda no período (estoque parado) — consolidado por
        // produto: se tiver 2+ lotes do mesmo produto parado, soma em vez
        // de listar duplicado.
        const semVendaMap = {};
        estoqueLocal
          .filter(e => !prodVendas[e.produto_id])
          .forEach(e => {
            if (!semVendaMap[e.produto_id]) {
              semVendaMap[e.produto_id] = { produto_id: e.produto_id, nome: prodMap[e.produto_id] || 'Produto', qtd: 0 };
            }
            semVendaMap[e.produto_id].qtd += Number(e.quantidade_atual || 0);
          });
        const prodSemVenda = Object.values(semVendaMap);

        // Produtos danificados no período — consolidado por produto.
        const danificadoMap = {};
        (auditItens || [])
          .filter(i => i.auditorias_mercado?.local_id === lid && i.quantidade_danificada > 0)
          .forEach(i => {
            if (!danificadoMap[i.produto_id]) {
              danificadoMap[i.produto_id] = { produto_id: i.produto_id, nome: prodMap[i.produto_id] || 'Produto', qtd: 0, valor: 0 };
            }
            danificadoMap[i.produto_id].qtd += Number(i.quantidade_danificada || 0);
            danificadoMap[i.produto_id].valor += Number(i.quantidade_danificada || 0) * Number(i.valor_unitario || 0);
          });
        const prodDanificado = Object.values(danificadoMap).sort((a, b) => b.qtd - a.qtd);
        const totalDanificadoQtd = prodDanificado.reduce((s, p) => s + p.qtd, 0);
        const totalDanificadoValor = prodDanificado.reduce((s, p) => s + p.valor, 0);

        // Aguardando Venda (só Consignado): o que já foi entregue mas ainda
        // não foi vendido não gera cobrança nenhuma — é só o estoque que
        // está parado no mercado agora, consolidado por produto.
        let aguardandoVenda = [];
        if (local.modelo_negocio === 'consignado') {
          const aguardandoMap = {};
          estoqueLocal.forEach(e => {
            if (!aguardandoMap[e.produto_id]) {
              aguardandoMap[e.produto_id] = { produto_id: e.produto_id, nome: prodMap[e.produto_id] || 'Produto', qtd: 0 };
            }
            aguardandoMap[e.produto_id].qtd += Number(e.quantidade_atual || 0);
          });
          aguardandoVenda = Object.values(aguardandoMap).sort((a, b) => b.qtd - a.qtd);
        }

        return {
          id: lid,
          nome: local.nome,
          modeloNegocio: local.modelo_negocio,
          totalVendido,
          valorFaturamento,
          totalReabastecimentoLiquido,
          reabastecimentoForaDeAuditoria,
          totalQtd,
          visitas,
          ticketMedioVisita,
          eficiencia,
          giroEstoque,
          valorEmRisco,
          totalEstoqueQtd,
          maisVendido: prodList[0] || null,
          menosVendido: prodList.length > 0 ? prodList[prodList.length - 1] : null,
          prodList,
          prodSemVenda,
          prodDanificado,
          totalDanificadoQtd,
          totalDanificadoValor,
          pendenteBaixaQtd,
          pendenteBaixaValor,
          aguardandoVenda,
        };
      }).sort((a, b) => b.valorFaturamento - a.valorFaturamento);

      setMercados(mercadosData);
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, dataInicio, dataFim]);

  useEffect(() => { loadDados(); }, [loadDados]);

  const totalGeral = mercados.reduce((s, m) => s + m.valorFaturamento, 0);
  const maxVendido = mercados[0]?.valorFaturamento || 1;

  return (
    <>
      <Helmet><title>Comparativo de Mercados - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Comparativo de Mercados</h1>
              <p className="text-gray-500 text-sm mt-0.5">Ranking, produtos e indicadores por mercado.</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <Button onClick={loadDados} className="gap-2 bg-purple-600 hover:bg-purple-700 h-10">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            </div>
          ) : mercados.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma venda no período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* KPIs gerais */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Total Geral</p>
                  <p className="text-xl font-black text-purple-600 mt-1">{fmt(totalGeral)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Mercados Ativos</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{mercados.filter(m => m.valorFaturamento > 0).length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Total Visitas</p>
                  <p className="text-xl font-black text-teal-600 mt-1">{mercados.reduce((s, m) => s + m.visitas, 0)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Ticket Médio/Visita</p>
                  <p className="text-xl font-black text-blue-600 mt-1">
                    {fmt(mercados.filter(m => m.visitas > 0).reduce((s, m) => s + m.ticketMedioVisita, 0) / Math.max(1, mercados.filter(m => m.visitas > 0).length))}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-red-400 uppercase">Total Danificado</p>
                  <p className="text-xl font-black text-red-600 mt-1">{fmt(mercados.reduce((s, m) => s + m.totalDanificadoValor, 0))}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{mercados.reduce((s, m) => s + m.totalDanificadoQtd, 0)} un</p>
                </div>
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 text-center">
                  <p className="text-xs font-semibold text-amber-500 uppercase">Pendente de Baixa</p>
                  <p className="text-xl font-black text-amber-600 mt-1">{fmt(mercados.reduce((s, m) => s + m.pendenteBaixaValor, 0))}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{mercados.filter(m => m.pendenteBaixaValor > 0).length} mercado(s)</p>
                </div>
              </div>

              {mercados.some(m => m.pendenteBaixaValor > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Mercados consignados com venda pendente de pagamento nesse período:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mercados.filter(m => m.pendenteBaixaValor > 0).map(m => (
                      <span key={m.id} className="text-xs bg-white text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 font-medium">
                        {m.nome} — {fmt(m.pendenteBaixaValor)} ({m.pendenteBaixaQtd} un.)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ranking */}
              <div className="space-y-3">
                {mercados.map((m, idx) => (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                    {/* Header do mercado */}
                    <button className="w-full p-5 hover:bg-gray-50 transition-colors text-left"
                      onClick={() => setExpandedMercado(expandedMercado === m.id ? null : m.id)}>
                      <div className="flex items-center gap-4">

                        {/* Posição */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${idx === 0 ? 'bg-yellow-400 text-white' :
                            idx === 1 ? 'bg-gray-300 text-gray-700' :
                              idx === 2 ? 'bg-orange-300 text-white' :
                                'bg-gray-100 text-gray-500'
                          }`}>
                          {idx === 0 ? <Trophy className="h-5 w-5" /> : idx + 1}
                        </div>

                        {/* Nome e barra */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="font-bold text-gray-900">{m.nome}</p>
                            <p className="font-black text-purple-600 text-lg">{fmt(m.valorFaturamento)}</p>
                          </div>
                          {/* Barra de progresso */}
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-purple-500 transition-all"
                              style={{ width: `${Math.max(2, (m.valorFaturamento / maxVendido) * 100)}%` }} />
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-gray-500">
                            <span>{m.modeloNegocio === 'venda_direta' ? 'Reabastecimento' : 'Vendido'}</span>
                            <span>{fmtN(m.totalQtd)} un. vendidas</span>
                            <span>{m.visitas} visita(s)</span>
                            {m.ticketMedioVisita > 0 && <span>Ticket: {fmt(m.ticketMedioVisita)}/visita</span>}
                            {m.giroEstoque !== null && <span>Giro: {m.giroEstoque}d</span>}
                          </div>
                        </div>

                        {expandedMercado === m.id
                          ? <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          : <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        }
                      </div>

                      {/* Alertas inline */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.maisVendido && (
                          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-200">
                            <TrendingUp className="h-3 w-3" /> {m.maisVendido.nome?.split(' ').slice(0, 3).join(' ')}
                          </span>
                        )}
                        {m.menosVendido && m.menosVendido.produto_id !== m.maisVendido?.produto_id && (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-200">
                            <TrendingDown className="h-3 w-3" /> {m.menosVendido.nome?.split(' ').slice(0, 3).join(' ')}
                          </span>
                        )}
                        {m.prodSemVenda.length > 0 && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                            <AlertTriangle className="h-3 w-3" /> {m.prodSemVenda.length} parado(s)
                          </span>
                        )}
                        {m.totalDanificadoQtd > 0 && (
                          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-200">
                            <PackageX className="h-3 w-3" /> {m.totalDanificadoQtd} danificado(s)
                          </span>
                        )}
                        {m.pendenteBaixaValor > 0 && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-300">
                            <AlertTriangle className="h-3 w-3" /> {fmt(m.pendenteBaixaValor)} pendente de baixa
                          </span>
                        )}
                        {m.eficiencia > 0 && (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-200">
                            <Zap className="h-3 w-3" /> {m.eficiencia.toFixed(1)} un/visita
                          </span>
                        )}
                        {m.reabastecimentoForaDeAuditoria > 0 && (
                          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-orange-200"
                            title="Parte do reabastecimento veio da ação rápida 'Reabastecer Mercado', sem Auditoria completa">
                            <Clock className="h-3 w-3" /> {fmt(m.reabastecimentoForaDeAuditoria)} sem auditoria
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Detalhes expandidos */}
                    {expandedMercado === m.id && (
                      <div className="border-t border-gray-100 p-5 space-y-5">

                        {/* Indicadores */}
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                          <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
                            <p className="text-xs font-bold text-purple-600 uppercase">Vendido</p>
                            <p className="text-lg font-black text-purple-700">{fmt(m.totalVendido)}</p>
                            <p className="text-xs text-purple-500">{fmtN(m.totalQtd)} un.</p>
                          </div>
                          <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                            <p className="text-xs font-bold text-orange-600 uppercase">Faturamento</p>
                            <p className="text-lg font-black text-orange-700">{fmt(m.valorFaturamento)}</p>
                            <p className="text-xs text-orange-500">{m.modeloNegocio === 'venda_direta' ? 'reabastecimento' : 'vendido (baixado)'}</p>
                          </div>
                          <div className="bg-teal-50 rounded-xl p-3 text-center border border-teal-100">
                            <p className="text-xs font-bold text-teal-600 uppercase">Visitas</p>
                            <p className="text-lg font-black text-teal-700">{m.visitas}</p>
                            <p className="text-xs text-teal-500">{fmt(m.ticketMedioVisita)}/visita</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                            <p className="text-xs font-bold text-blue-600 uppercase">Eficiência</p>
                            <p className="text-lg font-black text-blue-700">{m.eficiencia.toFixed(1)}</p>
                            <p className="text-xs text-blue-500">un/visita</p>
                          </div>
                          <div className={`rounded-xl p-3 text-center border ${m.giroEstoque !== null && m.giroEstoque <= 7 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className="text-xs font-bold text-gray-600 uppercase">Giro Estoque</p>
                            <p className={`text-lg font-black ${m.giroEstoque !== null && m.giroEstoque <= 7 ? 'text-red-600' : 'text-gray-700'}`}>
                              {m.giroEstoque !== null ? `${m.giroEstoque}d` : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">{m.totalEstoqueQtd} un. em estoque</p>
                          </div>
                          <div className={`rounded-xl p-3 text-center border ${m.totalDanificadoQtd > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className={`text-xs font-bold uppercase ${m.totalDanificadoQtd > 0 ? 'text-red-500' : 'text-gray-500'}`}>Danificado</p>
                            <p className={`text-lg font-black ${m.totalDanificadoQtd > 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmt(m.totalDanificadoValor)}</p>
                            <p className={`text-xs ${m.totalDanificadoQtd > 0 ? 'text-red-400' : 'text-gray-400'}`}>{m.totalDanificadoQtd} un.</p>
                          </div>
                        </div>

                        {m.prodDanificado.length > 0 && (
                          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                            <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
                              <PackageX className="h-4 w-4 text-red-500" /> Produtos danificados no período
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {m.prodDanificado.map(p => (
                                <span key={p.produto_id} className="text-xs bg-white text-red-700 px-2.5 py-1 rounded-full border border-red-200 font-medium">
                                  {p.nome} ({p.qtd} un. · {fmt(p.valor)})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.modeloNegocio === 'consignado' && m.aguardandoVenda.length > 0 && (
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <p className="text-sm font-bold text-indigo-700 mb-1 flex items-center gap-2">
                              <Package className="h-4 w-4 text-indigo-500" /> Aguardando Venda (entregue, ainda não vendido)
                            </p>
                            <p className="text-xs text-indigo-500 mb-2">
                              Não gera cobrança — é só o que está parado no mercado agora, esperando ser vendido.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {m.aguardandoVenda.map(p => (
                                <span key={p.produto_id} className="text-xs bg-white text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200 font-medium">
                                  {p.nome} ({p.qtd} un.)
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ranking de produtos */}
                        <div>
                          <p className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <Package className="h-4 w-4 text-gray-400" /> Produtos no período
                          </p>
                          <div className="space-y-2">
                            {m.prodList.map((p, pidx) => (
                              <div key={p.produto_id} className="flex items-center gap-3">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${pidx === 0 ? 'bg-green-500 text-white' :
                                    pidx === m.prodList.length - 1 ? 'bg-red-400 text-white' :
                                      'bg-gray-100 text-gray-500'
                                  }`}>{pidx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{p.nome}</p>
                                    <span className="text-sm font-bold text-gray-900 ml-2">{fmt(p.valor)}</span>
                                  </div>
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-purple-400"
                                      style={{ width: `${(p.valor / (m.prodList[0]?.valor || 1)) * 100}%` }} />
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">{fmtN(p.qtd)} un. vendidas</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Produtos parados */}
                        {m.prodSemVenda.length > 0 && (
                          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                            <p className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" /> Produtos sem venda no período
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {m.prodSemVenda.map(p => (
                                <span key={p.produto_id} className="text-xs bg-white text-amber-800 px-2.5 py-1 rounded-full border border-amber-200 font-medium">
                                  {p.nome} ({p.qtd} un. paradas)
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

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