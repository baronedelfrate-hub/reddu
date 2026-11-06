-- SEGURANÇA, passo 3 de 4: funções internas fechadas ao visitante (sem login).
--
-- Problema: 46 funções com permissão total podiam ser chamadas por qualquer visitante
-- (a chave pública do site), inclusive as que mexem em estoque, vendas e pedidos. Várias
-- recebem o id da empresa e não conferem quem chama.
--
-- Solução: o mesmo padrão que rpc_aceitar_pedido_cardapio já usa (aberta só para usuário
-- logado e para o servidor). Fecha-se para o visitante APENAS o que o sistema não usa sem login.
--
-- Continuam abertas ao visitante, de propósito:
--   - cardápio público e seus dados: rpc_get_cardapio_empresa, rpc_criar_pedido_cardapio (4
--     versões), rpc_validar_cupom_cardapio, rpc_get_pagamento_config_publico,
--     rpc_get_taxa_entrega_config, fn_cashback_config, rpc_cashback_consultar,
--     rpc_cashback_resgatar, rpc_buscar_pedidos_cliente, rpc_cliente_cancelar_pedido,
--     rpc_enderecos_cliente, rpc_salvar_endereco_cliente, rpc_definir_pagamento_entrega,
--     rpc_atualizar_bairro_pedido_cardapio
--   - get_user_empresa_id e is_admin (usadas pelas regras de segurança das tabelas)
--   - funções de gatilho (trigger): não são chamáveis pela API e o Postgres não confere a
--     permissão ao disparar o gatilho; ficam como estão para não arriscar
--
-- Risco de quebrar: baixo a médio. Se o cardápio público ou alguma tela passar a falhar com
-- "permission denied for function", o desfazer abaixo reabre a função apontada.

do $$
declare
  alvo text[] := array[
    'arquivar_pedidos_cardapio_antigos',
    'calcular_resumo_vendas',
    'ensure_descarte_local_rpc',
    'ensure_estoque_bandejas_local_rpc',
    'fn_cashback_expirar',
    'get_caixa_aberto',
    'registrar_devolucao_rpc',
    'rpc_arquivar_pedido_cardapio',
    'rpc_atualizar_status_pedido_cardapio',
    'rpc_cancelar_pedido_cardapio',
    'rpc_cashback_clientes',
    'rpc_confirmar_preparo_pedido_cardapio',
    'rpc_descarte',
    'rpc_devolucao',
    'rpc_producao',
    'rpc_producao_bandeja',
    'rpc_transferencia_estoque',
    'rpc_venda_mercado',
    'transferir_estoque_rpc'
  ];
  f record;
  tocadas int := 0;
  ainda_abertas int;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (alvo) and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
    tocadas := tocadas + 1;
  end loop;

  select count(*) into ainda_abertas
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = any (alvo)
    and has_function_privilege('anon', p.oid, 'execute');

  raise notice 'funções fechadas ao visitante: % (ainda abertas: %)', tocadas, ainda_abertas;
  if ainda_abertas > 0 then
    raise exception 'Alguma função continuou aberta ao visitante; migration cancelada.';
  end if;
end
$$;

-- Para desfazer UMA função (exemplo):
--   grant execute on function public.rpc_producao(uuid, uuid, uuid, text, integer, date) to anon;
-- Para desfazer todas: repetir o laço acima com "grant execute ... to anon" no lugar do revoke.
