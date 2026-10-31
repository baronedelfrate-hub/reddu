import React from 'react';
import { Button } from '@/components/ui/button';
import { formatUnit } from '@/utils/currencyFormatter';
import { Trash2, ShoppingCart } from 'lucide-react';
import CompactQuantidadeInput from '@/components/pdv-rapido/CompactQuantidadeInput';

// Carrinho do "PDV Pedidos Balcão" — visual inspirado no ListaItemsVenda do
// PDV Rápido, mas sem lote/tipo de item (não existe aqui).
export default function CarrinhoBalcao({ items, onUpdateQuantidade, onRemoveItem, total }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white relative z-10 w-full">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-gray-500" />
            Pedido
          </h2>
          <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">0</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 bg-gray-50/30">
          <ShoppingCart className="w-12 h-12 opacity-30 text-gray-400 mb-3" />
          <p className="font-medium text-gray-500">Nenhum item adicionado</p>
          <p className="text-sm text-gray-400 text-center mt-1 max-w-[200px]">Selecione produtos no catálogo para montar o pedido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative z-10 w-full">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50 flex items-center justify-between">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[var(--color-primary)]" />
          Pedido
        </h2>
        <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary-dark)] px-2 py-0.5 rounded-full text-xs font-bold">
          {items.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 scroll-smooth tablet-scroll bg-white">
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const itemTotal = Number(item.preco) * Number(item.quantidade);
            return (
              <div key={item.id} className="group flex items-center p-3 border border-gray-100 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all bg-white">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-bold text-gray-900 text-xs sm:text-sm truncate" title={item.nome}>
                    {item.nome}
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 rounded border border-emerald-100">
                    {formatUnit(item.preco)}/un
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0 border-l border-gray-100 pl-3">
                  <CompactQuantidadeInput
                    value={item.quantidade}
                    onChange={(novaQtd) => onUpdateQuantidade(item.id, novaQtd)}
                    min={0}
                    max={item.max_quantidade}
                  />
                  <div className="w-20 text-right font-black text-gray-900 text-sm shrink-0">
                    {formatUnit(itemTotal)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0 rounded-lg transition-colors ml-1"
                    onClick={() => onRemoveItem(item.id)}
                    title="Remover Item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-200 px-4 py-3 shrink-0 bg-gray-50 flex items-center justify-between">
        <span className="font-bold text-gray-700 text-sm">Subtotal</span>
        <span className="font-black text-gray-900 text-lg">{formatUnit(total)}</span>
      </div>
    </div>
  );
}
