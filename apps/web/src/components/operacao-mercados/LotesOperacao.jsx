import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, ArrowRightLeft, Trash2, Package, CheckCircle2, ShoppingCart, AlertCircle } from 'lucide-react';
import { formatDateBR } from '@/utils/dateFormatter';
import { useConferenciaRapida } from '@/hooks/useConferenciaRapida';
import VendaMercadoRapidaModal from './VendaMercadoRapidaModal';

export default function LotesOperacao({ 
  producto, 
  empresaId, 
  selectedMarketId, 
  mercadoNome, 
  onActionClick,
  onProductAuditComplete,
  onConferenceRegistered,
  onSaleRegistered
}) {
  const { empresaId: authEmpresaId } = useAuth();
  const [lotes, setLotes] = useState([]);
  const [locaisInfo, setLocaisInfo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vendaModalOpen, setVendaModalOpen] = useState(false);
  const [selectedLoteForVenda, setSelectedLoteForVenda] = useState(null);
  const [highlightedLoteId, setHighlightedLoteId] = useState(null);

  // Timeout reference for 30-second protection
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const effectiveEmpresaId = authEmpresaId || empresaId;

  const {
    isRegistering,
    fetchConferenciasHoje,
    registrarConferencia,
    isConferidoHoje,
  } = useConferenciaRapida(effectiveEmpresaId);

  // Component lifecycle logging
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // CRITICAL: Memoized fetch function to prevent infinite loops
  const fetchEstoqueELocais = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setLoading(true);
    setError(null);

    // 30-second timeout protection
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading) {
        setLoading(false);
        setError('Tempo esgotado ao carregar dados. Tente novamente.');
      }
    }, 30000);

    try {
      // STEP 1: Fetch estoque_por_local (ALL TYPES - UNITARIO + BANDEJA)
      // CRITICAL: NO tipo_lote filter - fetch ALL lotes
      const { data: estoqueData, error: estoqueError } = await supabase
        .from('estoque_por_local')
        .select('*')
        .eq('produto_id', producto.id)
        .eq('empresa_id', effectiveEmpresaId)
        .gt('quantidade_atual', 0)
        .order('local_nome')
        .order('numero_lote');

      if (estoqueError) {
        throw estoqueError;
      }

      // STEP 2: Extract unique lote IDs
      const loteIds = [...new Set((estoqueData || []).map(item => item.lote_id).filter(Boolean))];

      let lotesDataMap = {};
      
      // STEP 3: Fetch lotes data if we have IDs
      if (loteIds.length > 0) {
        const { data: lotesData, error: lotesError } = await supabase
          .from('lotes')
          .select('id, data_validade')
          .in('id', loteIds)
          .eq('ativo', true)
          .eq('lote_devolvido', false);

        if (lotesError) {
          throw lotesError;
        }

        lotesDataMap = (lotesData || []).reduce((acc, lote) => {
          acc[lote.id] = lote.data_validade;
          return acc;
        }, {});
      }

      // STEP 4: Combine estoque with validade data + normalize tipo_lote
      const estoqueWithValidade = (estoqueData || []).map((item) => {
        const tipoLoteNormalized = (item.tipo_lote || 'base').toLowerCase();
        return {
          ...item,
          tipo_lote: tipoLoteNormalized,
          data_validade: lotesDataMap[item.lote_id] || null
        };
      });

      // STEP 5: Fetch locais info
      const { data: locaisData, error: locaisError } = await supabase
        .from('locais')
        .select('id, tipo, nome')
        .eq('empresa_id', effectiveEmpresaId);

      if (locaisError) {
        throw locaisError;
      }

      // STEP 6: Update state only if component is still mounted
      if (isMountedRef.current) {
        setLotes(estoqueWithValidade);
        setLocaisInfo(locaisData || []);
      }

    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Erro ao carregar dados. Tente novamente.');
      }
    } finally {
      // CRITICAL: Always clear timeout and set loading to false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [producto?.id, effectiveEmpresaId, selectedMarketId]);

  // CRITICAL: Effect with correct dependencies to trigger data fetch
  useEffect(() => {
    if (producto?.id && effectiveEmpresaId) {
      fetchEstoqueELocais();
      fetchConferenciasHoje(producto.id);
    } else {
      setLoading(false);
    }
  }, [producto?.id, effectiveEmpresaId, fetchEstoqueELocais, fetchConferenciasHoje]);

  // CRITICAL: Check if all lots are audited/conferenced and notify parent
  useEffect(() => {
    if (!producto?.id || !lotes.length) return;

    const lotesMercado = lotes.filter(l => l.local_id === selectedMarketId);
    
    if (lotesMercado.length === 0) return;

    const allAudited = lotesMercado.every(lote => {
      const conferido = isConferidoHoje(lote.lote_id);
      const esgotado = lote.quantidade_atual === 0;
      return conferido || esgotado;
    });

    if (allAudited && onProductAuditComplete) {
      onProductAuditComplete(producto.id, 'complete');
    }
  }, [lotes, selectedMarketId, producto, isConferidoHoje, onProductAuditComplete]);

  const handleConferenciaRapida = async (lote) => {
    const success = await registrarConferencia(lote, producto);
    
    if (success) {
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }
      
      // Refresh data to check if all audited
      await fetchEstoqueELocais();
    } else {
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
    }
  };

  const handleActionClick = async (actionType, lote) => {
    try {
      await onActionClick(actionType, lote);
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }
      
      // Refresh data after action
      await fetchEstoqueELocais();
    } catch (error) {
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
    }
  };

  const handleVendaClick = (lote) => {
    setSelectedLoteForVenda(lote);
    setVendaModalOpen(true);
  };

  const handleVendaSuccess = async () => {
    if (selectedLoteForVenda) {
      setHighlightedLoteId(selectedLoteForVenda.lote_id);
      setTimeout(() => setHighlightedLoteId(null), 2000);
    }

    await fetchEstoqueELocais();
  };

  // CRITICAL: Loading state rendering
  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="text-sm text-gray-600 font-medium">Carregando dados do produto...</p>
      </div>
    );
  }

  // CRITICAL: Error state rendering
  if (error) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <h3 className="text-lg font-bold text-red-900">Erro ao Carregar Dados</h3>
          </div>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <Button 
            onClick={fetchEstoqueELocais}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  const isMovel = (localId) => {
    const loc = locaisInfo.find(l => l.id === localId);
    if (!loc) return false;
    const t = (loc.tipo || '').toLowerCase();
    const n = (loc.nome || '').toLowerCase();
    
    return t.includes('móvel') || 
           t.includes('movel') || 
           n.includes('móvel') || 
           n.includes('movel') ||
           t === 'veículo' ||
           t === 'veiculo';
  };

  // CRITICAL: Helper function to get tipo_lote badge
  const getTipoLoteBadge = (tipoLote) => {
    const tipo = (tipoLote || 'base').toLowerCase();
    
    if (tipo === 'bandeja') {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs font-bold ml-2">
          Bandeja
        </Badge>
      );
    }
    
    // Default to Unitário for 'base', 'unitario', or any other value
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs font-bold ml-2">
        Unitário
      </Badge>
    );
  };

  const lotesMercado = lotes.filter(l => l.local_id === selectedMarketId);
  const lotesOutros = lotes.filter(l => l.local_id !== selectedMarketId && isMovel(l.local_id));
  
  const tipoLoteMercado = lotesMercado.length > 0 ? lotesMercado[0].tipo_lote : null;
  
  let tipoProduto = 'NORMAL';
  if (tipoLoteMercado === 'bandeja') {
    tipoProduto = 'BANDEJA';
  } else if (tipoLoteMercado === 'base' || tipoLoteMercado === 'unitario') {
    tipoProduto = 'UNITÁRIO';
  } else if (!tipoLoteMercado) {
    tipoProduto = (producto?.tem_bandeja || producto?.categoria?.toLowerCase().includes('bandeja')) ? 'BANDEJA' : 'UNITÁRIO';
  }

  const totalQuantidade = lotesMercado.reduce((sum, l) => sum + (l.quantidade_atual || 0), 0);
  
  const validadesRaw = lotesMercado.map(l => l.data_validade).filter(Boolean);
  const validades = validadesRaw.sort();
  const proximaValidadeRaw = validades.length > 0 ? validades[0] : null;
  const proximaValidade = proximaValidadeRaw ? formatDateBR(proximaValidadeRaw) : '-';
  
  const isValidadeExpired = proximaValidadeRaw ? new Date(proximaValidadeRaw) <= new Date() : false;
  
  let precoToDisplay = 0;
  let precoLabel = 'Preço';
  
  if (tipoLoteMercado === 'bandeja') {
    precoToDisplay = producto?.preco_bandeja ?? 0;
    precoLabel = 'Preço Bandeja';
  } else if (tipoLoteMercado === 'base' || tipoLoteMercado === 'unitario') {
    precoToDisplay = producto?.preco_unitario ?? 0;
    precoLabel = 'Preço Unitário';
  } else {
    if (producto?.tem_bandeja || producto?.categoria?.toLowerCase().includes('bandeja')) {
      precoToDisplay = producto?.preco_bandeja ?? 0;
      precoLabel = 'Preço Bandeja';
    } else {
      precoToDisplay = producto?.preco_unitario ?? producto?.preco_venda ?? 0;
      precoLabel = 'Preço Unitário';
    }
  }
  
  const precoFormatado = precoToDisplay > 0 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoToDisplay)
    : '-';

  const renderTable = (data, isMarket) => {
    return (
      <div className="overflow-x-auto border rounded-lg shadow-sm bg-white mb-6">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Lote</TableHead>
              {!isMarket && <TableHead>Local Atual</TableHead>}
              <TableHead>Qtd Disp.</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isMarket ? 4 : 5} className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">Nenhum lote encontrado neste local</p>
                </TableCell>
              </TableRow>
            ) : data.map((lote, idx) => {
              const validityDate = lote.data_validade;
              const conferidoHoje = isConferidoHoje(lote.lote_id);
              const isHighlighted = highlightedLoteId === lote.lote_id;
              
              let loteValidadeExpired = false;
              let validadeFormatted = '-';
              
              if (validityDate) {
                try {
                  const validityDateObj = new Date(validityDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  loteValidadeExpired = validityDateObj <= today;
                  validadeFormatted = formatDateBR(validityDate);
                } catch (err) {
                  validadeFormatted = '-';
                }
              }
              
              const validadeClass = loteValidadeExpired ? 'text-red-600 font-bold' : 'text-gray-700';
              const rowClass = conferidoHoje 
                ? 'bg-green-100 hover:bg-green-150' 
                : isHighlighted 
                  ? 'bg-blue-100 animate-pulse' 
                  : '';
              
              return (
                <TableRow key={`${lote.lote_id}-${idx}`} className={rowClass}>
                  <TableCell className="font-mono font-medium text-gray-900">
                    <div className="flex items-center flex-wrap gap-2">
                      <span>{lote.numero_lote || '-'}</span>
                      {getTipoLoteBadge(lote.tipo_lote)}
                      {conferidoHoje && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                          ✓ Conferido Hoje
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {!isMarket && <TableCell className="text-gray-600">{lote.local_nome || '-'}</TableCell>}
                  <TableCell className="font-bold text-gray-900">{lote.quantidade_atual ?? 0}</TableCell>
                  <TableCell className={validadeClass}>{validadeFormatted}</TableCell>
                  <TableCell className="text-right p-2">
                    {isMarket ? (
                      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                        <Button
                          variant="outline"
                          className="h-14 sm:h-8 sm:text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold"
                          onClick={() => handleConferenciaRapida(lote)}
                          disabled={conferidoHoje || isRegistering}
                        >
                          {isRegistering ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4" />}
                          <span>Conf. Rápida</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-14 sm:h-8 sm:text-xs text-green-700 border-green-200 hover:bg-green-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold"
                          onClick={() => handleVendaClick({ ...lote, produto_nome: producto?.nome, preco_unitario: producto?.preco_unitario, preco_bandeja: producto?.preco_bandeja })}
                        >
                          <ShoppingCart className="h-5 w-5 sm:h-4 sm:w-4" />
                          <span>Venda</span>
                        </Button>
                        <Button variant="outline" className="h-14 sm:h-8 sm:text-xs text-teal-700 border-teal-200 hover:bg-teal-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold" onClick={() => handleActionClick('conferencia', lote)}>
                          <ClipboardCheck className="h-5 w-5 sm:h-4 sm:w-4" />
                          <span>Auditar</span>
                        </Button>
                        <Button variant="outline" className="h-14 sm:h-8 sm:text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold" onClick={() => handleActionClick('retorno_estoque', lote)}>
                          <ArrowUpFromLine className="h-5 w-5 sm:h-4 sm:w-4" />
                          <span>Retornar</span>
                        </Button>
                        <Button variant="outline" className="h-14 sm:h-8 sm:text-xs text-amber-700 border-amber-200 hover:bg-amber-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold" onClick={() => handleActionClick('transferencia', lote)}>
                          <ArrowRightLeft className="h-5 w-5 sm:h-4 sm:w-4" />
                          <span>Transferir</span>
                        </Button>
                        <Button variant="outline" className="h-14 sm:h-8 sm:text-xs text-rose-700 border-rose-200 hover:bg-rose-50 flex flex-col sm:flex-row items-center justify-center gap-1 px-2 text-xs font-semibold" onClick={() => handleActionClick('devolucao', lote)}>
                          <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
                          <span>Devolver</span>
                        </Button>
                      </div>
                    ) : (
                      <Button className="w-full sm:w-auto h-12 sm:h-8 bg-blue-600 hover:bg-blue-700 text-sm" onClick={() => handleActionClick('reabastecer', lote)}>
                        <ArrowDownToLine className="h-5 w-5 sm:h-4 sm:w-4 mr-2" /> Enviar para Mercado
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {selectedMarketId && (
        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-wrap gap-4 justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-700">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-indigo-600/80 font-bold uppercase tracking-wider">Tipo de Produto</span>
              <span className="text-sm font-bold text-indigo-900">{tipoProduto}</span>
            </div>
          </div>
          <div className="flex flex-col border-l border-indigo-200/50 pl-4">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Quantidade Total</span>
            <span className="text-sm font-bold text-gray-900">{totalQuantidade} unidades</span>
          </div>
          <div className="flex flex-col border-l border-indigo-200/50 pl-4">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Próxima Validade</span>
            <span className={`text-sm font-bold ${isValidadeExpired ? 'text-red-600' : 'text-amber-700'}`}>
              {proximaValidade}
            </span>
          </div>
          <div className="flex flex-col border-l border-indigo-200/50 pl-4">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">{precoLabel}</span>
            <span className="text-sm font-bold text-emerald-700">{precoFormatado}</span>
          </div>
        </div>
      )}

      {selectedMarketId ? (
        <>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Badge className="bg-emerald-500">No Mercado Selecionado</Badge>
            </h3>
            {renderTable(lotesMercado, true)}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Outros Locais (Para Reabastecimento)</Badge>
            </h3>
            {renderTable(lotesOutros, false)}
          </div>
        </>
      ) : (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Estoque Geral</h3>
          {renderTable(lotes, false)}
        </div>
      )}

      <VendaMercadoRapidaModal
        isOpen={vendaModalOpen}
        onClose={() => {
          setVendaModalOpen(false);
          setSelectedLoteForVenda(null);
        }}
        lote={selectedLoteForVenda}
        onSuccess={handleVendaSuccess}
        onSaleRegistered={onSaleRegistered}
      />
    </div>
  );
}