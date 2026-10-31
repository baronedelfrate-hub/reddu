import React from 'react';
import { Button } from '@/components/ui/button';
import { formatUnit, formatMoney } from '@/utils/currencyFormatter';
import { Trash2, ShoppingCart } from 'lucide-react';
import CompactQuantidadeInput from './CompactQuantidadeInput';

export default function ListaItemsVenda({ items, produtos, onUpdateQuantidade, onUpdateItemLote, onRemoveItem, total }) {

  if (!items || !Array.isArray(items) || items.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white relative z-10 w-full">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-gray-500" />
            Itens na Venda
          </h2>
          <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">0</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 bg-gray-50/30">
          <ShoppingCart className="w-12 h-12 opacity-30 text-gray-400 mb-3" />
          <p className="font-medium text-gray-500">Nenhum item adicionado</p>
          <p className="text-sm text-gray-400 text-center mt-1 max-w-[200px]">Selecione produtos no catálogo para iniciar a venda.</p>
        </div>
      </div>
    );
  }

  const getTypeColor = (tipo_item) => {
    if (tipo_item === 'BRINDE') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (tipo_item === 'PERDA') return 'bg-red-50 text-red-700 border-red-100';
    return 'bg-blue-50 text-blue-700 border-blue-100';
  };

  return (
    <div className="flex flex-col h-full bg-white relative z-10 w-full">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50 flex items-center justify-between">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[var(--color-primary)]" />
          Itens na Venda
        </h2>
        <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary-dark)] px-2 py-0.5 rounded-full text-xs font-bold">
          {items.length}
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 py-2 scroll-smooth tablet-scroll bg-white">
        <div className="flex flex-col gap-2">
          {items.map((item, index) => {
            const displayName = item.produto_nome || item.nome || 'Produto';
            // CRITICAL: Use full precision - no rounding
            const price = item.tipo_item === 'NORMAL' ? Number(item.preco) : 0;
            const quantity = parseFloat(item.quantidade) || 1;
            // Calculate item total with full precision - NO rounding for display
            const itemTotal = price * quantity;
            const key = item.id || `item-${index}`;

            const itemProduct = produtos?.find(p => p.id === item.produto_id);
            const availableLotes = itemProduct?.lotes || [];

            return (
              <div key={key} className="group flex items-center p-3 border border-gray-100 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all bg-white">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-bold text-gray-900 text-xs sm:text-sm truncate" title={displayName}>
                    {displayName}
                  </div>
                  
                  <div className="flex flex-col gap-1.5 mt-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 rounded border border-emerald-100">
                        {formatUnit(price)}/un
                      </span>
                      {item.tipo_item !== 'NORMAL' && (
                        <span className={`text-[10px] border px-1.5 py-0.5 rounded flex items-center whitespace-nowrap font-bold uppercase tracking-wide ${getTypeColor(item.tipo_item)}`}>
                          {item.tipo_item}
                        </span>
                      )}
                    </div>

                    {availableLotes.length > 1 && onUpdateItemLote ? (
                      <select 
                        className="text-[11px] bg-gray-50 border border-gray-200 rounded p-1 max-w-full text-gray-700 focus:ring-1 focus:ring-[var(--color-primary)] outline-none truncate shadow-sm cursor-pointer"
                        value={item.lote_id}
                        onChange={(e) => onUpdateItemLote(item.id, e.target.value, produtos)}
                      >
                        {availableLotes.map(l => (
                          <option key={l.id} value={l.id}>
                            Lote: {l.numero_lote} (Disp: {l.quantidade_disponivel})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                          Lote: {item.numero_lote}
                        </span>
                        <span className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                          Val: {item.data_validade ? new Date(item.data_validade).toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0 border-l border-gray-100 pl-3">
                  <div className="flex flex-col items-center gap-1">
                    <CompactQuantidadeInput 
                      value={quantity} 
                      onChange={(newQty) => {
                        if (newQty !== quantity && onUpdateQuantidade) {
                          onUpdateQuantidade(item.id, newQty);
                        }
                      }} 
                      min={0.0001}
                      max={item.max_quantidade} 
                    />
                    <span className="text-[10px] text-gray-400 font-medium">Máx: {item.max_quantidade}</span>
                  </div>
                  
                  <div className="w-20 text-right font-black text-gray-900 text-sm shrink-0">
                    {formatUnit(itemTotal)}
                  </div>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0 rounded-lg transition-colors ml-1"
                    onClick={() => { if (onRemoveItem) onRemoveItem(item.id); }}
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
    </div>
  );
}