-- Segurança, passo 6: ajustes nas funções públicas do cardápio.
--
-- 1) rpc_get_cardapio_empresa: a resposta pública trazia o cardapio_config
--    inteiro, incluindo alertas_gestor (e-mail e WhatsApp do gestor). Passa a
--    omitir essa chave.
-- 2) rpc_criar_pedido_cardapio (todas as versões):
--    - recusa quantidade negativa nos itens do combo (dava pra pedir +100 e
--      -90 e levar 100 unidades do estoque pelo preço de 10);
--    - limita o tamanho de nome, telefone, endereço, observação e nº de itens.
-- 3) limpar_lotes_inativos e rpc_pegar_lote_campanha eram executáveis por
--    visitante e usuário logado; só o cron / servidor precisam delas.

do $mig$
declare
  r record;
  v text;
  n text;
  guard_a text;
  guard_b text;
begin
  select pg_get_functiondef('public.rpc_get_cardapio_empresa(text)'::regprocedure) into v;
  n := replace(v, 'SELECT id, nome, logo_url, cardapio_config',
                  'SELECT id, nome, logo_url, (cardapio_config - ''alertas_gestor'') AS cardapio_config');
  if n = v and v not like '%- ''alertas_gestor''%' then
    raise exception 'rpc_get_cardapio_empresa: trecho não encontrado';
  end if;
  if n <> v then execute n; end if;

  guard_a := E'RAISE EXCEPTION ''Pedido vazio.'';\n  END IF;\n\n  IF length(p_cliente_nome) > 120 OR length(p_cliente_telefone) > 30\n     OR length(coalesce(p_endereco_entrega, '''')) > 400 OR length(coalesce(p_observacao, '''')) > 1000\n     OR jsonb_array_length(p_itens) > 100 THEN\n    RAISE EXCEPTION ''Dados do pedido grandes demais.'';\n  END IF;';
  guard_b := E'IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_item->''sabores'') s WHERE (s->>''quantidade'')::numeric < 0) THEN\n        RAISE EXCEPTION ''Quantidade inválida nos itens de "%".'', v_cardapio_item.nome;\n      END IF;\n\n      SELECT COALESCE(SUM((s->>''quantidade'')::numeric), 0) INTO v_soma_sabores';

  for r in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'rpc_criar_pedido_cardapio'
  loop
    v := pg_get_functiondef(r.oid);
    if v like '%Dados do pedido grandes demais%' then
      continue; -- já aplicado
    end if;

    n := regexp_replace(v, 'RAISE EXCEPTION ''Pedido vazio\.'';\s*END IF;', guard_a);
    n := replace(n, 'SELECT COALESCE(SUM((s->>''quantidade'')::numeric), 0) INTO v_soma_sabores', guard_b);

    if n = v then
      raise exception 'nenhuma alteração em %', r.sig;
    end if;
    execute n;
  end loop;
end
$mig$;

revoke all on function public.limpar_lotes_inativos() from public, anon, authenticated;
revoke all on function public.rpc_pegar_lote_campanha(uuid, integer) from public, anon, authenticated;
grant execute on function public.rpc_pegar_lote_campanha(uuid, integer) to service_role;
