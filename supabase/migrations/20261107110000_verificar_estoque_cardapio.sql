-- Confere o estoque ANTES de o cliente chegar ao último clique do pedido.
--
-- Antes: o estoque só era conferido dentro de rpc_criar_pedido_cardapio, então o cliente montava o
-- pedido inteiro, escolhia a forma de pagamento e só ao confirmar descobria que um sabor não tinha
-- a quantidade (e a mensagem de erro citava o nome do produto).
--
-- Esta função responde só "dá ou não dá" e quais itens do pedido têm problema. Nunca devolve
-- quantidades de estoque. Usa a mesma regra de estoque do pedido (lotes ativos e não devolvidos com
-- saldo no local do item) e soma as quantidades do mesmo produto entre as linhas do carrinho.
-- Pedido agendado não baixa estoque na hora, então não conta.

create or replace function public.rpc_verificar_estoque_cardapio(p_empresa_id uuid, p_itens jsonb, p_agendado boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_falhas uuid[];
begin
  if not exists (select 1 from public.empresas where id = p_empresa_id and cardapio_ativo = true) then
    raise exception 'Cardápio indisponível no momento.';
  end if;

  -- Pedido agendado não baixa estoque na hora: nada a conferir.
  if coalesce(p_agendado, false) then
    return jsonb_build_object('ok', true, 'itens_indisponiveis', '[]'::jsonb);
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 100 then
    raise exception 'Itens inválidos.';
  end if;

  with linhas as (
    select (l->>'cardapio_item_id')::uuid as item_id,
           greatest(coalesce((l->>'quantidade')::numeric, 1), 0) as caixas,
           coalesce(l->'sabores', '[]'::jsonb) as sabores
    from jsonb_array_elements(p_itens) l
  ),
  demanda as (
    -- itens simples
    select ci.id as item_id, ci.produto_id, ci.local_id, li.caixas as qtd
    from linhas li
    join public.cardapio_itens ci on ci.id = li.item_id and ci.empresa_id = p_empresa_id and ci.ativo
    where ci.combo_quantidade_total is null and ci.produto_id is not null and ci.local_id is not null
    union all
    -- sabores de combos
    select ci.id, co.produto_id, co.local_id, (s->>'quantidade')::numeric * li.caixas
    from linhas li
    join public.cardapio_itens ci on ci.id = li.item_id and ci.empresa_id = p_empresa_id and ci.ativo
      and ci.combo_quantidade_total is not null
    cross join lateral jsonb_array_elements(li.sabores) s
    join public.cardapio_combo_opcoes co on co.id = (s->>'opcao_id')::uuid and co.cardapio_item_id = ci.id and co.ativo
    where (s->>'quantidade')::numeric > 0
  ),
  total as (
    select produto_id, local_id, sum(qtd) as qtd from demanda group by produto_id, local_id
  ),
  falta as (
    select t.produto_id, t.local_id
    from total t
    where t.qtd > coalesce((
      select sum(l.quantidade)
      from public.lotes l
      join public.estoque_por_local epl on epl.lote_id = l.id and epl.local_id = t.local_id
      where l.produto_id = t.produto_id and l.empresa_id = p_empresa_id
        and l.ativo and not l.lote_devolvido and epl.quantidade_atual > 0
    ), 0)
  )
  select coalesce(array_agg(distinct d.item_id), '{}'::uuid[]) into v_falhas
  from demanda d join falta f on f.produto_id = d.produto_id and f.local_id = d.local_id;

  -- Nunca devolve quantidades de estoque: só se dá ou não, e quais itens do pedido têm problema.
  return jsonb_build_object('ok', coalesce(array_length(v_falhas, 1), 0) = 0, 'itens_indisponiveis', to_jsonb(v_falhas));
end;
$$;

revoke all on function public.rpc_verificar_estoque_cardapio(uuid, jsonb, boolean) from public;
grant execute on function public.rpc_verificar_estoque_cardapio(uuid, jsonb, boolean) to anon, authenticated, service_role;
