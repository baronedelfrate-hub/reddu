import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { formatUnit, formatMoney } from '@/utils/currencyFormatter';
import { Banknote, QrCode, CreditCard, Loader2, X, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import CupomInput from './CupomInput';
import TaxaMotoboy from './TaxaMotoboy';
import ObservacaoInput from './ObservacaoInput';
import PaymentMethodModal from './PaymentMethodModal';
import CPFNaNotaInput, { validateCPF, validateCNPJ, getDocType } from '@/components/fiscal/CPFNaNotaInput';

export default function FinalizacaoRapida({
  cart,
  subtotal: subtotalProp,
  desconto,
  onDescontoChange,
  taxaMotoboy,
  onTaxaChange,
  observacoes,
  onObservacoesChange,
  total: totalProp,
  onFinalize,
  isSubmitting,
  clearCart,
  onSaleSuccess,
  onSaleError,
  payments,
  addPayment,
  removePayment,
  getTotalPaid,
  getRemainingBalance,
  validatePaymentComplete
}) {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');

  // Phase 2: NFC-e CPF state
  const [cpfCliente, setCpfCliente] = useState('');
  const [isCpfValid, setIsCpfValid] = useState(true);

  // CRITICAL FIX: Calculate subtotal excluding BRINDE and PERDA items
  const subtotal = useMemo(() => {
    if (!cart || !Array.isArray(cart) || cart.length === 0) return 0;

    const raw = cart.reduce((sum, item) => {
      if (item.tipo_item !== 'NORMAL') return sum;
      const price = Number(item.preco) || 0;
      const quantity = parseFloat(item.quantidade) || 0;
      const itemTotal = price * quantity;
      // bandeja: Math.round corrige floating point (19.899... → 19.90)
      // unitario: Math.trunc preserva 3 casas (0.999 → 0.99)
      const itemTruncated = item.tipo === 'bandeja'
        ? Math.round(itemTotal * 100) / 100
        : Math.trunc(itemTotal * 100) / 100;
      return sum + itemTruncated;
    }, 0);
    return Math.round(raw * 100) / 100;
  }, [cart]);

  // CRITICAL FIX: Calculate total using corrected subtotal
  const total = useMemo(() => {
    const taxaValue = Number(taxaMotoboy) || 0;
    const descontoValue = Number(desconto) || 0;
    return Math.round((subtotal + taxaValue - descontoValue) * 100) / 100;
  }, [subtotal, taxaMotoboy, desconto]);

  const cartVazio = cart.length === 0;
  const remaining = getRemainingBalance(total);
  const isComplete = validatePaymentComplete(total);
  const totalPaid = getTotalPaid();
  const troco = Math.max(0, totalPaid - total);

  const handleOpenModal = (method) => {
    if (cartVazio) return;
    if (remaining <= 0) {
      toast({ title: "Pagamento Completo", description: "O valor total já foi atingido.", variant: "default" });
      return;
    }

    const itemSemLote = cart.find(item => !item.lote_id);
    if (itemSemLote) {
      toast({
        title: "Lote não selecionado",
        description: `Por favor, selecione um lote para o produto: ${itemSemLote.produto_nome}`,
        variant: "destructive"
      });
      return;
    }

    setSelectedMethod(method);
    setModalOpen(true);
  };

  const handleConfirmSale = async () => {
    if (cartVazio) {
      toast({ title: "Carrinho vazio", variant: "destructive" });
      return;
    }

    if (!isCpfValid) {
      const docType = getDocType(cpfCliente);
      const docLabel = docType === 'cnpj' ? 'CNPJ' : 'CPF';
      toast({ title: `${docLabel} Inválido`, description: `Por favor, corrija o ${docLabel} informado ou deixe em branco.`, variant: "destructive" });
      return;
    }

    // CRITICAL FIX: Validate payment only if total > 0
    if (total > 0 && !isComplete) {
      const missingAmount = remaining;
      toast({
        title: "Pagamento Incompleto",
        description: `Falta pagar ${formatMoney(missingAmount)}. Total: ${formatMoney(total)}, Pago: ${formatMoney(totalPaid)}`,
        variant: "destructive"
      });
      return;
    }

    // Pass cpfCliente explicitly in the onFinalize callback
    const res = await onFinalize({ cpfCliente });

    if (res?.success) {
      // toast shown in PDVRapidoPage.jsx to avoid duplication
      if (clearCart) {
        clearCart();
        setCpfCliente(''); // Clear CPF on success
      }
      if (onSaleSuccess) onSaleSuccess();
    } else {
      toast({ title: "Erro na Venda", description: res?.error || 'Erro desconhecido', variant: "destructive" });
      if (onSaleError) onSaleError(res?.error);
    }
  };

  const getMethodName = (method) => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'pix') return 'Pix';
    if (method === 'cartao_debito') return 'Débito';
    if (method === 'cartao_credito') return 'Crédito';
    return method;
  };

  return (
    <div className="flex flex-col h-full bg-white relative z-10 w-full">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50 flex items-center gap-2">
        <Wallet className="w-4 h-4 text-[var(--color-primary)]" />
        <h2 className="font-bold text-gray-800">Resumo da Venda</h2>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col tablet-scroll">
        <div className="p-4 space-y-4 border-b border-gray-100 bg-white">
          <div className="grid grid-cols-2 gap-4">
            <CupomInput value={desconto} onChange={onDescontoChange} />
            <TaxaMotoboy value={taxaMotoboy} onChange={onTaxaChange} />
          </div>
          <ObservacaoInput value={observacoes} onChange={onObservacoesChange} />

          <div className="pt-2">
            <CPFNaNotaInput
              value={cpfCliente}
              onChange={setCpfCliente}
              onValidationChange={setIsCpfValid}
            />
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-1.5 text-sm font-medium shrink-0">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {desconto > 0 && (
            <div className="flex justify-between text-red-500">
              <span>Desconto</span>
              <span>-{formatMoney(desconto)}</span>
            </div>
          )}
          {taxaMotoboy > 0 && (
            <div className="flex justify-between text-[var(--color-primary)]">
              <span>Entrega</span>
              <span>+{formatMoney(taxaMotoboy)}</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-white shrink-0">
          <div className="grid grid-cols-4 gap-2 mb-5">
            <Button
              disabled={cartVazio || isSubmitting || remaining <= 0}
              className="h-12 flex flex-col gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 disabled:opacity-50"
              onClick={() => handleOpenModal('dinheiro')}
              variant="outline"
            >
              <Banknote className="w-4 h-4" />
              <span className="font-bold text-[10px] tracking-wide">Dinheiro</span>
            </Button>

            <Button
              disabled={cartVazio || isSubmitting || remaining <= 0}
              className="h-12 flex flex-col gap-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 disabled:opacity-50"
              onClick={() => handleOpenModal('pix')}
              variant="outline"
            >
              <QrCode className="w-4 h-4" />
              <span className="font-bold text-[10px] tracking-wide">Pix</span>
            </Button>

            <Button
              disabled={cartVazio || isSubmitting || remaining <= 0}
              className="h-12 flex flex-col gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-50"
              onClick={() => handleOpenModal('cartao_debito')}
              variant="outline"
            >
              <CreditCard className="w-4 h-4" />
              <span className="font-bold text-[10px] tracking-wide">Débito</span>
            </Button>

            <Button
              disabled={cartVazio || isSubmitting || remaining <= 0}
              className="h-12 flex flex-col gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 disabled:opacity-50"
              onClick={() => handleOpenModal('cartao_credito')}
              variant="outline"
            >
              <CreditCard className="w-4 h-4" />
              <span className="font-bold text-[10px] tracking-wide">Crédito</span>
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pagamentos Adicionados</div>
            {payments.length === 0 ? (
              <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 text-center">
                Nenhum pagamento registrado.
              </div>
            ) : (
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      {p.method === 'dinheiro' && <Banknote className="w-4 h-4 text-emerald-600" />}
                      {p.method === 'pix' && <QrCode className="w-4 h-4 text-sky-600" />}
                      {p.method.startsWith('cartao') && <CreditCard className="w-4 h-4 text-violet-600" />}
                      {getMethodName(p.method)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-gray-900">{formatMoney(p.value)}</span>
                      <button
                        onClick={() => removePayment(idx)}
                        disabled={isSubmitting}
                        className="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded-md transition-colors"
                        title="Remover pagamento"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-900 text-white shrink-0 mt-auto border-t border-gray-800">
        <div className="flex justify-between items-end mb-2">
          <span className="text-gray-400 font-bold uppercase tracking-wider text-xs">
            Total
          </span>
          <span className="text-2xl font-black text-white">
            {formatMoney(total)}
          </span>
        </div>

        <div className="flex justify-between items-end mb-4 pb-3 border-b border-gray-700">
          <span className="text-gray-300 font-bold uppercase tracking-wider text-xs">
            Saldo Pendente
          </span>
          <span className={`text-lg font-black ${remaining > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatMoney(remaining)}
          </span>
        </div>

        {troco > 0 && (
          <div className="flex justify-between items-end mb-4 bg-emerald-900/40 p-2 rounded border border-emerald-800/50 text-emerald-400">
            <span className="font-bold uppercase tracking-wider text-xs">Troco a devolver</span>
            <span className="font-black text-xl">{formatMoney(troco)}</span>
          </div>
        )}

        <Button
          className={`w-full h-14 text-base font-bold text-white border-none shadow-lg transition-all ${(!isComplete || cartVazio || isSubmitting || !isCpfValid)
              ? 'bg-gray-600 hover:bg-gray-600 opacity-70 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-600 hover:shadow-emerald-500/25 active:scale-[0.98]'
            }`}
          disabled={isSubmitting || cartVazio || !isComplete || !isCpfValid}
          onClick={handleConfirmSale}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Finalizando...</span>
          ) : (
            "FINALIZAR VENDA"
          )}
        </Button>
      </div>

      <PaymentMethodModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        method={selectedMethod}
        remainingBalance={remaining}
        onAddPayment={addPayment}
      />
    </div>
  );
}