import { supabase } from '@/lib/customSupabaseClient';

/**
 * Gets or creates the "Desconto" product for discount lines in movimentacoes
 * @param {string} empresaId - Company ID
 * @returns {Promise<string>} Product ID for discount product
 */
export async function getOrCreateDescontoProduct(empresaId) {
  if (!empresaId) {
    throw new Error('[getOrCreateDescontoProduct] empresaId is required');
  }

  try {
    // Check if "Desconto" product already exists
    const { data: existingProduct, error: queryError } = await supabase
      .from('produtos')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('nome', 'Desconto')
      .limit(1)
      .single();

    if (queryError && queryError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[getOrCreateDescontoProduct] Error querying produtos:', queryError);
      throw queryError;
    }

    if (existingProduct) {
      console.log('[DEBUG] Produto Desconto ID (existing):', existingProduct.id);
      return existingProduct.id;
    }

    // Create new "Desconto" product
    const { data: newProduct, error: insertError } = await supabase
      .from('produtos')
      .insert({
        empresa_id: empresaId,
        nome: 'Desconto',
        categoria: 'Desconto',
        preco_venda: 0,
        preco_unitario: 0,
        preco_bandeja: 0,
        tem_bandeja: false,
        estoque_minimo: 0,
        controla_validade: false
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[getOrCreateDescontoProduct] Error creating produto:', insertError);
      throw insertError;
    }

    console.log('[DEBUG] Produto Desconto ID (newly created):', newProduct.id);
    return newProduct.id;

  } catch (error) {
    console.error('[getOrCreateDescontoProduct] Fatal error:', error);
    throw error;
  }
}