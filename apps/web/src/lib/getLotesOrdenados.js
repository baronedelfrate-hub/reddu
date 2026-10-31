import { filterActiveLotes, formatLoteNumber } from './lotFormatUtils';
import { getLotDisplayValue } from './lotDisplayUtils';

export function ordenarLotes(lotes, includeInactive = false) {
  if (!lotes || !Array.isArray(lotes)) return [];
  
  const filteredLotes = includeInactive ? lotes : filterActiveLotes(lotes);
  
  return [...filteredLotes].sort((a, b) => {
    // 1. lote_devolvido DESC (true first)
    if (a.lote_devolvido && !b.lote_devolvido) return -1;
    if (!a.lote_devolvido && b.lote_devolvido) return 1;

    // 2. data_validade ASC (nulls last)
    if (!a.data_validade && !b.data_validade) return 0;
    if (!a.data_validade) return 1;
    if (!b.data_validade) return -1;
    
    return new Date(a.data_validade) - new Date(b.data_validade);
  });
}

export function formatLoteDisplay(lote) {
  if (!lote) return '';
  
  // Resolve the display value (show parent lot if it's a bandeja)
  const originNumber = lote.lote_origem_numero || (lote.lote_origem && lote.lote_origem.numero_lote);
  const displayNum = getLotDisplayValue(lote.numero_lote, lote.tipo_lote, originNumber);
  
  let text = String(formatLoteNumber({ ...lote, numero_lote: displayNum }));
  
  if (lote.tipo_lote === 'bandeja' && lote.unidades_por_bandeja) {
    text += ` - ${lote.unidades_por_bandeja} un/bdj`;
  } else if (lote.tipo_lote && lote.tipo_lote !== 'base' && lote.tipo_lote !== 'bandeja') {
    text += ` - ${lote.tipo_lote.toUpperCase()}`;
  } else if (lote.tipo_lote === 'bandeja') {
    text += ` - BANDEJA`;
  }
  
  if (lote.lote_devolvido === true) {
    text += ' (DEVOLVIDO)';
  }

  if (lote.data_validade) {
    try {
      const [year, month, day] = String(lote.data_validade).split('T')[0].split('-');
      text += ` | Validade: ${day}/${month}/${year}`;
    } catch (e) {
      text += ` | Validade: ${lote.data_validade}`;
    }
  }

  if (lote.quantidade !== undefined && lote.quantidade !== null) {
    text += ` | Saldo: ${lote.quantidade}`;
  }
  
  return text;
}