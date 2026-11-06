const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { input } = await req.json();

    if (!input || String(input).trim().length < 3) {
      return new Response(
        JSON.stringify({ success: true, sugestoes: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Busca de endereço temporariamente indisponível.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', String(input));
    url.searchParams.set('key', googleApiKey);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('components', 'country:br');
    url.searchParams.set('types', 'address');

    const googleRes = await fetch(url.toString());
    const googleData = await googleRes.json();

    if (googleData.status !== 'OK' && googleData.status !== 'ZERO_RESULTS') {
      return new Response(
        JSON.stringify({ success: false, error: 'Não conseguimos buscar sugestões agora.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sugestoes = (googleData.predictions || []).map((p) => ({
      descricao: p.description,
      placeId: p.place_id,
    }));

    return new Response(
      JSON.stringify({ success: true, sugestoes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao buscar sugestões de endereço:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
