import { supabase } from '@/lib/customSupabaseClient';

export async function buscarProdutoPorBarcode(searchValue, empresaId) {
  try {
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('barcode', searchValue); // Schema defines barcode, matching intention of codigo_barras
      
    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }
      
    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}