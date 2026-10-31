import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Download, Loader2, Check, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getPaymentMethodDisplay } from '@/utils/validatePaymentMethod';
import { buildFinancialItems } from '@/utils/buildFinancialItems';
import { formatMoney, formatTruncatedCurrency } from '@/utils/truncateDecimal';
import { formatUnit, formatCurrency } from '@/utils/currencyFormatter';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOM from 'react-dom/client';

export default function RelatorioVendasTabelaConsolidada({
  data,
  filterFinanceiro = false,
  empresaNome = "CUPOM",
  statusFiltro = 'TODAS',
  onRefresh
}) {
  const { toast } = useToast();
  const { empresaId } = useAuth();
  const [expandedChannels, setExpandedChannels] = useState({});
  const [expandedClients, setExpandedClients] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const [downloadingOrders, setDownloadingOrders] = useState({});
  const [processingBaixa, setProcessingBaixa] = useState({});
  const [empresaLogoUrl, setEmpresaLogoUrl] = useState(null);

  // Logo da empresa pro cupom baixado aqui bater com o mesmo layout do PDV
  // Rápido — busca uma vez só, não a cada download.
  useEffect(() => {
    if (!empresaId) return;
    supabase.from('empresas').select('logo_url').eq('id', empresaId).single()
      .then(({ data }) => { if (data?.logo_url) setEmpresaLogoUrl(data.logo_url); })
      .catch(() => {});
  }, [empresaId]);

  // Mercados Venda Direta não usam esse fluxo de baixa (a cobrança deles é
  // via reabastecimento) — se alguma venda antiga ficou marcada como
  // pendente por engano, não deve mostrar o botão de "Dar Baixa" aqui.
  const [mercadosVendaDireta, setMercadosVendaDireta] = useState(new Set());
  useEffect(() => {
    supabase.from('locais').select('nome').eq('tipo', 'Mercado').eq('modelo_negocio', 'venda_direta')
      .then(({ data: locs }) => setMercadosVendaDireta(new Set((locs || []).map(l => l.nome))));
  }, []);

  const toggleChannel = (canal) => setExpandedChannels(p => ({ ...p, [canal]: !p[canal] }));
  const toggleClient = (cliente) => setExpandedClients(p => ({ ...p, [cliente]: !p[cliente] }));
  const toggleOrder = (orderId) => setExpandedOrders(p => ({ ...p, [orderId]: !p[orderId] }));


  const getDescontoValor = (item) => {
    if (item.tipo_item !== 'DESCONTO') return 0;
    if (item.desconto_valor !== undefined && item.desconto_valor !== null) return Math.abs(item.desconto_valor);
    if (item.desconto !== undefined && item.desconto !== null) return Math.abs(item.desconto);
    if (item.subtotal !== undefined && item.subtotal !== null && item.subtotal !== 0) return Math.abs(item.subtotal);
    if (item.valor_unitario !== undefined && item.valor_unitario !== null && item.valor_unitario !== 0) return Math.abs(item.valor_unitario);
    if (item.total_final !== undefined && item.total_final !== null) return Math.abs(item.total_final);
    return 0;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getTipoLote = (item) => {
    return item.lotes?.tipo_lote || '-';
  };

  const getCanalDisplay = (canalVenda, clienteReferencia, numeroPedidoApp) => {
    const canal = String(canalVenda || '').toLowerCase().trim();
    if (canal.includes('pdv')) return 'PDV';
    if (canal.includes('mercado')) return 'MERCADO';

    const isAppSale = canal.includes('app') || (numeroPedidoApp && numeroPedidoApp !== '-' && numeroPedidoApp.trim() !== '');
    if (isAppSale) {
      const clienteRef = String(clienteReferencia || '').toLowerCase().trim();
      if (clienteRef === '99') return 'APP - 99';
      if (clienteRef.includes('ifood')) return 'APP - IFOOD';
      if (clienteRef.includes('próprio') || clienteRef.includes('proprio')) return 'APP - PRÓPRIO';
      if (!clienteRef || clienteRef === 'não informado' || clienteRef === 'nao informado') return 'APP';
      return `APP - ${clienteRef.toUpperCase()}`;
    }
    return 'NÃO INFORMADO';
  };

  const handleBaixa = async (vendaId) => {
    setProcessingBaixa(prev => ({ ...prev, [vendaId]: true }));
    try {
      const { error } = await supabase.from('vendas').update({ status: 'CONCILIADO', financeiro_baixado: true, data_baixa: new Date().toISOString() }).eq('id', vendaId);
      if (error) throw error;
      toast({ title: "Baixa realizada", description: `Venda ${vendaId.split('-')[0]} foi conciliada.`, className: "bg-emerald-600 text-white" });
      if (onRefresh) await onRefresh();
    } catch (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setProcessingBaixa(prev => ({ ...prev, [vendaId]: false }));
    }
  };

  const downloadReceipt = async (vendaId, paperWidth = '80mm') => {
    setDownloadingOrders(prev => ({ ...prev, [vendaId]: true }));
    try {
      const { data: vendaData, error: vendaError } = await supabase.from('vendas').select('*').eq('id', vendaId).single();
      if (vendaError || !vendaData) throw new Error('Venda não encontrada');
      // Linha ~108 — logo após o if (itemsError...)
      console.log('vendaData campos:', JSON.stringify(vendaData)); // ← adicionar esta linha
      const { data: itemsData, error: itemsError } = await supabase.from('movimentacoes').select(`*, produtos:produto_id(nome), lotes:lote_id(numero_lote, tipo_lote)`).eq('venda_id', vendaId);
      if (itemsError || !itemsData?.length) throw new Error('Itens não encontrados');
      console.log('itemsData:', JSON.stringify(itemsData)); // ← adicionar esta linha
      const saleData = {
        venda_id: vendaData.id, data: vendaData.data_venda, total_final: vendaData.total_final, forma_pagamento: vendaData.forma_pagamento,
        forma_pagamento_detalhes: vendaData.forma_pagamento_detalhes,
        desconto_valor: 0,
        taxa_motoboy: 0,
        subtotal: 0,
        numero_pedido_app: vendaData.numero_pedido_app,
        items: itemsData.map(item => ({
          produto_nome: item.produtos?.nome || 'Produto', quantidade: item.quantidade, preco: item.valor_unitario, total: item.total_final,
          tipo_item: item.tipo_item, taxa_motoboy: item.taxa_motoboy, desconto_valor: item.desconto_valor,
          lotes: { tipo_lote: item.lotes?.tipo_lote || 'base', numero_lote: item.lotes?.numero_lote || '-' }
        }))
      };

      saleData.items.forEach(item => {
        const tipo = String(item.tipo_item || '').toUpperCase();
        if (!['TAXA', 'ENTREGA', 'DESCONTO'].includes(tipo)) {
          saleData.subtotal += Number(item.total_final || item.subtotal || (item.quantidade * item.preco) || 0);
        }
        // taxa e desconto ficam no último item
        if (Number(item.taxa_motoboy) > 0) saleData.taxa_motoboy = Number(item.taxa_motoboy);
        if (Number(item.desconto_valor) > 0) saleData.desconto_valor = Number(item.desconto_valor);
      });
      console.log('saleData final:', JSON.stringify({
        taxa_motoboy: saleData.taxa_motoboy,
        desconto_valor: saleData.desconto_valor,
        total_final: saleData.total_final
      }));
      await generateReceiptPDF(saleData, empresaNome, paperWidth);
      toast({ title: "PDF gerado", description: `Cupom baixado.`, className: "bg-emerald-600 text-white" });
    } catch (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setDownloadingOrders(prev => ({ ...prev, [vendaId]: false }));
    }
  };

  // Gera o QR code isoladamente (sem precisar de nenhum elemento fixo na
  // tela) — cria uma div temporária fora da tela, desenha o QR nela,
  // tira o "print" com html2canvas, e desmonta tudo em seguida. Assim não
  // precisa mexer no JSX/layout do relatório pra conseguir o QR no PDF.
  const gerarQrCodeDataUrl = (value, size = 92) => new Promise((resolve) => {
    if (!value) { resolve(null); return; }
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    root.render(<QRCodeSVG value={value} size={size} level="M" includeMargin={false} />);
    requestAnimationFrame(async () => {
      try {
        const canvas = await html2canvas(container, { backgroundColor: '#ffffff', scale: 2 });
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('[Cupom] Falha ao gerar QR code:', err);
        resolve(null);
      } finally {
        root.unmount();
        document.body.removeChild(container);
      }
    });
  });

  const getImageDataUrl = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });

  // Mesmo layout do cupom do PDV Rápido (Helvetica, linhas desenhadas,
  // item em 2 linhas, logo e QR code) — unificado aqui pra não ter dois
  // cupons com cara diferente no sistema. Não mexe em nada da lógica
  // do relatório em si, só em como o PDF é desenhado.
  const generateReceiptPDF = async (saleData, empresaNome, paperWidth) => {
    const receiptUrl = saleData?.venda_id ? `${window.location.origin}/lote-publico?v=${saleData.venda_id}` : '';

    let logoDataUrl = null;
    if (empresaLogoUrl) {
      try { logoDataUrl = await getImageDataUrl(empresaLogoUrl); }
      catch (err) { console.warn('[Cupom] Falha ao carregar logo:', err); }
    }
    const qrDataUrl = await gerarQrCodeDataUrl(receiptUrl);

    const imgWidth = paperWidth === '58mm' ? 58 : 80;
    const margin = 6;
    const contentWidth = imgWidth - margin * 2;
    const lineHeight = 5;
    const fontMain = paperWidth === '58mm' ? 9 : 10;
    const fontSmall = fontMain - 1.5;

    const tempPDF = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [imgWidth, 300] });
    tempPDF.setFont('helvetica', 'normal');
    tempPDF.setFontSize(fontMain);

    let estimatedHeight = 70;
    if (logoDataUrl) estimatedHeight += 28;
    saleData.items.forEach((item) => {
      const splitLines = tempPDF.splitTextToSize(item.produto_nome || 'Produto', contentWidth);
      estimatedHeight += splitLines.length * lineHeight + lineHeight;
    });
    if (saleData.desconto_valor > 0) estimatedHeight += 6;
    if (saleData.taxa_motoboy > 0) estimatedHeight += 6;
    if (qrDataUrl) estimatedHeight += 42;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [imgWidth, Math.max(estimatedHeight, 90)] });
    let cursorY = 10;

    const linha = (y, grosso = false) => {
      pdf.setLineWidth(grosso ? 0.5 : 0.15);
      pdf.line(margin, y, imgWidth - margin, y);
    };

    if (logoDataUrl) {
      const logoHeight = 22;
      const logoWidth = imgWidth - margin * 4;
      const logoX = (imgWidth - logoWidth) / 2;
      try {
        pdf.addImage(logoDataUrl, 'PNG', logoX, cursorY, logoWidth, logoHeight, undefined, 'FAST');
        cursorY += logoHeight + 3;
      } catch (err) { console.warn('[Cupom] Erro ao inserir logo:', err); }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontMain + 2);
    pdf.text(empresaNome || 'Cupom', imgWidth / 2, cursorY, { align: 'center' });
    cursorY += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontSmall);
    pdf.setTextColor(90);
    pdf.text('CUPOM NÃO FISCAL', imgWidth / 2, cursorY, { align: 'center' });
    pdf.setTextColor(0);
    cursorY += 4;

    linha(cursorY, true);
    cursorY += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontMain);
    const dataFormatada = saleData.data ? new Date(saleData.data).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
    pdf.text(dataFormatada, margin, cursorY);
    cursorY += lineHeight;

    const orderId = saleData.venda_id ? saleData.venda_id.split('-')[0].toUpperCase() : 'N/A';
    pdf.text(`Pedido ${orderId}`, margin, cursorY);
    cursorY += lineHeight;

    linha(cursorY, true);
    cursorY += 5;

    saleData.items.forEach((item) => {
      const productName = item.produto_nome || 'Produto';
      const quantidade = Number(item.quantidade) || 0;
      const preco = Number(item.preco) || 0;
      const itemTotal = preco * quantidade;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontMain);
      const splitName = pdf.splitTextToSize(productName, contentWidth);
      splitName.forEach((linhaTexto) => {
        pdf.text(linhaTexto, margin, cursorY);
        cursorY += lineHeight;
      });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSmall);
      pdf.setTextColor(90);
      pdf.text(`${quantidade} × ${formatCurrency(preco, 3)}`, margin, cursorY);
      pdf.setTextColor(0);
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatCurrency(itemTotal, 2), imgWidth - margin, cursorY, { align: 'right' });
      cursorY += lineHeight + 1.5;
    });

    linha(cursorY);
    cursorY += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(fontMain);

    if (saleData.taxa_motoboy > 0) {
      pdf.text('Taxa de entrega', margin, cursorY);
      pdf.text(`+ ${formatCurrency(saleData.taxa_motoboy, 2)}`, imgWidth - margin, cursorY, { align: 'right' });
      cursorY += lineHeight;
    }

    if (saleData.desconto_valor > 0) {
      pdf.text('Desconto', margin, cursorY);
      pdf.text(`- ${formatCurrency(Math.abs(saleData.desconto_valor), 2)}`, imgWidth - margin, cursorY, { align: 'right' });
      cursorY += lineHeight;
    }

    cursorY += 2;
    linha(cursorY, true);
    cursorY += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontMain + 1);
    pdf.text('TOTAL', margin, cursorY);
    pdf.setFontSize(fontMain + 3);
    pdf.text(formatCurrency(saleData.total_final, 2), imgWidth - margin, cursorY, { align: 'right' });
    cursorY += 4;
    linha(cursorY, true);
    cursorY += 6;

    if (saleData.forma_pagamento) {
      const paymentMethodMap = {
        dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Cartão de Débito',
        cartao_credito: 'Cartão de Crédito', multiplo: 'Múltiplas Formas', nao_informado: 'Não Informado',
      };
      const paymentLabel = paymentMethodMap[saleData.forma_pagamento] || saleData.forma_pagamento;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontMain);
      pdf.text('Forma de pagamento', margin, cursorY);
      pdf.text(paymentLabel, imgWidth - margin, cursorY, { align: 'right' });
      cursorY += lineHeight + 2;
      linha(cursorY, true);
      cursorY += 6;
    }

    if (qrDataUrl) {
      try {
        const qrSize = paperWidth === '58mm' ? 26 : 30;
        const qrX = (imgWidth - qrSize) / 2;
        pdf.addImage(qrDataUrl, 'PNG', qrX, cursorY, qrSize, qrSize, undefined, 'FAST');
        cursorY += qrSize + 3;
        pdf.setFontSize(6.5);
        pdf.setTextColor(120);
        pdf.text('Consulte sua venda', imgWidth / 2, cursorY, { align: 'center' });
        pdf.setTextColor(0);
        cursorY += 6;
      } catch (err) { console.warn('[Cupom] Erro ao inserir QR code:', err); }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontMain);
    pdf.text('Obrigado pela preferência!', imgWidth / 2, cursorY, { align: 'center' });
    cursorY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90);
    pdf.text('Volte sempre', imgWidth / 2, cursorY, { align: 'center' });
    cursorY += 5;
    pdf.setFontSize(6.5);
    pdf.setTextColor(150);
    pdf.text('Gerado por Reddu', imgWidth / 2, cursorY, { align: 'center' });

    pdf.save(`cupom_${orderId}_${Date.now()}.pdf`);
  };

  /**
   * 1. UNIFIED FILTER (Single source of truth)
   */
  const vendasFiltradas = useMemo(() => {
    return (data || []).filter(venda => {
      const status = String(venda.status || '').trim().toUpperCase();

      if (filterFinanceiro && venda.financeiro_baixado) return false;

      if (statusFiltro === 'PENDENTES' && status !== 'PENDENTE') return false;
      if (statusFiltro === 'CONCILIADAS' && status !== 'CONCILIADO') return false;

      return true;
    });
  }, [data, statusFiltro, filterFinanceiro]);

  /**
   * 2. KPI METRICS (Acumuladores Unificados e Matemática Reversa)
   */
  const summaryMetrics = useMemo(() => {
    let totalRecebidoAcumulado = 0;
    let totalDescontosAcumulado = 0;
    let totalTaxasAcumulado = 0;
    let totalBrindesAcumulado = 0;
    let totalPerdasAcumulado = 0;

    // Processar cada venda filtrada
    vendasFiltradas.forEach(order => {
      // 1. Líquido (Recebido) - truncar CADA valor antes de acumular
      totalRecebidoAcumulado += Number(order.total_final || 0);

      // 2. Desconto - vem direto do order normalizado
      totalDescontosAcumulado += Math.abs(Number(order.desconto || order.desconto_valor || 0));

      // 3. Taxa - vem direto do order normalizado
      totalTaxasAcumulado += Math.abs(Number(order.taxa_motoboy || 0));

      // 4. Brindes e Perdas - buscar nos itens normalizados
      const items = order.itens || [];

      const brindesVenda = items
        .filter(item => String(item.tipo_item || '').toUpperCase() === 'BRINDE')
        .reduce((sum, item) => sum + Number(item.subtotal || item.total_final || (Number(item.quantidade || 0) * Number(item.valor_unitario || 0))) || 0, 0);
      totalBrindesAcumulado += brindesVenda;

      const perdasVenda = items
        .filter(item => String(item.tipo_item || '').toUpperCase() === 'PERDA')
        .reduce((sum, item) => sum + Number(item.subtotal || item.total_final || (Number(item.quantidade || 0) * Number(item.valor_unitario || 0))) || 0, 0);
      totalPerdasAcumulado += perdasVenda;
    });

    // Matemática Reversa: Total Bruto = Recebido + Descontos - Taxas
    const totalBruto = Math.round(
      (totalRecebidoAcumulado + totalDescontosAcumulado - totalTaxasAcumulado) * 100
    ) / 100;

    // Log dos valores finais truncados
    console.log('KPI Summary - Valores Finais:', {
      totalRecebido: totalRecebidoAcumulado,
      totalDescontos: totalDescontosAcumulado,
      totalTaxas: totalTaxasAcumulado,
      totalBruto: totalBruto,
      quantidadeVendas: vendasFiltradas.length
    });

    return {
      totalRecebido: totalRecebidoAcumulado,
      totalDescontos: totalDescontosAcumulado,
      totalTaxas: totalTaxasAcumulado,
      totalBruto: totalBruto,
      totalBrindes: totalBrindesAcumulado,
      totalPerdas: totalPerdasAcumulado,
      quantidadeVendas: vendasFiltradas.length,
      ticketMedio: vendasFiltradas.length > 0
        ? Math.round((totalRecebidoAcumulado / vendasFiltradas.length) * 100) / 100
        : 0
    };
  }, [vendasFiltradas]);

  /**
   * 3. TABLE HIERARCHY
   */
  const hierarchicalData = useMemo(() => {
    const grouped = {};
    vendasFiltradas.forEach(order => {
      const canal = String(order.canal_venda || 'NÃO INFORMADO').trim();
      const cliente = String(order.cliente_referencia || 'NÃO INFORMADO').trim();

      if (!grouped[canal]) grouped[canal] = { name: canal, clients: {}, total: 0, count: 0 };
      if (!grouped[canal].clients[cliente]) grouped[canal].clients[cliente] = { name: cliente, orders: {}, total: 0, count: 0 };

      const t = Number(order.total_final || 0);
      grouped[canal].clients[cliente].orders[order.id] = order;
      grouped[canal].clients[cliente].count += 1;
      grouped[canal].clients[cliente].total += t;
      grouped[canal].count += 1;
      grouped[canal].total += t;
    });
    return grouped;
  }, [vendasFiltradas]);

  const handleExportExcel = () => {
    try {
      const rows = [];
      Object.values(hierarchicalData).forEach(ca => Object.values(ca.clients).forEach(cl => Object.values(cl.orders).forEach(order => {
        const items = (buildFinancialItems(order) || []).filter(i => i.subtotal !== 0 && i.subtotal !== '0');
        const cDisp = getCanalDisplay(order.canal_venda, order.cliente_referencia, order.numero_pedido_app);
        const pApp = order.numero_pedido_app || '-';
        const dStr = formatDate(order.data_venda);

        rows.push({ 'Canal': cDisp, 'Pedido APP': pApp, 'Descrição': `PEDIDO: ${order.id?.split('-')[0]} | DATA: ${dStr}`, 'Data e Hora da Venda': dStr, 'Lote': '', 'Qtd': '', 'Valor Unitário': '', 'Valor': '' });

        const uniq = items.filter((item, index, self) => {
          const tp = String(item.tipo_item || '').toUpperCase();
          if (['NORMAL', '', 'BRINDE', 'PERDA'].includes(tp)) return true;
          return index === self.findIndex(i => String(i.tipo_item).toUpperCase() === tp);
        });

        uniq.forEach(item => {
          const tp = String(item.tipo_item || '').toUpperCase();
          const isFinanceiro = ['TAXA', 'ENTREGA', 'DESCONTO', 'BRINDE', 'PERDA'].includes(tp);
          // DEPOIS — itens NORMAL sempre calculados por qtd × valor_unitario
          const rawVlr = tp === 'BRINDE' || tp === 'PERDA' ? 0
            : tp === 'DESCONTO' ? -Math.abs(item.total_final ?? 0)
              : ['TAXA', 'ENTREGA'].includes(tp) ? Math.abs(item.total_final ?? 0)
                : (Number(item.quantidade || 0) * Number(item.valor_unitario || 0));
          const vlr = Math.round(rawVlr * 100) / 100;
          const nomeItem = tp === 'TAXA' || tp === 'ENTREGA' ? 'Taxa de Entrega'
            : tp === 'DESCONTO' ? 'Desconto'
              : (item.produtos?.nome || item.nome || tp);
          rows.push({
            'Canal': cDisp,
            'Pedido APP': pApp,
            'Descrição': nomeItem,
            'Data e Hora da Venda': dStr,
            'Lote': isFinanceiro ? '' : getTipoLote(item),
            'Qtd': isFinanceiro ? 1 : (item.quantidade || 0),
            'Valor Unitário': isFinanceiro ? '-' : Number(item.valor_unitario || 0),
            'Valor': vlr
          });
        });
        rows.push({
          'Canal': cDisp, 'Pedido APP': pApp,
          'Descrição': `TOTAL (${getPaymentMethodDisplay(order.forma_pagamento)})`,
          'Data e Hora da Venda': dStr, 'Lote': '', 'Qtd': '', 'Valor Unitário': '',
          'Valor': Number(order.total_final || 0)
        });
        rows.push({ 'Canal': '', 'Pedido APP': '', 'Descrição': '', 'Data e Hora da Venda': '', 'Lote': '', 'Qtd': '', 'Valor Unitário': '', 'Valor': '' });
      })));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Extrato");
      XLSX.writeFile(wb, "extrato_vendas.xlsx");
      toast({ title: "Sucesso!", description: "Arquivo exportado." });
    } catch (e) { toast({ title: "Erro", description: "Falha ao gerar arquivo.", variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">QTD. VENDAS</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-900">{summaryMetrics.quantidadeVendas}</div></CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700">TOTAL RECEBIDO (C/ TAXA)</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-900">{formatTruncatedCurrency(summaryMetrics.totalRecebido, 2)}</div></CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-violet-700">BRINDES</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-violet-900">{formatTruncatedCurrency(summaryMetrics.totalBrindes, 2)}</div></CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-rose-700">PERDAS</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-rose-900">{formatTruncatedCurrency(summaryMetrics.totalPerdas, 2)}</div></CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleExportExcel} variant="outline" className="gap-2 bg-white">
          <Download className="w-4 h-4 text-emerald-600" /> Exportar Excel
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12"></TableHead>
              <TableHead className="font-bold text-slate-600 uppercase">Referência / Cliente</TableHead>
              <TableHead className="text-right font-bold text-slate-600 uppercase">Qtd. Vendas</TableHead>
              <TableHead className="text-right font-bold text-slate-600 uppercase">Total</TableHead>
              <TableHead className="w-16 text-center font-bold text-slate-600 uppercase">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.values(hierarchicalData).map((canal) => (
              <React.Fragment key={canal.name}>
                <TableRow className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer font-bold" onClick={() => toggleChannel(canal.name)}>
                  <TableCell>{expandedChannels[canal.name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                  <TableCell className="uppercase">{canal.name}</TableCell>
                  <TableCell className="text-right text-slate-600">{canal.count}</TableCell>
                  <TableCell className="text-right">{formatTruncatedCurrency(canal.total)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>

                {expandedChannels[canal.name] && Object.values(canal.clients).map(client => (
                  <React.Fragment key={client.name}>
                    <TableRow className="bg-white hover:bg-slate-50 cursor-pointer" onClick={() => toggleClient(client.name)}>
                      <TableCell className="pl-8">{expandedClients[client.name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                      <TableCell className="font-semibold uppercase">{client.name}</TableCell>
                      <TableCell className="text-right text-slate-600">{client.count}</TableCell>
                      <TableCell className="text-right">{formatTruncatedCurrency(client.total, 2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>

                    {expandedClients[client.name] && Object.values(client.orders).map(order => {
                      const items = buildFinancialItems(order) || [];
                      const itensValidos = items.filter(item => item.subtotal !== 0 && item.subtotal !== '0');
                      const uniqueItems = itensValidos.filter((item, index, self) => {
                        const tp = String(item.tipo_item || '').toUpperCase();
                        if (['NORMAL', '', 'BRINDE', 'PERDA'].includes(tp)) return true;
                        return index === self.findIndex(t => String(t.tipo_item).toUpperCase() === tp);
                      });

                      const isAppChannel = String(order.canal_venda || '').toLowerCase().includes('app') || (order.numero_pedido_app && order.numero_pedido_app.trim() !== '');
                      const pedidoAppDisplay = isAppChannel && order.numero_pedido_app ? order.numero_pedido_app : null;
                      const ehMercadoVendaDireta = order.canal_venda === 'MERCADO' && mercadosVendaDireta.has(order.cliente_referencia);
                      const statusReal = String(order.status || '').trim().toUpperCase();
                      const isPendente = statusReal === 'PENDENTE';
                      const isConciliado = statusReal === 'CONCILIADO';
                      // Venda Direta só pode ser baixada pelo Faturamento de
                      // Reabastecimento (senão desincroniza o pedido de lá,
                      // que fica sem saber que já foi pago) — esconde o
                      // botão de "Dar Baixa" aqui mesmo quando pendente,
                      // mas o selo PENDENTE/CONCILIADO continua mostrando
                      // o status real.
                      const podeDarBaixaAqui = isPendente && !ehMercadoVendaDireta;

                      return (
                        <React.Fragment key={order.id}>
                          <TableRow className="bg-slate-50/30 hover:bg-slate-100">
                            <TableCell className="pl-14 cursor-pointer" onClick={() => toggleOrder(order.id)}>
                              {expandedOrders[order.id] ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                            </TableCell>
                            <TableCell className="py-2" colSpan={2}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-mono text-[10px] text-slate-400">ID: {order.id?.split('-')[0]}</span>
                                <span className="text-[10px] font-bold text-slate-500">{formatDate(order.data_venda)}</span>
                                <span className="font-medium text-slate-600 uppercase">{getPaymentMethodDisplay(order.forma_pagamento)}</span>
                                {pedidoAppDisplay && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-semibold px-2 py-0.5">APP: {pedidoAppDisplay}</Badge>}
                                {isPendente && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[9px] font-semibold px-2 py-0.5">PENDENTE</Badge>}
                                {isConciliado && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[9px] font-semibold px-2 py-0.5">CONCILIADO</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-slate-800">{formatTruncatedCurrency(Number(order.total_final || 0), 2)}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {podeDarBaixaAqui ? (
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-emerald-50 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); handleBaixa(order.id); }} disabled={processingBaixa[order.id]}>
                                          {processingBaixa[order.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <Check className="w-3.5 h-3.5" />}
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-emerald-50 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); downloadReceipt(order.id); }} disabled={downloadingOrders[order.id]}>
                                          {downloadingOrders[order.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <Download className="w-3.5 h-3.5" />}
                                        </Button>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">{podeDarBaixaAqui ? 'Dar Baixa' : 'Baixar Cupom'}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {order.nfe_url_pdf && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-50 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); window.open(order.nfe_url_pdf, '_blank'); }}>
                                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p className="text-xs">Ver NF-e</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {expandedOrders[order.id] && (
                            <TableRow className="bg-white">
                              <TableCell colSpan={5} className="p-0">
                                <div className="pl-24 pr-6 py-3 bg-slate-50/20">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="border-slate-200">
                                        <TableHead className="h-7 text-[10px] font-bold uppercase">Descrição</TableHead>
                                        <TableHead className="h-7 text-[10px] font-bold uppercase">Lote</TableHead>
                                        <TableHead className="h-7 text-right text-[10px] font-bold uppercase">Qtd</TableHead>
                                        <TableHead className="h-7 text-right text-[10px] font-bold uppercase">Vlr. Unitário</TableHead>
                                        <TableHead className="h-7 text-right text-[10px] font-bold uppercase">Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {uniqueItems.map((item, idx) => {
                                        const tp = String(item.tipo_item || '').toUpperCase();
                                        const isBrinde = tp === 'BRINDE';
                                        const isPerda = tp === 'PERDA';
                                        const isTaxa = ['TAXA', 'ENTREGA'].includes(tp);
                                        const isDesconto = tp === 'DESCONTO';

                                        let vTotal = isBrinde || isPerda ? 0 : isTaxa ? formatMoney(Math.abs(item.taxa_motoboy || item.total_final || 0)) : isDesconto ? -formatMoney(Math.abs(getDescontoValor(item))) : Number(item.subtotal || 0);

                                        return (
                                          <TableRow key={idx} className="border-0">
                                            <TableCell className="py-1 uppercase text-slate-700">
                                              <div className="flex items-center gap-2">
                                                <span>{item.produtos?.nome || item.nome || (isTaxa ? 'Taxa Entrega' : 'Item')}</span>
                                                {isBrinde && <Badge className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 font-semibold">BRINDE</Badge>}
                                                {isPerda && <Badge className="bg-red-100 text-red-700 text-[9px] px-1.5 py-0.5 font-semibold">PERDA</Badge>}
                                              </div>
                                            </TableCell>
                                            <TableCell className="py-1 text-[10px] font-mono text-slate-500">{isTaxa || isDesconto ? '-' : getTipoLote(item)}</TableCell>
                                            <TableCell className="py-1 text-right font-bold text-slate-600">{isTaxa || isDesconto ? '1' : item.quantidade}</TableCell>
                                            <TableCell className="py-1 text-right font-bold text-slate-600">
                                              {!isTaxa && !isDesconto && !isBrinde && !isPerda ? formatTruncatedCurrency(Number(item.valor_unitario), 3) : '-'}
                                            </TableCell>
                                            <TableCell className={`py-1 text-right font-bold ${isDesconto ? 'text-red-600' : 'text-emerald-600'}`}>{formatTruncatedCurrency(vTotal, 2)}</TableCell>
                                          </TableRow>
                                        );
                                      })}
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