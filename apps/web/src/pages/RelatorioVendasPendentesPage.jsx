import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, TrendingUp, DollarSign, ShoppingCart, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RelatorioVendasPendentesTabela from '@/components/relatorios/RelatorioVendasPendentesTabela';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/utils/currencyFormatter';

export default function RelatorioVendasPendentesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [filterCanal, setFilterCanal] = useState('TODOS');
  const [filterMercado, setFilterMercado] = useState('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  const [selectedVendaForSettlement, setSelectedVendaForSettlement] = useState(null);
  const [isSettling, setIsSettling] = useState(false);
  const [dataBaixaEscolhida, setDataBaixaEscolhida] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (empresaId) {
      fetchVendas();
    }
  }, [empresaId]);

  const fetchVendas = async () => {
    console.log('[RelatorioVendasPendentesPage] ===== FETCHING VENDAS PENDENTES =====');
    console.log('[RelatorioVendasPendentesPage] Timestamp:', new Date().toISOString());
    console.log('[RelatorioVendasPendentesPage] empresa_id:', empresaId);
    
    setIsLoading(true);
    try {
      // CRITICAL: Retrieve vendas with exact desconto values from database
      console.log('[RelatorioVendasPendentesPage] Fetching vendas from Supabase...');
      
      const { data: vendasData, error: vendasError } = await supabase
        .from('vendas')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('financeiro_baixado', false)
        .neq('status', 'CANCELADO')
        .order('data_venda', { ascending: false });

      if (vendasError) {
        console.error('[RelatorioVendasPendentesPage] Error fetching vendas:', vendasError);
        throw vendasError;
      }

      console.log('[RelatorioVendasPendentesPage] Vendas fetched:', vendasData?.length || 0);
      console.log('[RelatorioVendasPendentesPage] Sample venda structure:');
      if (vendasData && vendasData.length > 0) {
        console.table(vendasData[0]);
        console.log('[RelatorioVendasPendentesPage] Desconto from database:', {
          value: vendasData[0].desconto,
          type: typeof vendasData[0].desconto,
          exact_value: vendasData[0].desconto
        });
      }

      if (!vendasData || vendasData.length === 0) {
        console.log('[RelatorioVendasPendentesPage] No pending vendas found');
        setVendas([]);
        setIsLoading(false);
        return;
      }

      // Mercados Venda Direta também ficam pendentes de verdade agora (até
      // o pedido de reabastecimento ser baixado) — então devem aparecer
      // aqui também. Só a baixa continua exclusiva do Faturamento de
      // Reabastecimento (pra não dessincronizar o pedido de lá); por isso
      // ainda precisamos saber quais mercados são Venda Direta, só que
      // agora pra marcar a venda em vez de escondê-la da lista.
      const { data: mercadosVD } = await supabase
        .from('locais').select('nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado').eq('modelo_negocio', 'venda_direta');
      const nomesVendaDireta = new Set((mercadosVD || []).map(m => m.nome));
      const vendasFiltradas = vendasData;

      if (vendasFiltradas.length === 0) {
        setVendas([]);
        setIsLoading(false);
        return;
      }

      // CRITICAL: Fetch movimentacoes for each venda to calculate subtotal
      console.log('[RelatorioVendasPendentesPage] Fetching movimentacoes for vendas...');
      
      const vendaIds = vendasFiltradas.map(v => v.id);
      
      const { data: movimentacoesData, error: movError } = await supabase
        .from('movimentacoes')
        .select(`
          id,
          venda_id,
          tipo,
          quantidade,
          valor_unitario,
          subtotal,
          total_final,
          desconto,
          tipo_item,
          produto_id,
          produtos(nome),
          lote_id,
          lotes(numero_lote, tipo_lote)
        `)
        .in('venda_id', vendaIds)
        .eq('empresa_id', empresaId);

      if (movError) {
        console.error('[RelatorioVendasPendentesPage] Error fetching movimentacoes:', movError);
        throw movError;
      }

      console.log('[RelatorioVendasPendentesPage] ===== LOADING VENDAS PENDENTES =====');
      console.log('[RelatorioVendasPendentesPage] Total movimentacoes carregadas:', movimentacoesData?.length || 0);

      // CRITICAL: Group movimentacoes by venda_id and calculate subtotals
      console.log('[RelatorioVendasPendentesPage] ===== PROCESSING VENDAS DATA =====');
      
      const vendasComItens = vendasFiltradas.map((venda, index) => {
        const itens = (movimentacoesData || []).filter(m => m.venda_id === venda.id);
        
        console.log(`[RelatorioVendasPendentesPage] Processing venda ${index + 1}/${vendasFiltradas.length}`);
        console.log('[RelatorioVendasPendentesPage] Venda carregada:', {
          id: venda.id,
          status: venda.status,
          financeiro_baixado: venda.financeiro_baixado,
          total_final: venda.total_final,
          desconto_valor: venda.desconto,
          movimentacoes_count: itens.length
        });
        
        // Log each movimentacao
        itens.forEach((movimentacao, idx) => {
          console.log(`[RelatorioVendasPendentesPage] Movimentacao ${idx + 1}/${itens.length} carregada:`, {
            id: movimentacao.id,
            produto_nome: movimentacao.produtos?.nome,
            quantidade: movimentacao.quantidade,
            subtotal: movimentacao.subtotal,
            desconto_valor: movimentacao.desconto,
            total_final: movimentacao.total_final,
            tipo_item: movimentacao.tipo_item
          });
        });
        
        // CRITICAL: Get exact desconto from venda record (NOT from movimentacoes)
        const descontoExato = Number(venda.desconto || 0);
        
        console.log('[RelatorioVendasPendentesPage] Desconto from database:', {
          raw_value: venda.desconto,
          type: typeof venda.desconto,
          exact_numeric: descontoExato,
          is_number: typeof descontoExato === 'number'
        });
        
        // CRITICAL: Calculate subtotal from movimentacoes items (ONLY tipo = 'venda')
        // Reconhece todos os tipos de movimentação que representam venda de
        // verdade — antes só pegava 'venda' (PDV) e ignorava 'venda_mercado'
        // (a maioria, mercado/consignado) e 'venda_unitario', fazendo o
        // subtotal recalculado sair bem menor que o valor real da venda.
        const itensVenda = itens.filter(item => ['venda', 'venda_mercado', 'venda_unitario'].includes(item.tipo));
        
        console.log('[RelatorioVendasPendentesPage] Subtotal items count:', itensVenda.length);
        console.log('[RelatorioVendasPendentesPage] Items being summed:');
        console.table(itensVenda.map(item => ({
          produto: item.produtos?.nome,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          item_total: item.quantidade * item.valor_unitario
        })));
        
        const subtotalCalculado = itensVenda.reduce((sum, item) => {
          const itemTotal = item.quantidade * item.valor_unitario;
          return sum + itemTotal;
        }, 0);
        
        console.log('[RelatorioVendasPendentesPage] Subtotal calculation:', {
          calculated: subtotalCalculado,
          type: typeof subtotalCalculado
        });
        
        // CRITICAL: Calculate total final = subtotal - desconto (using EXACT values)
        const totalFinalCalculado = Math.max(0, subtotalCalculado - descontoExato);
        
        console.log('[RelatorioVendasPendentesPage] Total final calculation:', {
          formula: `${subtotalCalculado} - ${descontoExato} = ${totalFinalCalculado}`,
          subtotal: subtotalCalculado,
          desconto: descontoExato,
          total: totalFinalCalculado
        });
        console.table({
          subtotal: subtotalCalculado,
          desconto_exact: descontoExato,
          total_final: totalFinalCalculado
        });
        
        // CRITICAL: Format desconto for display (use .toFixed(2) ONLY for formatting)
        const descontoFormatado = descontoExato.toFixed(2);
        
        console.log('[RelatorioVendasPendentesPage] Formatted desconto:', {
          exact_value: descontoExato,
          formatted: descontoFormatado,
          display: formatMoney(descontoExato)
        });
        
        return {
          ...venda,
          venda_id: venda.id,
          itens: itens,
          // CRITICAL: Use exact database value for desconto (NO truncation)
          desconto: descontoExato,
          subtotal: subtotalCalculado,
          total_final: totalFinalCalculado,
          ehVendaDireta: venda.canal_venda === 'MERCADO' && nomesVendaDireta.has(venda.cliente_referencia),
        };
      });

      console.log('[RelatorioVendasPendentesPage] ===== VENDAS PENDENTES LOADING COMPLETE =====');
      console.log('[RelatorioVendasPendentesPage] Total vendas processadas:', vendasComItens.length);
      console.log('[RelatorioVendasPendentesPage] ✓ Vendas processing complete');

      setVendas(vendasComItens);

    } catch (err) {
      console.error('[RelatorioVendasPendentesPage] ===== ERROR FETCHING VENDAS =====');
      console.error('[RelatorioVendasPendentesPage] Error:', err);
      console.table({
        error_message: err.message,
        error_type: err.constructor.name
      });
      
      toast({
        title: 'Erro ao Carregar Vendas',
        description: err.message || 'Falha ao buscar vendas pendentes',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSettlementDialog = (venda) => {
    console.log('[RelatorioVendasPendentesPage] Opening settlement dialog for venda:', venda.id);
    setDataBaixaEscolhida(new Date().toISOString().slice(0, 10));
    setSelectedVendaForSettlement(venda);
  };

  const handleConfirmSettlement = async () => {
    if (!selectedVendaForSettlement) return;

    console.log('[RelatorioVendasPendentesPage] ===== SETTLING VENDA =====');
    console.log('[RelatorioVendasPendentesPage] Venda ID:', selectedVendaForSettlement.id);
    
    setIsSettling(true);

    try {
      const vendaId = selectedVendaForSettlement.id;

      // Mantém a hora atual, só troca o dia pro escolhido — evita problema
      // de fuso horário ao converter só a data.
      const agora = new Date();
      const [ano, mes, dia] = dataBaixaEscolhida.split('-').map(Number);
      const dataBaixaFinal = new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds()).toISOString();

      // Update venda financeiro_baixado
      const { error: vendaUpdateError } = await supabase
        .from('vendas')
        .update({
          financeiro_baixado: true,
          data_baixa: dataBaixaFinal
        })
        .eq('id', vendaId);

      if (vendaUpdateError) {
        console.error('[RelatorioVendasPendentesPage] Error updating venda:', vendaUpdateError);
        throw vendaUpdateError;
      }

      console.log('[RelatorioVendasPendentesPage] ✓ Venda updated');

      // Update movimentacoes financeiro_baixado
      const { error: movUpdateError } = await supabase
        .from('movimentacoes')
        .update({
          financeiro_baixado: true,
          data_baixa: dataBaixaFinal
        })
        .eq('venda_id', vendaId);

      if (movUpdateError) {
        console.error('[RelatorioVendasPendentesPage] Error updating movimentacoes:', movUpdateError);
        throw movUpdateError;
      }

      console.log('[RelatorioVendasPendentesPage] ✓ Movimentacoes updated');

      toast({
        title: 'Baixa Realizada',
        description: 'Venda baixada no financeiro com sucesso.',
        duration: 3000
      });

      setSelectedVendaForSettlement(null);
      fetchVendas();

    } catch (err) {
      console.error('[RelatorioVendasPendentesPage] ===== ERROR SETTLING VENDA =====');
      console.error('[RelatorioVendasPendentesPage] Error:', err);
      
      toast({
        title: 'Erro ao Baixar Venda',
        description: err.message || 'Falha ao realizar baixa no financeiro',
        variant: 'destructive'
      });
    } finally {
      setIsSettling(false);
    }
  };

  // Filter vendas
  const filteredVendas = vendas.filter(v => {
    const matchesCanal = filterCanal === 'TODOS' || v.canal_venda === filterCanal;
    const matchesMercado = filterMercado === 'TODOS' || v.cliente_referencia === filterMercado;
    const matchesSearch = !searchTerm || 
      v.cliente_referencia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.numero_pedido_app?.toLowerCase().includes(searchTerm.toLowerCase());
    const dataVenda = v.data_venda ? v.data_venda.slice(0, 10) : null;
    const matchesInicio = !dataInicio || (dataVenda && dataVenda >= dataInicio);
    const matchesFim = !dataFim || (dataVenda && dataVenda <= dataFim);

    return matchesCanal && matchesMercado && matchesSearch && matchesInicio && matchesFim;
  });

  // Calculate summary metrics
  const totalPendente = filteredVendas.reduce((sum, v) => sum + (v.total_final || 0), 0);
  const totalVendas = filteredVendas.length;
  const ticketMedio = totalVendas > 0 ? totalPendente / totalVendas : 0;

  const canais = ['TODOS', ...new Set(vendas.map(v => v.canal_venda).filter(Boolean))];
  const mercados = ['TODOS', ...[...new Set(vendas.map(v => v.cliente_referencia).filter(Boolean))].sort()];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>Vendas Pendentes - Estoque 360</title>
      </Helmet>
      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6 pb-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Vendas Pendentes</h1>
              <p className="text-gray-500 mt-1">Acompanhe as vendas aguardando baixa no financeiro.</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
                <DollarSign className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{formatMoney(totalPendente)}</div>
                <p className="text-xs text-gray-500 mt-1">Valor total a receber</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas Pendentes</CardTitle>
                <ShoppingCart className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{totalVendas}</div>
                <p className="text-xs text-gray-500 mt-1">Pedidos aguardando baixa</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal de Venda</label>
                  <Select value={filterCanal} onValueChange={setFilterCanal}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Selecione o canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {canais.map(canal => (
                        <SelectItem key={canal} value={canal}>{canal}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Mercado</label>
                  <Select value={filterMercado} onValueChange={setFilterMercado}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Selecione o mercado" />
                    </SelectTrigger>
                    <SelectContent>
                      {mercados.map(mercado => (
                        <SelectItem key={mercado} value={mercado}>{mercado}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Buscar</label>
                  <Input
                    placeholder="Cliente, referência, pedido APP..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Período — De</label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={e => setDataInicio(e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Período — Até</label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={e => setDataFim(e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={fetchVendas} disabled={isLoading} size="sm" className="bg-amber-600 hover:bg-amber-700 gap-2">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Buscar
                  </Button>
                  {(dataInicio || dataFim) && (
                    <Button variant="outline" size="sm" onClick={() => { setDataInicio(''); setDataFim(''); }} className="bg-white">
                      Limpar período
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {filteredVendas.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-gray-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                  <p className="text-lg font-medium">Nenhuma venda pendente encontrada</p>
                  <p className="text-sm mt-1">Todas as vendas foram baixadas no financeiro.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <RelatorioVendasPendentesTabela
              data={filteredVendas}
              showSettlementButton={true}
              onSettlement={handleOpenSettlementDialog}
              filterFinanceiro={true}
            />
          )}
        </div>

        {/* Settlement Confirmation Dialog */}
        <AlertDialog open={!!selectedVendaForSettlement} onOpenChange={() => setSelectedVendaForSettlement(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Baixa Financeira</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja dar baixa nesta venda?
              </AlertDialogDescription>
            </AlertDialogHeader>
            {selectedVendaForSettlement && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Cliente:</span>
                  <span className="text-sm">{selectedVendaForSettlement.cliente_referencia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Canal:</span>
                  <Badge variant="outline">{selectedVendaForSettlement.canal_venda}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-sm font-bold text-emerald-600">
                    {formatMoney(selectedVendaForSettlement.total_final)}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="data-baixa-pendentes" className="text-sm font-medium">Data em que o pagamento caiu</label>
              <Input
                id="data-baixa-pendentes"
                type="date"
                value={dataBaixaEscolhida}
                onChange={e => setDataBaixaEscolhida(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="bg-white text-gray-900"
              />
            </div>
            <p className="text-sm text-amber-600 font-medium">
              Esta ação marcará a venda como baixada no financeiro e não poderá ser desfeita.
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSettling}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmSettlement}
                disabled={isSettling}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSettling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Baixa
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}