import { supabase } from './customSupabaseClient';

export async function initializeDefaultLocais(empresaId) {
  if (!empresaId) return;

  try {
    const defaultNames = ['ESTOQUE CENTRAL', 'ESTOQUE CLÁSSICOS', 'ESTOQUE BANDEJAS'];
    
    // Check which ones already exist
    const { data: existingLocais, error: fetchError } = await supabase
      .from('locais')
      .select('nome')
      .eq('empresa_id', empresaId)
      .in('nome', defaultNames);

    if (fetchError) throw fetchError;

    const existingNames = (existingLocais || []).map(l => l.nome);
    const missingNames = defaultNames.filter(name => !existingNames.includes(name));

    // Insert missing locations
    if (missingNames.length > 0) {
      const inserts = missingNames.map(nome => ({
        empresa_id: empresaId,
        nome,
        tipo: 'armazenamento' // Default type for these locations
      }));

      const { error: insertError } = await supabase
        .from('locais')
        .insert(inserts);

      if (insertError) throw insertError;
      console.log('Default locations initialized successfully.');
    }

    // Ensure DESCARTE local is available silently
    await supabase.rpc('ensure_descarte_local_rpc', { p_empresa_id: empresaId });

  } catch (error) {
    console.error('Error initializing default locations:', error);
  }
}