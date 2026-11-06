-- SEGURANÇA, passo 4 de 4: views passam a respeitar a empresa de quem consulta.
--
-- Problema: as views rodam com a permissão do dono do banco e ignoram a segurança por
-- empresa. Hoje um usuário LOGADO de uma empresa enxerga linhas de outras empresas nelas
-- (medido: um usuário da Tô Coxinha via 5.473 itens de venda; só da empresa dele são 4.174).
--
-- Solução: security_invoker = true. A view passa a consultar com a permissão de quem pergunta,
-- então valem as regras de segurança das tabelas por trás (empresa_id = get_user_empresa_id()).
--
-- Medido antes de escrever esta migration (simulação desfeita no final, com usuários reais de
-- duas empresas): cada um continua vendo os dados da própria empresa e deixa de ver os das
-- outras. As telas já filtram por empresa_id (conferido no código), então não mudam.
-- O servidor (service_role) segue vendo tudo.
--
-- Aplicar só depois do passo 1. Risco de quebrar: baixo a médio (uma tela que dependa de ver
-- outras empresas pelas views, por exemplo um painel de super administrador, passaria a ver
-- só a própria; no código atual nenhuma faz isso).

alter view public.alertas_estoque set (security_invoker = true);
alter view public.dashboard_alertas_resumo set (security_invoker = true);
alter view public.dashboard_distribuicao_local set (security_invoker = true);
alter view public.dashboard_lotes_vencendo set (security_invoker = true);
alter view public.dashboard_producao_venda_diaria set (security_invoker = true);
alter view public.dashboard_produtos_criticos set (security_invoker = true);
alter view public.dashboard_ranking_produtos set (security_invoker = true);
alter view public.dashboard_total_itens set (security_invoker = true);
alter view public.estoque_por_local set (security_invoker = true);
alter view public.itens_venda set (security_invoker = true);
alter view public.relatorio_producao set (security_invoker = true);
alter view public.vw_auditoria_mercado_resumo set (security_invoker = true);

-- Para desfazer (por view):
--   alter view public.<nome> set (security_invoker = false);
