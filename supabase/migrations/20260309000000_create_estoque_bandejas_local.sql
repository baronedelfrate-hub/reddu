-- Migration: Add ESTOQUE BANDEJAS local logic and update rpc_devolucao

-- Create helper RPC function
CREATE OR REPLACE FUNCTION public.ensure_estoque_bandejas_local_rpc(p_empresa_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Check if it exists
  SELECT id INTO v_id FROM public.locais 
  WHERE empresa_id = p_empresa_id AND nome = 'ESTOQUE BANDEJAS' 
  LIMIT 1;
  
  -- If not exists, insert and return id
  IF v_id IS NULL THEN
    INSERT INTO public.locais (empresa_id, nome, tipo, descricao, controla_validade, controla_estoque, is_system)
    VALUES (
      p_empresa_id, 
      'ESTOQUE BANDEJAS', 
      'estoque', 
      'Local de armazenamento de bandejas devolvidas', 
      false, 
      true, 
      true
    )
    RETURNING id INTO v_id;
  ELSE
    -- Ensure it has correct flags in case it was created previously
    UPDATE public.locais 
    SET is_system = true, tipo = 'estoque', controla_estoque = true, controla_validade = false 
    WHERE id = v_id AND (is_system = false OR tipo != 'estoque' OR controla_estoque = false OR controla_validade = true);
  END IF;
  
  RETURN v_id;
END;
$function$;

-- Update rpc_devolucao
CREATE OR REPLACE FUNCTION public.rpc_devolucao(p_empresa_id uuid, p_local_origem_id uuid, p_produto_id uuid, p_lote_id uuid, p_quantidade bigint, p_motivo_devolucao text, p_observacao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_lote_origem RECORD;
    v_lote_destino RECORD;
    v_mov_id uuid;
    v_local_destino_id uuid;
    v_tipo_movimentacao text;
    v_novo_lote_id uuid;
BEGIN
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
    END IF;

    IF p_motivo_devolucao IS NULL OR p_motivo_devolucao = '' THEN
        RAISE EXCEPTION 'Motivo da devolução é obrigatório.';
    END IF;

    -- Lock origin lote
    SELECT * INTO v_lote_origem 
    FROM lotes 
    WHERE id = p_lote_id AND local_id = p_local_origem_id AND empresa_id = p_empresa_id 
    FOR UPDATE;

    IF v_lote_origem IS NULL THEN
        RAISE EXCEPTION 'Lote de origem não encontrado no local especificado.';
    END IF;

    IF v_lote_origem.quantidade < p_quantidade THEN
        RAISE EXCEPTION 'Quantidade insuficiente no lote para esta devolução. Disponível: %', v_lote_origem.quantidade;
    END IF;

    -- Determine destination and type based on motivo
    IF p_motivo_devolucao = 'troca' THEN
        v_tipo_movimentacao := 'devolucao';
        v_local_destino_id := public.ensure_estoque_bandejas_local_rpc(p_empresa_id);
    ELSE
        v_tipo_movimentacao := 'descarte';
        v_local_destino_id := public.ensure_descarte_local_rpc(p_empresa_id);
    END IF;

    -- Decrease from origin
    UPDATE lotes SET quantidade = quantidade - p_quantidade::integer WHERE id = p_lote_id;

    -- Increase in destination (find or create lot)
    SELECT * INTO v_lote_destino 
    FROM lotes 
    WHERE numero_lote = v_lote_origem.numero_lote 
      AND produto_id = p_produto_id 
      AND local_id = v_local_destino_id 
      AND empresa_id = p_empresa_id 
      AND tipo_lote = v_lote_origem.tipo_lote
    LIMIT 1 FOR UPDATE;

    IF v_lote_destino IS NULL THEN
        v_novo_lote_id := gen_random_uuid();
        INSERT INTO lotes (
            id, empresa_id, produto_id, numero_lote, data_validade, 
            quantidade, local_id, lote_origem_id, tipo_lote, unidades_por_bandeja
        ) VALUES (
            v_novo_lote_id, p_empresa_id, p_produto_id, v_lote_origem.numero_lote, v_lote_origem.data_validade,
            p_quantidade::integer, v_local_destino_id, p_lote_id, v_lote_origem.tipo_lote, v_lote_origem.unidades_por_bandeja
        );
    ELSE
        UPDATE lotes SET quantidade = quantidade + p_quantidade::integer WHERE id = v_lote_destino.id;
    END IF;

    -- Insert movement
    INSERT INTO movimentacoes (
        empresa_id, tipo, produto_id, lote_id, local_origem_id, local_destino_id, quantidade, motivo_devolucao, observacao, data_movimentacao
    ) VALUES (
        p_empresa_id, v_tipo_movimentacao, p_produto_id, p_lote_id, p_local_origem_id, v_local_destino_id, p_quantidade::integer, p_motivo_devolucao, p_observacao, now()
    ) RETURNING id INTO v_mov_id;

    RETURN v_mov_id;
END;
$function$;

-- Ensure local exists for all existing companies
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.empresas LOOP
    PERFORM public.ensure_estoque_bandejas_local_rpc(rec.id);
  END LOOP;
END;
$$;