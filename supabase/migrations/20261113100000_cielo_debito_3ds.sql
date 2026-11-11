-- Fase 2 do cartão no cardápio: DÉBITO (exige autenticação 3DS) e 3DS opcional no crédito, pela API E-commerce da Cielo.
-- O 3DS roda no navegador do cliente (script da Cielo) e devolve o resultado da autenticação (ECI, CAVV...), que o servidor
-- repassa na autorização. Só ACRESCENTA colunas; as credenciais ficam na mesma tabela da Merchant Key (mesma proteção).

alter table public.cardapio_pagamento_config
  add column if not exists cielo_debito_ativo boolean not null default false,
  add column if not exists cielo_3ds_credito boolean not null default false,
  add column if not exists cielo_3ds_client_id text,
  add column if not exists cielo_3ds_client_secret text,
  add column if not exists cielo_ec_codigo text,   -- número do estabelecimento (EC) na Cielo, 10 dígitos
  add column if not exists cielo_mcc text;         -- categoria do estabelecimento (MCC), 4 dígitos

-- Config pública: só booleanos (nenhuma credencial).
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
    'cielo_link_cartao', COALESCE(cielo_link_cartao, true),
    'cielo_cartao_ativo', (provider = 'cielo' AND COALESCE(cielo_cartao_ativo, false)
                          AND COALESCE(merchant_id, '') <> '' AND COALESCE(merchant_key, '') <> ''
                          AND COALESCE(cielo_sop_client_id, '') <> '' AND COALESCE(cielo_sop_client_secret, '') <> ''),
    -- 3DS pronto = credenciais + EC + MCC preenchidos (ele só é usado se débito ou "3DS no crédito" estiverem ligados)
    'cielo_3ds_pronto', (provider = 'cielo' AND COALESCE(cielo_3ds_client_id, '') <> '' AND COALESCE(cielo_3ds_client_secret, '') <> ''
                          AND COALESCE(cielo_ec_codigo, '') <> '' AND COALESCE(cielo_mcc, '') <> ''),
    'cielo_debito_ativo', (provider = 'cielo' AND COALESCE(cielo_cartao_ativo, false) AND COALESCE(cielo_debito_ativo, false)
                          AND COALESCE(merchant_id, '') <> '' AND COALESCE(merchant_key, '') <> ''
                          AND COALESCE(cielo_sop_client_id, '') <> '' AND COALESCE(cielo_sop_client_secret, '') <> ''
                          AND COALESCE(cielo_3ds_client_id, '') <> '' AND COALESCE(cielo_3ds_client_secret, '') <> ''
                          AND COALESCE(cielo_ec_codigo, '') <> '' AND COALESCE(cielo_mcc, '') <> ''),
    'cielo_3ds_credito', (provider = 'cielo' AND COALESCE(cielo_cartao_ativo, false) AND COALESCE(cielo_3ds_credito, false)
                          AND COALESCE(cielo_3ds_client_id, '') <> '' AND COALESCE(cielo_3ds_client_secret, '') <> ''
                          AND COALESCE(cielo_ec_codigo, '') <> '' AND COALESCE(cielo_mcc, '') <> '')
  )
  FROM cardapio_pagamento_config
  WHERE empresa_id = p_empresa_id;
$function$;
