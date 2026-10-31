import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Download, Store, Smartphone, User, ShoppingCart, HelpCircle, CheckCircle2, MinusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { getPaymentMethodDisplay } from '@/utils/validatePaymentMethod';
import { truncateToTwoDecimals, formatTruncatedCurrency } from '@/utils/truncateDecimal';

export default function RelatorioVendasPendentesTabela({
  data,
  showSettlementButton = false,
  onSettlement = null,
  filterFinanceiro = false,
  selectable = false,
  selectedIds = new Set(),
  onToggleSelect = null,
}) {
  const { toast } = useToast();
  const [expandedChannels, setExpandedChannels] = useState({});
  const [expandedClients, setExpandedClients] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});

  const toggleChannel = (canal) => setExpandedChannels(p => ({ ...p, [canal]: !p[canal] }));
  const toggleClient = (cliente) => setExpandedClients(p => ({ ...p, [cliente]: !p[cliente] }));
  const toggleOrder = (orderId) => setExpandedOrders(p => ({ ...p, [orderId]: !p[orderId] }));

  // CRITICAL: Truncate to 2 decimals (prevents 0.999 × 5 = 4.995 → 5.00 rounding)
  const calculateItemTotal = (item) => {
    const quantidade = Number(item.quantidade || 0);
    const valorUnit = Number(item.valor_unitario || item.produtos?.preco_venda || 0);
    const rawTotal = valorUnit * quantidade;
    
    // CRITICAL: Use truncateToTwoDecimals to prevent rounding (4.995 → 4.99, NOT 5.00)
    return truncateToTwoDecimals(rawTotal);
  };

  const formatVisualCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 3
    }).format(value);
  };

  const hierarchicalData = useMemo(() => {
    console.log('[RelatorioVendasPendentesTabela] ===== BUILDING HIERARCHICAL DATA =====');
    console.log('[RelatorioVendasPendentesTabela] Total vendas recebidas:', data?.length || 0);
    
    const grouped = {};

    let filteredData = data || [];

    if (filterFinanceiro) {
      filteredData = filteredData.filter(v => !v.financeiro_baixado);
    } else {
      filteredData = filteredData.filter(order => {
        const canalVendaStr = typeof order.canal_venda === 'string' ? order.canal_venda : String(order.canal_venda || '');
        const canalUpper = canalVendaStr.toUpperCase();

        const isAppOrMercado = canalUpper === 'APP' ||
          canalUpper === 'MERCADO' ||
          canalUpper.includes('APP') ||
          canalUpper.includes('MERCADO');

        if (isAppOrMercado) {
          return order.financeiro_baixado === true;
        }

        return true;
      });
    }

    filteredData.forEach((venda, vendaIndex) => {
      console.log(`[RelatorioVendasPendentesTabela] Processando venda ${vendaIndex + 1}/${filteredData.length}:`, {
        id: venda.id,
        status: venda.status,
        total_final: venda.total_final,
        desconto_valor: venda.desconto,
        movimentacoes_count: venda.itens?.length || 0
      });
      
      const canalVendaStr = typeof venda.canal_venda === 'string' ? venda.canal_venda : String(venda.canal_venda || '');
      const clienteRefStr = typeof venda.cliente_referencia === 'string' ? venda.cliente_referencia : String(venda.cliente_referencia || '');

      const canal = canalVendaStr.trim() || 'NÃO INFORMADO';
      const cliente = clienteRefStr.trim() || 'NÃO INFORMADO';

      if (!grouped[canal]) {
        grouped[canal] = { name: canal, clients: {}, total: 0, count: 0 };
      }

      if (!grouped[canal].clients[cliente]) {
        grouped[canal].clients[cliente] = { name: cliente, orders: {}, total: 0, count: 0 };
      }

      const itensArray = Array.isArray(venda.itens) ? venda.itens : [];

      // Log each movimentacao BEFORE processing
      itensArray.forEach((movimentacao, movIndex) => {
        console.log(`[RelatorioVendasPendentesTabela] Movimentacao ${movIndex + 1}/${itensArray.length} ANTES de processar:`, {
          id: movimentacao.id,
          produto_nome: movimentacao.produtos?.nome || movimentacao.produto_nome,
          quantidade: movimentacao.quantidade,
          subtotal: movimentacao.subtotal,
          desconto_valor: movimentacao.desconto,
          total_final: movimentacao.total_final,
          tipo_item: movimentacao.tipo_item
        });
      });

      // CRITICAL FIX: Calculate subtotal (without discount/tax)
      const subtotalCalculado = itensArray.reduce((sum, item, itemIndex) => {
        const isTaxa = item.tipo_item === 'TAXA';
        const isDesconto = item.tipo_item === 'DESCONTO';
        const isPerda = item.tipo_item === 'PERDA';
        const isBrinde = item.tipo_item === 'BRINDE';

        // Skip TAXA, DESCONTO, PERDA, BRINDE for subtotal
        if (isTaxa || isDesconto || isPerda || isBrinde) return sum;

        const quantidade = Number(item.quantidade || 0);
        const valorUnit = Number(item.valor_unitario || item.produtos?.preco_venda || 0);
        const itemTotal = calculateItemTotal(item);
        
        // Log AFTER processing
        console.log(`[RelatorioVendasPendentesTabela] Movimentacao ${itemIndex + 1}/${itensArray.length} APÓS processar:`, {
          produto_nome: item.produtos?.nome || item.produto_nome,
          quantidade_processada: quantidade,
          valor_unitario_processado: valorUnit,
          total_item_processado: itemTotal,
          tipo_item: item.tipo_item
        });
        
        return sum + itemTotal;
      }, 0);

      // CRITICAL FIX: Use desconto from order data (correct column name)
      const descontoValor = Math.abs(Number(venda.desconto || 0));

      // CRITICAL FIX: Extract delivery tax (only for non-APP channels)
      const canalUpper = canal.toUpperCase();
      const taxaMotoboy = canalUpper.includes('APP') ? 0 : itensArray.reduce((sum, item) => {
        if (item.tipo_item === 'TAXA') {
          return sum + Math.abs(calculateItemTotal(item));
        }
        return sum;
      }, 0);

      // CRITICAL FIX: Calculate total = subtotal - discount + tax
      const totalCalculado = truncateToTwoDecimals(
        Math.max(0, subtotalCalculado - descontoValor + taxaMotoboy)
      );

      const orderData = {
        ...venda,
        id: venda.venda_id || venda.id,
        // CRITICAL: Check data_movimentacao FIRST for correct date display
        data: venda.data_movimentacao || venda.data_venda || venda.created_at || venda.data,
        itens: itensArray,
        subtotal: subtotalCalculado,
        descontoValor: descontoValor,
        taxaMotoboy: taxaMotoboy,
        total: totalCalculado,
        totalExibicao: totalCalculado
      };

      grouped[canal].clients[cliente].orders[orderData.id] = orderData;

      grouped[canal].clients[cliente].count += 1;
      grouped[canal].clients[cliente].total += totalCalculado;
      grouped[canal].count += 1;
      grouped[canal].total += totalCalculado;
    });

    console.log('[RelatorioVendasPendentesTabela] Hierarchical data complete');
    return grouped;
  }, [data, filterFinanceiro]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const exportToExcel = () => {
    if (!data || data.length === 0) {
      toast({ title: 'Atenção', description: 'Nenhum dado para exportar.', variant: 'destructive' });
      return;
    }

    const wb = XLSX.utils.book_new();

    Object.values(hierarchicalData).forEach(canal => {
      const channelData = [];
      Object.values(canal.clients).forEach(client => {
        Object.values(client.orders).forEach(order => {
          const itensExibicao = Array.isArray(order.itens) ? order.itens : [];
          const canalNameUpper = (canal.name || '').toUpperCase();

          itensExibicao.forEach(item => {
            const isTaxa = item.tipo_item === 'TAXA';
            const isDesconto = item.tipo_item === 'DESCONTO';
            const isBrinde = item.tipo_item === 'BRINDE';
            const isPerda = item.tipo_item === 'PERDA';

            if (isTaxa && canalNameUpper.includes('APP')) return;
            if (isDesconto) return; // Skip discount items in Excel export (shown separately)

            const quantidade = Number(item.quantidade || 0);
            const valorUnit = Number(item.valor_unitario || item.produtos?.preco_venda || 0);
            const totalItemRaw = calculateItemTotal(item);

            const qtd = isTaxa || isDesconto ? '' : quantidade;

            let vUnit;
            if (isPerda || isBrinde) {
              vUnit = 0;
            } else {
              vUnit = valorUnit;
            }

            let totalItemValue;
            if (isBrinde || isPerda) {
              totalItemValue = 0;
            } else {
              totalItemValue = totalItemRaw;
            }

            const rawTipo = item.tipo_lote || item.lotes?.tipo_lote || item.tipo_venda || (order.canal_venda === 'MERCADO' ? 'bandeja' : 'unitario');
            let displayTipoLote = 'UNITÁRIO';
            if (isBrinde) displayTipoLote = 'BRINDE';
            else if (isPerda) displayTipoLote = 'PERDA';
            else if (isTaxa) displayTipoLote = 'TAXA';
            else if (String(rawTipo).toLowerCase().includes('bandeja')) displayTipoLote = 'BANDEJA';

            channelData.push({
              'Canal de Venda': canal.name,
              'Cliente / Ref': client.name,
              'Data': formatDate(order.data),
              'Pedido ID': order.id?.split('-')[0] || order.id,
              'Produto': item.produtos?.nome || item.produto_nome || item.nome || 'Desconhecido',
              'Qtd': qtd,
              'Valor Unitário': (isTaxa || isDesconto || !qtd) ? '' : vUnit,
              'Total Item': totalItemValue,
              'Tipo Item': displayTipoLote
            });
          });

          // Add discount row if exists
          if (order.descontoValor > 0) {
            channelData.push({
              'Canal de Venda': '',
              'Cliente / Ref': '',
              'Data': '',
              'Pedido ID': '',
              'Produto': 'DESCONTO',
              'Qtd': '',
              'Valor Unitário': '',
              'Total Item': -order.descontoValor,
              'Tipo Item': 'DESCONTO'
            });
          }

          // Add delivery tax row if exists
          if (order.taxaMotoboy > 0) {
            channelData.push({
              'Canal de Venda': '',
              'Cliente / Ref': '',
              'Data': '',
              'Pedido ID': '',
              'Produto': 'TAXA ENTREGA',
              'Qtd': '',
              'Valor Unitário': '',
              'Total Item': order.taxaMotoboy,
              'Tipo Item': 'TAXA'
            });
          }

          channelData.push({});
        });
      });

      if (channelData.length > 0) {
        const wsDetail = XLSX.utils.json_to_sheet(channelData);
        XLSX.utils.book_append_sheet(wb, wsDetail, canal.name.substring(0, 31));
      }
    });

    XLSX.writeFile(wb, `Relatorio_Vendas_Pendentes.xlsx`);
    toast({ title: 'Sucesso', description: 'Relatório exportado com sucesso.' });
  };

  const getChannelIcon = (canal) => {
    const canalUpper = canal?.toUpperCase() || '';
    if (canalUpper.includes('MERCADO')) return <ShoppingCart className="w-4 h-4 text-emerald-600" />;
    if (canalUpper.includes('APP')) return <Smartphone className="w-4 h-4 text-purple-600" />;
    if (canalUpper.includes('PDV')) return <Store className="w-4 h-4 text-blue-600" />;
    return <HelpCircle className="w-4 h-4 text-slate-600" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={exportToExcel} variant="outline" className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12"></TableHead>
              <TableHead>Nível / Referência</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
              <TableHead className="text-right">Ticket Médio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.values(hierarchicalData).map((canal) => (
              <React.Fragment key={canal.name}>
                <TableRow className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer font-bold" onClick={() => toggleChannel(canal.name)}>
                  <TableCell>
                    {expandedChannels[canal.name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    {getChannelIcon(canal.name)} <span className="uppercase">{canal.name}</span>
                  </TableCell>
                  <TableCell className="text-right">{canal.count}</TableCell>
                  <TableCell className="text-right text-indigo-700">{formatTruncatedCurrency(canal.total)}</TableCell>
                  <TableCell className="text-right">{formatTruncatedCurrency(canal.count ? canal.total / canal.count : 0)}</TableCell>
                </TableRow>

                {expandedChannels[canal.name] && Object.values(canal.clients).map(client => (
                  <React.Fragment key={client.name}>
                    <TableRow className="bg-white hover:bg-slate-50 cursor-pointer" onClick={() => toggleClient(client.name)}>
                      <TableCell className="pl-8">
                        {expandedClients[client.name] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </TableCell>
                      <TableCell className="flex items-center gap-2 font-semibold text-slate-700">
                        <User className="w-3 h-3 text-slate-400" /> {client.name}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">{client.count}</TableCell>
                      <TableCell className="text-right font-medium text-slate-800">{formatTruncatedCurrency(client.total)}</TableCell>
                      <TableCell className="text-right text-slate-600">{formatTruncatedCurrency(client.count ? client.total / client.count : 0)}</TableCell>
                    </TableRow>

                    {expandedClients[client.name] && Object.values(client.orders).map(order => {
                      const itensExibicao = Array.isArray(order.itens) ? order.itens : [];
                      const shouldShowDesconto = order.descontoValor > 0;
                      const shouldShowTaxa = order.taxaMotoboy > 0;

                      return (
                        <React.Fragment key={order.id}>
                          <TableRow className="bg-slate-50/30 hover:bg-slate-50 cursor-pointer text-sm" onClick={() => toggleOrder(order.id)}>
                            <TableCell className="pl-14">
                              <div className="flex items-center gap-2">
                                {selectable && !order.financeiro_baixado && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has ? selectedIds.has(order.id) : selectedIds.includes(order.id)}
                                    onClick={e => e.stopPropagation()}
                                    onChange={() => onToggleSelect && onToggleSelect(order)}
                                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                  />
                                )}
                                {expandedOrders[order.id] ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-slate-500">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>Data: {formatDate(order.data)} | ID: {order.id?.split('-')[0] || order.id} | Pag: {getPaymentMethodDisplay(order.forma_pagamento)}</span>
                                {order.numero_pedido_app && <span className="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded">APP: {order.numero_pedido_app}</span>}
                                {shouldShowDesconto && (
                                  <span className="text-red-600 font-semibold bg-red-50 border border-red-200 px-1.5 rounded">
                                    Desconto: {formatTruncatedCurrency(order.descontoValor)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-slate-500">1</TableCell>
                            <TableCell className="text-right font-medium text-slate-700">{formatTruncatedCurrency(order.total)}</TableCell>
                            <TableCell className="text-right">
                              {order.ehVendaDireta ? (
                                <span className="text-[10px] text-gray-400 italic">Baixa via Reabastecimento</span>
                              ) : showSettlementButton && !order.financeiro_baixado ? (
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); onSettlement && onSettlement(order); }} className="bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs px-3 shadow-sm">
                                  <CheckCircle2 className="w-3 h-3" /> Baixa
                                </Button>
                              ) : <span className="text-slate-400">-</span>}
                            </TableCell>
                          </TableRow>

                          {expandedOrders[order.id] && (
                            <TableRow className="bg-slate-50/50">
                              <TableCell colSpan={5} className="p-0 border-b border-slate-100">
                                <div className="pl-20 pr-6 py-3 bg-white shadow-inner">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-transparent border-b border-slate-200">
                                        <TableHead className="py-2 text-xs font-semibold">Produto</TableHead>
                                        <TableHead className="py-2 text-xs font-semibold">Tipo Lote</TableHead>
                                        <TableHead className="py-2 text-right text-xs font-semibold">Qtd</TableHead>
                                        <TableHead className="py-2 text-right text-xs font-semibold">V. Unitário</TableHead>
                                        <TableHead className="py-2 text-right text-xs font-semibold">Total Item</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {/* Regular product items */}
                                      {itensExibicao
                                        .filter(item => {
                                          const isTaxa = item.tipo_item === 'TAXA';
                                          const isDesconto = item.tipo_item === 'DESCONTO';
                                          // Filter out TAXA and DESCONTO items (shown separately below)
                                          return !isTaxa && !isDesconto;
                                        })
                                        .map((item, idx) => {
                                        const isBrinde = item.tipo_item === 'BRINDE';
                                        const isPerda = item.tipo_item === 'PERDA';

                                        const quantidade = Number(item.quantidade || 0);
                                        const valorUnit = Number(item.valor_unitario || item.produtos?.preco_venda || 0);
                                        const totalItem = calculateItemTotal(item);

                                        // Log row being rendered
                                        console.log(`[RelatorioVendasPendentesTabela] Renderizando linha ${idx + 1}:`, {
                                          produto_nome: item.produtos?.nome || item.produto_nome,
                                          quantidade: quantidade,
                                          valor_unitario: valorUnit,
                                          total_item: totalItem,
                                          tipo_item: item.tipo_item
                                        });

                                        const rawT = item.tipo_lote || item.lotes?.tipo_lote || item.tipo_venda || (order.canal_venda === 'MERCADO' ? 'bandeja' : 'unitario');
                                        let dTipo = isBrinde ? 'BRINDE' : isPerda ? 'PERDA' : String(rawT).toUpperCase();
                                        if (dTipo.includes('BANDEJA')) dTipo = 'BANDEJA';
                                        else if (dTipo.includes('UNIT') || dTipo.includes('BASE')) dTipo = 'UNITÁRIO';

                                        const displayValorUnitario = (isPerda || isBrinde)
                                          ? formatTruncatedCurrency(0)
                                          : formatVisualCurrency(valorUnit);

                                        const displayTotalItem = (isBrinde || isPerda) ? formatTruncatedCurrency(0) : formatTruncatedCurrency(totalItem);

                                        return (
                                          <TableRow key={idx} className="border-b-0 hover:bg-slate-50/50">
                                            <TableCell className="py-2 text-xs font-medium text-slate-700">
                                              <div className="flex items-center gap-2">
                                                <span>{item.produtos?.nome || item.produto_nome || item.nome || 'Produto'}</span>
                                                {isBrinde && <Badge className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5">BRINDE</Badge>}
                                                {isPerda && <Badge className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5">PERDA</Badge>}
                                              </div>
                                            </TableCell>
                                            <TableCell className="py-2">
                                              <Badge variant="outline" className="text-[9px] font-bold uppercase">
                                                {dTipo}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="py-2 text-right text-xs text-slate-600">{quantidade}</TableCell>
                                            <TableCell className="py-2 text-right text-xs text-slate-500">
                                              {displayValorUnitario}
                                            </TableCell>
                                            <TableCell className="py-2 text-right text-xs font-semibold text-emerald-600">
                                              {displayTotalItem}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}

                                      {/* Subtotal row */}
                                      <TableRow className="border-t-2 border-slate-300 bg-slate-50">
                                        <TableCell colSpan={4} className="py-2 text-xs font-bold text-slate-700 text-right">
                                          Subtotal:
                                        </TableCell>
                                        <TableCell className="py-2 text-right text-xs font-bold text-slate-800">
                                          {formatTruncatedCurrency(order.subtotal)}
                                        </TableCell>
                                      </TableRow>

                                      {/* CRITICAL FIX - Discount row (if exists) */}
                                      {shouldShowDesconto && (
                                        <TableRow className="bg-red-50/50 border-b border-red-100">
                                          <TableCell className="py-2 text-xs font-medium text-red-700">
                                            <div className="flex items-center gap-2">
                                              <MinusCircle className="w-3 h-3" />
                                              <span>Desconto Aplicado</span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="py-2">
                                            <Badge className="bg-red-100 text-red-700 text-[9px] font-bold">
                                              DESCONTO
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-2 text-right text-xs text-red-600">-</TableCell>
                                          <TableCell className="py-2 text-right text-xs text-red-600">-</TableCell>
                                          <TableCell className="py-2 text-right text-xs font-bold text-red-600">
                                            -{formatTruncatedCurrency(order.descontoValor)}
                                          </TableCell>
                                        </TableRow>
                                      )}

                                      {/* Delivery tax row (if exists and not APP) */}
                                      {shouldShowTaxa && (
                                        <TableRow className="bg-blue-50/50 border-b border-blue-100">
                                          <TableCell className="py-2 text-xs font-medium text-blue-700">
                                            Taxa de Entrega
                                          </TableCell>
                                          <TableCell className="py-2">
                                            <Badge className="bg-blue-100 text-blue-700 text-[9px] font-bold">
                                              TAXA
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-2 text-right text-xs text-blue-600">1</TableCell>
                                          <TableCell className="py-2 text-right text-xs text-blue-600">-</TableCell>
                                          <TableCell className="py-2 text-right text-xs font-bold text-blue-600">
                                            +{formatTruncatedCurrency(order.taxaMotoboy)}
                                          </TableCell>
                                        </TableRow>
                                      )}

                                      {/* CRITICAL FIX - Total final row */}
                                      <TableRow className="border-t-2 border-slate-400 bg-slate-100">
                                        <TableCell colSpan={4} className="py-3 text-sm font-bold text-slate-900 text-right">
                                          TOTAL FINAL:
                                        </TableCell>
                                        <TableCell className="py-3 text-right text-sm font-bold text-emerald-700">
                                          {formatTruncatedCurrency(order.total)}
                                        </TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}