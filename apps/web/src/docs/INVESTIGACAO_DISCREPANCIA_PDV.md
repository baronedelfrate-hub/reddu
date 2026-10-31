# Investigação: Discrepância de R$ 0,01 no PDV

Este documento detalha a investigação sobre a causa da discrepância de R$ 0,01 (ou frações de centavos) observada nos totais do PDV (Carrinho de Venda).

## 1. Fluxo de Cálculo de Totais

Os cálculos estão centralizados no hook `usePDVManagement.js` e a exibição ocorre em `CarrinhoVenda.jsx`. 

**Como os cálculos são realizados:**
- **Total por Item (`calculateItemTotal`)**: Multiplica `quantidade` por `parseFloat(preco)`. Se o item não for do tipo `'NORMAL'` (ex: `'BRINDE'`), o total forçadamente retorna `0`.
- **Subtotal do Carrinho (`calculateCartTotals`)**: Itera sobre os itens com um `reduce`, acumulando a soma de `qty * parseFloat(item.preco)`.
- **Desconto e Total Final (`calculateDiscountTotals`)**: Pega o Subtotal calculado acima e subtrai o desconto (seja valor fixo ou percentual), retornando `total_final`.

## 2. Achados e Causas da Discrepância

Foram identificados 3 fatores principais na arquitetura de cálculo que causam divergências matemáticas visuais para o usuário:

### A) Arredondamento Tardio vs. Soma Bruta (Causa Principal)
Atualmente, o sistema soma os valores com toda a precisão de ponto flutuante do JavaScript (IEEE 754) e apenas formata o resultado final na hora de exibir na tela usando `formatCurrency(valor, 3)`.

**Exemplo Prático (ilusão matemática na exibição):**
- Item A: R$ 49,99 (Subtotal bruto)
- Desconto de 15%: R$ 7,4985 (Desconto bruto)
- Total Final Calculado: R$ 42,4915 (Total bruto)

**Como aparece na tela formatado para 3 casas (arredondamento UI):**
- Subtotal Exibido: **R$ 49,990**
- Desconto Exibido: **R$ 7,499**
- Total Final Exibido: **R$ 42,492**

Se o usuário subtrair visualmente os números da tela (`49,990 - 7,499`), o resultado deveria ser **R$ 42,491**. Porém, a tela exibe **R$ 42,492**. Essa é a exata origem da "diferença de 1 centavo" relatada.

### B) Inconsistência de Preço (UI vs Lógica)
Em `CarrinhoVenda.jsx` (linhas 85-88), existe um cálculo de Valor Unitário que prioriza uma propriedade diferente da usada no total do carrinho: