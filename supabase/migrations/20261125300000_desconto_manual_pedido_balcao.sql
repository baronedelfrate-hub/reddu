-- Desconto manual no Pedidos Balcão ("Ajustar valor"): valor fixo ou percentual definido pela atendente.
alter table public.pedidos_cardapio add column if not exists desconto_manual numeric not null default 0;

create or replace function public.rpc_aplicar_desconto_balcao(p_pedido_id uuid, p_valor numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ped record;
  v_valor numeric;
  v_itens numeric;
  v_venda record;
begin
  select * into v_ped from pedidos_cardapio where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not exists (select 1 from usuarios where id = auth.uid() and empresa_id = v_ped.empresa_id) then
    raise exception 'Não autorizado.';
  end if;

  if v_ped.status in ('CANCELADO', 'ENTREGUE') then
    raise exception 'Pedido % não pode receber desconto.', v_ped.status;
  end if;
  if coalesce(v_ped.desconto_manual, 0) > 0 then
    raise exception 'Esse pedido já tem um desconto manual.';
  end if;

  v_valor := round(coalesce(p_valor, 0), 2);
  if v_valor <= 0 then
    raise exception 'Informe um desconto maior que zero.';
  end if;

  -- valor dos itens depois de eventual cupom (a taxa de entrega não entra no desconto)
  v_itens := coalesce(v_ped.total, 0) - coalesce(v_ped.taxa_entrega, 0);
  if v_valor > v_itens then
    raise exception 'O desconto (%) não pode ser maior que o valor dos itens (%).', v_valor, v_itens;
  end if;

  if v_ped.venda_id is not null then
    select financeiro_baixado into v_venda from vendas where id = v_ped.venda_id;
    if found and v_venda.financeiro_baixado is true then
      raise exception 'O pagamento desse pedido já foi registrado; não dá para mudar o valor.';
    end if;
    update vendas set total_final = greatest(0, coalesce(total_final, 0) - v_valor) where id = v_ped.venda_id;
  end if;

  update pedidos_cardapio
     set desconto_manual = v_valor,
         desconto_aplicado = coalesce(desconto_aplicado, 0) + v_valor,
         total = total - v_valor,
         updated_at = now()
   where id = p_pedido_id;

  update cardapio_clientes
     set total_gasto = greatest(0, total_gasto - v_valor)
   where empresa_id = v_ped.empresa_id and telefone = v_ped.cliente_telefone;
end;
$function$;

revoke all on function public.rpc_aplicar_desconto_balcao(uuid, numeric) from public, anon;
grant execute on function public.rpc_aplicar_desconto_balcao(uuid, numeric) to authenticated;

-- Para desfazer: drop function public.rpc_aplicar_desconto_balcao(uuid, numeric); alter table public.pedidos_cardapio drop column desconto_manual;
--   (pedidos que já receberam desconto manual manteriam o total reduzido).
