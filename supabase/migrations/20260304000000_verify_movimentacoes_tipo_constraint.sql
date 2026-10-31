-- Migration: Verify and standardize movimentacoes.tipo constraint
-- Description: Ensures all necessary movement types are allowed, including unaccented versions 
-- like 'devolucao' and 'saida' to prevent RPC constraint violations.

BEGIN;

-- 1. Drop existing constraints if they exist
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS check_tipo CASCADE;
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_check CASCADE;

-- 2. Create new comprehensive CHECK constraint
-- Includes both accented (legacy) and unaccented (standardized) values
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_tipo_check CHECK (tipo IN (
    'entrada', 
    'saida', 'saída', 
    'transferencia', 'transferência', 
    'devolucao', 'devolução', 
    'bandeja', 
    'producao', 
    'venda', 
    'ajuste', 
    'baixa', 
    'venda_mercado', 
    'ajuste_manual'
));

COMMIT;