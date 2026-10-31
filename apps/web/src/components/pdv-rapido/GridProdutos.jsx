import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUnit } from '@/utils/currencyFormatter';
import { formatBandejaPriceForDisplay } from '@/utils/bandejaPriceFormatter';
import { PackageOpen, AlertCircle, Loader2, Search, ImageOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import ItemTypeSelector from '@/components/ItemTypeSelector';
import { buscarProdutoPorBarcode } from '@/utils/buscarProdutoPorBarcode';

// Miniatura do produto com fallback confiável via estado do React
// (em vez de mexer direto no DOM no onError, que pode falhar em casos de borda)
function ProdutoThumb({ url, nome }) {
  const [errorLoading, setErrorLoading] = useState(false);

  useEffect(() => {
    setErrorLoading(false);
  }, [url]);

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

export default function GridProdutos({ produtos, cart, tipoVenda, onAddToCart, isLoading }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductForLot, setSelectedProductForLot] = useState(null);
  const [validatingLoteId, setValidatingLoteId] = useState(null);
  
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pendingLote, setPendingLote] = useState(null);
  const [selectedType, setSelectedType] = useState('NORMAL');

  useEffect(() => {
    console.log(`[GridProdutos] Renderizando. Total de produtos recebidos: ${produtos?.length || 0}. Loading: ${isLoading}`);
  }, [produtos, isLoading]);

  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const searchValue = e.target.value.trim();
      if (!searchValue) return;
      
      console.log('[DEBUG BARCODE] Valor digitado:', searchValue);
      console.log('[DEBUG BARCODE] Buscando no banco...');
      
      try {
        const empresaId = produtos?.[0]?.empresa_id || null;
        const resultado = await buscarProdutoPorBarcode(searchValue, empresaId);
        
        console.log('[DEBUG BARCODE]', resultado);
        
        if (resultado && resultado.id) {
          console.log('[DEBUG BARCODE] Produto encontrado:', resultado);
          
          e.target.value = '';
          setSearchTerm('');
          
          const productWithLots = produtos?.find(p => p.id === resultado.id || p.barcode === searchValue);
          
          if (productWithLots) {
            await handleProductClick(productWithLots);
          } else {
            await handleProductClick({ ...resultado, lotes: [], total_estoque: 0 });
          }
          
          e.target.focus();
        } else {
          console.log('[DEBUG BARCODE] Nenhum barcode encontrado, fallback para texto');
        }
      } catch (error) {
        console.error('[DEBUG BARCODE] Erro ao buscar:', error);
        console.log('[DEBUG BARCODE] Erro na busca, fallback para texto');
      }
    }
  };

  const handleProductClick = async (produto) => {
    if (!produto.lotes || produto.lotes.length === 0) {
      toast({
        title: "Sem lotes disponíveis",
        description: `Este produto não possui estoque em lotes do tipo "${tipoVenda === 'bandeja' ? 'Bandeja' : 'Unitário'}" ativos e liberados.`,
        variant: "destructive"
      });
      return;
    }

    if (produto.lotes.length === 1) {
      await handleSelectLote(produto, produto.lotes[0]);
    } else {
      setSelectedProductForLot(produto);
    }
  };

  const handleSelectLote = async (produto, lote) => {
    const qtyInCart = cart
      ?.filter(item => item.produto_id === produto.id && item.tipo === tipoVenda && item.lote_id === lote.id)
      ?.reduce((sum, item) => sum + item.quantidade, 0) || 0;

    if (qtyInCart >= lote.quantidade_disponivel) {
      toast({
        title: "Estoque insuficiente",
        description: `Máximo disponível no lote ${lote.numero_lote}: ${lote.quantidade_disponivel}`,
        variant: "destructive"
      });
      return;
    }
    
    setValidatingLoteId(lote.id);
    try {
      const { data, error } = await supabase
        .from('lotes')
        .select('id, ativo, quantidade')
        .eq('id', lote.id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data || data.ativo === false) {
        toast({
          title: "Lote Inválido",
          description: "O lote selecionado não existe ou está inativo.",
          variant: "destructive"
        });
        return;
      }
      
      setPendingProduct(produto);
      setPendingLote(lote);
      setSelectedType('NORMAL');
      setShowTypeDialog(true);
      setSelectedProductForLot(null);

    } catch (e) {
      console.error("[GridProdutos] Erro ao validar lote:", e);
      toast({
        title: "Erro de Validação",
        description: "Não foi possível validar o lote. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setValidatingLoteId(null);
    }
  };

  const confirmAddToCart = () => {
    if (typeof onAddToCart === 'function' && pendingProduct && pendingLote) {
      onAddToCart({
        ...pendingProduct,
        tipo_item: selectedType
      }, pendingLote);
    }
    setShowTypeDialog(false);
    setPendingProduct(null);
    setPendingLote(null);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px] flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm font-medium text-gray-500">Carregando produtos e lotes...</p>
      </div>
    );
  }

  const produtosValidados = produtos || [];
  const produtosFiltrados = produtosValidados.filter(p => {
    if (!searchTerm) return true;
    return p.nome.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3 px-2 mt-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar por nome ou bipar código de barras..."
            className="pl-9 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
        </div>
      </div>

      {produtosValidados.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-gray-400 bg-gray-50/50 m-2 border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <PackageOpen className="w-12 h-12 mb-3 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-600 mb-1">Nenhum produto em {tipoVenda === 'bandeja' ? 'Bandeja' : 'Unitário'}</h3>
          <p className="text-sm text-gray-500 max-w-sm mt-1">
            O local selecionado não possui produtos com lotes do tipo <strong className="text-gray-700">{tipoVenda === 'bandeja' ? 'Bandeja' : 'Unitário'}</strong> que estejam liberados e com saldo positivo.
          </p>
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-gray-400 bg-gray-50/50 m-2 border border-dashed border-gray-200 rounded-lg p-6 text-center">
          <Search className="w-12 h-12 mb-3 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-600 mb-1">Nenhum produto encontrado</h3>
          <p className="text-sm text-gray-500 max-w-sm mt-1">
            Não encontramos nenhum produto com o termo "{searchTerm}".
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 bg-gray-50/30 tablet-scroll scroll-smooth min-h-[200px]">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {produtosFiltrados.map((produto) => {
              const isOutOfStock = produto.total_estoque <= 0 || !produto.lotes || produto.lotes.length === 0;

              // Badge de estoque em 3 níveis, usando o Estoque Mínimo cadastrado no produto
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
                  disabled={isOutOfStock || validatingLoteId !== null}
                  className={`h-auto min-h-[80px] flex flex-col items-start justify-between p-0 transition-all duration-150 rounded-lg whitespace-normal relative overflow-hidden ${
                    isOutOfStock 
                      ? 'opacity-60 bg-gray-50 cursor-not-allowed border-gray-200' 
                      : 'bg-white hover:bg-[var(--color-primary-light)]/10 border-gray-200 hover:border-[var(--color-primary-light)] shadow-sm hover:shadow active:scale-[0.98]'
                  }`}
                  onClick={() => handleProductClick(produto)}
                >
                  {produto.lotes?.length === 1 && validatingLoteId === produto.lotes[0].id && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex items-center justify-center">
                       <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
                    </div>
                  )}

                  <div className="w-full h-20 bg-gray-100 overflow-hidden pointer-events-none">
                    <ProdutoThumb url={produto.imagem_url} nome={produto.nome} />
                  </div>

                  <div className="w-full text-left pointer-events-none px-2 pt-1.5 mb-1">
                    <h4 className="font-bold text-gray-800 text-[11px] leading-tight line-clamp-2">
                      {produto.nome}
                    </h4>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Estoque ({tipoVenda === 'bandeja' ? 'Bandejas' : 'Uni'}): <span className="font-semibold">{produto.total_estoque}</span>
                    </p>
                  </div>
                  <div className="w-full text-left mt-auto flex items-center justify-between pointer-events-none px-2 pb-2">
                    <span className={`inline-block font-black text-xs px-1.5 py-0.5 rounded ${stockBadgeClass}`}>
                      {tipoVenda === 'bandeja' 
                        ? formatBandejaPriceForDisplay(produto.preco)
                        : formatUnit(produto.preco)
                      }
                    </span>
                    {isOutOfStock && <span className="text-[9px] text-red-500 font-bold">Indisponível</span>}
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!selectedProductForLot} onOpenChange={(open) => !open && setSelectedProductForLot(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg border-b border-gray-100 pb-2">
              Selecionar Lote - {selectedProductForLot?.nome}
            </DialogTitle>
          </DialogHeader>
          
          {selectedProductForLot?.lotes?.length === 0 && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Nenhum lote liberado ou com saldo para este tipo de produto.</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            {selectedProductForLot?.lotes?.map(lote => {
              const qtyInCart = cart
                ?.filter(item => item.produto_id === selectedProductForLot.id && item.tipo === tipoVenda && item.lote_id === lote.id)
                ?.reduce((sum, item) => sum + item.quantidade, 0) || 0;
              const remaining = lote.quantidade_disponivel - qtyInCart;
              const isDisabled = remaining <= 0 || validatingLoteId !== null;
              const isValidating = validatingLoteId === lote.id;

              return (
                <Button 
                  key={lote.id} 
                  variant="outline" 
                  disabled={isDisabled}
                  className={`w-full justify-between h-auto py-3 relative overflow-hidden ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--color-primary-light)]/10 hover:border-[var(--color-primary-light)]'}`}
                  onClick={() => handleSelectLote(selectedProductForLot, lote)}
                >
                  {isValidating && (
                    <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                       <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-bold text-sm text-gray-900">
                      Lote: {lote.numero_lote}
                      <span className="text-xs font-normal text-gray-500 ml-1">
                        ({lote.tipo_lote === 'bandeja' ? 'Bandeja' : 'Base/Unid'})
                      </span>
                    </span>
                    <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      Validade: {lote.data_validade ? new Date(lote.data_validade).toLocaleDateString('pt-BR') : 'N/A'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`font-black text-xs px-2 py-1 rounded ${isDisabled && !isValidating ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                      Disp: {remaining}
                    </span>
                    {qtyInCart > 0 && (
                      <span className="text-[9px] text-[var(--color-primary)] font-medium mt-1">
                        ({qtyInCart} no carrinho)
                      </span>
                    )}
                  </div>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="sm:max-w-[420px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Opções do Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 border-b border-gray-100">
            <div>
              <p className="font-semibold text-gray-800">{pendingProduct?.nome}</p>
              <p className="text-sm text-gray-500">Lote: {pendingLote?.numero_lote}</p>
            </div>
            <ItemTypeSelector value={selectedType} onChange={setSelectedType} />
            <div className="bg-gray-50 p-3 rounded-md flex justify-between items-center text-sm">
              <span className="font-medium text-gray-600">Valor Unitário:</span>
              <span className="font-bold text-gray-900">
                {selectedType === 'NORMAL' 
                  ? (tipoVenda === 'bandeja'
                      ? formatBandejaPriceForDisplay(pendingProduct?.preco)
                      : formatUnit(pendingProduct?.preco))
                  : formatUnit(0)
                }
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>Cancelar</Button>
            <Button onClick={confirmAddToCart} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white">
              Confirmar Adição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}