-- SEGURANÇA, passo 2 de 4: reset operacional só para quem pode.
--
-- Problema: reset_operacional_rpc(p_empresa_id) APAGA lotes, movimentações, pedidos, caixas e
-- logs da empresa informada, rodava com permissão total, era chamável SEM LOGIN e não
-- conferia quem chamava. O id da empresa é público (o cardápio devolve), então qualquer
-- visitante poderia apagar os dados de uma empresa.
--
-- Solução, sem reescrever a lógica de apagar (ela fica idêntica, só com outro nome):
--   1. a função original vira reset_operacional_rpc_executar e fica fechada a todos;
--   2. reset_operacional_rpc passa a ser uma "porta" que confere quem chama:
--        - o servidor (service_role) passa: a função de servidor valida o usuário antes;
--        - super administrador: pode resetar qualquer empresa;
--        - administrador de empresa: só a PRÓPRIA empresa;
--        - qualquer outro, ou visitante: recusado.
--   3. visitante não consegue nem chamar a "porta".
--
-- A tela AdminResetPage continua chamando reset_operacional_rpc do mesmo jeito.
-- Risco de quebrar: baixo (só muda quem consegue executar).

alter function public.reset_operacional_rpc(uuid) rename to reset_operacional_rpc_executar;
revoke all on function public.reset_operacional_rpc_executar(uuid) from public, anon, authenticated, service_role;

create function public.reset_operacional_rpc(p_empresa_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_papel text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_uid uuid := auth.uid();
  v_perfil text;
  v_super boolean;
  v_empresa uuid;
begin
  if v_papel <> 'service_role' then
    if v_uid is null then
      raise exception 'Não autenticado.' using errcode = '42501';
    end if;

    select perfil, coalesce(is_super_admin, false), empresa_id
      into v_perfil, v_super, v_empresa
    from public.usuarios
    where id = v_uid;

    if not found or not (v_super or (v_perfil = 'admin' and v_empresa = p_empresa_id)) then
      raise exception 'Sem permissão para resetar esta empresa.' using errcode = '42501';
    end if;
  end if;

  return public.reset_operacional_rpc_executar(p_empresa_id);
end;
$fn$;

revoke all on function public.reset_operacional_rpc(uuid) from public, anon;
grant execute on function public.reset_operacional_rpc(uuid) to authenticated, service_role;

-- Para desfazer:
--   drop function public.reset_operacional_rpc(uuid);
--   alter function public.reset_operacional_rpc_executar(uuid) rename to reset_operacional_rpc;
--   grant execute on function public.reset_operacional_rpc(uuid) to anon, authenticated, service_role;  -- estado anterior (inseguro)
