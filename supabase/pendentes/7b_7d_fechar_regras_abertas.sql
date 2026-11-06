-- PENDENTE (NÃO APLICADO): passos 7b + 7d da segurança — fecha as regras abertas ao visitante.
--
-- Só aplicar DEPOIS que estiverem no ar (deploy do Vercel concluído):
--   * as telas de orçamento e lote por QR usando funções (PR #9, já mergeado);
--   * o cadastro novo que só cria empresa (PR do cadastro).
-- Aplicando antes, as versões antigas dessas telas deixam de funcionar.
--
-- Já testado numa transação desfeita (visitante, cadastro novo, admin, super admin).
-- Depois de aplicar: mover este arquivo para supabase/migrations/ com um timestamp novo.

-- 0) Função auxiliar: o cardápio público precisa saber "essa empresa tem cardápio ativo?"
--    sem poder ler a tabela empresas (que passa a ser fechada ao visitante).
create or replace function public.empresa_cardapio_ativa(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.empresas where id = p_empresa_id and cardapio_ativo = true) $$;
revoke all on function public.empresa_cardapio_ativa(uuid) from public;
grant execute on function public.empresa_cardapio_ativa(uuid) to anon, authenticated, service_role;

alter policy cardapio_categorias_leitura_publica on public.cardapio_categorias
  using ((ativo = true) AND public.empresa_cardapio_ativa(empresa_id));
alter policy cardapio_itens_leitura_publica on public.cardapio_itens
  using ((ativo = true) AND public.empresa_cardapio_ativa(empresa_id));
alter policy cardapio_cupons_leitura_publica on public.cardapio_cupons
  using ((ativo = true) AND ((validade_inicio IS NULL) OR (now() >= validade_inicio)) AND ((validade_fim IS NULL) OR (now() <= validade_fim)) AND public.empresa_cardapio_ativa(empresa_id));
alter policy cardapio_grupos_adicionais_leitura_publica on public.cardapio_grupos_adicionais
  using ((ativo = true) AND public.empresa_cardapio_ativa(empresa_id));
alter policy cardapio_combo_opcoes_leitura_publica on public.cardapio_combo_opcoes
  using ((ativo = true) AND (cardapio_item_id IN (SELECT ci.id FROM public.cardapio_itens ci WHERE ci.ativo = true AND public.empresa_cardapio_ativa(ci.empresa_id))));
alter policy cardapio_grupos_adicionais_opcoes_leitura_publica on public.cardapio_grupos_adicionais_opcoes
  using ((ativo = true) AND (grupo_id IN (SELECT g.id FROM public.cardapio_grupos_adicionais g WHERE g.ativo = true AND public.empresa_cardapio_ativa(g.empresa_id))));
alter policy cardapio_itens_grupos_adicionais_leitura_publica on public.cardapio_itens_grupos_adicionais
  using (cardapio_item_id IN (SELECT ci.id FROM public.cardapio_itens ci WHERE ci.ativo = true AND public.empresa_cardapio_ativa(ci.empresa_id)));

-- 7b) regras abertas de eventos / lotes / produtos / locais
drop policy if exists eventos_public_approve on public.eventos;   -- qualquer visitante alterava qualquer evento
drop policy if exists eventos_public_token on public.eventos;     -- qualquer visitante lia todos os eventos (CPF, e-mail, IP)
drop policy if exists lotes_public_read_by_id on public.lotes;
drop policy if exists produtos_public_read on public.produtos;
drop policy if exists locais_public_read on public.locais;

-- 7d) empresas e usuarios: sem o "OR get_user_empresa_id() IS NULL" e sem inserção livre
alter policy empresas_select_policy on public.empresas using (id = get_user_empresa_id());
alter policy usuarios_select_policy on public.usuarios using ((id = auth.uid()) OR (empresa_id = get_user_empresa_id()));

drop policy if exists empresas_insert_policy on public.empresas;
create policy empresas_insert_policy on public.empresas for insert to authenticated
  with check (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_super_admin = true));

drop policy if exists usuarios_insert_policy on public.usuarios;
create policy usuarios_insert_policy on public.usuarios for insert to authenticated
  with check ((EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_super_admin = true))
              OR (public.is_admin() AND empresa_id = public.get_user_empresa_id()));
