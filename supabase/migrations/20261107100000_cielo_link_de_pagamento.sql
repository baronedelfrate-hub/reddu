-- Link de Pagamento da Cielo (Link & Checkout) como modo extra do provedor Cielo.
--
-- Só ACRESCENTA colunas e uma chave na config pública; nada que já existe muda.
-- As credenciais (Client ID / Client Secret do Link & Checkout) ficam nesta tabela,
-- protegida pela mesma regra de acesso da Merchant Key: só a equipe da própria
-- empresa lê, e o cardápio público nunca recebe isso (só um booleano).

alter table public.cardapio_pagamento_config
  add column if not exists cielo_client_id text,
  add column if not exists cielo_client_secret text,
  add column if not exists cielo_link_ativo boolean not null default false,
  add column if not exists cielo_link_pix boolean not null default true,
  add column if not exists cielo_link_cartao boolean not null default true;

alter table public.pedidos_cardapio
  add column if not exists cielo_link_id text,                 -- id do link devolvido pela Cielo
  add column if not exists cielo_link_url text,                -- shortUrl do link
  add column if not exists cielo_link_order_number text;       -- OrderNumber que enviamos (só letras e números, até 20)

create unique index if not exists pedidos_cardapio_cielo_link_order_number_key
  on public.pedidos_cardapio (cielo_link_order_number)
  where cielo_link_order_number is not null;

-- Config pública: acrescenta cielo_link_ativo (true só se o link está ligado E as credenciais existem).
do $$
declare
  v text;
  n text;
begin
  select pg_get_functiondef('public.rpc_get_pagamento_config_publico(uuid)'::regprocedure) into v;
  if v like '%cielo_link_ativo%' then
    return; -- já aplicado
  end if;
  n := replace(
    v,
    '''cartao_max_parcelas'', GREATEST(1, LEAST(12, COALESCE(cartao_max_parcelas, 1)))',
    '''cartao_max_parcelas'', GREATEST(1, LEAST(12, COALESCE(cartao_max_parcelas, 1))),
    ''cielo_link_ativo'', (provider = ''cielo'' AND COALESCE(cielo_link_ativo, false)
                          AND COALESCE(cielo_client_id, '''') <> '''' AND COALESCE(cielo_client_secret, '''') <> '''')'
  );
  if n = v then
    raise exception 'rpc_get_pagamento_config_publico: trecho não encontrado';
  end if;
  execute n;
end
$$;
