-- SEGURANÇA, passo 1 de 4: views só para leitura.
--
-- Problema: as 12 views abaixo rodam com a permissão do dono do banco (ignoram a segurança
-- por empresa) e davam ao visitante (anon) e a qualquer usuário logado permissão de
-- INSERIR, ALTERAR e APAGAR. Duas são realmente graváveis:
--   - itens_venda: recorte da tabela movimentacoes (insert, update e delete)
--   - estoque_por_local: um gatilho altera lotes.quantidade
-- Ou seja, com a chave pública do site dava para mexer no estoque e nas vendas de qualquer
-- empresa. O sistema só LÊ por estas views (conferido no código), então nada muda para o uso.
--
-- Efeito: visitante sem login não acessa mais nenhuma view; usuário logado só LÊ (SELECT).
-- O servidor (service_role) continua com acesso total. Risco de quebrar: baixo.

revoke all privileges on table
  public.alertas_estoque,
  public.dashboard_alertas_resumo,
  public.dashboard_distribuicao_local,
  public.dashboard_lotes_vencendo,
  public.dashboard_producao_venda_diaria,
  public.dashboard_produtos_criticos,
  public.dashboard_ranking_produtos,
  public.dashboard_total_itens,
  public.estoque_por_local,
  public.itens_venda,
  public.relatorio_producao,
  public.vw_auditoria_mercado_resumo
from anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.alertas_estoque,
  public.dashboard_alertas_resumo,
  public.dashboard_distribuicao_local,
  public.dashboard_lotes_vencendo,
  public.dashboard_producao_venda_diaria,
  public.dashboard_produtos_criticos,
  public.dashboard_ranking_produtos,
  public.dashboard_total_itens,
  public.estoque_por_local,
  public.itens_venda,
  public.relatorio_producao,
  public.vw_auditoria_mercado_resumo
from authenticated;

-- Para desfazer (volta ao estado anterior, que é inseguro):
--   grant all privileges on table <as 12 views> to anon;
--   grant insert, update, delete, truncate, references, trigger on table <as 12 views> to authenticated;
