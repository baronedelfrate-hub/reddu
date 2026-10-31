import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, MonitorSmartphone, Download } from 'lucide-react';
import CupomNaoFiscal from './CupomNaoFiscal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/utils/currencyFormatter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';

export default function PrintReceiptDialog({
  isOpen,
  onClose,
  saleData,
  empresaNome,
  empresaLogo
}) {
  const [paperWidth, setPaperWidth] = useState('80mm');
  const [isDownloading, setIsDownloading] = useState(false);
  const [fetchedLogo, setFetchedLogo] = useState(null);
  const { toast } = useToast();
  const { empresaId } = useAuth();
  const qrContainerRef = useRef(null);
  const logoRef = useRef(null);

  // Fetch company logo from Supabase if not provided via props
  useEffect(() => {
    const fetchLogo = async () => {
      if (empresaId && !empresaLogo) {
        try {
          const { data, error } = await supabase
            .from('empresas')
            .select('logo_url')
            .eq('id', empresaId)
            .single();

          if (!error && data?.logo_url) {
            setFetchedLogo(data.logo_url);
          }
        } catch (err) {
          console.error('[PrintReceiptDialog] Error fetching logo:', err);
        }
      }
    };

    if (isOpen) {
      fetchLogo();
    }
  }, [empresaId, empresaLogo, isOpen]);

  const logoUrl = empresaLogo || fetchedLogo;

  // Generate receipt URL for QR code
  const receiptUrl = saleData?.venda_id
    ? `${window.location.origin}/lote-publico?v=${saleData.venda_id}`
    : '';

  const handlePrint = () => {
    try {
      // Get the cupom element
      const cupomEl = document.getElementById('printable-receipt');
      if (!cupomEl) {
        toast({ title: "Erro", description: "Cupom não encontrado.", variant: "destructive" });
        return;
      }

      // Open popup window with cupom content
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) {
        toast({ title: "Popup bloqueado", description: "Permita popups para este site e tente novamente.", variant: "destructive" });
        return;
      }

      const is58 = paperWidth === '58mm';
      const widthMm = is58 ? 58 : 80;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Cupom - ${empresaNome || 'Reddu'}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                background: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                font-size: ${is58 ? '11px' : '12.5px'};
                color: #000 !important;
                width: ${widthMm}mm;
                padding: 2mm;
              }
              @page {
                size: ${widthMm}mm auto;
                margin: 0mm;
              }
              @media print {
                html, body {
                  width: ${widthMm}mm;
                  padding: 2mm;
                  margin: 0;
                }
              }
              /* Força tudo pra preto puro e sem sombra/borda decorativa —
                 impressora térmica não reproduz cinza nem sombra direito.
                 Isso vale pra texto E borda (as réguas do cupom usam
                 border-top inline; sem essa regra, algumas ficariam num
                 cinza que pode sumir na impressão). */
              * {
                color: #000 !important;
                background: #fff !important;
                border-color: #000 !important;
                box-shadow: none !important;
              }
              img { max-width: 100% !important; filter: grayscale(100%) contrast(1.2) !important; display: block; }
              svg { width: auto !important; height: auto !important; }
              .print\\:hidden { display: none !important; }
            </style>
          </head>
          <body>
            ${cupomEl.outerHTML}
          </body>
        </html>
      `);

      printWindow.document.close();

      // Wait for images to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 500);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      }, 1500);

    } catch (error) {
      toast({
        title: "Erro de impressão",
        description: "Não foi possível abrir a janela de impressão.",
        variant: "destructive"
      });
    }
  };

  /**
   * Helper function to convert image URL to base64 data URL
   */
  const getImageDataUrl = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  };

  /**
   * ENHANCED PDF GENERATION WITH LOGO AND QR CODE
   */
  const downloadReceiptPDF = async () => {
    setIsDownloading(true);

    try {
      // 1. DATA VALIDATION
      if (!saleData) {
        throw new Error('Dados da venda não disponíveis');
      }

      if (!saleData.items || !Array.isArray(saleData.items) || saleData.items.length === 0) {
        throw new Error('Nenhum item encontrado na venda');
      }

      let totalFinal = Number(saleData.total_final) || 0;
      if (isNaN(totalFinal) || totalFinal < 0) totalFinal = 0;

      // 2. PREPARE IMAGES (LOGO AND QR CODE)
      let logoDataUrl = null;
      let qrDataUrl = null;

      if (logoUrl) {
        try {
          logoDataUrl = await getImageDataUrl(logoUrl);
        } catch (err) {
          console.warn('[PDF] Falha ao carregar logo:', err);
        }
      }

      if (receiptUrl && qrContainerRef.current) {
        try {
          const qrCanvas = await html2canvas(qrContainerRef.current, { backgroundColor: '#ffffff', scale: 2 });
          qrDataUrl = qrCanvas.toDataURL('image/png');
        } catch (err) {
          console.warn('[PDF] Falha ao gerar QR code:', err);
        }
      }

      // 3. LAYOUT CONFIG — mesma proporção do cupom em tela: item em 2
      // linhas (nome completo + "qtd × unit ...... total"), sem coluna
      // fixa que trunca nome de produto.
      const imgWidth = paperWidth === '58mm' ? 58 : 80;
      const margin = 6;
      const contentWidth = imgWidth - margin * 2;
      const maxNameWidth = contentWidth;
      const lineHeight = 5;
      const fontMain = paperWidth === '58mm' ? 9 : 10;
      const fontSmall = fontMain - 1.5;

      const discountValue = Number(saleData.desconto_valor) || 0;
      const taxaMotoboyValue = Number(saleData.taxa_motoboy) || 0;

      // 4. ESTIMATE HEIGHT
      const tempPDF = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [imgWidth, 300] });
      tempPDF.setFont('helvetica', 'normal');
      tempPDF.setFontSize(fontMain);

      let estimatedHeight = 70;
      if (logoDataUrl) estimatedHeight += 28;
      saleData.items.forEach((item) => {
        const splitLines = tempPDF.splitTextToSize(item.produto_nome || 'Produto', maxNameWidth);
        estimatedHeight += splitLines.length * lineHeight + lineHeight; // nome + linha de qtd/total
      });
      if (discountValue > 0) estimatedHeight += 6;
      if (taxaMotoboyValue > 0) estimatedHeight += 6;
      if (qrDataUrl) estimatedHeight += 42;

      // 5. CREATE PDF
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [imgWidth, Math.max(estimatedHeight, 90)] });
      let cursorY = 10;

      const linha = (y, grosso = false) => {
        pdf.setLineWidth(grosso ? 0.5 : 0.15);
        pdf.line(margin, y, imgWidth - margin, y);
      };

      // 6. HEADER
      if (logoDataUrl) {
        const logoHeight = 22;
        const logoWidth = imgWidth - margin * 4;
        const logoX = (imgWidth - logoWidth) / 2;
        try {
          pdf.addImage(logoDataUrl, 'PNG', logoX, cursorY, logoWidth, logoHeight, undefined, 'FAST');
          cursorY += logoHeight + 3;
        } catch (err) {
          console.warn('[PDF] Erro ao inserir logo:', err);
        }
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

      // 7. TRANSACTION INFO
      const saleDate = saleData.data ? new Date(saleData.data) : new Date();
      const formattedDate = saleDate.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontMain);
      pdf.text(formattedDate, margin, cursorY);
      cursorY += lineHeight;

      const orderId = saleData.venda_id ? saleData.venda_id.split('-')[0].toUpperCase() : 'N/A';
      pdf.text(`Pedido ${orderId}`, margin, cursorY);
      cursorY += lineHeight;

      if (saleData.cliente_referencia) {
        pdf.text(`Cliente: ${saleData.cliente_referencia}`, margin, cursorY);
        cursorY += lineHeight;
      }

      linha(cursorY, true);
      cursorY += 5;

      // 8. ITEMS — nome completo (com quebra de linha se precisar) e,
      // logo abaixo, "qtd × valor unit" à esquerda com o total à direita.
      saleData.items.forEach((item) => {
        const productName = item.produto_nome || 'Produto';
        const quantidade = Number(item.quantidade) || 0;
        const preco = Number(item.preco) || 0;
        const itemTotal = preco * quantidade;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(fontMain);
        const splitName = pdf.splitTextToSize(productName, maxNameWidth);
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

      // 9. TOTALS
      const subtotal = saleData.subtotal || totalFinal;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontMain);
      pdf.text('Subtotal', margin, cursorY);
      pdf.text(formatCurrency(subtotal, 2), imgWidth - margin, cursorY, { align: 'right' });
      cursorY += lineHeight;

      if (discountValue > 0) {
        pdf.text('Desconto', margin, cursorY);
        pdf.text(`- ${formatCurrency(Math.abs(discountValue), 2)}`, imgWidth - margin, cursorY, { align: 'right' });
        cursorY += lineHeight;
      }

      if (taxaMotoboyValue > 0) {
        pdf.text('Taxa de entrega', margin, cursorY);
        pdf.text(`+ ${formatCurrency(taxaMotoboyValue, 2)}`, imgWidth - margin, cursorY, { align: 'right' });
        cursorY += lineHeight;
      }

      // TOTAL em caixa (duas linhas grossas), pra pesar mais que o resto
      cursorY += 2;
      linha(cursorY, true);
      cursorY += 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontMain + 1);
      pdf.text('TOTAL', margin, cursorY);
      pdf.setFontSize(fontMain + 3);
      pdf.text(formatCurrency(totalFinal, 2), imgWidth - margin, cursorY, { align: 'right' });
      cursorY += 4;
      linha(cursorY, true);
      cursorY += 6;

      // 10. PAYMENT
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

      // 11. QR CODE
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
        } catch (err) {
          console.warn('[PDF] Erro ao inserir QR code:', err);
        }
      }

      // 12. FOOTER
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

      // 13. SAVE PDF
      const filename = `cupom_${orderId}_${Date.now()}.pdf`;
      pdf.save(filename);

      toast({
        title: 'PDF gerado com sucesso',
        description: `Arquivo ${filename} baixado com logo e QR code.`,
        className: 'bg-emerald-600 text-white',
      });

    } catch (error) {
      console.error('[PDF Generation Error]', error);
      toast({
        title: 'Erro ao gerar PDF',
        description: error.message || 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <>
      {/* Hidden elements for image generation */}
      {receiptUrl && (
        <div
          ref={qrContainerRef}
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            backgroundColor: '#ffffff',
            padding: '10px'
          }}
        >
          <QRCodeSVG
            value={receiptUrl}
            size={256}
            level="M"
            includeMargin={true}
          />
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-[var(--color-primary)]" />
              Imprimir Cupom
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col items-center bg-gray-50 p-4 rounded-md border border-gray-200">
            <div className="w-full flex justify-between items-center mb-4 bg-white p-2 rounded border border-gray-200 shadow-sm">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MonitorSmartphone className="w-4 h-4" />
                Largura do Papel:
              </span>
              <div className="flex gap-2">
                <Button
                  variant={paperWidth === '58mm' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPaperWidth('58mm')}
                >
                  58mm
                </Button>
                <Button
                  variant={paperWidth === '80mm' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPaperWidth('80mm')}
                >
                  80mm
                </Button>
              </div>
            </div>

            <div className="bg-white shadow-md border border-gray-200 overflow-hidden" style={{ width: paperWidth }}>
              <CupomNaoFiscal
                saleData={saleData}
                empresaNome={empresaNome}
                empresaLogo={logoUrl}
                width={paperWidth}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 sm:justify-between flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={downloadReceiptPDF}
                disabled={isDownloading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isDownloading ? (
                  <>
                    <Download className="w-4 h-4 mr-2 animate-pulse" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Baixar PDF
                  </>
                )}
              </Button>
              <Button onClick={handlePrint} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}