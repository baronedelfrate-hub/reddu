import React, { useRef, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function EtiquetaPreview({ 
  lote, 
  forPrint = false, 
  labelQuantity,
  printMode = 'standard',
  labelSize = '60x40'
}) {
  const containerRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (containerRef.current && !forPrint) {
      const el = containerRef.current;
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        setIsOverflowing(true);
      } else {
        setIsOverflowing(false);
      }
    }
  }, [lote, labelSize, printMode, forPrint]);

  if (!lote) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const parts = dateString.split('T')[0].split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    } catch {
      return dateString;
    }
  };

  const strFab = formatDate(lote.data_fabricacao || lote.created_at);
  const strVal = formatDate(lote.data_validade);
  const prodName = lote.produtos?.nome || lote.produto?.nome || lote.produto || 'Produto';

  const displayQty = labelQuantity !== undefined ? labelQuantity : (lote.quantidade || 0);

  const qrUrl = `${window.location.origin}/estoque/lote/${lote.id || ''}`;
  const barcodeValue = lote.codigo_barra || lote.numero_lote;

  const isThermal = printMode === 'thermal';

  // 🔥 escala simples (sem calc)
  const scaleValue = 0.9;

  const outerContainerStyle = {
    width: '60mm',
    height: '40mm',
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    margin: (isThermal && forPrint) ? '0' : 'auto',
    backgroundColor: '#ffffff',
  };

  const innerContentStyle = {
    width: '60mm',
    height: '40mm',
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `scale(${scaleValue})`,
    transformOrigin: 'top left',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    color: '#000000',
    padding: '2mm',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {!forPrint && isThermal && isOverflowing && (
        <div style={{ color: 'red', fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>
          ⚠️ OVERFLOW DETECTADO
        </div>
      )}

      <div 
        ref={containerRef}
        style={outerContainerStyle}
        className={forPrint || isThermal ? "" : "border border-gray-400 shadow-sm"}
      >
        <div style={innerContentStyle}>
          
          {/* QR CODE — topo centralizado */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '1mm'
          }}>
            <QRCodeSVG 
              id="etiqueta-qr-code"
              value={qrUrl} 
              size={80}
              level="H"
              includeMargin={true}
            />
          </div>

          {/* TEXTO — centralizado abaixo do QR */}
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '0.5mm'
          }}>
            <div style={{ 
              fontSize: '12px', 
              fontWeight: '900',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%'
            }}>
              {prodName}
            </div>

            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
              LOTE: {lote.numero_lote}
            </div>

            <div style={{ fontSize: '9px', color: '#333' }}>
              FAB: {strFab} &nbsp; VAL: {strVal}
            </div>

            <div style={{ fontSize: '9px', color: '#666', marginTop: '0.5mm' }}>
              {barcodeValue}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}