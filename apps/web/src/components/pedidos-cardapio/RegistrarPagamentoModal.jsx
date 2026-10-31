import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUnit } from '@/utils/currencyFormatter';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wallet, Banknote, QrCode, CreditCard, X } from 'lucide-react';
import PaymentMethodModal from '@/components/pdv-rapido/PaymentMethodModal';
import CPFNaNotaInput from '@/components/fiscal/CPFNaNotaInput';
import { pagamentoCardapioService } from '@/services/pagamentoCardapioService';

const METODO_LABEL = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_debito: 'Débito', cartao_credito: 'Crédito' };

// "Registrar pagamento" no próprio card do pedido — igual ao que o Anota AI
// mostra no quadro de pedidos (balcão). Serve pra baixar um pagamento que
// ficou "pra pagar na entrega/retirada" (pedido.vendas.financeiro_baixado ===
// false). Reaproveita o mesmo PaymentMethodModal/CPFNaNotaInput e a mesma
// matemática de payments do FormaEntregaModal, só que aqui o total já é
// fixo (pedido.total) — nenhum recálculo de venda, só grava metadado através
// do pagamentoCardapioService (mesmo serviço usado na criação do pedido).
export default function RegistrarPagamentoModal({ isOpen, onClose, pedido, onSuccess }) {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('dinheiro');
  const [cpfCliente, setCpfCliente] = useState('');
  const [isCpfValid, setIsCpfValid] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPayments([]);
    setCpfCliente(pedido?.vendas?.cpf_cliente || '');
    setIsCpfValid(true);
  }, [isOpen, pedido]);

  const total = Number(pedido?.total || 0);
  const totalPago = useMemo(() => payments.reduce((s, p) => s + Number(p.value || 0), 0), [payments]);
  const saldoPendente = Math.max(0, total - totalPago);
  const trocoCalculado = Math.max(0, totalPago - total);
  const pagamentoCompleto = total <= 0 || totalPago >= total - 0.01;

  const handleAddPayment = (method, value) => {
    setPayments((prev) => [...prev, { method, value: Number(value) }]);
  };
  const handleRemovePayment = (idx) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleOpenPaymentModal = (method) => {
    if (saldoPendente <= 0) {
      toast({ title: 'Pagamento completo', description: 'O valor total já foi atingido.' });
      return;
    }
    setSelectedMethod(method);
    setPaymentModalOpen(true);
  };

  const handleConfirmar = async () => {
    if (!isCpfValid) {
      toast({ title: 'CPF/CNPJ inválido', description: 'Corrija o documento na nota ou deixe em branco.', variant: 'destructive' });
      return;
    }
    if (!pagamentoCompleto) {
      toast({ title: 'Pagamento incompleto', description: `Falta ${formatUnit(saldoPendente)} para completar o total.`, variant: 'destructive' });
      return;
    }
    if (!pedido?.venda_id) {
      toast({ title: 'Pedido sem venda vinculada', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      const resultado = await pagamentoCardapioService.registrarPagamento(pedido.venda_id, {
        payments,
        cpfCliente: cpfCliente || null,
        financeiroBaixado: true,
      });
      toast({ title: 'Pagamento registrado', description: `Pedido #${pedido.numero_pedido} marcado como pago.`, className: 'bg-emerald-600 text-white border-none' });
      onSuccess?.(resultado.forma_pagamento);
      onClose();
    } catch (error) {
      toast({ title: 'Erro ao registrar pagamento', description: error.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !salvando && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Registrar pagamento — Pedido #{pedido?.numero_pedido}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          <span className="font-bold text-gray-700 text-sm">Total do pedido</span>
          <span className="font-black text-gray-900 text-lg">{formatUnit(total)}</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Button type="button" variant="outline" disabled={saldoPendente <= 0}
            className="h-12 flex flex-col gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 disabled:opacity-50"
            onClick={() => handleOpenPaymentModal('dinheiro')}>
            <Banknote className="w-4 h-4" /><span className="font-bold text-[10px]">Dinheiro</span>
          </Button>
          <Button type="button" variant="outline" disabled={saldoPendente <= 0}
            className="h-12 flex flex-col gap-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 disabled:opacity-50"
            onClick={() => handleOpenPaymentModal('pix')}>
            <QrCode className="w-4 h-4" /><span className="font-bold text-[10px]">Pix</span>
          </Button>
          <Button type="button" variant="outline" disabled={saldoPendente <= 0}
            className="h-12 flex flex-col gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-50"
            onClick={() => handleOpenPaymentModal('cartao_debito')}>
            <CreditCard className="w-4 h-4" /><span className="font-bold text-[10px]">Débito</span>
          </Button>
          <Button type="button" variant="outline" disabled={saldoPendente <= 0}
            className="h-12 flex flex-col gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-50"
            onClick={() => handleOpenPaymentModal('cartao_credito')}>
            <CreditCard className="w-4 h-4" /><span className="font-bold text-[10px]">Crédito</span>
          </Button>
        </div>

        {payments.length > 0 && (
          <div className="space-y-1.5">
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200">
                <span className="text-sm font-semibold text-gray-700">{METODO_LABEL[p.method] || p.method}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-gray-900">{formatUnit(p.value)}</span>
                  <button type="button" onClick={() => handleRemovePayment(idx)} className="text-red-400 hover:text-red-600 bg-red-50 p-1 rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between text-sm font-bold">
          <span className="text-gray-500">{saldoPendente > 0 ? 'Falta pagar' : 'Troco'}</span>
          <span className={saldoPendente > 0 ? 'text-red-600' : 'text-emerald-600'}>
            {formatUnit(saldoPendente > 0 ? saldoPendente : trocoCalculado)}
          </span>
        </div>

        <CPFNaNotaInput value={cpfCliente} onChange={setCpfCliente} onValidationChange={setIsCpfValid} />

        <PaymentMethodModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          method={selectedMethod}
          remainingBalance={saldoPendente}
          onAddPayment={handleAddPayment}
        />

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={salvando}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
