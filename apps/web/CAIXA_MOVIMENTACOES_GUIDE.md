# Guia de Movimentações de Caixa (Retiradas)

Este documento detalha o sistema de controle de retiradas de caixa integrado ao PDV.

## 1. Esquema do Banco de Dados
A tabela `caixa_movimentacoes` gerencia as transações adicionais do caixa:
- **id**: UUID primário
- **caixa_id**: Referência ao caixa atual. Exclusões de caixas são em cascata (`ON DELETE CASCADE`).
- **tipo**: Identifica o movimento, default `RETIRADA`. Permite expansão futura (ex: `SUPRIMENTO`).
- **valor**: Valor do movimento, restrito a positivo (`> 0`).
- **observacao**: Detalhamento do movimento (pagamento a fornecedor, retirada de sócio, etc).
- **usuario_id**: Operador logado que realizou o movimento.
- **created_at**: Timestamp do registro.

*Segurança*: RLS aplicada validando o `empresa_id` na tabela `caixas` vinculada.

## 2. Utilização dos Componentes
- **useCaixaMovimentacoes.js**: Hook responsável pela integração do Supabase. Expõe `fetchMovimentacoes`, `createRetirada` e `calculateCaixaBalance`.
- **CaixaMovimentacoesService.js**: Abstrai cálculos de saldo, conversões de moeda e validações de input, reduzindo a lógica de negócio dos componentes de UI.
- **RetiradaModal.jsx**: Formulário acessado através do PDV (botão "Retirada").
- **CaixaMovimentacoesHistorico.jsx**: Tabela de listagem renderizada no modal de Fechar Caixa para revisão prévia.

## 3. Cálculo de Saldo em Tempo Real
O saldo atual do caixa obedece a fórmula:
`Saldo Final = Valor Inicial (Troco) + Total de Vendas (Receitas) - Total de Retiradas`

O total de vendas é calculado somando todo valor efetivamente recebido de todos os métodos mapeados via RPC (`calcular_resumo_vendas`). Sempre que uma venda ou retirada é concluída, a função `updateSaldo()` é acionada no PDV, reprocessando o RPC e os somatórios.

## 4. Pontos de Integração
- **PDVPage.jsx**: O header inclui informações em tempo real do saldo atual e os botões "Retirada" e "Fechar".
- **FecharCaixaModal.jsx**: Busca automaticamente o histórico do dia/turno via useEffect, exibe no resumo da modal e deduz do "Saldo Esperado em Caixa" orientando a conferência física do operador.

## 5. Fluxo do Operador
1. Abre o caixa (informa Troco).
2. Transaciona vendas normais.
3. Precisando retirar valores (ex: pagar motoboy, sangria de segurança), clica em "Retirada".
4. Informa valor, motivo e valida a operação.
5. No fim do expediente, ao clicar em "Fechar", visualiza as vendas, retiradas detalhadas e o saldo esperado para fechamento oficial.

## 6. Cenários de Teste
- **Validação de Valor**: Tentar retirar R$ 0 ou negativos deve ser bloqueado na interface.
- **Dedução Correta**: A dedução de uma retirada de R$ 50.00 deve atualizar em tempo real o header do PDV.
- **Histórico**: Validar a exibição da retirada no Modal de Fechamento com horário e responsável corretos.

## 7. Melhorias Futuras
- Relatórios gerenciais de sangrias exportáveis para PDF/Excel.
- Inclusão do tipo `SUPRIMENTO` para reforços de caixa.
- Aprovação de administradores para retiradas acima de limite configurável.