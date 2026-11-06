-- Verificação de segurança do banco (somente leitura). Rode antes e depois dos passos para comparar.

-- 1) Quais funções com permissão total o visitante (anon) ainda consegue chamar
select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 2) Permissões do visitante e do usuário logado nas views (esperado após os passos: anon nada; logado só lê)
select c.relname as view,
  has_table_privilege('anon', c.oid, 'select') as anon_le,
  has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') as anon_escreve,
  has_table_privilege('authenticated', c.oid, 'select') as logado_le,
  has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') as logado_escreve,
  coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'não') as security_invoker
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' order by 1;

-- 3) Tabelas sem segurança por empresa ligada (esperado: nenhuma)
select c.relname as tabela from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity order by 1;
