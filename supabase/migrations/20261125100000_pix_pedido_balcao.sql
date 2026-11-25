-- Pix como forma de pagamento na entrega/retirada (Pedidos Balcão): cliente paga por Pix ao receber.
alter table public.pedidos_cardapio drop constraint if exists pedidos_cardapio_pagamento_entrega_tipo_check;
alter table public.pedidos_cardapio add constraint pedidos_cardapio_pagamento_entrega_tipo_check
  check (pagamento_entrega_tipo is null or pagamento_entrega_tipo = any (array['dinheiro'::text, 'cartao'::text, 'pix'::text]));

create or replace function public.rpc_definir_pagamento_entrega(p_pedido_id uuid, p_tipo text, p_troco_para numeric default null::numeric, p_taxa_retorno_aplicada boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_tipo is null or p_tipo not in ('dinheiro', 'cartao', 'pix') then
    raise exception 'Forma de pagamento na entrega inválida.';
  end if;

  update pedidos_cardapio
     set pagamento_entrega_tipo = p_tipo,
         troco_para = case when p_tipo = 'dinheiro' and p_troco_para is not null and p_troco_para > 0 then p_troco_para else null end,
         taxa_retorno_aplicada = coalesce(p_taxa_retorno_aplicada, false) and p_tipo = 'cartao'
   where id = p_pedido_id
     and pagamento_entrega_tipo is null
     and forma_pagamento_online is null
     and status = 'PENDENTE'
     and created_at > now() - interval '15 minutes';
end;
$function$;

-- Para desfazer: recriar a constraint e a função só com 'dinheiro' e 'cartao' (pedidos com 'pix' precisariam ser ajustados antes).
