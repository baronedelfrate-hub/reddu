import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, DollarSign, Receipt, Store, Clock, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react';

export default function NewMetricsCards({ filters }) {
  const { empresaId } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarAnalitico, setMostrarAnalitico] = useState(false);

  useEffect(() => {
    if (!empresaId || !filters) return;
    fetchMetrics();
  }, [empresaId, filters]);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const { dataInicio, dataFim } = filters;

      // Mercados e seu modelo de negócio — pra saber quais vendas de MERCADO
      // já podem contar (Venda Direta, conta na hora) e quais precisam
      // esperar a baixa do Pedido Consignado antes de virar faturamento.
      const { data: locaisMercado } = await supabase
        .from('locais').select('id, nome, modelo_negocio').eq('empresa_id', empresaId).eq('tipo', 'Mercado');
      const modeloNegocioPorNome = {};
      (locaisMercado || []).forEach(l => { modeloNegocioPorNome[l.nome] = l.modelo_negocio; });

      // Reabastecimento líquido (bruto entregue menos dano) por mercado Venda
      // Direta — é isso que vale como faturamento pra esses mercados, não o
      // vendido. Mesma regra já aplicada nos relatórios de mercado.
      const idsVendaDireta = (locaisMercado || []).filter(l => l.modelo_negocio === 'venda_direta').map(l => l.id);
      const idParaNomeMercado = {};
      (locaisMercado || []).forEach(l => { idParaNomeMercado[l.id] = l.nome; });
      const precoOfMerc = (p) => Number(p?.preco_bandeja_mercado || p?.preco_bandeja || 0);
      const reabLiquidoPorNome = {};
      if (idsVendaDireta.length > 0) {
        const { data: movsReabDash } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, local_destino_id, produtos(preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).eq('tipo', 'transferencia')
          .in('local_destino_id', idsVendaDireta)
          .gte('data_movimentacao', `${filters.dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${filters.dataFim}T23:59:59`);
        (movsReabDash || []).forEach(m => {
          const nome = idParaNomeMercado[m.local_destino_id];
          reabLiquidoPorNome[nome] = (reabLiquidoPorNome[nome] || 0) + Number(m.quantidade || 0) * precoOfMerc(m.produtos);
        });
        const { data: movsDanoDash } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId).in('tipo', ['devolucao', 'descarte']).eq('motivo_devolucao', 'danificado')
          .in('local_origem_id', idsVendaDireta)
          .gte('data_movimentacao', `${filters.dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${filters.dataFim}T23:59:59`);
        (movsDanoDash || []).forEach(m => {
          const nome = idParaNomeMercado[m.local_origem_id];
          if (reabLiquidoPorNome[nome] != null) {
            reabLiquidoPorNome[nome] = Math.max(0, reabLiquidoPorNome[nome] - Number(m.quantidade || 0) * precoOfMerc(m.produtos));
          }
        });

        // Devolução comum (não-dano) também é perda — mesmo tratamento.
        const { data: locaisDevolucaoDash } = await supabase.from('locais').select('id, nome').eq('empresa_id', empresaId);
        const idsDevolucaoDash = (locaisDevolucaoDash || [])
          .filter(l => (l.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('estoque devolucao'))
          .map(l => l.id);
        if (idsDevolucaoDash.length > 0) {
          const { data: movsDevolucaoDash } = await supabase
            .from('movimentacoes')
            .select('produto_id, quantidade, local_origem_id, produtos(preco_bandeja_mercado, preco_bandeja)')
            .eq('empresa_id', empresaId).eq('tipo', 'transferencia')
            .in('local_origem_id', idsVendaDireta)
            .in('local_destino_id', idsDevolucaoDash)
            .gte('data_movimentacao', `${filters.dataInicio}T00:00:00`)
            .lte('data_movimentacao', `${filters.dataFim}T23:59:59`);
          (movsDevolucaoDash || []).forEach(m => {
            const nome = idParaNomeMercado[m.local_origem_id];
            if (reabLiquidoPorNome[nome] != null) {
              reabLiquidoPorNome[nome] = Math.max(0, reabLiquidoPorNome[nome] - Number(m.quantidade || 0) * precoOfMerc(m.produtos));
            }
          });
        }
      }
      const totalReabLiquidoVendaDireta = Object.values(reabLiquidoPorNome).reduce((s, v) => s + v, 0);

      // Eventos realizados também são faturamento — só conta quando o
      // evento já aconteceu de verdade (não orçamento nem confirmado
      // ainda), pelo valor total do contrato.
      const { data: eventosRealizados } = await supabase
        .from('eventos')
        .select('valor_total')
        .eq('empresa_id', empresaId)
        .eq('status', 'realizado')
        .gte('data_evento', dataInicio)
        .lte('data_evento', dataFim);
      const totalEventosRealizados = (eventosRealizados || []).reduce((s, e) => s + Number(e.valor_total || 0), 0);

      // 1. Faturamento + ticket médio + vendas por canal + pendentes
      const { data: vendas } = await supabase
        .from('vendas')
        .select('total_final, canal_venda, cliente_referencia, status, financeiro_baixado')
        .eq('empresa_id', empresaId)
        .gte('data_venda', `${dataInicio}T00:00:00`)
        .lte('data_venda', `${dataFim}T23:59:59`);

      const vendasArr = vendas || [];

      // Venda cancelada nunca conta como faturamento, em nenhum canal —
      // isso valia antes de qualquer regra de mercado.
      // Uma venda de MERCADO só conta no faturamento pelo "vendido" se for
      // Consignado (e já baixada) — Venda Direta não entra aqui, porque o
      // faturamento dela vem do reabastecimento (somado à parte, abaixo).
      // PDV/App continuam contando direto, sem essa regra.
      const vendaJaConta = (v) => {
        if (String(v.status || '').trim().toUpperCase() === 'CANCELADO') return false;
        if (v.canal_venda !== 'MERCADO') return true;
        const modelo = modeloNegocioPorNome[v.cliente_referencia];
        if (modelo === 'venda_direta') return false;
        return modelo !== 'consignado' || v.financeiro_baixado === true;
      };

      const vendasConfirmadas = vendasArr.filter(vendaJaConta);
      const totalVendasConfirmadas = vendasConfirmadas.reduce((s, v) => s + Number(v.total_final || 0), 0);
      const faturamento = totalVendasConfirmadas + totalReabLiquidoVendaDireta + totalEventosRealizados;
      // Ticket médio considera só vendas de verdade (PDV/App/Consignado) —
      // misturar com o valor de reabastecimento (que não tem "quantidade de
      // vendas" correspondente) distorceria a média.
      const ticketMedio = vendasConfirmadas.length > 0 ? totalVendasConfirmadas / vendasConfirmadas.length : 0;

      const porCanal = {};
      vendasConfirmadas.forEach(v => {
        const canal = v.canal_venda || 'OUTROS';
        if (!porCanal[canal]) porCanal[canal] = { qtd: 0, total: 0 };
        porCanal[canal].qtd++;
        porCanal[canal].total += Number(v.total_final || 0);
      });
      // Mercados Venda Direta não entram em vendasConfirmadas (o valor deles
      // vem do reabastecimento, calculado à parte) — soma aqui dentro do
      // canal MERCADO, senão a soma de "Vendas por Canal" fica menor que o
      // Faturamento total lá em cima, sem bater.
      if (totalReabLiquidoVendaDireta > 0) {
        if (!porCanal['MERCADO']) porCanal['MERCADO'] = { qtd: 0, total: 0 };
        porCanal['MERCADO'].total += totalReabLiquidoVendaDireta;
      }
      if (totalEventosRealizados > 0) {
        porCanal['EVENTOS'] = { qtd: (eventosRealizados || []).length, total: totalEventosRealizados };
      }

      // Pendente de baixa — só o que é de fato Consignado (não qualquer
      // venda pendente de qualquer canal).
      const vendasPendentesConsignado = vendasArr.filter(v =>
        v.canal_venda === 'MERCADO' &&
        modeloNegocioPorNome[v.cliente_referencia] === 'consignado' &&
        !v.financeiro_baixado
      );
      const valorPendente = vendasPendentesConsignado.reduce((s, v) => s + Number(v.total_final || 0), 0);

      const pendentePorMercado = {};
      vendasPendentesConsignado.forEach(v => {
        const nome = v.cliente_referencia || 'Desconhecido';
        if (!pendentePorMercado[nome]) pendentePorMercado[nome] = { nome, total: 0, qtd: 0 };
        pendentePorMercado[nome].total += Number(v.total_final || 0);
        pendentePorMercado[nome].qtd++;
      });
      const pendenteAnalitico = Object.values(pendentePorMercado).sort((a, b) => b.total - a.total);

      // 2. Top mercados (canal MERCADO) — Consignado usa o vendido já
      // confirmado; Venda Direta usa o reabastecimento líquido.
      const vendasMercadoConfirmadas = vendasConfirmadas.filter(v => v.canal_venda === 'MERCADO');
      const mercadoMap = {};
      vendasMercadoConfirmadas.forEach(v => {
        const nome = v.cliente_referencia || 'Desconhecido';
        if (!mercadoMap[nome]) mercadoMap[nome] = { nome, total: 0, qtd: 0 };
        mercadoMap[nome].total += Number(v.total_final || 0);
        mercadoMap[nome].qtd++;
      });
      Object.entries(reabLiquidoPorNome).forEach(([nome, valor]) => {
        if (!mercadoMap[nome]) mercadoMap[nome] = { nome, total: 0, qtd: 0 };
        mercadoMap[nome].total += valor;
        mercadoMap[nome].vendaDireta = true;
      });
      const topMercados = Object.values(mercadoMap).sort((a, b) => b.total - a.total).slice(0, 5);

      // 3. Giro de Estoque de Bandeja — quanto do que estava disponível pra
      // vender (o que já saiu + o que ainda está em estoque) já girou.
      // Antes comparava produzido-no-período com vendido-no-período, mas
      // bandeja é produzida e vendida em momentos bem diferentes (fica em
      // estoque até vender), então essa conta dava número sem sentido
      // (ex: vendeu 8x mais do que produziu no mesmo período).
      const { data: movsVendaBandeja } = await supabase
        .from('movimentacoes')
        .select('quantidade')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'venda_mercado')
        .gte('data_movimentacao', `${dataInicio}T00:00:00`)
        .lte('data_movimentacao', `${dataFim}T23:59:59`);
      const totalVend = (movsVendaBandeja || []).reduce((s, m) => s + Number(m.quantidade || 0), 0);

      const { data: lotesBandejaAtivos } = await supabase
        .from('lotes')
        .select('quantidade, data_validade')
        .eq('empresa_id', empresaId)
        .eq('tipo_lote', 'bandeja')
        .eq('ativo', true)
        .eq('lote_devolvido', false);
      const todayStrGiro = new Date().toISOString().split('T')[0];
      const totalEstoqueBandeja = (lotesBandejaAtivos || [])
        .filter(l => !l.data_validade || l.data_validade > todayStrGiro)
        .reduce((s, l) => s + Number(l.quantidade || 0), 0);

      const totalDisponivel = totalVend + totalEstoqueBandeja;
      const taxaConversao = totalDisponivel > 0 ? Math.round((totalVend / totalDisponivel) * 100) : 0;

      // 4. Valor em risco (lotes vencendo em 7 dias)
      const hoje = new Date();
      const em7dias = new Date();
      em7dias.setDate(hoje.getDate() + 7);
      // Fetch lotes vencendo sem join para evitar ambiguidade
      const { data: lotesVencendo } = await supabase
        .from('lotes')
        .select('quantidade, produto_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('lote_devolvido', false)
        .gte('data_validade', hoje.toISOString().split('T')[0])
        .lte('data_validade', em7dias.toISOString().split('T')[0]);

      // Busca preços separado
      const prodIdsVencendo = [...new Set((lotesVencendo || []).map(l => l.produto_id).filter(Boolean))];
      let precosMap = {};
      if (prodIdsVencendo.length > 0) {
        const { data: prodPrecos } = await supabase
          .from('produtos').select('id, preco_bandeja, preco_venda')
          .in('id', prodIdsVencendo);
        (prodPrecos || []).forEach(p => { precosMap[p.id] = Number(p.preco_bandeja || p.preco_venda || 0); });
      }

      const valorEmRisco = (lotesVencendo || []).reduce((s, l) => {
        return s + (Number(l.quantidade || 0) * (precosMap[l.produto_id] || 0));
      }, 0);

      setData({
        faturamento, ticketMedio, porCanal, vendasArr,
        valorPendente, qtdPendentes: vendasPendentesConsignado.length, pendenteAnalitico,
        topMercados, taxaConversao, totalEstoqueBandeja, totalVend,
        valorEmRisco, qtdVencendo: lotesVencendo?.length || 0
      });
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
      setError(err.message || 'Erro ao carregar indicadores');
    } finally {
      setIsLoading(false);
    }
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtN = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);

  const canalLabel = { PDV: 'PDV', MERCADO: 'Mercados', APP: 'App', CARDAPIO_DIGITAL: 'Venda Digital', EVENTOS: 'Eventos', OUTROS: 'Outros' };
  const canalColor = { PDV: 'bg-blue-500', MERCADO: 'bg-purple-500', APP: 'bg-green-500', CARDAPIO_DIGITAL: 'bg-rose-500', EVENTOS: 'bg-amber-500', OUTROS: 'bg-gray-400' };

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
      Erro ao carregar indicadores: {error}
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6">

      {/* Row 1: Faturamento, Ticket Médio, Pendentes, Valor em Risco */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Faturamento */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-500">Faturamento</p>
            <div className="p-2 bg-green-100 rounded-xl"><DollarSign className="h-4 w-4 text-green-600" /></div>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmt(data.faturamento)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmtN(data.vendasArr.length)} venda(s) no período</p>
        </div>

        {/* Ticket Médio */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-500">Ticket Médio</p>
            <div className="p-2 bg-blue-100 rounded-xl"><Receipt className="h-4 w-4 text-blue-600" /></div>
          </div>
          <p className="text-2xl font-black text-gray-900">{fmt(data.ticketMedio)}</p>
          <p className="text-xs text-gray-400 mt-1">por venda</p>
        </div>

        {/* Vendas Pendentes (Consignado) */}
        <button
          onClick={() => data.qtdPendentes > 0 && setMostrarAnalitico(true)}
          className={`bg-white rounded-2xl border shadow-sm p-5 transition-shadow text-left ${data.qtdPendentes > 0 ? 'border-amber-200 hover:shadow-md cursor-pointer' : 'border-gray-100'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-500">Consignado Pendente</p>
            <div className={`p-2 rounded-xl ${data.qtdPendentes > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <Clock className={`h-4 w-4 ${data.qtdPendentes > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
            </div>
          </div>
          <p className={`text-2xl font-black ${data.qtdPendentes > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{fmt(data.valorPendente)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {data.qtdPendentes} venda(s) a receber{data.qtdPendentes > 0 ? ' — clique pra ver por mercado' : ''}
          </p>
        </button>

        {/* Valor em Risco */}
        <div className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-shadow ${data.valorEmRisco > 0 ? 'border-red-200' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-500">Em Risco (7 dias)</p>
            <div className={`p-2 rounded-xl ${data.valorEmRisco > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
              <AlertTriangle className={`h-4 w-4 ${data.valorEmRisco > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
          </div>
          <p className={`text-2xl font-black ${data.valorEmRisco > 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(data.valorEmRisco)}</p>
          <p className="text-xs text-gray-400 mt-1">{data.qtdVencendo} lote(s) vencendo</p>
        </div>
      </div>

      {/* Row 2: Vendas por Canal + Taxa Conversão + Top Mercados */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Vendas por Canal */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <h3 className="font-bold text-gray-900">Vendas por Canal</h3>
          </div>
          {Object.keys(data.porCanal).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda no período</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.porCanal)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([canal, info]) => {
                  const pct = data.faturamento > 0 ? Math.round((info.total / data.faturamento) * 100) : 0;
                  return (
                    <div key={canal}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${canalColor[canal] || 'bg-gray-400'}`} />
                          <span className="text-sm font-semibold text-gray-700">{canalLabel[canal] || canal}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-gray-900">{fmt(info.total)}</span>
                          <span className="text-xs text-gray-400 ml-1">
                            {info.qtd > 0 ? `(${info.qtd} vd.)` : canal === 'MERCADO' ? '(reabastecimento)' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${canalColor[canal] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Taxa de Conversão */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            <h3 className="font-bold text-gray-900">Giro de Estoque</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                <circle cx="50" cy="50" r="40" fill="none"
                  stroke={data.taxaConversao >= 70 ? '#22c55e' : data.taxaConversao >= 40 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="10"
                  strokeDasharray={`${data.taxaConversao * 2.51} 251`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-gray-900">{data.taxaConversao}%</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-3">Giro de Estoque de Bandeja</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>Vendido: <strong>{fmtN(data.totalVend)}</strong></span>
              <span>Em estoque: <strong>{fmtN(data.totalEstoqueBandeja)}</strong></span>
            </div>
          </div>
        </div>

        {/* Top Mercados */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Store className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-gray-900">Top Mercados</h3>
          </div>
          {data.topMercados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda em mercados</p>
          ) : (
            <div className="space-y-2">
              {data.topMercados.map((m, i) => (
                <div key={m.nome} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : 'bg-orange-200 text-orange-700'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{m.nome}</p>
                    <p className="text-xs text-gray-400">{m.vendaDireta ? 'reabastecimento' : `${m.qtd} venda(s)`}</p>
                  </div>
                  <span className="text-sm font-black text-gray-900 flex-shrink-0">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {mostrarAnalitico && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMostrarAnalitico(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">Consignado Pendente — por mercado</p>
                <p className="text-xs text-gray-500">Vendas aguardando baixa do Pedido Consignado</p>
              </div>
              <button onClick={() => setMostrarAnalitico(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-2">
              {data.pendenteAnalitico.map((m, i) => (
                <div key={m.nome} className="flex items-center justify-between bg-amber-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{m.nome}</p>
                    <p className="text-xs text-gray-500">{m.qtd} venda(s)</p>
                  </div>
                  <span className="text-sm font-black text-amber-700">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-amber-50 flex items-center justify-between">
              <p className="font-bold text-amber-800 text-sm">Total Pendente</p>
              <p className="font-black text-amber-700">{fmt(data.valorPendente)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}