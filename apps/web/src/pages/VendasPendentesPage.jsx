import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import RelatorioVendasPendentesTabela from '@/components/relatorios/RelatorioVendasPendentesTabela';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle2, Calendar, ShoppingCart, DollarSign, Tag, AlertTriangle, Search } from 'lucide-react';
import { formatTruncatedCurrency, truncateToTwoDecimals } from '@/utils/truncateDecimal';
import { formatCurrency } from '@/utils/currencyFormatter';
import { getPaymentMethodDisplay } from '@/utils/validatePaymentMethod';
import { auditVendaPrecision, formatAuditResults } from '@/utils/validateVendaPrecision';

export default function VendasPendentesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');

  const [vendas, setVendas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [auditResults, setAuditResults] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDataInicial(today);
    setDataFinal(today);
  }, []);

  useEffect(() => {
    if (empresaId && dataInicial && dataFinal) {
      fetchVendas();
    }
  }, [empresaId, dataInicial, dataFinal]);

  const fetchVendas = async () => {
    if (!empresaId || !dataInicial || !dataFinal) return;

    setIsLoading(true);
    try {
      console.log('[VendasPendentesPage] ===== FETCHING VENDAS =====');
      
      const dataInicialTimestamp = new Date(dataInicial + 'T00:00:00').toISOString();
      const dataFinalTimestamp = new Date(dataFinal + 'T23:59:59').toISOString();

      // CRITICAL FIX: Fetch vendas without desconto column (does not exist in vendas table)
      const { data: vendasData, error: vendasError } = await supabase
        .from('vendas')
        .select(`
          id,
          canal_venda,
          cliente_referencia,
          data_venda,
          total_final,
          forma_pagamento,
          forma_pagamento_detalhes,
          status,
          financeiro_baixado,
          data_baixa,
          numero_pedido_app,
          observacao_retirada,
          responsavel_retirada,
          created_at
        `)
        .eq('empresa_id', empresaId)
        .gte('created_at', dataInicialTimestamp)
        .lte('created_at', dataFinalTimestamp)
        .order('created_at', { ascending: false });

      if (vendasError) throw vendasError;

      console.log('[VendasPendentesPage] Vendas fetched from database:', vendasData?.length || 0);

      if (vendasData && vendasData.length > 0) {
        console.log('[VendasPendentesPage] Sample venda data from DB:', {
          id: vendasData[0].id.split('-')[0],
          total_final: vendasData[0].total_final,
          total_final_type: typeof vendasData[0].total_final
        });
      }

      const vendasComItens = await Promise.all(
        (vendasData || []).map(async (venda) => {
          const { data: movimentacoes, error: movError } = await supabase
            .from('movimentacoes')
            .select(`
              id,
              quantidade,
              valor_unitario,
              subtotal,
              total_final,
              desconto_tipo,
              desconto_valor,
              tipo_item,
              tipo_lote,
              canal_venda,
              taxa_motoboy,
              data_movimentacao,
              produtos:produto_id (
                id,
                nome,
                preco_venda
              ),
              lotes:lote_id (
                id,
                numero_lote,
                tipo_lote
              )
            `)
            .eq('venda_id', venda.id)
            .order('data_movimentacao', { ascending: true });

          if (movError) {
            console.error('[VendasPendentesPage] Error fetching movimentacoes:', movError);
            return { ...venda, itens: [] };
          }

          // Calculate subtotal from movimentacoes (for display/verification only)
          const subtotalCalculado = (movimentacoes || []).reduce((sum, item) => {
            const isTaxa = item.tipo_item === 'TAXA';
            const isDesconto = item.tipo_item === 'DESCONTO';
            const isPerda = item.tipo_item === 'PERDA';
            const isBrinde = item.tipo_item === 'BRINDE';

            if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

            const quantidade = Number(item.quantidade || 0);
            const valorUnit = Number(item.valor_unitario || item.produtos?.preco_venda || 0);
            const itemTotal = truncateToTwoDecimals(valorUnit * quantidade);

            return sum + itemTotal;
          }, 0);

          // CRITICAL FIX: Calculate discount from movimentacoes.desconto_valor
          // Sum all desconto_valor from movimentacoes for this venda
          const descontoCalculado = (movimentacoes || []).reduce((sum, item) => {
            const descontoItem = Number(item.desconto_valor || 0);
            return sum + descontoItem;
          }, 0);

          // Fallback: if no desconto_valor, calculate from subtotal - total_final
          let descontoFinal = descontoCalculado;
          if (descontoCalculado === 0) {
            const totalItens = (movimentacoes || []).reduce((sum, item) => {
              const isTaxa = item.tipo_item === 'TAXA';
              const isDesconto = item.tipo_item === 'DESCONTO';
              const isPerda = item.tipo_item === 'PERDA';
              const isBrinde = item.tipo_item === 'BRINDE';

              if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

              const totalItem = Number(item.total_final || 0);
              return sum + totalItem;
            }, 0);

            const subtotalItens = (movimentacoes || []).reduce((sum, item) => {
              const isTaxa = item.tipo_item === 'TAXA';
              const isDesconto = item.tipo_item === 'DESCONTO';
              const isPerda = item.tipo_item === 'PERDA';
              const isBrinde = item.tipo_item === 'BRINDE';

              if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

              const subtotalItem = Number(item.subtotal || 0);
              return sum + subtotalItem;
            }, 0);

            descontoFinal = Math.max(0, subtotalItens - totalItens);
          }

          console.log('[VendasPendentesPage] Venda discount calculation:', {
            venda_id: venda.id.split('-')[0],
            desconto_from_movimentacoes: descontoCalculado,
            desconto_fallback: descontoFinal,
            using: descontoFinal
          });

          // Calculate delivery tax from movimentacoes
          const canalUpper = (venda.canal_venda || '').toUpperCase();
          const taxaMotoboy = canalUpper.includes('APP') ? 0 : (movimentacoes || []).reduce((sum, item) => {
            if (item.tipo_item === 'TAXA') {
              const quantidade = Number(item.quantidade || 0);
              const valorUnit = Number(item.valor_unitario || 0);
              return sum + Math.abs(truncateToTwoDecimals(valorUnit * quantidade));
            }
            return sum;
          }, 0);

          console.log('[VendasPendentesPage] Venda financial data:', {
            venda_id: venda.id.split('-')[0],
            subtotal_calculado: subtotalCalculado,
            desconto_final: descontoFinal,
            taxa_motoboy: taxaMotoboy,
            total_final_db: venda.total_final,
            expected_total: truncateToTwoDecimals(Math.max(0, subtotalCalculado - descontoFinal + taxaMotoboy))
          });

          return {
            ...venda,
            venda_id: venda.id,
            data_movimentacao: movimentacoes?.[0]?.data_movimentacao || venda.data_venda || venda.created_at,
            itens: movimentacoes || [],
            subtotal: subtotalCalculado,
            desconto: descontoFinal, // CRITICAL: Calculated from movimentacoes
            descontoValor: descontoFinal, // Keep for compatibility
            taxaMotoboy: taxaMotoboy,
          };
        })
      );

      console.log('[VendasPendentesPage] Vendas processed:', vendasComItens.length);
      setVendas(vendasComItens);
    } catch (error) {
      console.error('[VendasPendentesPage] Error fetching vendas:', error);
      toast({
        title: 'Erro ao carregar vendas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettlement = (order) => {
    setSelectedOrder(order);
    setOpenModal(true);
  };

  const handleConfirmSettlement = async () => {
    if (!selectedOrder || !empresaId) return;

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase
        .from('vendas')
        .update({
          financeiro_baixado: true,
          data_baixa: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id)
        .eq('empresa_id', empresaId);

      if (updateError) throw updateError;

      toast({
        title: 'Baixa realizada com sucesso!',
        description: `Venda ID ${selectedOrder.id.split('-')[0]} foi baixada no financeiro.`,
        duration: 5000,
      });

      setOpenModal(false);
      setSelectedOrder(null);

      await fetchVendas();
    } catch (error) {
      console.error('[VendasPendentesPage] Error confirming settlement:', error);
      toast({
        title: 'Erro ao realizar baixa',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunAudit = async () => {
    if (!empresaId) return;

    setIsAuditing(true);
    try {
      console.log('[VendasPendentesPage] Running precision audit...');
      
      const auditData = await auditVendaPrecision(
        empresaId,
        dataInicial ? new Date(dataInicial + 'T00:00:00').toISOString() : null,
        dataFinal ? new Date(dataFinal + 'T23:59:59').toISOString() : null,
        100 // Audit last 100 vendas
      );

      const formatted = formatAuditResults(auditData);
      setAuditResults(formatted);

      console.log('[VendasPendentesPage] Audit completed:', formatted);

      if (formatted.variant === 'success') {
        toast({
          title: formatted.title,
          description: formatted.description,
          duration: 5000
        });
      } else if (formatted.variant === 'warning') {
        toast({
          title: formatted.title,
          description: formatted.description,
          variant: 'destructive',
          duration: 8000
        });
      } else {
        toast({
          title: formatted.title,
          description: formatted.description,
          variant: 'destructive',
          duration: 5000
        });
      }

    } catch (error) {
      console.error('[VendasPendentesPage] Audit error:', error);
      toast({
        title: 'Erro ao executar auditoria',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const summaryMetrics = useMemo(() => {
    const vendasPendentes = vendas.filter(v => !v.financeiro_baixado && v.status !== 'CANCELADO');

    const qtdVendas = vendasPendentes.length;

    const totalAReceber = vendasPendentes.reduce((sum, venda) => {
      const totalVenda = Number(venda.total_final || 0);
      return sum + totalVenda;
    }, 0);

    const totalDescontos = vendasPendentes.reduce((sum, venda) => {
      // Use desconto calculated from movimentacoes
      const desconto = Number(venda.desconto || venda.descontoValor || 0);
      return sum + desconto;
    }, 0);

    console.log('[VendasPendentesPage] Summary metrics calculated:', {
      qtdVendas,
      totalAReceber,
      totalDescontos
    });

    return {
      qtdVendas,
      totalAReceber,
      totalDescontos
    };
  }, [vendas]);

  return (
    <>
      <Helmet>
        <title>Vendas Pendentes - Estoque 360</title>
      </Helmet>
      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6 pb-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Vendas Pendentes</h1>
                <p className="text-gray-500 mt-1">
                  Vendas aguardando baixa no financeiro
                </p>
              </div>
            </div>

            <Button
              onClick={handleRunAudit}
              disabled={isAuditing || !empresaId}
              variant="outline"
              className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {isAuditing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Auditando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Auditar Precisão
                </>
              )}
            </Button>
          </div>

          {/* Audit Results Display */}
          {auditResults && auditResults.discrepancies && auditResults.discrepancies.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="w-5 h-5" />
                  {auditResults.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-amber-800">{auditResults.description}</p>
                
                <div className="bg-white rounded-lg p-3 border border-amber-200">
                  <p className="text-xs font-bold text-amber-900 mb-2">Top 5 Maiores Discrepâncias:</p>
                  <div className="space-y-1.5">
                    {auditResults.discrepancies.slice(0, 5).map((disc, idx) => (
                      <div key={idx} className="text-xs flex justify-between items-center p-2 bg-amber-50 rounded">
                        <span className="font-mono text-amber-800">ID: {disc.vendaIdShort}</span>
                        <span className="text-amber-700">{disc.clienteReferencia}</span>
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">
                          Diff: {disc.difference > 0 ? '+' : ''}{disc.difference.toFixed(2)}
                        </Badge>
                        <span className="text-amber-600">{disc.percentageError}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Date Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Filtros de Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Data Inicial
                  </label>
                  <Input
                    type="date"
                    value={dataInicial}
                    onChange={(e) => setDataInicial(e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Data Final
                  </label>
                  <Input
                    type="date"
                    value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={fetchVendas}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isLoading || !dataInicial || !dataFinal}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      'Buscar Vendas'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {!isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Qtd Vendas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-900">
                    {summaryMetrics.qtdVendas}
                  </div>
                  <p className="text-xs text-blue-600 mt-1">Vendas pendentes</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Total a Receber c/ Taxa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-900">
                    {formatCurrency(summaryMetrics.totalAReceber, 2)}
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">Valor total pendente</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Desconto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-900">
                    {formatCurrency(summaryMetrics.totalDescontos, 2)}
                  </div>
                  <p className="text-xs text-purple-600 mt-1">Total de descontos</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {/* Table */}
          {!isLoading && (
            <RelatorioVendasPendentesTabela
              data={vendas}
              showSettlementButton={true}
              onSettlement={handleSettlement}
              filterFinanceiro={true}
            />
          )}

          {/* Settlement Modal */}
          <Dialog open={openModal} onOpenChange={setOpenModal}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-amber-600" />
                  Confirmar Baixa Financeira
                </DialogTitle>
                <DialogDescription className="text-gray-600">
                  Revise os dados da venda antes de confirmar a baixa no financeiro.
                </DialogDescription>
              </DialogHeader>

              {selectedOrder && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <p className="text-xs text-gray-500">ID da Venda</p>
                      <p className="font-mono font-semibold text-gray-900">
                        {selectedOrder.id.split('-')[0]}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Data</p>
                      <p className="font-medium text-gray-900">
                        {formatDate(selectedOrder.data_movimentacao || selectedOrder.data_venda)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Canal de Venda</p>
                      <p className="font-medium text-gray-900">
                        {selectedOrder.canal_venda || 'NÃO INFORMADO'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Cliente / Ref</p>
                      <p className="font-medium text-gray-900">
                        {selectedOrder.cliente_referencia || 'NÃO INFORMADO'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Forma de Pagamento</p>
                      <p className="font-medium text-gray-900">
                        {getPaymentMethodDisplay(selectedOrder.forma_pagamento)}
                      </p>
                    </div>
                    {selectedOrder.numero_pedido_app && (
                      <div>
                        <p className="text-xs text-gray-500">Pedido APP</p>
                        <Badge variant="outline" className="font-mono text-xs">
                          {selectedOrder.numero_pedido_app}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900">Resumo Financeiro</h3>
                    <div className="space-y-2 p-4 bg-white border border-slate-200 rounded-lg">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium text-gray-900">
                          {formatTruncatedCurrency(selectedOrder.subtotal || 0)}
                        </span>
                      </div>

                      {(selectedOrder.descontoValor > 0 || selectedOrder.desconto > 0) && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-red-600">Desconto:</span>
                          <span className="font-medium text-red-600">
                            -{formatTruncatedCurrency(selectedOrder.descontoValor || selectedOrder.desconto || 0)}
                          </span>
                        </div>
                      )}

                      {selectedOrder.taxaMotoboy > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-blue-600">Taxa Entrega:</span>
                          <span className="font-medium text-blue-600">
                            +{formatTruncatedCurrency(selectedOrder.taxaMotoboy)}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 border-t-2 border-slate-300">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-900">Total Final:</span>
                          <span className="font-bold text-xl text-emerald-600">
                            {formatTruncatedCurrency(selectedOrder.total || selectedOrder.total_final || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpenModal(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmSettlement}
                  disabled={isSubmitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Baixa
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}