-- Estoque do Cardápio: registro de vendas barradas por falta de estoque, painel do gestor,
-- aviso "últimas unidades" no cardápio público e base para o alerta de estoque baixo.
--
-- Regra de estoque: a MESMA usada na conferência e na criação do pedido (lotes ativos e não
-- devolvidos com saldo no local do item; soma lotes.quantidade). O cliente nunca vê números:
-- só "últimas unidades" (estoque entre 1 e o limite mínimo configurado). O gestor vê as
-- quantidades reais, só na área logada.
--
-- Limite mínimo: empresas.cardapio_config.estoque_limite_minimo (padrão 5).

-- 1) Vendas barradas por falta de estoque, agrupadas por hora (limita o crescimento da tabela
--    mesmo que um visitante fique repetindo a conferência).
create table if not exists public.cardapio_estoque_bloqueios (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cardapio_item_id uuid not null references public.cardapio_itens(id) on delete cascade,
  hora timestamptz not null,
  tentativas integer not null default 0,
  qtd_max_pedida numeric not null default 0,
  primary key (empresa_id, cardapio_item_id, hora)
);

alter table public.cardapio_estoque_bloqueios enable row level security;

drop policy if exists cardapio_estoque_bloqueios_select on public.cardapio_estoque_bloqueios;
create policy cardapio_estoque_bloqueios_select on public.cardapio_estoque_bloqueios
  for select using (empresa_id = get_user_empresa_id());

-- 2) Estado dos alertas de estoque já enviados (evita repetir a cada 15 min). Só o servidor usa.
create table if not exists public.cardapio_estoque_alertas (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cardapio_item_id uuid not null references public.cardapio_itens(id) on delete cascade,
  nivel text not null check (nivel in ('baixo', 'zerado')),
  alertado_em timestamptz not null default now(),
  primary key (empresa_id, cardapio_item_id)
);

alter table public.cardapio_estoque_alertas enable row level security;

-- 3) Estoque disponível de um produto num local (mesma regra do pedido).
create or replace function public.cardapio_estoque_produto_local(p_empresa_id uuid, p_produto_id uuid, p_local_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.quantidade), 0)
  from public.lotes l
  join public.estoque_por_local epl on epl.lote_id = l.id and epl.local_id = p_local_id
  where l.produto_id = p_produto_id and l.empresa_id = p_empresa_id
    and l.ativo and not l.lote_devolvido and epl.quantidade_atual > 0;
$$;

revoke all on function public.cardapio_estoque_produto_local(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cardapio_estoque_produto_local(uuid, uuid, uuid) to service_role;

create or replace function public.cardapio_estoque_limite(p_empresa_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(cardapio_config->>'estoque_limite_minimo', '')::numeric from public.empresas where id = p_empresa_id),
    5
  );
$$;

revoke all on function public.cardapio_estoque_limite(uuid) from public, anon, authenticated;
grant execute on function public.cardapio_estoque_limite(uuid) to service_role;

-- 4) Núcleo do painel (por empresa). Só o servidor chama; o painel usa o wrapper abaixo.
create or replace function public.cardapio_estoque_itens(p_empresa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite numeric := public.cardapio_estoque_limite(p_empresa_id);
  v_itens jsonb;
begin
  with itens as (
    select ci.id, ci.nome, ci.ativo, ci.produto_id, ci.local_id, ci.combo_quantidade_total,
           coalesce(cat.nome, 'Outros') as categoria, ci.ordem
    from public.cardapio_itens ci
    left join public.cardapio_categorias cat on cat.id = ci.categoria_id
    where ci.empresa_id = p_empresa_id
  ),
  simples as (
    select i.id, i.nome, i.ativo, i.categoria, i.ordem, 'simples'::text as tipo,
           case when i.produto_id is null or i.local_id is null then null
                else public.cardapio_estoque_produto_local(p_empresa_id, i.produto_id, i.local_id) end as estoque,
           '[]'::jsonb as opcoes
    from itens i
    where i.combo_quantidade_total is null
  ),
  combos as (
    select i.id, i.nome, i.ativo, i.categoria, i.ordem, 'combo'::text as tipo,
           null::numeric as estoque,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', co.id, 'nome', co.nome,
               'estoque', public.cardapio_estoque_produto_local(p_empresa_id, co.produto_id, co.local_id),
               'status', case
                 when public.cardapio_estoque_produto_local(p_empresa_id, co.produto_id, co.local_id) <= 0 then 'zerado'
                 when public.cardapio_estoque_produto_local(p_empresa_id, co.produto_id, co.local_id) <= v_limite then 'baixo'
                 else 'ok' end
             ) order by co.ordem)
             from public.cardapio_combo_opcoes co
             where co.cardapio_item_id = i.id and co.ativo and co.produto_id is not null and co.local_id is not null
           ), '[]'::jsonb) as opcoes
    from itens i
    where i.combo_quantidade_total is not null
  ),
  todos as (select * from simples union all select * from combos),
  bloq as (
    select cardapio_item_id, sum(tentativas) as tentativas, max(qtd_max_pedida) as qtd_max, max(hora) as ultimo
    from public.cardapio_estoque_bloqueios
    where empresa_id = p_empresa_id and hora >= now() - interval '7 days'
    group by cardapio_item_id
  ),
  final as (
    select t.id, t.nome, t.ativo, t.categoria, t.ordem, t.tipo, t.estoque, t.opcoes,
           case
             when t.tipo = 'simples' then
               case when t.estoque is null then 'sem_vinculo'
                    when t.estoque <= 0 then 'zerado'
                    when t.estoque <= v_limite then 'baixo'
                    else 'ok' end
             else
               case when jsonb_array_length(t.opcoes) = 0 then 'sem_vinculo'
                    when not exists (select 1 from jsonb_array_elements(t.opcoes) o where o->>'status' <> 'zerado') then 'zerado'
                    when exists (select 1 from jsonb_array_elements(t.opcoes) o where o->>'status' <> 'ok') then 'baixo'
                    else 'ok' end
           end as status,
           coalesce(b.tentativas, 0) as bloqueios_7d,
           b.qtd_max as qtd_max_pedida,
           b.ultimo as ultimo_bloqueio_em
    from todos t left join bloq b on b.cardapio_item_id = t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'nome', f.nome, 'ativo', f.ativo, 'categoria', f.categoria, 'tipo', f.tipo,
    'estoque', f.estoque, 'opcoes', f.opcoes, 'status', f.status,
    'bloqueios_7d', f.bloqueios_7d, 'qtd_max_pedida', f.qtd_max_pedida, 'ultimo_bloqueio_em', f.ultimo_bloqueio_em
  ) order by f.ordem, f.nome), '[]'::jsonb)
  into v_itens
  from final f;

  return jsonb_build_object('limite', v_limite, 'itens', v_itens);
end;
$$;

revoke all on function public.cardapio_estoque_itens(uuid) from public, anon, authenticated;
grant execute on function public.cardapio_estoque_itens(uuid) to service_role;

-- 5) Painel do gestor: só da empresa do usuário logado.
create or replace function public.rpc_estoque_cardapio_painel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid := get_user_empresa_id();
begin
  if v_empresa is null then
    raise exception 'Usuário sem empresa.';
  end if;
  return public.cardapio_estoque_itens(v_empresa);
end;
$$;

revoke all on function public.rpc_estoque_cardapio_painel() from public, anon;
grant execute on function public.rpc_estoque_cardapio_painel() to authenticated, service_role;

-- 6) "Últimas unidades" no cardápio público: só ids, nunca quantidades.
create or replace function public.rpc_cardapio_ultimas_unidades(p_empresa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite numeric;
  v_itens jsonb;
  v_opcoes jsonb;
begin
  if not exists (select 1 from public.empresas where id = p_empresa_id and cardapio_ativo = true) then
    return jsonb_build_object('itens', '[]'::jsonb, 'opcoes', '[]'::jsonb);
  end if;

  -- Loja pode desligar o aviso.
  if exists (select 1 from public.empresas where id = p_empresa_id and cardapio_config->>'estoque_aviso_ultimas_ativo' = 'false') then
    return jsonb_build_object('itens', '[]'::jsonb, 'opcoes', '[]'::jsonb);
  end if;

  v_limite := public.cardapio_estoque_limite(p_empresa_id);

  select coalesce(jsonb_agg(ci.id), '[]'::jsonb) into v_itens
  from public.cardapio_itens ci
  where ci.empresa_id = p_empresa_id and ci.ativo and ci.combo_quantidade_total is null
    and ci.produto_id is not null and ci.local_id is not null
    and public.cardapio_estoque_produto_local(p_empresa_id, ci.produto_id, ci.local_id) > 0
    and public.cardapio_estoque_produto_local(p_empresa_id, ci.produto_id, ci.local_id) <= v_limite;

  select coalesce(jsonb_agg(co.id), '[]'::jsonb) into v_opcoes
  from public.cardapio_combo_opcoes co
  join public.cardapio_itens ci on ci.id = co.cardapio_item_id and ci.empresa_id = p_empresa_id and ci.ativo
  where co.ativo and co.produto_id is not null and co.local_id is not null
    and public.cardapio_estoque_produto_local(p_empresa_id, co.produto_id, co.local_id) > 0
    and public.cardapio_estoque_produto_local(p_empresa_id, co.produto_id, co.local_id) <= v_limite;

  return jsonb_build_object('itens', v_itens, 'opcoes', v_opcoes);
end;
$$;

revoke all on function public.rpc_cardapio_ultimas_unidades(uuid) from public;
grant execute on function public.rpc_cardapio_ultimas_unidades(uuid) to anon, authenticated, service_role;

-- 7) Conferência de estoque: agora também registra a venda barrada (por item, por hora).
--    Deixa de ser "stable" porque grava. Continua sem devolver quantidades de estoque.
create or replace function public.rpc_verificar_estoque_cardapio(p_empresa_id uuid, p_itens jsonb, p_agendado boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_falhas uuid[];
  v_item uuid;
  v_qtd numeric;
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

  -- Registra a venda barrada: 1 linha por item por hora (tentativas + maior quantidade pedida).
  if coalesce(array_length(v_falhas, 1), 0) > 0 then
    foreach v_item in array v_falhas loop
      select coalesce(sum(greatest(coalesce((l->>'quantidade')::numeric, 1), 0)), 0) into v_qtd
      from jsonb_array_elements(p_itens) l
      where (l->>'cardapio_item_id')::uuid = v_item;

      insert into public.cardapio_estoque_bloqueios (empresa_id, cardapio_item_id, hora, tentativas, qtd_max_pedida)
      values (p_empresa_id, v_item, date_trunc('hour', now()), 1, v_qtd)
      on conflict (empresa_id, cardapio_item_id, hora)
      do update set tentativas = public.cardapio_estoque_bloqueios.tentativas + 1,
                    qtd_max_pedida = greatest(public.cardapio_estoque_bloqueios.qtd_max_pedida, excluded.qtd_max_pedida);
    end loop;
  end if;

  -- Nunca devolve quantidades de estoque: só se dá ou não, e quais itens do pedido têm problema.
  return jsonb_build_object('ok', coalesce(array_length(v_falhas, 1), 0) = 0, 'itens_indisponiveis', to_jsonb(v_falhas));
end;
$$;

revoke all on function public.rpc_verificar_estoque_cardapio(uuid, jsonb, boolean) from public;
grant execute on function public.rpc_verificar_estoque_cardapio(uuid, jsonb, boolean) to anon, authenticated, service_role;

-- Para desfazer:
--   drop function if exists public.rpc_cardapio_ultimas_unidades(uuid);
--   drop function if exists public.rpc_estoque_cardapio_painel();
--   drop function if exists public.cardapio_estoque_itens(uuid);
--   drop function if exists public.cardapio_estoque_limite(uuid);
--   drop function if exists public.cardapio_estoque_produto_local(uuid, uuid, uuid);
--   drop table if exists public.cardapio_estoque_alertas;
--   drop table if exists public.cardapio_estoque_bloqueios;
--   (e reaplicar a versão anterior de rpc_verificar_estoque_cardapio, em 20261107110000)
