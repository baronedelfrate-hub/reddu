DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimentacoes' AND column_name = 'taxa_motoboy') THEN
        ALTER TABLE movimentacoes ADD COLUMN taxa_motoboy numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimentacoes' AND column_name = 'desconto') THEN
        ALTER TABLE movimentacoes ADD COLUMN desconto numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimentacoes' AND column_name = 'observacoes') THEN
        ALTER TABLE movimentacoes ADD COLUMN observacoes text;
    END IF;
END $$;