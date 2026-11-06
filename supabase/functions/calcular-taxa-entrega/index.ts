import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extrairBairro(components) {
  if (!Array.isArray(components)) return null;
  const prioridade = ['sublocality_level_1', 'sublocality', 'neighborhood'];
  for (const tipo of prioridade) {
    const achou = components.find((c) => Array.isArray(c.types) && c.types.includes(tipo));
    if (achou?.long_name) return achou.long_name;
  }
  return null;
}

// Tenta extrair o bairro olhando TODOS os resultados de uma geocodificação
// (forward ou reverse). O reverse geocode do Google costuma devolver vários
// resultados em granularidades diferentes (rua, bairro, cidade...), e às
// vezes o nível "bairro" só aparece em um resultado mais genérico, não no
// primeiro (mais específico).
function extrairBairroDeResultados(results) {
  if (!Array.isArray(results)) return null;
  for (const r of results) {
    const achado = extrairBairro(r.address_components);
    if (achado) return achado;
  }
  return null;
}

async function geocodificar(googleApiKey, address) {
  const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  geoUrl.searchParams.set('address', address);
  geoUrl.searchParams.set('key', googleApiKey);
  geoUrl.searchParams.set('region', 'br');
  geoUrl.searchParams.set('language', 'pt-BR');
  const res = await fetch(geoUrl.toString());
  return res.json();
}

async function geocodificarReverso(googleApiKey, lat, lng) {
  const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  geoUrl.searchParams.set('latlng', `${lat},${lng}`);
  geoUrl.searchParams.set('key', googleApiKey);
  geoUrl.searchParams.set('region', 'br');
  geoUrl.searchParams.set('language', 'pt-BR');
  const res = await fetch(geoUrl.toString());
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { empresa_id, endereco_destino } = await req.json();

    if (!empresa_id || !endereco_destino || !String(endereco_destino).trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Informe o endereço de entrega.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: configData, error: configError } = await supabaseClient
      .rpc('rpc_get_taxa_entrega_config', { p_empresa_id: empresa_id });

    if (configError) throw configError;

    const enderecoLoja = configData?.endereco_loja;
    const config = configData?.config || {};
    const tabela = Array.isArray(config.tabela) ? config.tabela : [];
    const distanciaMaximaKm = config.distancia_maxima_km ?? null;

    if (!enderecoLoja) {
      return new Response(
        JSON.stringify({ success: false, error: 'A loja ainda não configurou o endereço de origem. Fale com o restaurante.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tabela.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'A loja ainda não configurou a taxa de entrega. Fale com o restaurante.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cálculo de entrega temporariamente indisponível.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', enderecoLoja);
    url.searchParams.set('destinations', String(endereco_destino));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', googleApiKey);

    const googleRes = await fetch(url.toString());
    const googleData = await googleRes.json();

    if (googleData.status !== 'OK') {
      return new Response(
        JSON.stringify({ success: false, error: 'Não conseguimos calcular a distância agora. Tente novamente.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const elemento = googleData.rows?.[0]?.elements?.[0];
    if (!elemento || elemento.status !== 'OK') {
      return new Response(
        JSON.stringify({ success: false, error: 'Não encontramos esse endereço. Confira e tente de novo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const distanciaMetros = elemento.distance.value;
    const distanciaKm = Math.ceil(distanciaMetros / 1000);

    // Bairro: só pra alimentar o Relatório de Áreas de Entrega, nunca bloqueia
    // o fluxo de pedido se a geocodificação falhar por qualquer motivo.
    //
    // Estratégia em cascata, parando no primeiro que achar o bairro:
    //   1. Geocodifica o endereço exatamente como o cliente digitou.
    //   2. Se não achar, geocodifica o endereço "resolvido" pelo Distance
    //      Matrix (o Google por vezes normaliza e perde o número).
    //   3. Se ainda não achar, faz um reverse geocode pelas coordenadas da
    //      primeira geocodificação que deu certo — o reverse geocode do
    //      Google devolve vários resultados em granularidades diferentes
    //      (rua, bairro, cidade...), e o nível "bairro" costuma aparecer
    //      ali mesmo quando o forward geocode só chega até o nível de rua.
    let bairro = null;
    try {
      const enderecoOriginal = String(endereco_destino);
      const enderecoResolvido = googleData.destination_addresses?.[0] || enderecoOriginal;

      let localizacao = null;

      const geo1 = await geocodificar(googleApiKey, enderecoOriginal);
      if (geo1.status === 'OK' && geo1.results?.length) {
        bairro = extrairBairroDeResultados(geo1.results);
        localizacao = geo1.results[0]?.geometry?.location || null;
      }

      if (!bairro && enderecoResolvido !== enderecoOriginal) {
        const geo2 = await geocodificar(googleApiKey, enderecoResolvido);
        if (geo2.status === 'OK' && geo2.results?.length) {
          bairro = extrairBairroDeResultados(geo2.results);
          if (!localizacao) localizacao = geo2.results[0]?.geometry?.location || null;
        }
      }

      if (!bairro && localizacao?.lat != null && localizacao?.lng != null) {
        const geo3 = await geocodificarReverso(googleApiKey, localizacao.lat, localizacao.lng);
        if (geo3.status === 'OK' && geo3.results?.length) {
          bairro = extrairBairroDeResultados(geo3.results);
        }
      }
    } catch (geoError) {
      console.warn('Não foi possível extrair o bairro do endereço:', geoError);
    }

    if (distanciaMaximaKm != null && distanciaKm > distanciaMaximaKm) {
      return new Response(
        JSON.stringify({ success: true, dentro_da_area: false, distancia_km: distanciaKm, bairro }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tabelaOrdenada = [...tabela].sort((a, b) => a.ate_km - b.ate_km);
    const faixa = tabelaOrdenada.find((f) => distanciaKm <= f.ate_km);
    const taxa = faixa ? faixa.valor : tabelaOrdenada[tabelaOrdenada.length - 1]?.valor ?? 0;

    return new Response(
      JSON.stringify({ success: true, dentro_da_area: true, distancia_km: distanciaKm, taxa, bairro }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao calcular taxa de entrega:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
