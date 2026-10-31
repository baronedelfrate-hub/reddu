import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Search, Calendar, ShoppingCart, Smartphone, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import RelatorioVendasChannelSummary from '@/components/relatorios/RelatorioVendasChannelSummary';
import RelatorioVendasTabelaConsolidada from '@/components/relatorios/RelatorioVendasTabelaConsolidada';
import { formatCurrency } from '@/utils/currencyFormatter';

export default function RelatorioVendasConsolidadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [canalFilter, setCanalFilter] = useState('all');
  const [clienteFilter, setClienteFilter] = useState('');
  const [pagamentoFilter, setPagamentoFilter] = useState('all');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

  // Efeito para carregar dados iniciais
  useEffect(() => {
    if (empresaId) fetchData();
  }, [empresaId]);

  /**
   * Função principal de busca e processamento
   * Corrigida para lidar com precisão decimal (R$ 0,999)
   */
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    console.log('[RELATORIO] Buscando vendas com precisão decimal reforçada...');

    try {
      let query = supabase.from('vendas').select(`
        id, 
        data_venda, 
        canal_venda, 
        cliente_referencia, 
        total_final, 
        forma_pagamento, 
        status, 
        financeiro_baixado,
        movimentacoes (
          id, tipo, quantidade, subtotal, total_final, valor_unitario, tipo_item, 
          commercial_product_name, meta_quantidade, status, tipo_lote, 
          desconto_valor, taxa_motoboy, 
          produtos ( id, nome, preco_venda ), 
          locais:local_origem_id ( id, nome ), 
          lotes ( tipo_lote )
        )
      `).eq('empresa_id', empresaId).order('data_venda', { ascending: false });

      if (dataInicio) query = query.gte('data_venda', `${dataInicio}T00:00:00.000Z`);
      if (dataFim) query = query.lte('data_venda', `${dataFim}T23:59:59.999Z`);
      if (canalFilter !== 'all') query = query.eq('canal_venda', canalFilter);
      if (pagamentoFilter !== 'all') query = query.eq('forma_pagamento', pagamentoFilter);

      const { data: vendasRes, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      console.log('[RELATORIO] Total de vendas carregadas do banco:', vendasRes?.length || 0);

      const groupedOrders = (vendasRes || []).map(venda => {
        const allMovs = venda.movimentacoes || [];
        console.log(`[RELATORIO] Processando venda ${venda.id}, total movimentações: ${allMovs.length}`);

        // FILTRO CIRÚRGICO CORRIGIDO: Apenas vendas CONFIRMADAS com financeiro_baixado = FALSE
        const allMovsFiltered = allMovs.filter(m => {
          // Normalizar status: converter para string, trim, uppercase
          const status = String(m.status || '').trim().toUpperCase();
          const financeiroBaixado = m.financeiro_baixado === true || m.financeiro_baixado === 'true';
          
          // REGRA EXPLÍCITA 1: Excluir PENDENTE
          if (status === 'PENDENTE') {
            console.log('[fetchData] ❌ FILTRANDO venda PENDENTE:', {
              id: m.id,
              venda_id: venda.id,
              status: status,
              canal_venda: venda.canal_venda,
              financeiro_baixado: financeiroBaixado,
              total_final: m.total_final
            });
            return false;
          }
          
          // REGRA EXPLÍCITA 2: Apenas CONFIRMADO
          if (status !== 'CONFIRMADO') {
            console.log('[fetchData] ❌ FILTRANDO venda com status inválido:', {
              id: m.id,
              venda_id: venda.id,
              status: status,
              esperado: 'CONFIRMADO'
            });
            return false;
          }
          
          // REGRA EXPLÍCITA 3: Apenas não baixadas
          if (financeiroBaixado) {
            console.log('[fetchData] ❌ FILTRANDO venda com financeiro_baixado=TRUE:', {
              id: m.id,
              venda_id: venda.id,
              status: status
            });
            return false;
          }
          
          // Log de inclusão
          console.log('[fetchData] ✅ INCLUINDO venda válida:', {
            id: m.id,
            venda_id: venda.id,
            status: status,
            financeiro_baixado: financeiroBaixado,
            canal_venda: venda.canal_venda,
            total_final: m.total_final
          });
          return true;
        });

        console.log(`[RELATORIO] Venda ${venda.id}: ${allMovs.length} movimentações → ${allMovsFiltered.length} após filtro`);

        // Se não restou nenhuma movimentação válida após o filtro, retorna null
        if (allMovsFiltered.length === 0) {
          console.log(`[RELATORIO] ⚠️ Venda ${venda.id} excluída: nenhuma movimentação válida após filtros`);
          return null;
        }

        let subtotalRealvenda = 0;
        let taxasVenda = 0;
        let descontosVenda = 0;

        // Processamento individual de cada item com correção de arredondamento
        const itensProcessados = allMovsFiltered.filter(m => {
          const tipo = String(m.tipo_item || '').toUpperCase();
          
          // RULE 1: Ignore lines with desconto_valor > 0
          if (m.desconto_valor && m.desconto_valor > 0) {
            console.log('[fetchData] Filtering line with desconto_valor:', m.desconto_valor);
            return false;
          }
          
          // RULE 2: Ignore lines with taxa_motoboy > 0
          if (m.taxa_motoboy && m.taxa_motoboy > 0) {
            console.log('[fetchData] Filtering line with taxa_motoboy:', m.taxa_motoboy);
            return false;
          }
          
          // RULE 3: Ignore lines with tipo_item = 'DESCONTO'
          if (tipo === 'DESCONTO') {
            console.log('[fetchData] Filtering line with tipo_item = DESCONTO');
            return false;
          }
          
          // RULE 4: Ignore lines with tipo_item = 'TAXA'
          if (tipo === 'TAXA') {
            console.log('[fetchData] Filtering line with tipo_item = TAXA');
            return false;
          }
          
          // RULE 5: Ignore lines with quantidade = 0
          if (m.quantidade === 0 || m.quantidade === '0') {
            console.log('[fetchData] Filtering line with quantidade = 0');
            return false;
          }
          
          // RULE 6: Keep only tipo_item = 'NORMAL' or empty
          const isNormal = tipo === 'NORMAL' || tipo === '';
          if (!isNormal) {
            console.log('[fetchData] Filtering line with invalid tipo_item:', tipo);
            return false;
          }
          
          // If passed all rules, include the line
          console.log('[fetchData] ✓ Including valid line:', {
            produto: m.produtos?.nome || m.commercial_product_name,
            quantidade: m.quantidade,
            tipo_item: tipo
          });
          return true;
        }).map(item => {
          const qtd = Number(item.quantidade || 0);
          const vUnit = Number(item.valor_unitario || 0);

          const subtotalItem = qtd * vUnit;
          subtotalRealvenda += subtotalItem;

          return {
            ...item,
            subtotal: subtotalItem,
            total_final: subtotalItem
          };
        });

        // Captura Taxas e Descontos das movimentações financeiras
        allMovsFiltered.forEach(m => {
          const tipo = String(m.tipo_item || '').toUpperCase();
          if (tipo === 'TAXA' || tipo === 'ENTREGA') {
            taxasVenda += Math.abs(Number(m.subtotal) || Number(m.taxa_motoboy) || 0);
          } else if (tipo === 'DESCONTO') {
            descontosVenda += Math.abs(Number(m.subtotal) || Number(m.desconto_valor) || 0);
          }
        });

        // Se houver desconto no cabeçalho maior que nos itens, assume o do cabeçalho
        const descontoAplicado = Math.max(descontosVenda, Math.abs(Number(venda.desconto_valor || 0)));

        // Faturamento Líquido da Venda
        const faturamentoFinal = (subtotalRealvenda + taxasVenda) - descontoAplicado;

        return {
          id: venda.id,
          data_movimentacao: venda.data_venda,
          canal_venda: venda.canal_venda,
          cliente_referencia: venda.cliente_referencia,
          forma_pagamento: venda.forma_pagamento,
          itens: itensProcessados,
          subtotal: subtotalRealvenda,
          total_final: faturamentoFinal,
          desconto_valor: descontoAplicado,
          taxa_motoboy: taxasVenda,
          status: venda.status || 'CONCILIADO',
          financeiro_baixado: venda.financeiro_baixado
        };
      }).filter(v => v !== null && v.itens.length > 0);

      console.log('[RELATORIO] Total de vendas após processamento e filtros:', groupedOrders.length);
      setData(groupedOrders);
      console.log('[RELATORIO] Processamento concluído com sucesso.');
    } catch (err) {
      console.error('Erro ao processar relatório:', err);
      setError(err.message);
      toast({ title: 'Erro de Processamento', description: 'Não foi possível consolidar os valores decimais.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const processedData = useMemo(() => {
    let filtered = data;
    if (clienteFilter) {
      const term = clienteFilter.toLowerCase();
      filtered = filtered.filter(item => (item.cliente_referencia || '').toLowerCase().includes(term));
    }
    return filtered;
  }, [data, clienteFilter]);

  const normalizedData = useMemo(() => {
    return processedData.map(item => ({
      ...item,
      canal_venda: String(item.canal_venda || 'NÃO INFORMADO').toUpperCase(),
      cliente_referencia: String(item.cliente_referencia || 'NÃO INFORMADO').trim()
    }));
  }, [processedData]);

  return (
    <>
      <Helmet><title>Relatório Consolidado de Vendas - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Vendas Consolidadas</h1>
                <p className="text-slate-500 mt-1 text-sm">Precisão financeira total e visão hierárquica por canal.</p>
              </div>
            </div>
            <Button onClick={fetchData} variant="outline" className="gap-2" disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar Dados
            </Button>
          </div>

          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-4 bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" /> Filtros Avançados
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Canal de Venda</label>
                  <Select value={canalFilter} onValueChange={setCanalFilter}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Canais</SelectItem>
                      <SelectItem value="PDV">PDV</SelectItem>
                      <SelectItem value="MERCADO">MERCADO</SelectItem>
                      <SelectItem value="APP">APP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Pagamento</label>
                  <Select value={pagamentoFilter} onValueChange={setPagamentoFilter}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Formas</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Debito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Cliente / Referência</label>
                  <Input placeholder="Buscar..." value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Data Inicial</label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Data Final</label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro crítico</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-6" />
              <p className="text-slate-500 font-semibold text-lg">Consolidando cálculos decimais...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <RelatorioVendasChannelSummary data={normalizedData} />
              <RelatorioVendasTabelaConsolidada data={normalizedData} />
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}