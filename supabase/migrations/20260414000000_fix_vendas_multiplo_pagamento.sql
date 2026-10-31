-- Migration to support multiple payment methods
-- Drops restrictive check constraints and ensures JSONB columns exist

DO $$ 
BEGIN
  -- Drop check constraints on forma_pagamento if they exist
  ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_forma_pagamento_check;
  ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_forma_pagamento_check;
  
  -- Add forma_pagamento_detalhes column to vendas if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendas' AND column_name = 'forma_pagamento_detalhes') THEN
    ALTER TABLE public.vendas ADD COLUMN forma_pagamento_detalhes jsonb;
  END IF;

  -- Add forma_pagamento_detalhes column to movimentacoes if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimentacoes' AND column_name = 'forma_pagamento_detalhes') THEN
    ALTER TABLE public.movimentacoes ADD COLUMN forma_pagamento_detalhes jsonb;
  END IF;
END $$;