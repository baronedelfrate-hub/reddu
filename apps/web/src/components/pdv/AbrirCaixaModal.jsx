import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useCaixaManagement } from '@/hooks/useCaixaManagement';
import { useToast } from '@/hooks/use-toast';
import { PlayCircle } from 'lucide-react';
import { validateBrazilianDecimal, parseBrazilianDecimal, formatBrazilianDecimal } from '@/utils/formatBrazilianDecimal';

export default function AbrirCaixaModal({ isOpen, onCaixaAberto, onClose }) {
  const { empresaId, user } = useAuth();
  const { abrirCaixa } = useCaixaManagement();
  const { toast } = useToast();
  
  const [valorInicial, setValorInicial] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setValorInicial('');
      setObservacao('');
      setIsValid(true);
    }
  }, [isOpen]);

  const handleValorChange = (e) => {
    let val = e.target.value;
    // Converte ponto para vírgula automaticamente
    val = val.replace('.', ',');
    
    if (validateBrazilianDecimal(val)) {
      setValorInicial(val);
      setIsValid(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const parsedValor = parseBrazilianDecimal(valorInicial);
    
    if (valorInicial === '' || parsedValor < 0 || isNaN(parsedValor)) {
      setIsValid(false);
      toast({
        title: "Valor Inválido",
        description: "O valor inicial deve ser maior ou igual a zero.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const caixa = await abrirCaixa(empresaId, user?.id, parsedValor, observacao);
      
      toast({
        title: "Caixa Aberto",
        description: "O caixa foi aberto com sucesso.",
        className: "bg-green-600 text-white border-none"
      });
      
      if (onCaixaAberto) {
        onCaixaAberto(caixa);
      }
    } catch (error) {
      toast({
        title: "Erro ao abrir caixa",
        description: error.message || "Ocorreu um erro ao tentar abrir o caixa. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open && onClose) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PlayCircle className="w-5 h-5 text-blue-600" />
            Abertura de Caixa
          </DialogTitle>
          <DialogDescription>
            Nenhum caixa aberto encontrado. Informe o valor inicial (troco) para iniciar as vendas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="valorInicial" className={!isValid ? "text-red-500" : ""}>Valor Inicial (R$)</Label>
            <Input
              id="valorInicial"
              type="text"
              inputMode="decimal"
              required
              value={valorInicial}
              onChange={handleValorChange}
              placeholder="0,00"
              autoFocus
              disabled={isLoading}
              className={`font-bold text-lg ${!isValid ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {!isValid && <p className="text-xs text-red-500">Formato inválido. Use números e vírgula.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacao">Observação (Opcional)</Label>
            <Textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Caixa do turno da manhã"
              rows={3}
              disabled={isLoading}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading} className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white font-bold text-md h-11">
              {isLoading ? 'Abrindo Caixa...' : 'Confirmar e Abrir Caixa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}