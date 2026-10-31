import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, XCircle, Package, Loader2, ShoppingCart, Camera, CheckCircle, ArrowDownToLine } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyFormatter';
import BarcodeScanner from '@/components/operacao-mercados/BarcodeScanner';
import ReabastecerMercadoModal from '@/components/operacao-mercados/ReabastecerMercadoModal';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

export default function ProductosGridOperacao({ 
  products, 
  onProductClick, 
  searchFilter, 
  setSearchFilter,
  loading,
  empresaId,
  getProductAuditStatus,
  selectedMarketId,
  marketName,
  onActionSuccess
}) {

  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isReabastecerModalOpen, setIsReabastecerModalOpen] = useState(false);
  const [estoqueMovelProduct, setEstoqueMovelProduct] = useState(null);
  const [estoqueMovelId, setEstoqueMovelId] = useState(null);
  const [isSearchingEstoqueMovel, setIsSearchingEstoqueMovel] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem('offline_queue') || '[]'); } catch { return []; }
  });
  const { toast } = useToast();

  // Melhoria 5: Monitor online/offline status
  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({ title: '✅ Conexão restaurada', description: 'Sincronizando operações pendentes...', duration: 3000 });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast({ title: '⚠️ Sem conexão', description: 'As operações serão salvas e sincronizadas quando a conexão voltar.', variant: 'destructive', duration: 5000 });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [toast]);

  // CRITICAL: Fetch ESTOQUE MÓVEL local_id when component mounts
  React.useEffect(() => {
    
    if (!empresaId) {
      return;
    }

    const fetchEstoqueMovel = async () => {
      try {
        const { data, error } = await supabase
          .from('locais')
          .select('id, nome')
          .eq('nome', 'ESTOQUE MÓVEL')
          .eq('empresa_id', empresaId)
          .single();

        if (error) {
          return;
        }

        setEstoqueMovelId(data?.id || null);
      } catch (err) {
      }
    };

    fetchEstoqueMovel();
  }, [empresaId]);

  // CRITICAL: Smart search - when product not found in market, search ESTOQUE MÓVEL
  const handleSearchSubmit = async (searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) {
      return;
    }


    // First check if product exists in current market products
    const term = searchTerm.toLowerCase().trim();
    const foundInMarket = products.find(p => 
      p.nome?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase() === term ||
      p.barcode === term
    );

    if (foundInMarket) {
      onProductClick(foundInMarket);
      return;
    }

    // Product not found in market - search ESTOQUE MÓVEL
    
    if (!estoqueMovelId) {
      toast({
        title: 'Produto não encontrado',
        description: 'Este produto não está disponível no mercado.',
        variant: 'destructive'
      });
      return;
    }

    setIsSearchingEstoqueMovel(true);

    try {
      // Search by name or barcode in produtos table
      const { data: productData, error: productError } = await supabase
        .from('produtos')
        .select('*')
        .eq('empresa_id', empresaId)
        .or(`nome.ilike.%${term}%,barcode.eq.${searchTerm}`)
        .limit(1)
        .single();

      if (productError || !productData) {
        toast({
          title: 'Produto não encontrado',
          description: 'Nenhum produto encontrado com este nome ou código de barras.',
          variant: 'destructive'
        });
        setIsSearchingEstoqueMovel(false);
        return;
      }


      // Check if product exists in ESTOQUE MÓVEL
      const { data: loteData, error: loteError } = await supabase
        .from('lotes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('local_id', estoqueMovelId)
        .eq('produto_id', productData.id)
        .gt('quantidade', 0)
        .limit(1);

      if (loteError) {
        toast({
          title: 'Erro ao buscar no estoque',
          description: 'Não foi possível verificar o estoque móvel.',
          variant: 'destructive'
        });
        setIsSearchingEstoqueMovel(false);
        return;
      }

      if (!loteData || loteData.length === 0) {
        toast({
          title: 'Produto não disponível',
          description: 'Este produto não está disponível no estoque móvel para transferência.',
          variant: 'destructive'
        });
        setIsSearchingEstoqueMovel(false);
        return;
      }

      // Prepare product data for ReabastecerMercadoModal
      setEstoqueMovelProduct({
        ...productData,
        lotes: loteData
      });

      // Open transfer modal
      setIsReabastecerModalOpen(true);

      toast({
        title: '📦 Produto encontrado no Estoque Móvel',
        description: `${productData.nome} está disponível para transferência.`,
        duration: 3000
      });

    } catch (err) {
      toast({
        title: 'Erro na busca',
        description: 'Ocorreu um erro ao buscar o produto.',
        variant: 'destructive'
      });
    } finally {
      setIsSearchingEstoqueMovel(false);
    }
  };

  // CRITICAL: Handle Enter key press for smart search
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit(searchFilter);
    }
  };

  // CRITICAL: Handle barcode scan with smart ESTOQUE MÓVEL search
  const handleBarcodeProductFound = async (product) => {
    if (!product) {
      return;
    }

    // Check if product exists in current market
    const foundInMarket = products.find(p => p.id === product.id);

    if (foundInMarket) {
      setSearchFilter(product.barcode || product.nome);
      setIsCameraDialogOpen(false);
      onProductClick(foundInMarket);
      return;
    }

    // Product not in market - check ESTOQUE MÓVEL

    if (!estoqueMovelId) {
      toast({
        title: 'Produto não encontrado',
        description: 'Este produto não está disponível no mercado.',
        variant: 'destructive'
      });
      setIsCameraDialogOpen(false);
      return;
    }

    setIsSearchingEstoqueMovel(true);

    try {
      // Check if product exists in ESTOQUE MÓVEL
      const { data: loteData, error: loteError } = await supabase
        .from('lotes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('local_id', estoqueMovelId)
        .eq('produto_id', product.id)
        .gt('quantidade', 0)
        .limit(1);

      if (loteError) {
        toast({
          title: 'Erro ao buscar no estoque',
          description: 'Não foi possível verificar o estoque móvel.',
          variant: 'destructive'
        });
        setIsSearchingEstoqueMovel(false);
        setIsCameraDialogOpen(false);
        return;
      }

      if (!loteData || loteData.length === 0) {
        toast({
          title: 'Produto não disponível',
          description: 'Este produto não está disponível no estoque móvel para transferência.',
          variant: 'destructive'
        });
        setIsSearchingEstoqueMovel(false);
        setIsCameraDialogOpen(false);
        return;
      }

      // Close camera dialog
      setIsCameraDialogOpen(false);

      // Prepare product data
      setEstoqueMovelProduct({
        ...product,
        lotes: loteData
      });

      // Open transfer modal
      setIsReabastecerModalOpen(true);

      toast({
        title: '📦 Produto encontrado no Estoque Móvel',
        description: `${product.nome} está disponível para transferência.`,
        duration: 3000
      });

    } catch (err) {
      toast({
        title: 'Erro na busca',
        description: 'Ocorreu um erro ao buscar o produto.',
        variant: 'destructive'
      });
      setIsCameraDialogOpen(false);
    } finally {
      setIsSearchingEstoqueMovel(false);
    }
  };

  const getProductPrice = (product) => {
    let price = 0;

    if (product.tipo_lote === 'bandeja') {
      price = product.preco_bandeja ?? 0;
    } else {
      price = product.preco_unitario ?? 0;
    }

    return formatCurrency(price, 2);
  };

  const getAuditStatusBadge = (status) => {
    switch (status) {
      case 'complete':
        return (
          <Badge className="bg-green-50 text-green-700 border-green-300 font-semibold">
            <CheckCircle className="h-3 w-3 mr-1" />
            ✓ Conferido
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-300 font-semibold">
            ⚠ Parcial
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
            ○ Não Conferido
          </Badge>
        );
    }
  };

  const getCardBorderClass = (status) => {
    switch (status) {
      case 'complete':
        return 'border-green-400 border-2 shadow-green-100';
      case 'partial':
        return 'border-amber-400 border-2 shadow-amber-100';
      case 'pending':
      default:
        return 'border-gray-200';
    }
  };

  // CRITICAL: Get tipo_lote badge with proper colors
  const getTipoLoteBadge = (tipoLote) => {
    if (tipoLote === 'bandeja') {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-semibold">
          Bandeja
        </Badge>
      );
    }
    
    // Default to Unitário for 'base' or null/undefined
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-semibold">
        Unitário
      </Badge>
    );
  };

  const handleTransferSuccess = () => {
    setIsReabastecerModalOpen(false);
    setEstoqueMovelProduct(null);
    setSearchFilter('');
    
    if (onActionSuccess) {
      onActionSuccess();
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Buscar por nome ou código de barras (Enter para buscar no estoque)..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-10 pr-10 py-6 text-lg shadow-sm focus-visible:ring-blue-500"
            style={{ fontSize: '16px' }}
            autoComplete="off"
            disabled={isSearchingEstoqueMovel}
          />
          {searchFilter && !isSearchingEstoqueMovel && (
            <button 
              onClick={() => setSearchFilter('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 touch-target"
              aria-label="Limpar busca"
            >
              <XCircle className="h-5 w-5" />
            </button>
          )}
          {isSearchingEstoqueMovel && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-blue-600" />
          )}
        </div>

        <Button
          type="button"
          onClick={() => setIsCameraDialogOpen(true)}
          className="h-auto py-6 px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-2 shrink-0"
          aria-label="Escanear com câmera"
          disabled={isSearchingEstoqueMovel}
        >
          <Camera className="h-6 w-6" />
          <span className="hidden sm:inline">Câmera</span>
        </Button>
      </div>

      {/* Melhoria 2: Category filter */}
      {products.length > 0 && (() => {
        const categories = [...new Set(products.map(p => p.categoria).filter(Boolean))].sort();
        return categories.length > 1 ? (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCategoryFilter('')}
              className={`px-3 py-1 rounded-full text-sm font-semibold border transition-all ${!categoryFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              Todos
            </button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full text-sm font-semibold border transition-all ${categoryFilter === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                {cat}
              </button>
            ))}
          </div>
        ) : null;
      })()}

      {/* Melhoria 5: Offline indicator */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center gap-2">
          <span className="text-amber-600 font-bold">⚠️ Modo Offline</span>
          <span className="text-amber-700 text-sm">As operações serão sincronizadas quando a conexão voltar. {offlineQueue.length > 0 ? `${offlineQueue.length} operação(ões) pendente(s).` : ''}</span>
        </div>
      )}

      {/* Search hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          <strong>💡 Dica:</strong> Digite o nome ou código de barras e pressione <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono">Enter</kbd> para buscar produtos no Estoque Móvel que não estão neste mercado.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 bg-white rounded-lg border shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600 font-medium">Carregando produtos...</span>
        </div>
      )}

      {!loading && products.length === 0 && searchFilter && (
        <div className="text-center py-12 bg-amber-50 rounded-lg border-2 border-dashed border-amber-200">
          <ShoppingCart className="h-16 w-16 text-amber-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhum produto encontrado neste mercado</h3>
          <p className="text-gray-600">Nenhum produto corresponde a <span className="font-mono font-bold text-gray-900">"{searchFilter}"</span></p>
          <div className="mt-4 p-4 bg-white rounded-lg border border-amber-300 inline-block">
            <p className="text-sm text-amber-800 mb-2">
              <ArrowDownToLine className="h-4 w-4 inline mr-1" />
              Pressione <kbd className="px-2 py-1 bg-amber-100 border border-amber-400 rounded text-xs font-mono">Enter</kbd> para buscar no <strong>Estoque Móvel</strong>
            </p>
          </div>
        </div>
      )}

      {!loading && products.length === 0 && !searchFilter && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhum produto disponível</h3>
          <p className="text-gray-600 mb-4">Este mercado não possui produtos em estoque no momento.</p>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 inline-block">
            <p className="text-sm text-blue-800">
              <Search className="h-4 w-4 inline mr-1" />
              Use a barra de busca para transferir produtos do <strong>Estoque Móvel</strong>
            </p>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (() => {
        const displayProducts = categoryFilter
          ? products.filter(p => p.categoria === categoryFilter)
          : products;
        const lowStockCount = displayProducts.filter(p => p.estoque_minimo > 0 && p.quantidade_total <= p.estoque_minimo).length;
        return (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">{displayProducts.length}</span> produto{displayProducts.length !== 1 ? 's' : ''} encontrado{displayProducts.length !== 1 ? 's' : ''}
              {categoryFilter && <span className="ml-2 text-blue-600 font-semibold">• {categoryFilter}</span>}
            </p>
            {lowStockCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full border border-red-300">
                ⚠ {lowStockCount} com estoque baixo
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayProducts.map(product => {
              const auditStatus = getProductAuditStatus ? getProductAuditStatus(product.id) : 'pending';
              const isLowStock = product.estoque_minimo > 0 && product.quantidade_total <= product.estoque_minimo;
              const borderClass = isLowStock && auditStatus === 'pending'
                ? 'border-red-400 border-2 shadow-red-100'
                : getCardBorderClass(auditStatus);
              
              return (
                <Card 
                  key={product.id} 
                  className={`hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group bg-white ${borderClass}`}
                  onClick={() => {
                    onProductClick(product);
                  }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 pr-2">
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">
                          {product.nome}
                        </h3>
                        {product.barcode && (
                          <p className="text-xs font-mono text-gray-500 mt-2 bg-gray-100 px-2 py-1 rounded inline-block">
                            {product.barcode}
                          </p>
                        )}
                      </div>
                      {/* CRITICAL: Show tipo_lote badge */}
                      {getTipoLoteBadge(product.tipo_lote)}
                    </div>

                    {/* Audit Status Badge */}
                    <div className="mb-3">
                      {getAuditStatusBadge(auditStatus)}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wide mb-1">Estoque</p>
                        <p className={`text-xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                          {product.quantidade_total} <span className="text-sm font-normal text-gray-500">un.</span>
                          {isLowStock && <span className="ml-1 text-xs font-bold text-red-500">⚠ BAIXO</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wide mb-1">Preço</p>
                        <p className="text-xl font-bold text-green-600">
                          {getProductPrice(product)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
        );
      })()}

      {/* Camera Scanner Dialog */}
      <Dialog open={isCameraDialogOpen} onOpenChange={setIsCameraDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Camera className="h-6 w-6 text-blue-600" />
              Escanear Código de Barras
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <BarcodeScanner 
              empresaId={empresaId} 
              onProductFound={handleBarcodeProductFound}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* CRITICAL: ReabastecerMercadoModal for ESTOQUE MÓVEL transfers */}
      {estoqueMovelProduct && (
        <ReabastecerMercadoModal
          isOpen={isReabastecerModalOpen}
          onClose={() => {
            setIsReabastecerModalOpen(false);
            setEstoqueMovelProduct(null);
          }}
          lote={null}
          empresaId={empresaId}
          marketId={selectedMarketId}
          marketName={marketName}
          onSuccess={handleTransferSuccess}
          produtoId={estoqueMovelProduct.id}
          estoqueMovelId={estoqueMovelId}
        />
      )}
    </div>
  );
}