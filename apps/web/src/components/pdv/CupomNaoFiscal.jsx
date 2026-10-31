import React from 'react';
import { formatCurrency } from '@/utils/currencyFormatter';
import { QRCodeSVG } from 'qrcode.react';

const fmt = (valor, casas = 2) => {
  const num = Number(valor);
  if (isNaN(num)) return casas === 3 ? '0,000' : '0,00';
  if (casas === 3) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(num);
  }
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

// Linha divisória de verdade (border), em vez de "----" digitado — fica
// consistente independente da fonte, e some sozinha em telas pequenas.
// Todo estilo aqui é inline de propósito: esse HTML é reaproveitado no
// popup de impressão via outerHTML, que não carrega o CSS do app — só
// o que está inline (ou no <style> escrito à mão em PrintReceiptDialog)
// chega lá.
const Regua = ({ grosso = false }) => (
  <div
    style={{
      borderTop: grosso ? '2px solid #000000' : '1px solid #000000',
      margin: grosso ? '10px 0' : '8px 0',
    }}
  />
);

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function CupomNaoFiscal({ saleData, empresaNome, empresaLogo, width = '80mm' }) {
  if (!saleData) return null;

  const is58 = width === '58mm';
  const baseFont = is58 ? 11 : 12.5;

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getMetodoPagamento = (metodo) => {
    const metodos = {
      dinheiro: 'Dinheiro',
      pix: 'PIX',
      cartao_debito: 'Cartão de Débito',
      cartao_credito: 'Cartão de Crédito',
    };
    return metodos[metodo] || metodo;
  };

  const receiptUrl = saleData.venda_id ? `${window.location.origin}/dashboard/pdv/venda/${saleData.venda_id}` : '';

  const linhaDupla = { display: 'flex', justifyContent: 'space-between', color: '#000000' };
  const rotulo = { color: '#000000' };
  const valorTexto = { color: '#000000', fontVariantNumeric: 'tabular-nums' };

  return (
    <div
      id="printable-receipt"
      className="bg-white mx-auto shadow-sm border border-gray-200"
      style={{
        width,
        maxWidth: '100%',
        fontFamily: FONT_STACK,
        fontSize: `${baseFont}px`,
        lineHeight: 1.45,
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: '14px 12px',
      }}
    >
      {/* Cabeçalho */}
      <div style={{ textAlign: 'center', color: '#000000' }}>
        {empresaLogo && (
          <img
            src={empresaLogo}
            alt="Logo"
            style={{
              maxHeight: is58 ? '44px' : '56px',
              margin: '0 auto 8px',
              display: 'block',
              filter: 'grayscale(100%) contrast(1.2)',
            }}
          />
        )}
        <div style={{ fontWeight: 700, fontSize: `${baseFont + 2}px`, letterSpacing: '0.2px', color: '#000000' }}>
          {empresaNome || 'Empresa'}
        </div>
        <div style={{ marginTop: '3px', fontSize: `${baseFont - 2.5}px`, letterSpacing: '0.6px', color: '#555555' }}>
          CUPOM NÃO FISCAL
        </div>
      </div>

      <Regua grosso />

      {/* Dados do pedido */}
      <div style={{ color: '#000000' }}>
        <div style={rotulo}>{formatDate(saleData.data)}</div>
        {saleData.venda_id && (
          <div style={rotulo}>Pedido {(saleData.venda_id).substring(0, 8).toUpperCase()}</div>
        )}
        {saleData.cliente_referencia && <div style={rotulo}>Cliente: {saleData.cliente_referencia}</div>}
      </div>

      <Regua grosso />

      {/* Itens — cada um em 2 linhas, sem truncar nome */}
      <div>
        {saleData.items?.map((item, idx) => {
          const valorUnitario =
            item.tipo === 'unitario'
              ? Number(item.original_preco ?? item.preco)
              : Number(item.preco);

          const itemTotal = item.subtotal !== undefined && item.subtotal !== null
            ? Number(item.subtotal)
            : item.quantidade * (item.tipo_item === 'NORMAL' ? valorUnitario : 0);
          const isNormal = item.tipo_item === 'NORMAL';
          const itemName = item.produto_nome + (isNormal ? '' : ` (${item.tipo_item})`);

          return (
            <div key={idx} style={{ marginBottom: idx === (saleData.items.length - 1) ? 0 : '7px' }}>
              <div style={{ fontWeight: 600, color: '#000000' }}>{itemName}</div>
              <div style={{ ...linhaDupla, fontSize: `${baseFont - 1}px`, color: '#444444' }}>
                <span style={{ color: '#444444' }}>
                  {item.quantidade} {isNormal ? `× ${fmt(valorUnitario, 3)}` : ''}
                </span>
                <span style={{ ...valorTexto, fontWeight: 600, color: '#000000' }}>{fmt(itemTotal)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Regua />

      {/* Subtotais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={linhaDupla}>
          <span style={rotulo}>Subtotal</span>
          <span style={valorTexto}>{fmt(saleData.subtotal)}</span>
        </div>

        {saleData.desconto_valor > 0 && (
          <div style={linhaDupla}>
            <span style={rotulo}>Desconto</span>
            <span style={valorTexto}>- {fmt(saleData.desconto_valor)}</span>
          </div>
        )}

        {saleData.taxa_motoboy > 0 && (
          <div style={linhaDupla}>
            <span style={rotulo}>Taxa de entrega</span>
            <span style={valorTexto}>+ {fmt(saleData.taxa_motoboy)}</span>
          </div>
        )}
      </div>

      {/* Total — em caixa, pra pesar mais visualmente mesmo sem cor (P&B) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          margin: '10px 0',
          padding: '8px 0',
          borderTop: '1.5px solid #000000',
          borderBottom: '1.5px solid #000000',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: `${baseFont + 1}px`, color: '#000000' }}>TOTAL</span>
        <span style={{ fontWeight: 700, fontSize: `${baseFont + 4}px`, color: '#000000', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(saleData.total_final)}
        </span>
      </div>

      {/* Pagamento */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={linhaDupla}>
          <span style={rotulo}>Forma de pagamento</span>
          <span style={valorTexto}>{getMetodoPagamento(saleData.forma_pagamento)}</span>
        </div>
        {saleData.forma_pagamento === 'dinheiro' && (
          <>
            <div style={linhaDupla}>
              <span style={rotulo}>Valor recebido</span>
              <span style={valorTexto}>{fmt(saleData.valor_recebido || 0)}</span>
            </div>
            <div style={linhaDupla}>
              <span style={rotulo}>Troco</span>
              <span style={valorTexto}>{fmt(saleData.troco || 0)}</span>
            </div>
          </>
        )}
      </div>

      <Regua grosso />

      {/* Rodapé */}
      <div style={{ textAlign: 'center', color: '#000000' }}>
        <p style={{ fontWeight: 700, margin: 0, color: '#000000' }}>Obrigado pela preferência!</p>
        <p style={{ margin: '2px 0 0', color: '#555555', fontSize: `${baseFont - 1}px` }}>Volte sempre</p>

        {receiptUrl && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '6px', border: '1px solid #dddddd', borderRadius: '6px' }}>
              <QRCodeSVG value={receiptUrl} size={is58 ? 76 : 92} level="M" includeMargin={false} />
            </div>
            <p style={{ marginTop: '5px', fontSize: '8px', color: '#888888' }}>Consulte sua venda</p>
          </div>
        )}

        <p style={{ marginTop: '10px', fontSize: '7.5px', color: '#999999' }}>Gerado por Reddu</p>
      </div>

      {/* Espaço pro corte */}
      <div style={{ height: '18px' }} />
    </div>
  );
}