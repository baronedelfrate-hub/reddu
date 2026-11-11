-- Config pública de pagamento: acrescenta quais meios o link da Cielo oferece (PIX e/ou cartão), pra o cardápio
-- poder mostrar "PIX direto" + "Cartão (página segura da Cielo)" quando o link está só com cartão.
-- Nada de credencial é exposto: são só dois booleanos.
create or replace function public.rpc_get_pagamento_config_publico(p_empresa_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT jsonb_build_object(
    'provider', provider,
    'pix_ativo', COALESCE(pix_ativo, false),
    'cartao_ativo', COALESCE(cartao_ativo, false),
    'pagamento_obrigatorio', COALESCE(pagamento_obrigatorio, false),
    'cartao_online', (provider = 'mercadopago' AND COALESCE(cartao_ativo, false) AND COALESCE(public_key, '') <> ''),
    'public_key', CASE WHEN provider = 'mercadopago' AND COALESCE(cartao_ativo, false) THEN public_key ELSE NULL END,
    'cartao_max_parcelas', GREATEST(1, LEAST(12, COALESCE(cartao_max_parcelas, 1))),
    'cielo_link_ativo', (provider = 'cielo' AND COALESCE(cielo_link_ativo, false)
                          AND COALESCE(cielo_client_id, '') <> '' AND COALESCE(cielo_client_secret, '') <> ''),
    'cielo_link_pix', COALESCE(cielo_link_pix, true),
    'cielo_link_cartao', COALESCE(cielo_link_cartao, true)
  )
  FROM cardapio_pagamento_config
  WHERE empresa_id = p_empresa_id;
$function$;
