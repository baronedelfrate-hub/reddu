-- Migration: Update existing bandeja lotes to ensure traceability and consistency
-- Note: We only update lotes, as changing produtos.nome would affect base lotes too.
-- The UI handles the "Bandeja" prefix dynamically, but we ensure lote_origem_id is set where possible.

-- 1. Try to set lote_origem_id for bandejas where it's NULL, based on same product and closest created_at
-- This is a best-effort update for legacy data
WITH bandeja_needs_origin AS (
    SELECT id, empresa_id, produto_id, created_at
    FROM public.lotes 
    WHERE tipo_lote = 'bandeja' AND lote_origem_id IS NULL
),
closest_base AS (
    SELECT 
        b.id AS bandeja_id,
        (
            SELECT l.id 
            FROM public.lotes l 
            WHERE l.empresa_id = b.empresa_id 
              AND l.produto_id = b.produto_id 
              AND l.tipo_lote = 'base'
              AND l.created_at <= b.created_at
            ORDER BY l.created_at DESC 
            LIMIT 1
        ) as origin_id
    FROM bandeja_needs_origin b
)
UPDATE public.lotes l
SET lote_origem_id = cb.origin_id
FROM closest_base cb
WHERE l.id = cb.bandeja_id AND cb.origin_id IS NOT NULL;

-- 2. Log a notice for any bandejas that still couldn't be linked
DO $$
DECLARE
    unlinked_count integer;
BEGIN
    SELECT count(*) INTO unlinked_count 
    FROM public.lotes 
    WHERE tipo_lote = 'bandeja' AND lote_origem_id IS NULL;
    
    IF unlinked_count > 0 THEN
        RAISE NOTICE 'Found % bandeja lotes that could not be linked to an origin lote automatically.', unlinked_count;
    END IF;
END $$;