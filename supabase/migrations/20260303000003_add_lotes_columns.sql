-- Migration: Add missing columns to lotes table
-- 1. Add columns if they don't exist using safe blocks
DO $$ 
BEGIN
    -- Add tipo_lote column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='tipo_lote') THEN
        ALTER TABLE public.lotes ADD COLUMN tipo_lote TEXT DEFAULT 'base';
    END IF;

    -- Add unidades_por_bandeja column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='unidades_por_bandeja') THEN
        ALTER TABLE public.lotes ADD COLUMN unidades_por_bandeja INTEGER NULL;
    END IF;

    -- Add lote_origem_id column (usually exists already)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='lote_origem_id') THEN
        ALTER TABLE public.lotes ADD COLUMN lote_origem_id UUID NULL;
    END IF;
END $$;

-- 2. Update existing rows where tipo_lote IS NULL to ensure data consistency before applying constraints
UPDATE public.lotes SET tipo_lote = 'base' WHERE tipo_lote IS NULL;

-- 3. Add CHECK constraint on tipo_lote to ensure values are only 'base' or 'bandeja'
DO $$ 
BEGIN
    ALTER TABLE public.lotes ADD CONSTRAINT lotes_tipo_lote_check CHECK (tipo_lote IN ('base', 'bandeja'));
EXCEPTION
    WHEN duplicate_object THEN 
        -- Constraint already exists, ignore
        NULL;
END $$;

-- 4. Add FOREIGN KEY constraint on lote_origem_id referencing public.lotes(id)
DO $$ 
BEGIN
    ALTER TABLE public.lotes ADD CONSTRAINT lotes_lote_origem_id_fkey FOREIGN KEY (lote_origem_id) REFERENCES public.lotes(id);
EXCEPTION
    WHEN duplicate_object THEN 
        -- Constraint already exists, ignore
        NULL;
END $$;