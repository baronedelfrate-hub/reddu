-- Segurança, passo 7c: o cadastro público só cria uma EMPRESA NOVA.
--
-- Regra de negócio: só o admin da empresa cria novos usuários nela (tela de
-- usuários / função manage-users). Quem se cadastra sozinho não pode entrar
-- numa empresa existente.
--
-- Esta migration SÓ ACRESCENTA a função rpc_completar_cadastro(), que cria a
-- empresa e o primeiro usuário (admin) de quem acabou de se cadastrar, usando
-- os nomes guardados no próprio cadastro (user_metadata: nome, empresa_nome).
-- Funciona com e sem confirmação de e-mail: o app chama logo após o cadastro
-- (se já houver sessão) ou no primeiro login.
--
-- O fechamento das regras abertas de `empresas` e `usuarios` fica no passo
-- 7d, depois que a tela de cadastro nova estiver no ar.

create or replace function public.rpc_completar_cadastro()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_meta jsonb;
  v_email text;
  v_emp_nome text;
  v_nome text;
  v_emp uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if exists (select 1 from public.usuarios where id = v_uid) then
    return jsonb_build_object('ok', true, 'ja_cadastrado', true);
  end if;

  select email, raw_user_meta_data into v_email, v_meta from auth.users where id = v_uid;

  v_emp_nome := trim(coalesce(v_meta->>'empresa_nome', ''));
  v_nome := trim(coalesce(v_meta->>'nome', ''));

  if length(v_emp_nome) < 2 or length(v_emp_nome) > 120 then
    raise exception 'Informe o nome da empresa.';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    v_nome := split_part(coalesce(v_email, ''), '@', 1);
  end if;

  insert into public.empresas (nome) values (v_emp_nome) returning id into v_emp;

  insert into public.usuarios (id, empresa_id, nome, email, perfil)
  values (v_uid, v_emp, v_nome, v_email, 'admin');

  return jsonb_build_object('ok', true, 'empresa_id', v_emp);
end;
$$;

revoke all on function public.rpc_completar_cadastro() from public, anon;
grant execute on function public.rpc_completar_cadastro() to authenticated, service_role;
