-- Add taxa_motoboy column to movimentacoes table
ALTER TABLE public.movimentacoes ADD COLUMN IF NOT EXISTS taxa_motoboy numeric;