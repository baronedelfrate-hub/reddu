import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeGenerator({
  loteNumber,
  codigoBarraValue,
  width = 1,
  height = 25,
  displayValue = false,
  className = ''
}) {
  const barcodeRef = useRef(null);

  const valueToRender =
    codigoBarraValue ||
    (loteNumber
      ? String(loteNumber).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
      : '');

  useEffect(() => {
    if (barcodeRef.current && valueToRender) {
      try {
        JsBarcode(barcodeRef.current, valueToRender, {
          format: 'CODE128',
          width: width,       // 🔥 mais fino
          height: height,     // 🔥 menor
          displayValue: false,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000'
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [valueToRender, width, height]);

  if (!valueToRender) return null;

  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxHeight: '12mm',   // 🔥 trava altura
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }}
    >
      <svg
        ref={barcodeRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />

      {displayValue && (
        <span
          style={{
            fontSize: '7px',
            fontWeight: 'bold',
            marginTop: '1px',
            lineHeight: 1,
            textAlign: 'center'
          }}
        >
          {valueToRender}
        </span>
      )}
    </div>
  );
}