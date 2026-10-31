-- 1. Clean up invalid movimentacoes types to allow constraint creation
-- We fall back to 'ajuste' for any invalid orphaned types to ensure constraint application succeeds.
UPDATE public.movimentacoes
SET tipo = 'ajuste'
WHERE tipo NOT IN (
    'entrada', 'saída', 'transferência', 'devolução', 'bandeja', 
    'producao', 'venda', 'ajuste', 'saida', 'baixa', 
    'venda_mercado', 'transferencia', 'ajuste_manual'
);

-- 2. Drop the existing movimentacoes_tipo_check constraint
DO $$
BEGIN
    ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_check;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 3. Add new columns to the lotes table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='tipo_lote') THEN
        ALTER TABLE public.lotes ADD COLUMN tipo_lote TEXT CHECK (tipo_lote IN ('base','bandeja')) DEFAULT 'base';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='unidades_por_bandeja') THEN
        ALTER TABLE public.lotes ADD COLUMN unidades_por_bandeja INTEGER NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='lote_origem_id') THEN
        ALTER TABLE public.lotes ADD COLUMN lote_origem_id UUID NULL REFERENCES public.lotes(id);
    END IF;
END $$;

-- 4. Update existing lotes records to set tipo_lote = 'base' where it is NULL
UPDATE public.lotes SET tipo_lote = 'base' WHERE tipo_lote IS NULL;

-- 5. Create a new movimentacoes_tipo_check constraint with all valid types
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_tipo_check CHECK (tipo IN (
    'entrada', 'saída', 'transferência', 'devolução', 'bandeja', 
    'producao', 'venda', 'ajuste', 'saida', 'baixa', 
    'venda_mercado', 'transferencia', 'ajuste_manual'
));

-- 6. Update the log_movimentacao_trigger function to include all valid types
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
    IF v_entidade IN ('entrada', 'saída', 'transferência', 'devolução', 'bandeja', 'producao', 'venda', 'ajuste', 'saida', 'baixa', 'venda_mercado', 'transferencia', 'ajuste_manual') THEN
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