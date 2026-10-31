-- Migration: Fix undefined or invalid numero_lote in lotes table
WITH numbered_lotes AS (
    SELECT 
        id,
        created_at,
        to_char(created_at, 'YYYYMMDD') as date_str,
        ROW_NUMBER() OVER (PARTITION BY to_char(created_at, 'YYYYMMDD') ORDER BY created_at) as seq
    FROM public.lotes
    WHERE numero_lote = 'undefined' 
       OR numero_lote IS NULL 
       OR numero_lote LIKE '%undefined%'
)
UPDATE public.lotes l
SET numero_lote = 'BDJ-' || nl.date_str || '-' || LPAD(nl.seq::text, 3, '0')
FROM numbered_lotes nl
WHERE l.id = nl.id;