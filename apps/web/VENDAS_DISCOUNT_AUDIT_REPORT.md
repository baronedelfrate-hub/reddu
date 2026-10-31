# Vendas Discount Column Audit Report
## Date: 2026-04-30

---

## Executive Summary

**CRITICAL FINDING:** The `vendas` table does NOT have `desconto` or `desconto_valor` columns. All discount data is stored in the `movimentacoes` table.

**Status:** ✅ **ALL COMPONENTS CORRECTED**

---

## Database Schema Verification

### ✅ Confirmed Table Structure

**vendas table columns:**
- id, empresa_id, canal_venda, cliente_referencia, data_venda, total_final
- forma_pagamento, created_at, updated_at, responsavel_retirada
- observacao_retirada, status, financeiro_baixado, data_baixa
- tipo_lote, numero_pedido_app, forma_pagamento_detalhes

**❌ DOES NOT EXIST in vendas:**
- `desconto`
- `desconto_valor`

**✅ Discount columns location:**
- Table: `movimentacoes`
- Columns: `desconto_tipo`, `desconto_valor`

---

## Component Audit Results

### 1. ✅ VendasPendentesPage.jsx
**Status:** CORRECTED ✅
**Changes Made:**
- Removed query for non-existent `vendas.desconto` column
- Now calculates discount from `movimentacoes.desconto_valor`
- Uses SUM aggregation for discount from all items
- Fallback calculation: `subtotal - total_final` if no desconto_valor

**Verification:**