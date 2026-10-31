import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/utils/currencyFormatter';
import { Banknote, QrCode, CreditCard, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function PaymentMethodModal({ isOpen, onClose, method, remainingBalance, onAddPayment }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount(remainingBalance > 0 ? remainingBalance.toString() : '');
      setError('');
    }
  }, [isOpen, remainingBalance]);

  const handleConfirm = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('O valor deve ser maior que zero.');
      return;
    }
    
    if (method !== 'dinheiro' && numAmount > remainingBalance) {
      setError('Para métodos que não são dinheiro, o valor não pode exceder o saldo pendente.');
      return;
    }

    onAddPayment(method, numAmount);
    onClose();
  };

  const getMethodIcon = () => {
    if (method === 'dinheiro') return <Banknote className="w-5 h-5 text-green-600" />;
    if (method === 'pix') return <QrCode className="w-5 h-5 text-[var(--color-primary)]" />;
    return <CreditCard className="w-5 h-5 text-purple-500" />;
  };

  const getMethodName = () => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'pix') return 'Pix';
    if (method === 'cartao_debito') return 'Cartão de Débito';
    if (method === 'cartao_credito') return 'Cartão de Crédito';
    return method;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px] w-[95vw] rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getMethodIcon()}
            Adicionar Pagamento - {getMethodName()}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Informe o valor recebido para este método de pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center border border-gray-100">
            <span className="text-gray-600 font-bold text-sm">Saldo Pendente:</span>
            <span className="text-lg font-black text-gray-900">{formatMoney(remainingBalance)}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount" className="text-sm font-bold text-gray-700">Valor (R$)</Label>
            <Input 
              id="payment-amount"
              type="number" 
              step="0.01" 
              min="0.01"
              value={amount} 
              onChange={(e) => setAmount(e.target.value)}
              className="text-xl font-bold h-12 text-center"
              autoFocus
            />
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {method === 'dinheiro' && parseFloat(amount) > remainingBalance && (
            <div className="bg-green-50 p-3 rounded-lg flex justify-between items-center border border-green-200 text-green-800">
              <span className="font-bold text-sm">Troco Estimado:</span>
              <span className="text-lg font-black">{formatMoney(parseFloat(amount) - remainingBalance)}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleConfirm} className="w-full sm:w-auto bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white">
            Adicionar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}