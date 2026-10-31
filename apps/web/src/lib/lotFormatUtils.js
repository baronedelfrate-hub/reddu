import { supabase } from './customSupabaseClient';

export function isManualLot(lotNumber) {
  if (!lotNumber) return false;
  return lotNumber.startsWith('BDJ-');
}

export async function generateAutomaticLot(empresaId, baseDate) {
  if (!empresaId || !baseDate) return null;
  const datePrefix = baseDate.replace(/-/g, '');
  
  const { count, error } = await supabase
    .from('lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero_lote', `${datePrefix}-%`);

  if (error) {
    console.error('Error generating automatic lot:', error);
    throw error;
  }

  const nextSequence = (count || 0) + 1;
  return `${datePrefix}-${String(nextSequence).padStart(6, '0')}`;
}

export async function validateLotDuplicate(supabaseClient, empresaId, lotNumber, tipoLote = null) {
  let query = supabaseClient
    .from('lotes')
    .select('id')
    .eq('numero_lote', lotNumber)
    .eq('empresa_id', empresaId);

  if (tipoLote) {
    query = query.eq('tipo_lote', tipoLote);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error validating lot duplicate:', error);
    return { exists: false, message: 'Erro ao validar lote' };
  }

  const exists = data && data.length > 0;
  return {
    exists,
    message: exists ? `Lote ${lotNumber} já existe. Não é possível criar lote duplicado.` : ''
  };
}

export function filterActiveLotes(lotes) {
  if (!lotes || !Array.isArray(lotes)) return [];
  return lotes.filter(l => l.ativo !== false);
}

export function formatLoteNumber(lote) {
  if (!lote || !lote.numero_lote) return '-';
  return lote.ativo === false ? `${lote.numero_lote} *` : lote.numero_lote;
}