import { supabase } from '@/lib/customSupabaseClient';

export async function generateClientReference(canal, empresaId, localId = null) {
  try {
    if (canal === 'MERCADO' && localId) {
      const { data, error } = await supabase
        .from('locais')
        .select('nome')
        .eq('id', localId)
        .single();
      
      if (error) throw error;
      return data?.nome || 'MERCADO DESCONHECIDO';
    }

    let prefix = '';
    if (canal === 'PDV') prefix = 'PDV-';
    else if (canal === 'APP') prefix = 'APP-';
    else return 'DESCONHECIDO';

    // Get the highest existing reference for this prefix from vendas table
    const { data: vendasData, error: vendasError } = await supabase
      .from('vendas')
      .select('cliente_referencia')
      .eq('empresa_id', empresaId)
      .ilike('cliente_referencia', `${prefix}%`)
      .order('cliente_referencia', { ascending: false })
      .limit(1);

    if (vendasError) throw vendasError;

    let nextNumber = 1;
    if (vendasData && vendasData.length > 0 && vendasData[0].cliente_referencia) {
      const lastRef = vendasData[0].cliente_referencia;
      const numPart = lastRef.replace(prefix, '');
      const parsedNum = parseInt(numPart, 10);
      if (!isNaN(parsedNum)) {
        nextNumber = parsedNum + 1;
      }
    }

    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  } catch (err) {
    console.error('Error generating client reference:', err);
    // Fallback if error occurs to avoid blocking the sale
    const randomSeq = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return canal === 'PDV' ? `PDV-${randomSeq}` : (canal === 'APP' ? `APP-${randomSeq}` : 'CLIENTE');
  }
}