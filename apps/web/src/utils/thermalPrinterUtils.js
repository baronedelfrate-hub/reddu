import jsPDF from 'jspdf';
import { QRCodeCanvas } from 'qrcode.react';
import React from 'react';
import { createRoot } from 'react-dom/client';

export const getThermalPageConfig = (sizeString = '60x40') => {
  try {
    const [width, height] = sizeString.split('x').map(Number);
    return { width: width || 60, height: height || 40, unit: 'mm' };
  } catch {
    return { width: 60, height: 40, unit: 'mm' };
  }
};

/**
 * Renderiza QRCodeCanvas em elemento temporário e retorna dataURL
 * Usa qrcode.react diretamente — qualidade perfeita sem conversão SVG
 */
const renderQRCodeToDataURL = (text, sizePx = 200) => {
  return new Promise((resolve) => {
    try {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;overflow:hidden;';
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(
        React.createElement(QRCodeCanvas, {
          value: text,
          size: sizePx,
          level: 'H',
          includeMargin: true,
          id: 'qr-render-temp'
        })
      );

      const tryGetCanvas = (attempts = 0) => {
        const canvas = container.querySelector('canvas');
        if (canvas && canvas.width > 0) {
          try {
            const dataURL = canvas.toDataURL('image/png');
            root.unmount();
            document.body.removeChild(container);
            resolve(dataURL);
          } catch {
            root.unmount();
            document.body.removeChild(container);
            resolve(null);
          }
        } else if (attempts < 10) {
          setTimeout(() => tryGetCanvas(attempts + 1), 50);
        } else {
          root.unmount();
          document.body.removeChild(container);
          resolve(null);
        }
      };
      setTimeout(() => tryGetCanvas(), 150);
    } catch {
      resolve(null);
    }
  });
};

/**
 * Geração de PDF térmico 60x40mm para Elgin L42DT
 * QR Code gerado via QRCodeCanvas (sem conversão SVG — qualidade máxima)
 *
 * AJUSTE DE CENTRALIZAÇÃO:
 * O conteúdo é centralizado matematicamente nas coordenadas do PDF (W/2),
 * mas a impressora física pode ter um pequeno desvio mecânico/de alimentação
 * do papel, fazendo a etiqueta sair impressa um pouco para a direita.
 *
 * HORIZONTAL_OFFSET_MM compensa esse desvio deslocando TODO o conteúdo
 * (QR Code + texto) para a esquerda antes de imprimir.
 *
 * Se ainda sair desalinhado após o teste, ajuste este valor:
 *  - Saindo para a DIREITA → aumente o valor negativo (ex: -2.5, -3)
 *  - Saindo para a ESQUERDA → reduza ou deixe positivo (ex: -1, 0, +1)
 */
const HORIZONTAL_OFFSET_MM = -5; // aumentado de -2 para -5 — teste real mostrou que ainda saía para a direita

export const generateThermalPDF = async (lotes, config) => {
  const W = config.width || 60;
  const H = config.height || 40;
  const PAD = 3;

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [W, H]
    });

    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      if (i > 0) pdf.addPage([W, H]);

      const nome = (lote.produtos?.nome || lote.produto?.nome || lote.produto || 'PRODUTO').toUpperCase();
      const loteNumero  = lote.numero_lote || '';
      const quantidade  = lote.labelQuantity || lote.quantidade || 0;
      const isBandeja   = lote.tipo_lote === 'bandeja' || lote.tipo === 'bandeja';
      const origem      = lote.lote_origem_numero || lote.lote_origem_id || null;
      const codigoBarra = lote.codigo_barra || loteNumero;
      const qrUrl       = `${window.location.origin}/estoque/lote/${lote.id || ''}`;

      // Layout: QR centralizado no topo + texto embaixo
      // centerX e qrX aplicam o offset de compensação física da impressora
      const qrSize = 20;
      const centerX = (W / 2) + HORIZONTAL_OFFSET_MM;
      const qrX = centerX - (qrSize / 2);
      const qrY = PAD;

      const qrDataURL = await renderQRCodeToDataURL(qrUrl, 256);
      if (qrDataURL) {
        pdf.addImage(qrDataURL, 'PNG', qrX, qrY, qrSize, qrSize);
      }

      let y = qrY + qrSize + 2;

      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(nome.length > 22 ? nome.substring(0, 22) + '...' : nome, centerX, y, { align: 'center' });
      y += 3.5;

      pdf.setFontSize(7);
      pdf.text(`LOTE: ${loteNumero}`, centerX, y, { align: 'center' });
      y += 3;

      if (isBandeja && origem) {
        pdf.text(`ORIG: ${origem}`, centerX, y, { align: 'center' });
        y += 3;
      }

      pdf.text(`QTD: ${quantidade} UN`, centerX, y, { align: 'center' });
      y += 3;

      pdf.setFont('Helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text(`FAB: ${formatDate(lote.data_fabricacao)}  VAL: ${formatDate(lote.data_validade)}`, centerX, y, { align: 'center' });
    }

    const pdfBase64 = pdf.output('datauristring');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      const blob = pdf.output('blob');
      window.open(URL.createObjectURL(blob));
      return true;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Etiqueta ${W}x${H}mm</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #f5f5f5; display: flex; flex-direction: column; align-items: center; padding: 20px; gap: 10px; font-family: Arial, sans-serif; }
            h2 { font-size: 14px; color: #333; margin-bottom: 10px; }
            iframe { border: 1px solid #ccc; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
            .instructions { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 16px; max-width: 500px; font-size: 12px; color: #856404; }
            .instructions strong { display: block; margin-bottom: 6px; font-size: 13px; }
            .instructions ol { padding-left: 16px; line-height: 1.8; }
            .btn-print { background: #0d6efd; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 8px; }
            .btn-print:hover { background: #0b5ed7; }
            @media print {
              body { background: white; padding: 0; }
              .instructions, .btn-print, h2 { display: none !important; }
              iframe { border: none; box-shadow: none; }
              @page { size: ${W}mm ${H}mm; margin: 0; }
            }
          </style>
        </head>
        <body>
          <h2>Etiqueta ${W}×${H}mm — Elgin L42DT</h2>
          <div class="instructions">
            <strong>⚙️ Configure antes de imprimir:</strong>
            <ol>
              <li>Clique em <b>Imprimir Etiqueta</b></li>
              <li>Selecione <b>Elgin L42DT</b></li>
              <li>Tamanho do papel: <b>${W}×${H}mm</b></li>
              <li>Margens: <b>Nenhuma</b></li>
              <li>Escala: <b>100%</b></li>
            </ol>
          </div>
          <iframe src="${pdfBase64}" width="${W * 4}px" height="${H * 4}px"></iframe>
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
        </body>
      </html>
    `);
    printWindow.document.close();
    return true;

  } catch (err) {
    console.error('Erro ao gerar PDF térmico:', err);
    return false;
  }
};

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const [y, m, d] = dateString.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateString; }
}