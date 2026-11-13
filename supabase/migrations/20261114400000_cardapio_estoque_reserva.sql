-- Estoque de reserva no cardápio (Fase 1).
--
-- Problema: o cardápio vendia de UM único estoque por item (ESTOQUE CLÁSSICOS, pequeno e sempre em
-- reposição). Quando ele zerava, o cliente era barrado mesmo havendo produto no ESTOQUE CENTRAL.
--
-- Agora cada item (e cada sabor de combo) pode ter um local de RESERVA:
--   - a conferência de estoque soma principal + reserva;
--   - o pedido consome primeiro o principal (mais próximo da validade primeiro) e completa com a reserva;
--     a movimentação de venda fica registrada no local de onde cada lote realmente saiu;
--   - o cardápio público passa a marcar como "Esgotado" sozinho o item que zerou nos dois estoques
--     (sem mexer no botão ativo/inativo manual) e volta ao normal quando o estoque é reposto.
-- O cliente nunca vê quantidades. Pedido agendado continua sem conferir/baixar estoque na hora.

alter table public.cardapio_itens
  add column if not exists local_reserva_id uuid references public.locais(id) on delete set null;
alter table public.cardapio_combo_opcoes
  add column if not exists local_reserva_id uuid references public.locais(id) on delete set null;

-- Estoque disponível de um produto no local principal + local de reserva (mesma regra do pedido).
create or replace function public.cardapio_estoque_disponivel(p_empresa_id uuid, p_produto_id uuid, p_local_id uuid, p_local_reserva_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.quantidade), 0)
  from public.lotes l
  join public.estoque_por_local epl on epl.lote_id = l.id
   and epl.local_id = any(array[p_local_id, p_local_reserva_id])
  where l.produto_id = p_produto_id and l.empresa_id = p_empresa_id
    and l.ativo and not l.lote_devolvido and epl.quantidade_atual > 0;
$$;

revoke all on function public.cardapio_estoque_disponivel(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cardapio_estoque_disponivel(uuid, uuid, uuid, uuid) to service_role;

-- Painel do gestor: agora com principal + reserva.
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
    select ci.id, ci.nome, ci.ativo, ci.produto_id, ci.local_id, ci.local_reserva_id, ci.combo_quantidade_total,
           coalesce(cat.nome, 'Outros') as categoria, ci.ordem
    from public.cardapio_itens ci
    left join public.cardapio_categorias cat on cat.id = ci.categoria_id
    where ci.empresa_id = p_empresa_id
  ),
  simples as (
    select i.id, i.nome, i.ativo, i.categoria, i.ordem, 'simples'::text as tipo,
           case when i.produto_id is null or i.local_id is null then null
                else public.cardapio_estoque_disponivel(p_empresa_id, i.produto_id, i.local_id, i.local_reserva_id) end as estoque,
           case when i.produto_id is null or i.local_id is null then null
                else public.cardapio_estoque_produto_local(p_empresa_id, i.produto_id, i.local_id) end as estoque_principal,
           case when i.produto_id is null or i.local_reserva_id is null then null
                else public.cardapio_estoque_produto_local(p_empresa_id, i.produto_id, i.local_reserva_id) end as estoque_reserva,
           (select nome from public.locais where id = i.local_reserva_id) as reserva_nome,
           '[]'::jsonb as opcoes
    from itens i
    where i.combo_quantidade_total is null
  ),
  combos as (
    select i.id, i.nome, i.ativo, i.categoria, i.ordem, 'combo'::text as tipo,
           null::numeric as estoque, null::numeric as estoque_principal, null::numeric as estoque_reserva,
           (select nome from public.locais where id = i.local_reserva_id) as reserva_nome,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', co.id, 'nome', co.nome,
               'estoque', public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id),
               'status', case
                 when public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) <= 0 then 'zerado'
                 when public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) <= v_limite then 'baixo'
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
    select t.id, t.nome, t.ativo, t.categoria, t.ordem, t.tipo, t.estoque, t.estoque_principal, t.estoque_reserva,
           t.reserva_nome, t.opcoes,
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
    'estoque', f.estoque, 'estoque_principal', f.estoque_principal, 'estoque_reserva', f.estoque_reserva,
    'reserva_nome', f.reserva_nome, 'opcoes', f.opcoes, 'status', f.status,
    'bloqueios_7d', f.bloqueios_7d, 'qtd_max_pedida', f.qtd_max_pedida, 'ultimo_bloqueio_em', f.ultimo_bloqueio_em
  ) order by f.ordem, f.nome), '[]'::jsonb)
  into v_itens
  from final f;

  return jsonb_build_object('limite', v_limite, 'itens', v_itens);
end;
$$;

revoke all on function public.cardapio_estoque_itens(uuid) from public, anon, authenticated;
grant execute on function public.cardapio_estoque_itens(uuid) to service_role;

-- Cardápio público: "Últimas unidades" e "Esgotado" automático. Só ids, nunca quantidades.
--   estoque_aviso_ultimas_ativo = false  -> sem aviso de últimas unidades
--   estoque_esgotado_auto_ativo = false  -> sem "Esgotado" automático
create or replace function public.rpc_cardapio_ultimas_unidades(p_empresa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite numeric;
  v_aviso boolean;
  v_auto boolean;
  v_itens jsonb := '[]'::jsonb;
  v_opcoes jsonb := '[]'::jsonb;
  v_itens_esg jsonb := '[]'::jsonb;
  v_opcoes_esg jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.empresas where id = p_empresa_id and cardapio_ativo = true) then
    return jsonb_build_object('itens', v_itens, 'opcoes', v_opcoes, 'itens_esgotados', v_itens_esg, 'opcoes_esgotadas', v_opcoes_esg);
  end if;

  select coalesce(cardapio_config->>'estoque_aviso_ultimas_ativo', 'true') <> 'false',
         coalesce(cardapio_config->>'estoque_esgotado_auto_ativo', 'true') <> 'false'
    into v_aviso, v_auto
  from public.empresas where id = p_empresa_id;

  v_limite := public.cardapio_estoque_limite(p_empresa_id);

  if v_aviso then
    select coalesce(jsonb_agg(ci.id), '[]'::jsonb) into v_itens
    from public.cardapio_itens ci
    where ci.empresa_id = p_empresa_id and ci.ativo and ci.combo_quantidade_total is null
      and ci.produto_id is not null and ci.local_id is not null
      and public.cardapio_estoque_disponivel(p_empresa_id, ci.produto_id, ci.local_id, ci.local_reserva_id) > 0
      and public.cardapio_estoque_disponivel(p_empresa_id, ci.produto_id, ci.local_id, ci.local_reserva_id) <= v_limite;

    select coalesce(jsonb_agg(co.id), '[]'::jsonb) into v_opcoes
    from public.cardapio_combo_opcoes co
    join public.cardapio_itens ci on ci.id = co.cardapio_item_id and ci.empresa_id = p_empresa_id and ci.ativo
    where co.ativo and co.produto_id is not null and co.local_id is not null
      and public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) > 0
      and public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) <= v_limite;
  end if;

  if v_auto then
    -- item simples sem estoque nos dois locais
    select coalesce(jsonb_agg(ci.id), '[]'::jsonb) into v_itens_esg
    from public.cardapio_itens ci
    where ci.empresa_id = p_empresa_id and ci.ativo and ci.combo_quantidade_total is null
      and ci.produto_id is not null and ci.local_id is not null
      and public.cardapio_estoque_disponivel(p_empresa_id, ci.produto_id, ci.local_id, ci.local_reserva_id) <= 0;

    -- combo: esgotado quando TODOS os sabores vinculados estão sem estoque
    select v_itens_esg || coalesce(jsonb_agg(ci.id), '[]'::jsonb) into v_itens_esg
    from public.cardapio_itens ci
    where ci.empresa_id = p_empresa_id and ci.ativo and ci.combo_quantidade_total is not null
      and exists (select 1 from public.cardapio_combo_opcoes co
                  where co.cardapio_item_id = ci.id and co.ativo and co.produto_id is not null and co.local_id is not null)
      and not exists (select 1 from public.cardapio_combo_opcoes co
                      where co.cardapio_item_id = ci.id and co.ativo and co.produto_id is not null and co.local_id is not null
                        and public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) > 0);

    -- sabor sem estoque
    select coalesce(jsonb_agg(co.id), '[]'::jsonb) into v_opcoes_esg
    from public.cardapio_combo_opcoes co
    join public.cardapio_itens ci on ci.id = co.cardapio_item_id and ci.empresa_id = p_empresa_id and ci.ativo
    where co.ativo and co.produto_id is not null and co.local_id is not null
      and public.cardapio_estoque_disponivel(p_empresa_id, co.produto_id, co.local_id, co.local_reserva_id) <= 0;
  end if;

  return jsonb_build_object('itens', v_itens, 'opcoes', v_opcoes, 'itens_esgotados', v_itens_esg, 'opcoes_esgotadas', v_opcoes_esg);
end;
$$;

revoke all on function public.rpc_cardapio_ultimas_unidades(uuid) from public;
grant execute on function public.rpc_cardapio_ultimas_unidades(uuid) to anon, authenticated, service_role;

-- Conferência de estoque: soma principal + reserva.
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
    select ci.id as item_id, ci.produto_id, ci.local_id, ci.local_reserva_id, li.caixas as qtd
    from linhas li
    join public.cardapio_itens ci on ci.id = li.item_id and ci.empresa_id = p_empresa_id and ci.ativo
    where ci.combo_quantidade_total is null and ci.produto_id is not null and ci.local_id is not null
    union all
    select ci.id, co.produto_id, co.local_id, co.local_reserva_id, (s->>'quantidade')::numeric * li.caixas
    from linhas li
    join public.cardapio_itens ci on ci.id = li.item_id and ci.empresa_id = p_empresa_id and ci.ativo
      and ci.combo_quantidade_total is not null
    cross join lateral jsonb_array_elements(li.sabores) s
    join public.cardapio_combo_opcoes co on co.id = (s->>'opcao_id')::uuid and co.cardapio_item_id = ci.id and co.ativo
    where (s->>'quantidade')::numeric > 0
  ),
  total as (
    select produto_id, local_id, local_reserva_id, sum(qtd) as qtd
    from demanda group by produto_id, local_id, local_reserva_id
  ),
  falta as (
    select t.produto_id, t.local_id, t.local_reserva_id
    from total t
    where t.qtd > public.cardapio_estoque_disponivel(p_empresa_id, t.produto_id, t.local_id, t.local_reserva_id)
  )
  select coalesce(array_agg(distinct d.item_id), '{}'::uuid[]) into v_falhas
  from demanda d join falta f on f.produto_id = d.produto_id and f.local_id = d.local_id
                              and f.local_reserva_id is not distinct from d.local_reserva_id;

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

-- Criação do pedido (versão atual, com p_taxa_entrega): consome o principal primeiro e completa
-- com a reserva. A movimentação e o item do pedido registram o local de onde cada lote saiu.
do $mig$
declare
  r record;
  v text;
  n text;
begin
  for r in
    select p.oid
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'rpc_criar_pedido_cardapio'
      and pg_get_function_identity_arguments(p.oid) like '%p_taxa_entrega numeric'
  loop
    v := pg_get_functiondef(r.oid);
    if v like '%local_reserva_id%' then
      continue; -- já aplicado
    end if;
    n := v;

    n := replace(n, 'SELECT ci.id, ci.produto_id, ci.local_id, ci.nome,', 'SELECT ci.id, ci.produto_id, ci.local_id, ci.local_reserva_id, ci.nome,');
    n := replace(n, 'SELECT co.id, co.produto_id, co.local_id, co.nome,', 'SELECT co.id, co.produto_id, co.local_id, co.local_reserva_id, co.nome,');

    -- laço dos sabores de combo
    n := regexp_replace(n,
      'SELECT l\.id, l\.quantidade, l\.data_validade(\s+FROM lotes l\s+JOIN estoque_por_local epl ON epl\.lote_id = l\.id AND epl\.local_id = )v_opcao\.local_id',
      'SELECT l.id, l.quantidade, l.data_validade, l.local_id\1ANY(ARRAY[v_opcao.local_id, v_opcao.local_reserva_id])');
    -- 1ª ocorrência (sabores de combo)
    n := regexp_replace(n,
      'ORDER BY l\.data_validade ASC NULLS LAST, l\.created_at ASC',
      'ORDER BY (l.local_id = v_opcao.local_id) DESC, l.data_validade ASC NULLS LAST, l.created_at ASC');

    -- laço do item simples
    n := regexp_replace(n,
      'SELECT l\.id, l\.quantidade, l\.data_validade(\s+FROM lotes l\s+JOIN estoque_por_local epl ON epl\.lote_id = l\.id AND epl\.local_id = )v_cardapio_item\.local_id',
      'SELECT l.id, l.quantidade, l.data_validade, l.local_id\1ANY(ARRAY[v_cardapio_item.local_id, v_cardapio_item.local_reserva_id])');
    -- agora só sobrou a ocorrência original do item simples
    n := regexp_replace(n,
      'ORDER BY l\.data_validade ASC NULLS LAST, l\.created_at ASC',
      'ORDER BY (l.local_id = v_cardapio_item.local_id) DESC, l.data_validade ASC NULLS LAST, l.created_at ASC');

    -- local de onde o lote realmente saiu
    n := replace(n, '''venda'', p_empresa_id, v_opcao.produto_id, v_lote.id, v_opcao.local_id, v_qtd_consumir,',
                    '''venda'', p_empresa_id, v_opcao.produto_id, v_lote.id, v_lote.local_id, v_qtd_consumir,');
    n := replace(n, 'v_pedido_id, v_cardapio_item.id, v_combo_grupo_id, v_opcao.produto_id, v_opcao.local_id, v_lote.id,',
                    'v_pedido_id, v_cardapio_item.id, v_combo_grupo_id, v_opcao.produto_id, v_lote.local_id, v_lote.id,');
    n := replace(n, '''venda'', p_empresa_id, v_cardapio_item.produto_id, v_lote.id, v_cardapio_item.local_id, v_qtd_consumir,',
                    '''venda'', p_empresa_id, v_cardapio_item.produto_id, v_lote.id, v_lote.local_id, v_qtd_consumir,');
    n := replace(n, 'v_pedido_id, v_cardapio_item.id, v_cardapio_item.produto_id, v_cardapio_item.local_id, v_lote.id, v_cardapio_item.nome,',
                    'v_pedido_id, v_cardapio_item.id, v_cardapio_item.produto_id, v_lote.local_id, v_lote.id, v_cardapio_item.nome,');

    -- confere que todas as trocas aconteceram (senão aborta sem mexer na função)
    if (length(n) - length(replace(n, 'v_lote.local_id', ''))) / length('v_lote.local_id') <> 4
       or (length(n) - length(replace(n, 'local_reserva_id', ''))) / length('local_reserva_id') <> 4 then
      raise exception 'rpc_criar_pedido_cardapio: trocas inesperadas (v_lote.local_id=%, local_reserva_id=%)',
        (length(n) - length(replace(n, 'v_lote.local_id', ''))) / length('v_lote.local_id'),
        (length(n) - length(replace(n, 'local_reserva_id', ''))) / length('local_reserva_id');
    end if;

    execute n;
  end loop;
end
$mig$;

-- Para desfazer: reaplicar as versões anteriores de rpc_criar_pedido_cardapio (20261106180000),
-- rpc_verificar_estoque_cardapio / rpc_cardapio_ultimas_unidades / cardapio_estoque_itens (20261114300000)
-- e, se quiser, remover as colunas local_reserva_id.
