-- Migration: Fix movimentacoes constraint to allow all valid types
-- 1. Drop existing constraints
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS check_tipo CASCADE;
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_check CASCADE;

-- 2. Clean up invalid data
UPDATE public.movimentacoes 
SET tipo = 'ajuste' 
WHERE tipo NOT IN (
    'entrada', 'saída', 'transferência', 'devolução', 'bandeja', 
    'producao', 'venda', 'ajuste', 'saida', 'baixa', 
    'venda_mercado', 'transferencia', 'ajuste_manual'
);

-- 3. Create new comprehensive CHECK constraint
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_tipo_check CHECK (tipo IN (
    'entrada', 'saída', 'transferência', 'devolução', 'bandeja', 
    'producao', 'venda', 'ajuste', 'saida', 'baixa', 
    'venda_mercado', 'transferencia', 'ajuste_manual'
));

-- 4. Update the log_movimentacao_trigger function to include 'bandeja'
CREATE OR REPLACE FUNCTION public.log_movimentacao_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_entidade text;
    v_acao text;
    v_empresa_id uuid;
    v_entidade_id uuid;
    v_uid uuid;
BEGIN
    v_uid := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        v_acao := 'criar';
        v_empresa_id := NEW.empresa_id;
        v_entidade_id := NEW.id;
        v_entidade := NEW.tipo;
    ELSIF TG_OP = 'UPDATE' THEN
        v_acao := 'editar';
        v_empresa_id := NEW.empresa_id;
        v_entidade_id := NEW.id;
        v_entidade := NEW.tipo;
    ELSIF TG_OP = 'DELETE' THEN
        v_acao := 'deletar';
        v_empresa_id := OLD.empresa_id;
        v_entidade_id := OLD.id;
        v_entidade := OLD.tipo;
    END IF;

    -- Safeguard to ensure validity against logs_auditoria_entidade_check constraints
    IF v_entidade IN ('producao', 'venda', 'baixa', 'transferencia', 'ajuste_manual', 'venda_mercado', 'devolucao', 'ajuste', 'saida', 'bandeja') THEN
        INSERT INTO public.logs_auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
        VALUES (
            v_empresa_id, 
            v_uid, 
            v_acao, 
            v_entidade, 
            v_entidade_id, 
            CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END, 
            CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
        );
    END IF;

    IF TG_OP = 'DELETE' THEN 
        RETURN OLD; 
    ELSE 
        RETURN NEW; 
    END IF;
END;
$function$;