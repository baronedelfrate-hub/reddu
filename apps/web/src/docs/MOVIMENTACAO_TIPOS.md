# Tipos de Movimentação Válidos

Este documento descreve os tipos de movimentações aceitos pela constraint do banco de dados na tabela `movimentacoes`. Qualquer tentativa de inserir um registro com um `tipo` não listado aqui resultará em erro.

## Tipos e Casos de Uso

| Tipo | Contexto / Operação | Descrição |
| :--- | :--- | :--- |
| `entrada` | Gestão de Estoque | Entrada avulsa de produtos no estoque geral. |
| `saida` / `saída` | Gestão de Estoque | Retirada genérica ou baixa de estoque. |
| `transferencia` / `transferência`| Logística | Movimentação de estoque entre dois locais (ex: Central para Mercado). |
| `devolucao` / `devolução` | Logística / Vendas | Retorno de produtos avariados, trocas ou devoluções de clientes. |
| `bandeja` | Produção | Movimentações específicas envolvendo o empacotamento ou quebra de bandejas. |
| `producao` | Produção | Lançamento de novos lotes criados internamente. |
| `producao_bandeja` | Produção | Processo que converte lotes base em lotes do tipo bandeja. |
| `venda` | Vendas / PDV | Registro padrão de uma venda finalizada no balcão. |
| `venda_mercado` | Vendas | Registro de vendas originadas especificamente em pontos externos (mercados). |
| `venda_unitario` | Vendas | Vendas de itens únicos de lotes base ou fracionados. |
| `ajuste` / `ajuste_manual` | Auditoria | Correções manuais de quantidades realizadas por administradores. |
| `baixa` | Auditoria / Vendas | Baixas administrativas ou financeiras ligadas a perdas ou cortes. |
| `descarte` | Logística | Lotes direcionados para inutilização devido a validade expirada ou danos irreversíveis. |
| `conferencia` | Operação Mercados | Auditoria e contagem física (checklist) resultando em correções ou validações positivas de estoque. |

## Validação Preventiva no Frontend

Para evitar que erros de constraint disparem falhas complexas na UI, utilize o utilitário centralizado antes de realizar qualquer operação de insert ou RPC: