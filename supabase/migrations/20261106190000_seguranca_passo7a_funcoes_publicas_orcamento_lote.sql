-- Segurança, passo 7a: funções mínimas para as duas telas públicas que hoje
-- dependem de regras de leitura/escrita abertas ao visitante.
--
--  * /orcamento/:token  -> rpc_get_orcamento_publico + rpc_aprovar_orcamento_publico
--  * /estoque/lote/:id  -> rpc_get_lote_publico
--
-- Esta migration SÓ ACRESCENTA funções (não altera nem remove nada). As regras
-- abertas (eventos_public_approve, eventos_public_token, lotes_public_read_by_id,
-- produtos_public_read, locais_public_read) só são removidas no passo 7b,
-- depois que as telas passarem a usar estas funções.

create or replace function public.rpc_get_orcamento_publico(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e record;
  v_cpf text;
  v_logo text;
begin
  select * into e from public.eventos where token_aprovacao = p_token;
  if not found then
    return null;
  end if;

  select logo_url into v_logo from public.empresas where id = e.empresa_id;

  -- CPF só aparece mascarado (a tela mostra "CPF: ***.***.789-01" depois da aprovação)
  v_cpf := case
    when e.aprovado_cpf is null or length(e.aprovado_cpf) <> 11 then null
    else '***.***.' || substr(e.aprovado_cpf, 7, 3) || '-' || substr(e.aprovado_cpf, 10, 2)
  end;

  return jsonb_build_object(
    'evento',
      (to_jsonb(e) - 'aprovado_ip' - 'aprovado_user_agent' - 'aprovado_email' - 'token_aprovacao' - 'empresa_id' - 'aprovado_cpf')
      || jsonb_build_object('aprovado_cpf', v_cpf),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'categoria', i.categoria, 'descricao', i.descricao,
               'quantidade', i.quantidade, 'preco_por_cento', i.preco_por_cento, 'subtotal', i.subtotal) order by i.created_at)
      from public.evento_itens i where i.evento_id = e.id), '[]'::jsonb),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'descricao', s.descricao, 'valor', s.valor) order by s.created_at)
      from public.evento_servicos s where s.evento_id = e.id), '[]'::jsonb),
    'logo_url', v_logo
  );
end;
$$;

create or replace function public.rpc_aprovar_orcamento_publico(
  p_token uuid, p_nome text, p_cpf text, p_email text, p_ip text default null, p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_nome text := trim(coalesce(p_nome, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_ua text;
  v_em timestamptz;
begin
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'Nome inválido.';
  end if;
  if length(v_cpf) <> 11 then
    raise exception 'CPF inválido.';
  end if;
  if length(v_email) > 200 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail inválido.';
  end if;

  -- IP e navegador: preferimos o que o servidor enxerga; o que a tela mandou é só reserva.
  v_ip := left(trim(split_part(coalesce(v_headers->>'x-forwarded-for', p_ip, 'desconhecido'), ',', 1)), 64);
  v_ua := left(coalesce(v_headers->>'user-agent', p_user_agent, ''), 500);

  update public.eventos
     set status = 'confirmado',
         aprovado_em = now(),
         aprovado_ip = v_ip,
         aprovado_nome = v_nome,
         aprovado_cpf = v_cpf,
         aprovado_email = v_email,
         aprovado_user_agent = v_ua
   where token_aprovacao = p_token
     and aprovado_em is null
     and status is distinct from 'cancelado'
  returning aprovado_em into v_em;

  if v_em is null then
    raise exception 'Este orçamento não pode ser aprovado (já aprovado, cancelado ou inexistente).';
  end if;

  return jsonb_build_object('aprovado_em', v_em);
end;
$$;

create or replace function public.rpc_get_lote_publico(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id, 'produto_id', l.produto_id, 'numero_lote', l.numero_lote, 'data_validade', l.data_validade,
    'quantidade', l.quantidade, 'local_id', l.local_id, 'tipo_lote', l.tipo_lote,
    'unidades_por_bandeja', l.unidades_por_bandeja, 'lote_devolvido', l.lote_devolvido, 'ativo', l.ativo,
    'created_at', l.created_at,
    'produto_nome', (select p.nome from public.produtos p where p.id = l.produto_id),
    'local_nome', (select lo.nome from public.locais lo where lo.id = l.local_id)
  )
  from public.lotes l
  where l.id = p_id;
$$;

revoke all on function public.rpc_get_orcamento_publico(uuid) from public;
revoke all on function public.rpc_aprovar_orcamento_publico(uuid, text, text, text, text, text) from public;
revoke all on function public.rpc_get_lote_publico(uuid) from public;
grant execute on function public.rpc_get_orcamento_publico(uuid) to anon, authenticated, service_role;
grant execute on function public.rpc_aprovar_orcamento_publico(uuid, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rpc_get_lote_publico(uuid) to anon, authenticated, service_role;
