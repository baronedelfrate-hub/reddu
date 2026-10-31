import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatUnit } from '@/utils/currencyFormatter';
import { PackageOpen, Loader2, Search, ImageOff } from 'lucide-react';

function ProdutoThumb({ url, nome }) {
  const [errorLoading, setErrorLoading] = useState(false);
  if (!url || errorLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <ImageOff className="w-5 h-5 text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={nome}
      className="w-full h-full object-cover object-center"
      loading="lazy"
      onError={() => setErrorLoading(true)}
    />
  );
}

// Grade de produtos do "PDV Pedidos Balcão". Propositalmente mais simples que
// o GridProdutos do PDV Rápido: aqui não existe seleção de lote (a
// rpc_criar_pedido_cardapio resolve o lote sozinha, por FEFO) nem tipo de
// item (BRINDE/PERDA) — é só clicar pra adicionar 1 unidade ao carrinho.
export default function GridProdutosBalcao({ produtos, isLoading, onAddToCart }) {
  const [searchTerm, setSearchTerm] = useState('');

  const produtosValidados = produtos || [];
  const produtosFiltrados = produtosValidados.filter((p) =>
    !searchTerm.trim() || p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px] flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm font-medium text-gray-500">Carregando produtos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3 px-2 mt-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar produto..."
            className="pl-9 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {produtosValidados.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-gray-400 bg-gray-50/50 m-2 border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <PackageOpen className="w-12 h-12 mb-3 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-600 mb-1">Nenhum produto disponível</h3>
          <p className="text-sm text-gray-500 max-w-sm mt-1">
            O local selecionado não possui produtos com lotes liberados e com saldo positivo.
          </p>
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-gray-400 bg-gray-50/50 m-2 border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <Search className="w-12 h-12 mb-3 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-600 mb-1">Nenhum produto encontrado</h3>
          <p className="text-sm text-gray-500 max-w-sm mt-1">Não encontramos nenhum produto com o termo "{searchTerm}".</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 bg-gray-50/30 tablet-scroll scroll-smooth min-h-[200px]">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {produtosFiltrados.map((produto) => {
              const isOutOfStock = produto.total_estoque <= 0;
              const minimo = produto.estoque_minimo || 0;
              let stockBadgeClass = 'bg-green-100 text-green-800';
              if (isOutOfStock) {
                stockBadgeClass = 'bg-gray-200 text-gray-500';
              } else if (minimo > 0 && produto.total_estoque <= minimo) {
                stockBadgeClass = 'bg-red-100 text-red-700';
              } else if (minimo > 0 && produto.total_estoque <= minimo * 2) {
                stockBadgeClass = 'bg-amber-100 text-amber-700';
              }

              return (
                <Button
                  key={produto.id}
                  type="button"
                  variant="outline"
                  disabled={isOutOfStock}
                  className={`h-auto min-h-[80px] flex flex-col items-start justify-between p-0 transition-all duration-150 rounded-lg whitespace-normal relative overflow-hidden ${
                    isOutOfStock
                      ? 'opacity-60 bg-gray-50 cursor-not-allowed border-gray-200'
                      : 'bg-white hover:bg-[var(--color-primary-light)]/10 border-gray-200 hover:border-[var(--color-primary-light)] shadow-sm hover:shadow active:scale-[0.98]'
                  }`}
                  onClick={() => onAddToCart(produto)}
                >
                  <div className="w-full h-20 bg-gray-100 overflow-hidden pointer-events-none">
                    <ProdutoThumb url={produto.imagem_url} nome={produto.nome} />
                  </div>
                  <div className="w-full text-left pointer-events-none px-2 pt-1.5 mb-1">
                    <h4 className="font-bold text-gray-800 text-[11px] leading-tight line-clamp-2">{produto.nome}</h4>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Estoque: <span className="font-semibold">{produto.total_estoque}</span>
                    </p>
                  </div>
                  <div className="w-full text-left mt-auto flex items-center justify-between pointer-events-none px-2 pb-2">
                    <span className={`inline-block font-black text-xs px-1.5 py-0.5 rounded ${stockBadgeClass}`}>
                      {formatUnit(produto.preco)}
                    </span>
                    {isOutOfStock && <span className="text-[9px] text-red-500 font-bold">Indisponível</span>}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
