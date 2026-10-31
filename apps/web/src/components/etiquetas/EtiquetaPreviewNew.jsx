import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import BarcodeGenerator from './BarcodeGenerator';

export default function EtiquetaPreview(props) {
  const {
    productName = 'Produto Padrão',
    lotNumber = '000000',
    quantity = 0,
    manufacturingDate = '',
    expirationDate = '',
    qrCodeValue = '',
    barcodeValue = '',
    forPrint = false
  } = props;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const parts = dateString.split('T')[0].split('-');
      if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  const formattedFab = formatDate(manufacturingDate);
  const formattedVal = formatDate(expirationDate);

  return (
    <>
      <style>
        {`
        @media print {
          @page {
            size: 60mm 40mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        .etiqueta-container {
          width: 60mm;
          height: 40mm;
          overflow: hidden;
          background-color: #ffffff;
          box-sizing: border-box;
          position: relative;
        }

        .etiqueta-borda-preview {
          border: 1px solid #ccc;
        }

        /*
          CORREÇÃO: removido "transform: scale(0.7); transform-origin: top left;"
          Esse scale encolhia o conteúdo para 70% ancorado no canto superior
          esquerdo, deixando espaço vazio à direita/embaixo e dando a impressão
          de que a etiqueta saía deslocada para um dos lados na impressão física.
          Agora o conteúdo ocupa o espaço real de 60x40mm de forma simétrica,
          com os tamanhos de fonte/QR ajustados para caber sem precisar de scale.
        */
        .conteudo {
          width: 60mm;
          height: 40mm;
          padding: 2mm;
          box-sizing: border-box;

          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-family: sans-serif;
          color: #000;
        }

        .topo {
          display: flex;
          width: 100%;
          flex: 1;
          overflow: hidden;
        }

        .info {
          width: 62%;
          display: flex;
          flex-direction: column;
          gap: 0.8mm;
          overflow: hidden;
          padding-right: 1mm;
        }

        .qrcode {
          width: 38%;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .barra {
          width: 100%;
          height: 11mm;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          margin-top: 0.5mm;
        }

        .nome-produto {
          font-size: 7.5px;
          font-weight: 900;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
        }

        .texto-destaque {
          font-size: 6.5px;
          font-weight: bold;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .texto-data {
          font-size: 5.5px;
          font-weight: 600;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        `}
      </style>

      <div className={'etiqueta-container ' + (!forPrint ? 'etiqueta-borda-preview' : '')}>
        <div className="conteudo">

          <div className="topo">
            <div className="info">
              <div className="nome-produto">
                {productName}
              </div>

              <div className="texto-destaque">
                LOTE: {lotNumber}
              </div>

              <div className="texto-destaque">
                QTD: {quantity} UN
              </div>

              <div className="texto-data" style={{ marginTop: 'auto' }}>
                FAB: {formattedFab}
              </div>

              <div className="texto-data">
                VAL: {formattedVal}
              </div>
            </div>

            <div className="qrcode">
              <QRCodeSVG
                value={qrCodeValue || 'https://estoque360.com'}
                size={55}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          <div className="barra">
            <BarcodeGenerator
              codigoBarraValue={barcodeValue || lotNumber}
              loteNumber={lotNumber}
              width={1.3}
              height={22}
              displayValue={true}
            />
          </div>

        </div>
      </div>
    </>
  );
}