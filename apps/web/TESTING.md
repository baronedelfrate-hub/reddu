# Instruções de Teste de Visibilidade

O objetivo deste teste é verificar se a aplicação está retendo corretamente o estado dos formulários ao transitar entre abas no navegador, e garantir que a página não sofra recarregamento automático (f5) acidental provocado por hooks ou listeners.

## Como Executar o Teste Manual

### Teste 1: Página de Produtos (`/dashboard/produtos`)
1. Abra a página de Produtos.
2. Clique no botão "Novo Produto" ou clique no ícone do lápis para editar um produto existente.
3. Preencha ou modifique alguns dados no formulário (ex: Nome do Produto, Preço).
4. Mude de aba no navegador usando `Ctrl + Tab` ou clicando em outra aba aberta.
5. Aguarde aproximadamente 5 a 10 segundos na outra aba.
6. Volte para a aba do sistema (Estoque 360) usando `Ctrl + Shift + Tab` ou clicando nela.
7. **Verificação Esperada**:
   - A página **NÃO** deve ter recarregado.
   - O modal de edição deve continuar aberto.
   - Os dados que você estava editando devem estar exatamente como você os deixou.
8. Abra o Console de Desenvolvedor (`F12`) e verifique a presença da mensagem:
   - `Page visibility changed: { hidden: true/false, timestamp: ... }`

### Teste 2: Gestão de Lotes (`/dashboard/lotes`)
1. Navegue para a página de Lotes.
2. Clique em "Novo Lote".
3. Selecione um Produto e informe uma quantidade.
4. Mude de aba e aguarde alguns segundos.
5. Retorne à aba do sistema.
6. **Verificação Esperada**: A tela de registro de lote deve continuar aberta e os campos preenchidos devem ser mantidos sem recarregamento forçado.

### Teste 3: Registrar Produção (`/dashboard/registrar-producao`)
1. Navegue para a página "Registrar Produção".
2. Comece a preencher o formulário (Produto Produzido, Quantidade).
3. Mude de aba, aguarde 30 segundos, retorne.
4. **Verificação Esperada**: Formulário não foi resetado e a página não sofreu reload.

### Teste 4: PDV Rápido (`/dashboard/pdv-rapido`)
1. Acesse o PDV Rápido.
2. Adicione pelo menos 2 produtos no "Carrinho".
3. Mude de aba e aguarde alguns segundos.
4. Retorne ao sistema.
5. **Verificação Esperada**: Os produtos adicionados ao carrinho devem continuar no carrinho de compras. O PDV não deve recarregar zerando o pedido.

## Considerações Finais
Se durante algum destes testes a página "piscar" (sofrer F5) ou os dados inseridos desaparecerem após retornar para a aba, capture o log que consta no `Console` do seu navegador para investigação adicional de qual evento disparou o *refresh*.