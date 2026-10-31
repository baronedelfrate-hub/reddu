import React from 'react';
import { montarLinhasTabelaNutricional, formatNumeroBR } from '@/utils/nutritionalTable';

/**
 * Tabela de Informação Nutricional no formato vertical padrão ANVISA
 * (RDC 429/2020 / IN 75/2020).
 *
 * `compact` reduz fontes/paddings para caber em etiquetas menores.
 */
export default function TabelaNutricionalPreview({ produto, compact = false }) {
  if (!produto) return null;

  const linhas = montarLinhasTabelaNutricional(produto);
  const porcaoValor = formatNumeroBR(produto.porcao_valor, 0);
  const porcaoUnidade = produto.porcao_unidade || 'g';
  const medidaCaseira = produto.medida_caseira || '';
  const porcoesPorEmbalagem = produto.porcoes_por_embalagem
    ? formatNumeroBR(produto.porcoes_por_embalagem, 0)
    : null;

  const fontTitulo = compact ? '9px' : '12px';
  const fontTexto = compact ? '6.5px' : '9px';
  const fontLinha = compact ? '6px' : '8.5px';
  const pad = compact ? '1mm' : '2mm';

  return (
    <div
      style={{
        border: '1.5px solid #000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000',
        width: '100%',
        boxSizing: 'border-box',
        padding: pad,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: fontTitulo, fontWeight: 900, borderBottom: '6px solid #000', paddingBottom: '1mm', marginBottom: '1mm' }}>
        INFORMAÇÃO NUTRICIONAL
      </div>

      <div style={{ fontSize: fontTexto, lineHeight: 1.3, marginBottom: '1mm' }}>
        {porcoesPorEmbalagem && (
          <div>Porções por embalagem: {porcoesPorEmbalagem}</div>
        )}
        <div>
          Porção: {porcaoValor}{porcaoUnidade}
          {medidaCaseira ? ` (${medidaCaseira})` : ''}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', display: 'flex', fontSize: fontLinha, fontWeight: 700, padding: '0.6mm 0' }}>
        <div style={{ flex: 1 }}>Quantidade por porção</div>
        <div style={{ width: compact ? '10mm' : '14mm', textAlign: 'right' }}>%VD*</div>
      </div>

      {linhas.map((linha) => (
        <div
          key={linha.key}
          style={{
            display: 'flex',
            fontSize: fontLinha,
            lineHeight: 1.35,
            borderBottom: '0.5px solid #ccc',
            padding: '0.4mm 0',
          }}
        >
          <div style={{ flex: 1 }}>
            {linha.label} {linha.valorFormatado}{linha.unidade}
          </div>
          <div style={{ width: compact ? '10mm' : '14mm', textAlign: 'right', fontWeight: 700 }}>
            {linha.percentualVD !== null ? `${linha.percentualVD}%` : '**'}
          </div>
        </div>
      ))}

      <div style={{ fontSize: compact ? '5px' : '6.5px', marginTop: '1mm', lineHeight: 1.25 }}>
        *Percentual de valores diários fornecidos pela porção. **VD não estabelecido.
      </div>

      {(produto.alergenicos_contem || produto.alergenicos_pode_conter) && (
        <div style={{ fontSize: compact ? '5.5px' : '7.5px', marginTop: '1.5mm', paddingTop: '1mm', borderTop: '0.5px solid #000', lineHeight: 1.3 }}>
          {produto.alergenicos_contem && (
            <div><strong>ALÉRGICOS: CONTÉM</strong> {produto.alergenicos_contem.toUpperCase()}.</div>
          )}
          {produto.alergenicos_pode_conter && (
            <div><strong>PODE CONTER</strong> {produto.alergenicos_pode_conter.toUpperCase()}.</div>
          )}
        </div>
      )}
    </div>
  );
}