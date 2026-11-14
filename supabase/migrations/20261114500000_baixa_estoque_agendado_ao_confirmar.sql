-- Pedidos agendados passam a baixar o estoque (escolhendo local e lote) no
-- momento em que são CONFIRMADOS (aceitos), e não só ao entrar em preparo.
-- Assim a tela e o cupom já mostram de qual local/lote o item vai sair.
-- A baixa agora também respeita a reserva (local_reserva_id): principal primeiro.

create or replace function public.cardapio_baixar_estoque_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_pedido record;
  v_pendente record;
  v_reserva uuid;
  v_restante numeric;
  v_lote record;
  v_qtd_consumir numeric;
  v_subtotal numeric;
  v_primeiro boolean;
begin
  select * into v_pedido from pedidos_cardapio where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.estoque_baixado then
    return;
  end if;

  for v_pendente in
    select * from pedidos_cardapio_itens
    where pedido_id = p_pedido_id and lote_id is null and produto_id is not null
    for update
  loop
    if v_pendente.combo_grupo_id is null then
      select ci.local_reserva_id into v_reserva from cardapio_itens ci where ci.id = v_pendente.cardapio_item_id;
    else
      select co.local_reserva_id into v_reserva
        from cardapio_combo_opcoes co
        where co.cardapio_item_id = v_pendente.cardapio_item_id and co.produto_id = v_pendente.produto_id
        order by (co.local_id = v_pendente.local_id) desc, co.ativo desc
        limit 1;
    end if;

    v_restante := v_pendente.quantidade;
    v_primeiro := true;

    for v_lote in
      select l.id, l.quantidade, l.data_validade, l.local_id
      from lotes l
      join estoque_por_local epl on epl.lote_id = l.id and epl.local_id = any(array[v_pendente.local_id, v_reserva])
      where l.produto_id = v_pendente.produto_id
        and l.empresa_id = v_pedido.empresa_id
        and l.ativo = true
        and l.lote_devolvido = false
        and epl.quantidade_atual > 0
      order by (l.local_id = v_pendente.local_id) desc, l.data_validade asc nulls last, l.created_at asc
      for update of l
    loop
      exit when v_restante <= 0;

      v_qtd_consumir := least(v_restante, v_lote.quantidade);
      if v_qtd_consumir <= 0 then
        continue;
      end if;

      update lotes set quantidade = quantidade - v_qtd_consumir
        where id = v_lote.id and quantidade >= v_qtd_consumir;
      if not found then
        raise exception 'Estoque de "%" mudou nesse instante, tente de novo.', v_pendente.nome_item;
      end if;

      v_subtotal := round(v_qtd_consumir * v_pendente.preco_unitario, 2);

      insert into movimentacoes (
        tipo, empresa_id, produto_id, lote_id, local_origem_id, quantidade,
        valor_unitario, subtotal, total_final, canal_venda, cliente_referencia,
        tipo_item, status, financeiro_baixado, forma_pagamento, venda_id, data_movimentacao
      ) values (
        'venda', v_pedido.empresa_id, v_pendente.produto_id, v_lote.id, v_lote.local_id, v_qtd_consumir,
        v_pendente.preco_unitario, v_subtotal, v_subtotal, 'CARDAPIO_DIGITAL', v_pedido.cliente_nome,
        'NORMAL', 'FINALIZADO', false, 'A combinar', v_pedido.venda_id, now()
      );

      if v_primeiro then
        update pedidos_cardapio_itens
          set lote_id = v_lote.id, local_id = v_lote.local_id, quantidade = v_qtd_consumir, subtotal = v_subtotal
          where id = v_pendente.id;
        v_primeiro := false;
      else
        insert into pedidos_cardapio_itens (
          pedido_id, cardapio_item_id, combo_grupo_id, produto_id, local_id, lote_id, nome_item, quantidade, preco_unitario, subtotal
        ) values (
          p_pedido_id, v_pendente.cardapio_item_id, v_pendente.combo_grupo_id, v_pendente.produto_id, v_lote.local_id, v_lote.id,
          v_pendente.nome_item, v_qtd_consumir, v_pendente.preco_unitario, v_subtotal
        );
      end if;

      v_restante := v_restante - v_qtd_consumir;
    end loop;

    if v_restante > 0 then
      raise exception 'Estoque insuficiente para "%" (faltam % un).', v_pendente.nome_item, v_restante;
    end if;
  end loop;

  update pedidos_cardapio set estoque_baixado = true where id = p_pedido_id;
end;
$function$;

-- Função interna: só chamada pelas RPCs abaixo (que já checam a empresa do usuário).
revoke all on function public.cardapio_baixar_estoque_pedido(uuid) from public, anon, authenticated;

create or replace function public.rpc_confirmar_preparo_pedido_cardapio(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido record;
begin
  select * into v_pedido from pedidos_cardapio where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not exists (select 1 from usuarios where id = auth.uid() and empresa_id = v_pedido.empresa_id) then
    raise exception 'Não autorizado.';
  end if;

  if v_pedido.status in ('CANCELADO', 'ENTREGUE') then
    raise exception 'Pedido % não pode ser movido.', v_pedido.status;
  end if;

  perform public.cardapio_baixar_estoque_pedido(p_pedido_id);

  update pedidos_cardapio set status = 'EM_PREPARO', updated_at = now() where id = p_pedido_id;
  insert into pedidos_cardapio_status_historico (pedido_id, status) values (p_pedido_id, 'EM_PREPARO');
end;
$function$;

create or replace function public.rpc_atualizar_status_pedido_cardapio(p_pedido_id uuid, p_novo_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido record;
begin
  if p_novo_status not in ('PENDENTE', 'CONFIRMADO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO') then
    raise exception 'Status inválido.';
  end if;

  select * into v_pedido from pedidos_cardapio where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if not exists (select 1 from usuarios where id = auth.uid() and empresa_id = v_pedido.empresa_id) then
    raise exception 'Não autorizado.';
  end if;

  -- Aceitou o pedido (agendado): baixa o estoque agora, com local e lote.
  if p_novo_status in ('CONFIRMADO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE') and not v_pedido.estoque_baixado then
    perform public.cardapio_baixar_estoque_pedido(p_pedido_id);
  end if;

  update pedidos_cardapio set status = p_novo_status, updated_at = now() where id = p_pedido_id;

  insert into pedidos_cardapio_status_historico (pedido_id, status) values (p_pedido_id, p_novo_status);
end;
$function$;

-- Para desfazer: reaplicar as versões anteriores dessas duas RPCs (baixa só em rpc_confirmar_preparo_pedido_cardapio).
