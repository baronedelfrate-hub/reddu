# Guia de Vendas Pendentes

## 1. Novas Regras de Negócio (Reconhecimento Financeiro Diferido)
Para os canais **APP** e **MERCADO**, o reconhecimento financeiro não ocorre no momento em que a venda é registrada. O fluxo agora é dividido em duas etapas:
1. **Baixa de Estoque**: Imediata. Assim que a venda é registrada no sistema, o estoque dos produtos é deduzido instantaneamente para garantir a precisão do inventário físico.
2. **Reconhecimento Financeiro**: Diferido. A venda é registrada com o status `PENDENTE`. O valor financeiro só entrará no fluxo de caixa (e aparecerá nos relatórios financeiros consolidados) quando a venda for "Conciliada" (Dar Baixa).

## 2. Comportamento Inalterado do PDV
As vendas realizadas no **PDV (Ponto de Venda)** mantêm o comportamento original. Elas são consideradas vendas diretas ao consumidor final, onde o pagamento e a entrega do produto ocorrem simultaneamente. 
- Baixa de estoque: Imediata.
- Reconhecimento financeiro: Imediato.
- Status: Não entram no fluxo de pendências.

## 3. Tela de Vendas Pendentes (Objetivo e Fluxo)
A tela de **Vendas Pendentes** funciona como um painel de controle financeiro de contas a receber.
- **Objetivo**: Listar todas as vendas de APP e MERCADO que já tiveram seus produtos entregues/despachados, mas cujos repasses financeiros (pelas plataformas ou parceiros) ainda não foram confirmados.
- **Fluxo**:
  1. O usuário acessa a tela e visualiza a lista de vendas com status `PENDENTE`.
  2. Ao receber o extrato do aplicativo (ex: iFood) ou o acerto do mercado parceiro, o usuário localiza a venda correspondente.
  3. O usuário clica em "Dar Baixa" na linha correspondente.

## 4. Processo de Conciliação (Passo a Passo)
1. **Ação**: Clicar em "Dar Baixa" na venda desejada.
2. **Modal de Conciliação**: Um formulário é exibido solicitando as seguintes informações:
   - *Data do Recebimento*: Quando o dinheiro efetivamente entrou na conta (padrão: hoje).
   - *Forma de Pagamento*: Como o valor foi recebido (PIX, Transferência, etc.).
   - *Desconto/Taxa do App*: Taxas cobradas pela plataforma (ex: comissão do iFood).
   - *Valor Líquido Recebido*: Valor bruto da venda menos as taxas.
   - *Observação*: Notas adicionais sobre o repasse.
3. **Confirmação**: Ao confirmar, o sistema muda o status da venda para `CONCILIADO` e gera a movimentação financeira correspondente com o valor líquido recebido e a data informada.

## 5. Fluxograma de Dados (Estoque vs. Financeiro)