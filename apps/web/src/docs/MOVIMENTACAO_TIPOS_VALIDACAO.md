# Teste de Validação: Tipos de Movimentações

Este documento descreve a validação preventiva da constraint `movimentacoes_tipo_check` nas operações do sistema Estoque 360.

## Valores EXATOS Permitidos pela Constraint
Com base na function `log_movimentacao_trigger` e na restrição do banco de dados, os seguintes tipos (case-insensitive para a validação frontend, mas normalizados no backend) são os *únicos* permitidos:

* `entrada`
* `saida` ou `saída`
* `transferencia` ou `transferência`
* `devolucao` ou `devolução`
* `bandeja`
* `producao`
* `producao_bandeja`
* `venda`
* `venda_mercado`
* `venda_unitario`
* `ajuste`
* `ajuste_manual`
* `baixa`
* `descarte`
* `conferencia`

## Mapeamento por Operação

| Ação do Usuário | Componente / Fluxo | Tipo da Movimentação |
| :--- | :--- | :--- |
| Transferir Lote | `TransferenciaLoteModal`, `TransferenciaEstoquePage` | `transferencia` |
| Devolver / Descartar Lote | `RegistrarDevolucaoPage`, `RetornoLoteModal` | `devolucao` / `descarte` |
| Conferir Lote no Mercado | `ConferenciaLoteModal` | `conferencia` |
| Produzir Novo Lote (Base/Clássico) | `RegistrarProducaoPage`, `RegistrarProducaoClassicosPage` | `producao` |
| Produzir Bandejas Diretas | `RegistrarProducaoBandejasPage` | `producao_bandeja` |
| Produzir Bandejas de um Lote Base | `ProduzirBandejasPage` | `producao_bandeja` |
| Venda no Aplicativo | `VendaAplicativoPage` | `venda` |
| Venda PDV Rápido (Normal) | `PDVRapidoPage` | `venda_unitario` |
| Venda PDV Rápido (Bandeja) | `PDVRapidoPage` | `venda_mercado` |
| Venda Clássicos Avulsa | `RegistrarVendaClassicosPage` | `venda_unitario` |

## Checklist de Testes

- [ ] **Transferência**: Confirmar que a RPC `transferir_estoque_rpc` insere com tipo `transferencia`.
- [ ] **Venda PDV Completo**: Confirmar que `finalizarVenda` (no Hook `usePDVManagement`) passa pela pre-validação sem estourar restrições.
- [ ] **Venda PDV Rápido**: Confirmar inserção bem-sucedida usando `venda_unitario` ou `venda_mercado` via hook.
- [ ] **Produção Estoque Central**: Confirmar inserção de tipo `producao`.
- [ ] **Produção Clássicos**: Confirmar inserção com tipo `producao`.
- [ ] **Venda Aplicativo**: Confirmar inserção iterada de itens usando `venda`.
- [ ] **Nenhuma inserção falha** com erro genérico do banco na interface de usuário, graças à interceptação via `validateMovimentacaoData()` no utilitário de frontend.