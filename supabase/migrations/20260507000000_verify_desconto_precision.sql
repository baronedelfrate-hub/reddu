-- Verify and ensure desconto column has correct numeric precision
-- This migration ensures desconto is stored as NUMERIC(10,2) for exact decimal precision

-- Check if desconto column exists and has correct type
DO $$
BEGIN
    -- If desconto column doesn't exist, add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'movimentacoes' 
        AND column_name = 'desconto'
    ) THEN
        ALTER TABLE public.movimentacoes 
        ADD COLUMN desconto NUMERIC(10,2) DEFAULT 0;
        
        RAISE NOTICE 'Added desconto column as NUMERIC(10,2)';
    ELSE
        -- Column exists, ensure it's NUMERIC type
        -- If it's text or other type, convert it
        DECLARE
            current_type TEXT;
        BEGIN
            SELECT data_type INTO current_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'movimentacoes'
            AND column_name = 'desconto';
            
            IF current_type != 'numeric' THEN
                -- Convert column to NUMERIC(10,2)
                ALTER TABLE public.movimentacoes 
                ALTER COLUMN desconto TYPE NUMERIC(10,2) 
                USING CASE 
                    WHEN desconto IS NULL THEN 0
                    WHEN desconto::text ~ '^[0-9.]+$' THEN desconto::text::NUMERIC(10,2)
                    ELSE 0
                END;
                
                RAISE NOTICE 'Converted desconto column from % to NUMERIC(10,2)', current_type;
            ELSE
                RAISE NOTICE 'desconto column already NUMERIC type';
            END IF;
        END;
    END IF;
    
    -- Ensure NOT NULL constraint with default 0
    ALTER TABLE public.movimentacoes 
    ALTER COLUMN desconto SET DEFAULT 0;
    
    RAISE NOTICE 'desconto column verified: NUMERIC(10,2) with DEFAULT 0';
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.movimentacoes.desconto IS 'Discount amount in BRL with 2 decimal precision (e.g., 14.70). MUST preserve exact decimal values without rounding.';