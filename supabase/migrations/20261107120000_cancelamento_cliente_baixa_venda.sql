-- Cancelamento feito pelo próprio cliente: a venda ligada ao pedido ficava CANCELADA mas com
-- financeiro_baixado = false, então ainda contava como "pendente" (sino de alertas / vendas pendentes).
-- O cancelamento feito pela loja (rpc_cancelar_pedido_cardapio) já dava baixa; agora os dois fazem igual.

do $$
declare
  v text;
  n text;
begin
  select pg_get_functiondef('public.rpc_cliente_cancelar_pedido(uuid,text,text)'::regprocedure) into v;
  if v like '%financeiro_baixado = true%' then
    return; -- já aplicado
  end if;
  n := replace(
    v,
    'UPDATE vendas SET status = ''CANCELADO'' WHERE id = v_pedido.venda_id;',
    'UPDATE vendas SET status = ''CANCELADO'', financeiro_baixado = true, data_baixa = COALESCE(data_baixa, now()) WHERE id = v_pedido.venda_id;'
  );
  if n = v then
    raise exception 'rpc_cliente_cancelar_pedido: trecho não encontrado';
  end if;
  execute n;
end
$$;

-- Vendas já canceladas que ficaram sem baixa
update public.vendas
   set financeiro_baixado = true, data_baixa = coalesce(data_baixa, now())
 where status = 'CANCELADO' and financeiro_baixado = false;
