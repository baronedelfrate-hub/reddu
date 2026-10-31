-- 1. Create vendas table
CREATE TABLE IF NOT EXISTS public.vendas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id),
    canal_venda text,
    cliente_referencia text,
    data_venda timestamp with time zone NOT NULL DEFAULT now(),
    total_final numeric,
    forma_pagamento text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS policies
DROP POLICY IF EXISTS "vendas_select_policy" ON public.vendas;
CREATE POLICY "vendas_select_policy" ON public.vendas FOR SELECT USING ((empresa_id = public.get_user_empresa_id()));

DROP POLICY IF EXISTS "vendas_insert_policy" ON public.vendas;
CREATE POLICY "vendas_insert_policy" ON public.vendas FOR INSERT USING (true);

DROP POLICY IF EXISTS "vendas_update_policy" ON public.vendas;
CREATE POLICY "vendas_update_policy" ON public.vendas FOR UPDATE USING ((empresa_id = public.get_user_empresa_id()));

DROP POLICY IF EXISTS "vendas_delete_policy" ON public.vendas;
CREATE POLICY "vendas_delete_policy" ON public.vendas FOR DELETE USING ((empresa_id = public.get_user_empresa_id()));

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_id ON public.vendas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data_venda ON public.vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_canal_venda ON public.vendas(canal_venda);

-- 4. Migrate data
DO $$
DECLARE
    r RECORD;
    v_venda_id uuid;
BEGIN
    FOR r IN 
        SELECT id, empresa_id, canal_venda, cliente_referencia, data_movimentacao, total_final, forma_pagamento, venda_id 
        FROM public.movimentacoes 
        WHERE tipo IN ('venda', 'venda_mercado', 'venda_unitario')
    LOOP
        IF r.venda_id IS NOT NULL THEN
            v_venda_id := r.venda_id;
            -- Insert if not exists
            IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE id = v_venda_id) THEN
                INSERT INTO public.vendas (id, empresa_id, canal_venda, cliente_referencia, data_venda, total_final, forma_pagamento)
                VALUES (v_venda_id, r.empresa_id, r.canal_venda, COALESCE(r.cliente_referencia, 'MIGRADO'), COALESCE(r.data_movimentacao, now()), COALESCE(r.total_final, 0), COALESCE(r.forma_pagamento, 'N/A'));
            END IF;
        ELSE
            v_venda_id := gen_random_uuid();
            INSERT INTO public.vendas (id, empresa_id, canal_venda, cliente_referencia, data_venda, total_final, forma_pagamento)
            VALUES (v_venda_id, r.empresa_id, COALESCE(r.canal_venda, 'PDV'), COALESCE(r.cliente_referencia, 'MIGRADO'), COALESCE(r.data_movimentacao, now()), COALESCE(r.total_final, 0), COALESCE(r.forma_pagamento, 'N/A'));
            
            UPDATE public.movimentacoes SET venda_id = v_venda_id WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- 5. Create itens_venda view
CREATE OR REPLACE VIEW public.itens_venda AS
SELECT 
    id, 
    venda_id, 
    empresa_id, 
    produto_id, 
    lote_id, 
    quantidade, 
    total_final, 
    forma_pagamento, 
    data_movimentacao
FROM public.movimentacoes
WHERE venda_id IS NOT NULL 
  AND tipo IN ('venda', 'venda_mercado', 'venda_unitario');

-- 6. Add foreign key constraint
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS fk_movimentacoes_vendas;
ALTER TABLE public.movimentacoes 
    ADD CONSTRAINT fk_movimentacoes_vendas 
    FOREIGN KEY (venda_id) 
    REFERENCES public.vendas(id);

-- 7. Create trigger
DROP TRIGGER IF EXISTS vendas_audit_trigger ON public.vendas;
CREATE TRIGGER vendas_audit_trigger 
    AFTER INSERT OR UPDATE OR DELETE ON public.vendas 
    FOR EACH ROW EXECUTE FUNCTION public.log_generic_trigger('vendas');