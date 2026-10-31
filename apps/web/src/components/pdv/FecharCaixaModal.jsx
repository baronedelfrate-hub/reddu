import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCaixaManagement } from '@/hooks/useCaixaManagement';
import { useCaixaMovimentacoes } from '@/hooks/useCaixaMovimentacoes';
import { useToast } from '@/hooks/use-toast';
import { StopCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyFormatter';
import { validateBrazilianDecimal, parseBrazilianDecimal } from '@/utils/formatBrazilianDecimal';
import { calculateTotalRetiradas, calculateFinalBalance } from '@/utils/CaixaMovimentacoesService';
import CaixaMovimentacoesHistorico from './CaixaMovimentacoesHistorico';

export default function FecharCaixaModal({ isOpen, onClose, onSuccess, caixaAberto }) {
  const { fecharCaixa, calcularResumoCaixa } = useCaixaManagement();
  const { fetchMovimentacoes } = useCaixaMovimentacoes();
  const { toast } = useToast();
  
  const [resumo, setResumo] = useState(null);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [valorFinal, setValorFinal] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResumo, setIsLoadingResumo] = useState(false);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (isOpen && caixaAberto) {
      setValorFinal('');
      setObservacao('');
      setIsValid(true);
      setIsLoadingResumo(true);
      
      Promise.all([
        calcularResumoCaixa(caixaAberto.id),
        fetchMovimentacoes(caixaAberto.id)
      ])
        .then(([resumoData, movData]) => {
          // Truncar valores do banco para 2 casas antes de exibir
if (resumoData) {
  if (resumoData.por_forma_pagamento) {
    Object.keys(resumoData.por_forma_pagamento).forEach(key => {
      resumoData.por_forma_pagamento[key] = Math.trunc((resumoData.por_forma_pagamento[key] || 0) * 100) / 100;
    });
    // Recalcular total_geral a partir dos valores já truncados
    resumoData.total_geral = Object.values(resumoData.por_forma_pagamento)
      .reduce((acc, val) => acc + val, 0);
    resumoData.total_geral = Math.trunc(resumoData.total_geral * 100) / 100;
  } else {
    resumoData.total_geral = Math.trunc((resumoData.total_geral || 0) * 100) / 100;
  }
}
          setResumo(resumoData);
          setMovimentacoes(movData || []);
      })
      .catch(err => {
        toast({ title: "Erro ao carregar dados", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        setIsLoadingResumo(false);
      });
    }
  }, [isOpen, caixaAberto]);

  const handleValorChange = (e) => {
    let val = e.target.value;
    val = val.replace('.', ',');
    
    if (validateBrazilianDecimal(val)) {
      setValorFinal(val);
      setIsValid(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const parsedValor = parseBrazilianDecimal(valorFinal);
    
    if (valorFinal === '' || parsedValor < 0 || isNaN(parsedValor)) {
      setIsValid(false);
      toast({
        title: "Valor Inválido",
        description: "O valor final em caixa deve ser maior ou igual a zero.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      await fecharCaixa(caixaAberto.id, parsedValor, observacao);
      toast({
        title: "Caixa Fechado",
        description: "O caixa foi encerrado com sucesso.",
        className: "bg-green-600 text-white border-none"
      });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: "Erro ao fechar caixa",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  const handleOpenChange = (open) => {
    if (!open && onClose) {
      onClose();
    }
  };

const totalVendas = Math.trunc((resumo?.total_geral || 0) * 100) / 100;
const totalRetiradas = Math.trunc(calculateTotalRetiradas(movimentacoes) * 100) / 100;
const totalEsperado = Math.trunc(calculateFinalBalance(caixaAberto?.valor_inicial || 0, totalVendas, totalRetiradas) * 100) / 100;
  
  const parsedValorFinal = valorFinal !== '' ? parseBrazilianDecimal(valorFinal) : 0;
  const diferenca = Math.trunc((parsedValorFinal - totalEsperado) * 100) / 100;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <StopCircle className="w-5 h-5 text-red-600" />
            Fechamento de Caixa
          </DialogTitle>
          <DialogDescription>
            Confira o resumo financeiro, movimentações e informe o valor final em caixa.
          </DialogDescription>
        </DialogHeader>

        {isLoadingResumo ? (
          <div className="py-8 flex flex-col items-center justify-center text-gray-500 space-y-3">
             <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
             <p>Calculando resumo do caixa...</p>
          </div>
        ) : caixaAberto && resumo ? (
          <div className="space-y-4 py-2">
            <div className="bg-gray-50 p-4 rounded-md text-sm space-y-2 border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">Abertura:</span>
                <span className="font-medium">{formatDate(caixaAberto.data_abertura)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fundo de Troco Inicial:</span>
                <span className="font-medium text-blue-600">{formatCurrency(caixaAberto.valor_inicial)}</span>
              </div>
              
              <hr className="my-2 border-gray-200" />
              
              <div className="font-semibold text-gray-700 mb-1">Receitas (Vendas):</div>
              <div className="flex justify-between">
                <span className="text-gray-600 ml-2">Dinheiro:</span>
                <span>{formatCurrency(resumo.por_forma_pagamento?.dinheiro || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 ml-2">Pix:</span>
                <span>{formatCurrency(resumo.por_forma_pagamento?.pix || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 ml-2">Cartões:</span>
                <span>{formatCurrency((resumo.por_forma_pagamento?.cartao_debito || 0) + (resumo.por_forma_pagamento?.cartao_credito || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 ml-2">Transferência:</span>
                <span>{formatCurrency(resumo.por_forma_pagamento?.transferencia || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 ml-2">Outros / Não Informado:</span>
                <span>{formatCurrency((resumo.por_forma_pagamento?.outros || 0) + (resumo.por_forma_pagamento?.nao_informado || 0))}</span>
              </div>
              <div className="flex justify-between font-medium text-green-700 mt-1">
                <span className="ml-2">Total Recebido:</span>
                <span>+{formatCurrency(totalVendas)}</span>
              </div>

              {totalRetiradas > 0 && (
                <>
                  <hr className="my-2 border-gray-200" />
                  <div className="flex justify-between font-medium text-red-600">
                    <span>Total Retiradas / Sangrias:</span>
                    <span>-{formatCurrency(totalRetiradas)}</span>
                  </div>
                </>
              )}
              
              <hr className="my-2 border-gray-400 border-dashed" />
              
              <div className="flex justify-between font-black text-gray-900 text-base">
                <span>Saldo Esperado em Caixa:</span>
                <span>{formatCurrency(totalEsperado)}</span>
              </div>
            </div>

            {movimentacoes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Histórico de Retiradas</Label>
                <CaixaMovimentacoesHistorico movimentacoes={movimentacoes} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="valorFinal" className={`font-bold ${!isValid ? 'text-red-500' : 'text-[var(--color-primary)]'}`}>
                  Valor Real em Caixa (R$)
                </Label>
                <Input
                  id="valorFinal"
                  type="text"
                  inputMode="decimal"
                  required
                  value={valorFinal}
                  onChange={handleValorChange}
                  placeholder="0,00"
                  className={`font-bold text-lg focus-visible:ring-[var(--color-primary)] ${!isValid ? 'border-red-500 focus-visible:ring-red-500' : 'border-[var(--color-primary)]'}`}
                />
                {!isValid && <p className="text-xs text-red-500">Formato inválido. Use números e vírgula.</p>}
              </div>

              {valorFinal !== '' && isValid && (
                <div className={`p-3 rounded-md text-sm font-bold flex justify-between ${diferenca === 0 ? 'bg-green-100 text-green-800' : diferenca < 0 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  <span>Diferença (Quebra):</span>
                  <span>{formatCurrency(diferenca)}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="observacao">Observação (Opcional)</Label>
                <Textarea
                  id="observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Justifique quebras ou adicione notas de fechamento"
                  rows={2}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>Cancelar</Button>
                <Button type="submit" disabled={isLoading || isLoadingResumo} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white">
                  {isLoading ? 'Fechando...' : 'Confirmar Fechamento'}
                </Button>
              </DialogFooter>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center text-red-500">Erro ao carregar os dados do caixa. Tente fechar e abrir novamente.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}