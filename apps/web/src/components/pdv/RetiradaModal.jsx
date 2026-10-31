import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useCaixaMovimentacoes } from '@/hooks/useCaixaMovimentacoes';
import { useToast } from '@/hooks/use-toast';
import { ArrowDownCircle, AlertTriangle } from 'lucide-react';
import { validateBrazilianDecimal, parseBrazilianDecimal } from '@/utils/formatBrazilianDecimal';
import { formatCurrencyBR, validateRetiradaAmount } from '@/utils/CaixaMovimentacoesService';

export default function RetiradaModal({ isOpen, onClose, caixaAberto, saldoAtual, onSuccess }) {
  const { user } = useAuth();
  const { createRetirada, loading } = useCaixaMovimentacoes();
  const { toast } = useToast();
  
  const [valor, setValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setValor('');
      setObservacao('');
      setIsValid(true);
      setWarning(null);
    }
  }, [isOpen]);

  const handleValorChange = (e) => {
    let val = e.target.value;
    val = val.replace('.', ',');
    
    if (validateBrazilianDecimal(val) || val === '') {
      setValor(val);
      setIsValid(true);
      
      if (val !== '') {
        const parsed = parseBrazilianDecimal(val);
        const validation = validateRetiradaAmount(parsed, saldoAtual);
        setWarning(validation.warning || null);
      } else {
        setWarning(null);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const parsedValor = parseBrazilianDecimal(valor);
    const validation = validateRetiradaAmount(parsedValor, saldoAtual);
    
    if (!validation.valid || valor === '') {
      setIsValid(false);
      toast({
        title: "Valor Inválido",
        description: validation.error || "Informe um valor válido maior que zero.",
        variant: "destructive"
      });
      return;
    }

    const result = await createRetirada(caixaAberto.id, parsedValor, observacao, user.id);
    
    if (result.success) {
      toast({
        title: "Retirada Registrada",
        description: "A retirada de caixa foi registrada com sucesso.",
        className: "bg-green-600 text-white border-none"
      });
      if (onSuccess) onSuccess();
      onClose();
    } else {
      toast({
        title: "Erro ao registrar",
        description: result.error || "Ocorreu um erro ao registrar a retirada.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-red-600">
            <ArrowDownCircle className="w-5 h-5" />
            Nova Retirada de Caixa
          </DialogTitle>
          <DialogDescription>
            Registre uma sangria ou retirada de dinheiro do caixa atual.
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-gray-50 p-3 rounded-md text-sm border border-gray-200 mb-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Saldo Atual Estimado:</span>
            <span className="font-bold text-gray-900">{formatCurrencyBR(saldoAtual)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="valorRetirada" className={!isValid ? "text-red-500" : ""}>Valor da Retirada (R$)</Label>
            <Input
              id="valorRetirada"
              type="text"
              inputMode="decimal"
              required
              value={valor}
              onChange={handleValorChange}
              placeholder="0,00"
              autoFocus
              disabled={loading}
              className={`font-bold text-lg ${!isValid ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {!isValid && <p className="text-xs text-red-500">Formato inválido. Use números e vírgula.</p>}
            {warning && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> {warning}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacaoRetirada">Observação / Motivo</Label>
            <Textarea
              id="observacaoRetirada"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: pagamento do boy, retirada do sócio..."
              rows={3}
              disabled={loading}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !valor} className="bg-red-600 hover:bg-red-700 text-white font-bold">
              {loading ? 'Registrando...' : 'Confirmar Retirada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}