-- Desabilita RLS temporariamente
ALTER TABLE public.logs_auditoria DISABLE ROW LEVEL SECURITY;

-- Remove políticas existentes
DROP POLICY IF EXISTS "logs_auditoria_select_policy" ON public.logs_auditoria;
DROP POLICY IF EXISTS "logs_auditoria_insert_policy" ON public.logs_auditoria;
DROP POLICY IF EXISTS "logs_auditoria_update_policy" ON public.logs_auditoria;
DROP POLICY IF EXISTS "logs_auditoria_delete_policy" ON public.logs_auditoria;

-- Reabilita RLS
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

-- Cria nova política de SELECT: Usuários só podem ver logs da sua empresa
CREATE POLICY "logs_auditoria_select_policy" 
ON public.logs_auditoria 
FOR SELECT 
USING (empresa_id = get_user_empresa_id());

-- Cria nova política de INSERT: Permite inserção por usuários autenticados
-- (Não restringe por empresa_id no INSERT para permitir que triggers funcionem,
-- mas a inserção manual já exige auth)
CREATE POLICY "logs_auditoria_insert_policy" 
ON public.logs_auditoria 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Nota: Não criamos políticas para UPDATE e DELETE. 
-- Como o RLS está habilitado, a ausência de políticas para essas operações 
-- resulta em um "Deny All" implícito, tornando os logs imutáveis.