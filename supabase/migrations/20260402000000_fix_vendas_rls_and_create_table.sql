-- 1. Drop existing vendas table and policies (if they exist)
DROP TABLE IF EXISTS public.vendas CASCADE;

-- 2. Create vendas table with correct structure
CREATE TABLE public.vendas (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  canal_venda text,
  cliente_referencia text,
  data_venda timestamp with time zone,
  total_final numeric,
  forma_pagamento text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 3. Enable RLS on vendas table
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies with correct syntax
CREATE POLICY "vendas_select_policy" ON public.vendas FOR SELECT USING (empresa_id = public.get_user_empresa_id());
CREATE POLICY "vendas_insert_policy" ON public.vendas FOR INSERT WITH CHECK (empresa_id = public.get_user_empresa_id());
CREATE POLICY "vendas_update_policy" ON public.vendas FOR UPDATE USING (empresa_id = public.get_user_empresa_id());
CREATE POLICY "vendas_delete_policy" ON public.vendas FOR DELETE USING (empresa_id = public.get_user_empresa_id());

-- 5. Create indexes
CREATE INDEX idx_vendas_empresa_id ON public.vendas(empresa_id);
CREATE INDEX idx_vendas_data_venda ON public.vendas(data_venda);
CREATE INDEX idx_vendas_canal_venda ON public.vendas(canal_venda);

-- 6. Migrate data from movimentacoes to vendas
DO $$
DECLARE
    r RECORD;
    v_venda_id uuid;
BEGIN
    FOR r IN 
        SELECT id, empresa_id, canal_venda, cliente_referencia, data_movimentacao, total_final, forma_pagamento, created_at
        FROM public.movimentacoes 
        WHERE tipo IN ('venda', 'venda_mercado', 'venda_unitario')
    LOOP
        v_venda_id := gen_random_uuid();
        
        INSERT INTO public.vendas (id, empresa_id, canal_venda, cliente_referencia, data_venda, total_final, forma_pagamento, created_at)
        VALUES (
            v_venda_id, 
            r.empresa_id, 
            COALESCE(r.canal_venda, 'PDV'), 
            COALESCE(r.cliente_referencia, 'MIGRADO'), 
            COALESCE(r.data_movimentacao, now()), 
            COALESCE(r.total_final, 0), 
            COALESCE(r.forma_pagamento, 'N/A'), 
            COALESCE(r.created_at, now())
        );
        
        UPDATE public.movimentacoes SET venda_id = v_venda_id WHERE id = r.id;
    END LOOP;
END $$;

-- 7. Create foreign key constraint
ALTER TABLE public.movimentacoes ADD CONSTRAINT fk_movimentacoes_vendas FOREIGN KEY (venda_id) REFERENCES public.vendas(id);

-- 8. Create view itens_venda
CREATE OR REPLACE VIEW public.itens_venda AS 
SELECT * FROM public.movimentacoes 
WHERE venda_id IS NOT NULL AND tipo IN ('venda', 'venda_mercado', 'venda_unitario');

-- Add Audit Trigger for vendas
DROP TRIGGER IF EXISTS vendas_audit_trigger ON public.vendas;
CREATE TRIGGER vendas_audit_trigger 
    AFTER INSERT OR UPDATE OR DELETE ON public.vendas 
    FOR EACH ROW EXECUTE FUNCTION public.log_generic_trigger('vendas');