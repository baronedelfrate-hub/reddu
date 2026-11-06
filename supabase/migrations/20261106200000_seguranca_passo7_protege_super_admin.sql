-- Segurança, passo 7 (parte 1): ninguém vira super admin pela API pública.
--
-- Problema: a regra de inserção em `usuarios` só exige "estar logado". Um
-- cadastro recém-feito conseguia inserir a própria linha com
-- is_super_admin = true (e empresa_id de qualquer empresa), ganhando acesso
-- total. A regra de alteração também não restringe colunas.
--
-- Correção: gatilho que só deixa is_super_admin passar a TRUE quando quem faz
-- a operação é um super admin de verdade, o servidor (service_role, usado
-- pelas Edge Functions) ou o acesso direto ao banco (migrations).
-- O cadastro normal (perfil 'admin', sem is_super_admin) continua igual.

create or replace function public.trg_usuarios_protege_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_uid uuid := auth.uid();
  v_quer_virar boolean;
  v_chamador_super boolean := false;
begin
  -- só interessa quando o resultado seria super admin e antes não era
  v_quer_virar := coalesce(NEW.is_super_admin, false)
                  and (TG_OP = 'INSERT' or not coalesce(OLD.is_super_admin, false));
  if not v_quer_virar then
    return NEW;
  end if;

  -- servidor (Edge Functions com chave de serviço), migrations e acesso direto ao banco
  if v_papel = 'service_role' or v_papel = '' then
    return NEW;
  end if;

  if v_uid is not null then
    select coalesce(is_super_admin, false) into v_chamador_super from public.usuarios where id = v_uid;
  end if;

  if not coalesce(v_chamador_super, false) then
    raise exception 'Somente um super admin pode definir outro usuário como super admin.' using errcode = '42501';
  end if;

  return NEW;
end;
$$;

revoke all on function public.trg_usuarios_protege_super_admin() from public, anon, authenticated;

drop trigger if exists usuarios_protege_super_admin on public.usuarios;
create trigger usuarios_protege_super_admin
  before insert or update on public.usuarios
  for each row execute function public.trg_usuarios_protege_super_admin();
