import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, PackageMinus } from 'lucide-react';

export default function ConfirmInactivateLoteModal({
  isOpen,
  onClose,
  onConfirmInactivate,
  lote,
  isInactivating
}) {
  if (!lote) return null;

  const handleConfirm = () => {
    console.log(`[ConfirmInactivateLoteModal] User confirmed inactivation for lote: ${lote.numero_lote}`);
    onConfirmInactivate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isInactivating && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-full">
              <PackageMinus className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-xl text-amber-600">Inativar Lote</DialogTitle>
          </div>
          <DialogDescription className="pt-3 text-base text-gray-700">
            Tem certeza que deseja inativar o lote <strong>{lote.numero_lote}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 my-2 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 font-medium">Produto:</span>
            <span className="font-semibold text-gray-900">{lote.produto_nome}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 font-medium">Lote Número:</span>
            <span className="font-semibold text-gray-900">{lote.numero_lote}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 font-medium">Quantidade:</span>
            <span className="font-bold text-gray-900">
              {lote.quantidade_atual}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 text-amber-800 p-3 rounded-md text-sm border border-amber-200 mt-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
          <p>
            <strong>Aviso:</strong> Um lote inativo não será contabilizado no estoque e não aparecerá nas opções de venda ou transferência.
          </p>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isInactivating}
            className="w-full sm:w-auto border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isInactivating}
            className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isInactivating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inativando...
              </>
            ) : (
              'Inativar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}