-- Itens "só no Pedidos Balcão": a atendente enxerga e vende, mas o item não aparece no cardápio digital,
-- não é oferecido pelo robô de WhatsApp e o cliente não consegue pedir por fora do balcão.
alter table public.cardapio_itens add column if not exists somente_balcao boolean not null default false;

-- 1) Leitura pública (anon e logado sem vínculo com a empresa) deixa de enxergar esses itens e seus sabores.
--    A equipe da empresa continua lendo pela política de gestão (cardapio_itens_gestao_empresa).
drop policy if exists cardapio_itens_leitura_publica on public.cardapio_itens;
create policy cardapio_itens_leitura_publica on public.cardapio_itens
  for select to anon, authenticated
  using (ativo = true and somente_balcao = false and public.empresa_cardapio_ativa(empresa_id));

drop policy if exists cardapio_combo_opcoes_leitura_publica on public.cardapio_combo_opcoes;
create policy cardapio_combo_opcoes_leitura_publica on public.cardapio_combo_opcoes
  for select to anon, authenticated
  using (
    ativo = true
    and cardapio_item_id in (
      select ci.id from public.cardapio_itens ci
      where ci.ativo = true and ci.somente_balcao = false and public.empresa_cardapio_ativa(ci.empresa_id)
    )
  );

-- 2) Mesmo que alguém descubra o id de um item desses, o pedido é recusado se quem pede não é da equipe
--    da empresa. O gatilho vale para TODAS as versões da função de criar pedido do cardápio.
create or replace function public.bloquear_item_somente_balcao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.cardapio_item_id is not null
     and exists (select 1 from cardapio_itens ci where ci.id = new.cardapio_item_id and ci.somente_balcao) then
    if not exists (
      select 1 from usuarios u
      join cardapio_itens ci on ci.empresa_id = u.empresa_id
      where u.id = auth.uid() and ci.id = new.cardapio_item_id
    ) then
      raise exception 'Um dos itens do pedido não está mais disponível.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_bloquear_item_somente_balcao on public.pedidos_cardapio_itens;
create trigger trg_bloquear_item_somente_balcao
  before insert on public.pedidos_cardapio_itens
  for each row execute function public.bloquear_item_somente_balcao();

-- Para desfazer: drop trigger trg_bloquear_item_somente_balcao on public.pedidos_cardapio_itens;
--   drop function public.bloquear_item_somente_balcao(); recriar as duas políticas de leitura pública sem a
--   condição somente_balcao; alter table public.cardapio_itens drop column somente_balcao;
