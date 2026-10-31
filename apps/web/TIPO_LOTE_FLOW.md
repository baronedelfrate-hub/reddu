# Guia de Fluxo: `tipo_lote`

Este documento descreve o fluxo completo do campo `tipo_lote` no sistema, focando nas Vendas por Aplicativo e Vendas Pendentes.

## 1. Estrutura de Dados (Auditoria)
- **Tabela `lotes`**: Possui a coluna `tipo_lote` (text). Valores esperados: `bandeja`, `base`, `unitario`.
- **Tabela `movimentacoes`**: Possui a coluna `tipo_lote` (text). Armazena o tipo_lote do item individual vendido.
- **Tabela `vendas`**: Possui a coluna `tipo_lote` (text). Armazena um resumo global (ex: `misto` se houver mais de um tipo).

## 2. Seleção de Lote (Venda Aplicativo)
- **Componente**: `VendaAplicativoPage.jsx` e `useVendaAplicativo.js`.
- **Ação**: Ao carregar os lotes (`fetchProdutosClassicos`), o `tipo_lote` é recuperado diretamente da tabela `lotes`.
- **Armazenamento**: O `tipo_lote` é salvo no estado do carrinho para cada item de forma independente.

## 3. Validação
- **Regra**: O `tipo_lote` deve ser obrigatório e pertencer à lista de valores válidos (`bandeja`, `unitario`, `base`). O valor `base` é frequentemente normalizado para `unitario`.
- **Função Utilitária**: `validateTipoLote` centraliza esta validação.
- **Bloqueios**: A venda é bloqueada na interface e no hook se houver itens com `tipo_lote` inválido.

## 4. Registro da Venda (Pendente)
- **Hook**: `saveSale` em `useVendaAplicativo.js`.
- **Ação**: 
  - Cria o registro na tabela `vendas`.
  - Para cada item no carrinho, cria um registro na tabela `movimentacoes`.
  - **Crucial**: O `tipo_lote` específico de cada item do carrinho é gravado na sua respectiva linha em `movimentacoes`.

## 5. Exibição de Vendas Pendentes
- **Página**: `VendasPendentesPage.jsx`.
- **Ação**: Busca os registros de `movimentacoes` com `status = 'PENDENTE'`.
- **Exibição**: O `tipo_lote` de cada movimentação é exibido na tabela, garantindo que o usuário veja a informação por item.

## 6. Baixa/Conciliação (Settlement)
- **Serviço**: `settlementService.js`.
- **Ação**: Atualiza o status da movimentação e da venda para `CONCILIADO`.
- **Preservação**: O `tipo_lote` não é alterado durante este processo. A query de update apenas afeta campos financeiros e de status. Foi adicionada validação para garantir a integridade.

## 7. Relatórios
- **Página**: `RelatorioVendasPage.jsx`.
- **Ação**: A query busca `movimentacoes` fazendo join com `vendas`. O campo `tipo_lote` de cada movimentação é retornado para análise detalhada do histórico de itens vendidos.