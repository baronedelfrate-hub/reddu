import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import ProductosGridOperacao from '@/components/operacao-mercados/ProductosGridOperacao';
import LotesOperacao from '@/components/operacao-mercados/LotesOperacao';
import ReabastecerMercadoModal from '@/components/operacao-mercados/ReabastecerMercadoModal';
import RetornoEstoqueModal from '@/components/operacao-mercados/RetornoEstoqueModal';
import ConferenciaLoteModal from '@/components/operacao-mercados/ConferenciaLoteModal';
import TransferenciaLoteModal from '@/components/operacao-mercados/TransferenciaLoteModal';
import RetornoLoteModal from '@/components/operacao-mercados/RetornoLoteModal';
import FinalizarVisitaModal from '@/components/operacao-mercados/FinalizarVisitaModal';
import { useOperacaoMercados } from '@/hooks/useOperacaoMercados';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScanBarcode, Store, ArrowLeft, Package, Flag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SESSION_KEY = 'operacao_mercados_session';

export default function OperacaoMercadosPage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  
  const [mercados, setMercados] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [productsData, setProductsData] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [activeModal, setActiveModal] = useState(null);
  const [activeLote, setActiveLote] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [finalizarModalOpen, setFinalizarModalOpen] = useState(false);

  // CRITICAL: State for ESTOQUE MÓVEL local_id
  const [estoqueMovelId, setEstoqueMovelId] = useState(null);

  // CRITICAL: Audit session state - tracks all operations during market visit
  // STRUCTURE: vendas_data and conferencias_data arrays
  const [auditSessionData, setAuditSessionData] = useState({
    vendas_data: [],
    conferencias_data: [],
    startTime: null,
    endTime: null,
    mercado_id: null,
    usuario_id: null,
    empresa_id: null
  });

  const {
    markProductAuditComplete,
    markProductAuditPartial,
    getProductAuditStatus,
    resetAuditStatus,
    hasAnyAuditedProducts,
    getAuditProgress,
    setTotalProductCount,
  } = useOperacaoMercados();

  // CRITICAL: Debug log initial auditSessionData structure on component mount
  useEffect(() => {
  }, []);

  // CRITICAL: Fetch ESTOQUE MÓVEL local_id on component mount
  useEffect(() => {
    if (!empresaId) return;

    const fetchEstoqueMovel = async () => {
      try {
        const { data, error } = await supabase
          .from('locais')
          .select('id, nome')
          .eq('nome', 'ESTOQUE MÓVEL')
          .eq('empresa_id', empresaId)
          .single();

        if (error) {
          
          if (error.code === 'PGRST116') {
            toast({
              title: 'ESTOQUE MÓVEL não encontrado',
              description: 'Entre em contato com o administrador para criar o local ESTOQUE MÓVEL.',
              variant: 'destructive'
            });
          }
          return;
        }

        setEstoqueMovelId(data?.id || null);
      } catch (err) {
      }
    };

    fetchEstoqueMovel();
  }, [empresaId, toast]);

  // CRITICAL: Fetch markets only (tipo === 'Mercado')
  useEffect(() => {
    if (!empresaId) return;

    const fetchMarkets = async () => {
      try {
        const { data, error } = await supabase
          .from('locais')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'Mercado')
          .order('nome');

        if (error) throw error;

        setMercados(data || []);
      } catch (err) {
        toast({
          title: 'Erro ao carregar mercados',
          description: 'Não foi possível carregar a lista de mercados.',
          variant: 'destructive'
        });
      }
    };

    fetchMarkets();
  }, [empresaId, toast]);

  useEffect(() => {
    if (selectedMarketId && empresaId) {
      const sessionStart = new Date().toISOString();
      
      setAuditSessionData({
        vendas_data: [],
        conferencias_data: [],
        startTime: sessionStart,
        endTime: null,
        mercado_id: selectedMarketId,
        usuario_id: currentUser?.id || null,
        empresa_id: empresaId
      });

      fetchProductsForMarket(selectedMarketId);
      setSelectedProduct(null);
      setSearchFilter('');
      resetAuditStatus();
    } else {
      setProductsData([]);
      setSelectedProduct(null);
      setSearchFilter('');
      resetAuditStatus();
      setTotalProductCount(0);
      
      setAuditSessionData({
        vendas_data: [],
        conferencias_data: [],
        startTime: null,
        endTime: null,
        mercado_id: null,
        usuario_id: null,
        empresa_id: null
      });
    }
  }, [selectedMarketId, empresaId, currentUser, resetAuditStatus]);

  const fetchProductsForMarket = async (marketId) => {
    if (!marketId || !empresaId) {
      setProductsData([]);
      return;
    }

    setLoading(true);
    try {
      const { data: estoqueData, error: estoqueError } = await supabase
        .from('estoque_por_local')
        .select('produto_id, produto_nome, tipo_lote, quantidade_atual')
        .eq('empresa_id', empresaId)
        .eq('local_id', marketId)
        .gt('quantidade_atual', 0);

      if (estoqueError) throw estoqueError;

      const grouped = (estoqueData || []).reduce((acc, row) => {
        if (!acc[row.produto_id]) {
          acc[row.produto_id] = {
            produto_id: row.produto_id,
            produto_nome: row.produto_nome,
            quantidade_total: 0,
            tipo_lote: row.tipo_lote || 'base'
          };
        }
        acc[row.produto_id].quantidade_total += row.quantidade_atual;
        return acc;
      }, {});

      const produtoIds = Object.keys(grouped);

      if (produtoIds.length === 0) {
        setProductsData([]);
        setLoading(false);
        return;
      }

      const { data: produtosData, error: produtosError } = await supabase
        .from('produtos')
        .select('id, barcode, preco_venda, preco_unitario, preco_bandeja, tem_bandeja, categoria, estoque_minimo')
        .in('id', produtoIds);

      if (produtosError) throw produtosError;

      const products = Object.values(grouped).map(p => {
        const detail = (produtosData || []).find(pd => pd.id === p.produto_id);
        return {
          id: p.produto_id,
          nome: p.produto_nome,
          barcode: detail?.barcode,
          preco_venda: detail?.preco_venda,
          preco_unitario: detail?.preco_unitario,
          preco_bandeja: detail?.preco_bandeja,
          tem_bandeja: detail?.tem_bandeja,
          categoria: detail?.categoria,
          estoque_minimo: detail?.estoque_minimo || 0,
          quantidade_total: p.quantidade_total,
          tipo_lote: p.tipo_lote
        };
      }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

      setProductsData(products);
      setTotalProductCount(products.length);

    } catch (err) {
      setProductsData([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * CRITICAL: Callback when a sale is registered
   * Receives complete vendaData from VendaMercadoRapidaModal
   * Adds sale to audit session state with duplicate prevention
   */
  const handleSaleRegistered = useCallback((saleData) => {

    setAuditSessionData(prev => {
      // Ensure vendas_data array exists
      const currentVendas = prev.vendas_data || [];
      
      // CRITICAL: Check for duplicate by ID
      const exists = currentVendas.some(v => v.id === saleData.id);
      if (exists) {
        return prev;
      }

      // CRITICAL: Add to vendas_data array with complete structure
      const updatedVendas = [...currentVendas, {
        id: saleData.id,
        produto_id: saleData.produto_id,
        produto_nome: saleData.produto_nome,
        lote_id: saleData.lote_id,
        mercado_id: saleData.mercado_id,
        usuario_id: saleData.usuario_id,
        quantidade: saleData.quantidade,
        preco_unitario: saleData.preco_unitario,
        valor_unitario: saleData.valor_unitario || saleData.preco_unitario,
        subtotal: saleData.subtotal,
        desconto: saleData.desconto || 0,
        total_final: saleData.total_final,
        forma_pagamento: saleData.forma_pagamento || 'pendente',
        data_movimentacao: saleData.data_movimentacao,
        venda_id: saleData.venda_id,
        cliente_referencia: saleData.cliente_referencia,
        canal_venda: saleData.canal_venda
      }];

      const newAuditSessionData = {
        ...prev,
        vendas_data: updatedVendas
      };


      return newAuditSessionData;
    });
  }, []);

  /**
   * CRITICAL: Callback when a conference is registered
   */
  const handleConferenceRegistered = useCallback((conferenceData) => {

    setAuditSessionData(prev => {
      // Ensure conferencias_data array exists
      const currentConferencias = prev.conferencias_data || [];
      
      const exists = currentConferencias.some(c => c.id === conferenceData.id);
      if (exists) {
        return prev;
      }

      const updatedConferencias = [...currentConferencias, {
        id: conferenceData.id,
        lote_id: conferenceData.lote_id,
        numero_lote: conferenceData.numero_lote,
        produto_id: conferenceData.produto_id,
        produto_nome: conferenceData.produto_nome,
        estoque_esperado: conferenceData.estoque_esperado,
        estoque_contado: conferenceData.estoque_contado,
        quantidade: conferenceData.quantidade || conferenceData.estoque_contado,
        divergencia: conferenceData.divergencia,
        observacao: conferenceData.observacao
      }];

      const newAuditSessionData = {
        ...prev,
        conferencias_data: updatedConferencias
      };


      return newAuditSessionData;
    });
  }, []);

  const filteredProducts = useMemo(() => {
    if (!searchFilter) return productsData;
    const term = searchFilter.toLowerCase();
    return productsData.filter(p => 
      p.nome?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term) ||
      p.barcode?.includes(term)
    );
  }, [productsData, searchFilter]);

  const handleProductClick = (product) => {
    setSelectedProduct(product);
  };

  const handleBackToProducts = () => {
    setSelectedProduct(null);
  };

  const handleActionClick = (actionType, lote) => {
    setActiveLote(lote);
    setActiveModal(actionType);
  };

  const handleActionSuccess = () => {
    setRefreshKey(prev => prev + 1);
    if (selectedMarketId) {
      fetchProductsForMarket(selectedMarketId);
    }
  };

  const handleProductAuditComplete = useCallback((productId, status) => {
    if (status === 'complete') {
      markProductAuditComplete(productId);
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]);
      }
      
      toast({
        title: '✅ Produto Conferido',
        description: 'Todos os lotes deste produto foram auditados.',
        duration: 3000,
      });
    } else if (status === 'partial') {
      markProductAuditPartial(productId);
    }
  }, [markProductAuditComplete, markProductAuditPartial, toast]);

  // Melhoria 1: Persistência de sessão
  useEffect(() => {
    if (auditSessionData.mercado_id) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          auditSessionData,
          selectedMarketId,
          timestamp: new Date().toISOString()
        }));
      } catch {}
    }
  }, [auditSessionData, selectedMarketId]);

  // Melhoria 1: Restaurar sessão ao montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedTime = new Date(parsed.timestamp);
        const now = new Date();
        const hoursElapsed = (now - savedTime) / (1000 * 60 * 60);
        if (hoursElapsed < 8 && parsed.auditSessionData?.mercado_id) {
          setAuditSessionData(parsed.auditSessionData);
          setSelectedMarketId(parsed.selectedMarketId || '');
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {}
  }, []);

  const handleFinalizarVisitaClick = () => {
    const sessionEnd = new Date().toISOString();
    
    
    setAuditSessionData(prev => ({
      ...prev,
      endTime: sessionEnd
    }));
    
    setFinalizarModalOpen(true);
  };

  const handleFinalizarVisitaSuccess = useCallback((result) => {
    setFinalizarModalOpen(false);
    setSelectedMarketId('');
    setSelectedProduct(null);
    setProductsData([]);
    setSearchFilter('');
    setRefreshKey(prev => prev + 1);
    resetAuditStatus();

    setAuditSessionData({
      vendas_data: [],
      conferencias_data: [],
      startTime: null,
      endTime: null,
      mercado_id: null,
      usuario_id: null,
      empresa_id: null
    });

    try { localStorage.removeItem(SESSION_KEY); } catch {}

    if (window.navigator.vibrate) {
      window.navigator.vibrate(100);
    }

    toast({
      title: '✅ Auditoria Concluída com Sucesso',
      description: `${result.lotsUpdated || 0} lotes foram ativados para PDV. A auditoria foi enviada para análise administrativa.`,
      duration: 6000,
    });
  }, [toast, resetAuditStatus]);

  const selectedMarketName = mercados.find(m => m.id === selectedMarketId)?.nome || '';
  const auditProgress = getAuditProgress;

  return (
    <>
      <Helmet>
        <title>Operação de Mercados - Estoque 360</title>
        <meta name="description" content="Gerencie estoque, transferências e auditorias diretamente nos pontos de venda com scanner de código de barras." />
      </Helmet>

      <div className="space-y-6 max-w-7xl mx-auto pb-32">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ScanBarcode className="h-8 w-8 text-blue-600" /> Operação de Mercados
            </h1>
            <p className="text-gray-600 mt-1">Gerencie estoque, transferências e auditorias nos pontos de venda.</p>
          </div>
          
          <div className="w-full sm:w-80 bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
            <Label className="text-xs text-gray-600 font-bold uppercase mb-2 flex items-center gap-1">
              <Store className="h-4 w-4" /> Mercado Ativo
            </Label>
            <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
              <SelectTrigger className="border-gray-300 bg-white font-semibold text-gray-900 h-12">
                <SelectValue placeholder="Selecione o mercado..." />
              </SelectTrigger>
              <SelectContent>
                {mercados.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500 text-center">
                    Nenhum mercado encontrado
                  </div>
                )}
                {mercados.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-medium">{m.nome}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!selectedMarketId && (
          <div className="bg-amber-50 border-2 border-amber-200 p-8 rounded-xl text-center">
            <Store className="h-16 w-16 text-amber-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-amber-900 mb-2">Selecione um Mercado</h3>
            <p className="text-amber-700">Escolha um mercado acima para visualizar os produtos e iniciar as operações.</p>
          </div>
        )}

        {selectedMarketId && !selectedProduct && (
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Produtos Disponíveis</h2>
                  <p className="text-sm text-gray-600">Mercado: <span className="font-semibold text-gray-900">{selectedMarketName}</span></p>
                </div>
              </div>
              
              {auditProgress.total > 0 && (
                <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 font-bold uppercase mb-1">Progresso de Auditoria</p>
                  <p className="text-lg font-bold text-blue-900">
                    {auditProgress.audited} / {auditProgress.total} 
                    <span className="text-sm font-normal text-blue-600 ml-2">({auditProgress.percentage}%)</span>
                  </p>
                </div>
              )}
            </div>

            <ProductosGridOperacao 
              products={filteredProducts}
              onProductClick={handleProductClick}
              searchFilter={searchFilter}
              setSearchFilter={setSearchFilter}
              loading={loading}
              empresaId={empresaId}
              getProductAuditStatus={getProductAuditStatus}
              selectedMarketId={selectedMarketId}
              marketName={selectedMarketName}
              onActionSuccess={handleActionSuccess}
            />
          </div>
        )}

        {selectedMarketId && selectedProduct && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Button 
                onClick={handleBackToProducts} 
                variant="outline" 
                className="flex items-center gap-2 font-semibold"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para Produtos
              </Button>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-gray-500 font-semibold">Produto Selecionado</p>
                  <p className="text-lg font-bold text-gray-900">{selectedProduct.nome}</p>
                </div>
                <Badge className="bg-blue-500 text-white px-3 py-1">
                  {selectedProduct.tipo_lote === 'bandeja' ? 'BANDEJA' : 'UNITÁRIO'}
                </Badge>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border">
              <LotesOperacao 
                key={refreshKey}
                producto={selectedProduct} 
                empresaId={empresaId} 
                selectedMarketId={selectedMarketId}
                mercadoNome={selectedMarketName}
                onActionClick={handleActionClick}
                onProductAuditComplete={handleProductAuditComplete}
                onConferenceRegistered={handleConferenceRegistered}
                onSaleRegistered={handleSaleRegistered}
              />
            </div>
          </div>
        )}

        {selectedMarketId && !selectedProduct && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl z-40 p-4">
            <div className="max-w-7xl mx-auto">
              <Button
                onClick={handleFinalizarVisitaClick}
                disabled={!hasAnyAuditedProducts}
                className={`w-full h-16 text-lg font-bold shadow-lg transition-all ${
                  hasAnyAuditedProducts 
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Flag className="mr-3 h-6 w-6" />
                Finalizar Visita
                {auditProgress.total > 0 && (
                  <span className="ml-3 bg-white/20 px-3 py-1 rounded-full text-sm">
                    ({auditProgress.audited}/{auditProgress.total} produtos conferidos)
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        <ReabastecerMercadoModal 
          isOpen={activeModal === 'reabastecer'} 
          onClose={() => setActiveModal(null)} 
          lote={activeLote} 
          empresaId={empresaId} 
          marketId={selectedMarketId} 
          marketName={selectedMarketName} 
          onSuccess={handleActionSuccess}
          produtoId={selectedProduct?.id}
          estoqueMovelId={estoqueMovelId}
        />
        
        <RetornoEstoqueModal 
          isOpen={activeModal === 'retorno_estoque'} 
          onClose={() => setActiveModal(null)} 
          lote={activeLote} 
          empresaId={empresaId} 
          marketName={selectedMarketName} 
          onSuccess={handleActionSuccess} 
        />
        
        <ConferenciaLoteModal 
          isOpen={activeModal === 'conferencia'} 
          onClose={() => setActiveModal(null)} 
          lote={activeLote} 
          empresaId={empresaId} 
          onSuccess={handleActionSuccess}
          onConferenceRegistered={handleConferenceRegistered}
        />
        
        <TransferenciaLoteModal 
          isOpen={activeModal === 'transferencia'} 
          onClose={() => setActiveModal(null)} 
          lote={activeLote} 
          empresaId={empresaId} 
          marketName={selectedMarketName} 
          onSuccess={handleActionSuccess} 
        />
        <RetornoLoteModal 
          isOpen={activeModal === 'devolucao'} 
          onClose={() => setActiveModal(null)} 
          lote={activeLote} 
          empresaId={empresaId} 
          onSuccess={handleActionSuccess} 
        />

        <FinalizarVisitaModal
          isOpen={finalizarModalOpen}
          onClose={() => setFinalizarModalOpen(false)}
          mercadoId={selectedMarketId}
          mercadoNome={selectedMarketName}
          empresaId={empresaId}
          auditSessionData={auditSessionData}
          onSuccess={handleFinalizarVisitaSuccess}
        />
      </div>
    </>
  );
}