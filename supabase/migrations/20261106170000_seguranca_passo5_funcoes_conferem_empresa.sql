-- Segurança, passo 5: funções internas não confiam mais no p_empresa_id.
--
-- Problema: rpc_producao, rpc_venda_mercado, transferir_estoque_rpc etc. são
-- SECURITY DEFINER e usavam o p_empresa_id que o chamador mandava. Qualquer
-- usuário logado (de qualquer empresa) podia produzir, vender, transferir ou
-- descartar estoque de OUTRA empresa informando o id dela.
--
-- Correção: uma função central confere se quem chama pertence à empresa
-- informada (ou é super admin, ou é o servidor / service_role / cron). Ela é
-- chamada na primeira linha de cada função. O restante do corpo das funções
-- permanece idêntico.
--
-- Fica de fora de propósito: fn_cashback_expirar, que é chamada por dentro
-- das funções públicas de cashback do cardápio (visitante sem login).

create or replace function public.exigir_empresa_do_usuario(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_super boolean;
begin
  -- Servidor (Edge Functions com chave de serviço), cron e acesso direto ao banco.
  if v_papel = 'service_role' or v_papel = '' then
    return;
  end if;

  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  select empresa_id, coalesce(is_super_admin, false)
    into v_empresa, v_super
  from public.usuarios
  where id = v_uid;

  if not found or not (v_super or v_empresa is not distinct from p_empresa_id) then
    raise exception 'Sem permissão para esta empresa.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.exigir_empresa_do_usuario(uuid) from public, anon;
grant execute on function public.exigir_empresa_do_usuario(uuid) to authenticated, service_role;

do $$
declare
  r record;
  v_def text;
  v_novo text;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'ensure_descarte_local_rpc', 'ensure_estoque_bandejas_local_rpc',
        'get_caixa_aberto', 'registrar_devolucao_rpc', 'rpc_descarte',
        'rpc_devolucao', 'rpc_producao_bandeja', 'rpc_producao',
        'rpc_transferencia_estoque', 'rpc_venda_mercado', 'transferir_estoque_rpc'
      )
  loop
    v_def := pg_get_functiondef(r.oid);

    -- já protegida (reaplicação segura)
    if v_def like '%exigir_empresa_do_usuario%' then
      continue;
    end if;

    -- insere a verificação logo depois do BEGIN do bloco principal
    v_novo := regexp_replace(
      v_def,
      '(\n\s*begin\s*\n)',
      E'\\1  perform public.exigir_empresa_do_usuario(p_empresa_id);\n',
      'i'
    );

    if v_novo = v_def then
      raise exception 'Não consegui inserir a verificação em %', r.sig;
    end if;

    execute v_novo;
  end loop;
end;
$$;
