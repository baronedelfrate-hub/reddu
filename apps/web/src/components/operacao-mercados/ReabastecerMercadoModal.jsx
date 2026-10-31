import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowDownToLine, Package } from 'lucide-react';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function ReabastecerMercadoModal({ 
  isOpen, 
  onClose, 
  lote, 
  empresaId, 
  marketId, 
  marketName, 
  onSuccess,
  produtoId,
  estoqueMovelId 
}) {
  console.log('[ReabastecerMercadoModal] Component render - Received props:', {
    isOpen,
    lote: lote ? { id: lote.lote_id, numero: lote.numero_lote, local_id: lote.local_id } : null,
    empresaId,
    marketId,
    marketName,
    produtoId,
    estoqueMovelId,
    timestamp: new Date().toISOString()
  });

  const [quantidade, setQuantidade] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableLotes, setAvailableLotes] = useState([]);
  const [selectedLoteId, setSelectedLoteId] = useState(null);
  const [isLoadingLotes, setIsLoadingLotes] = useState(false);
  const { toast } = useToast();

  // CRITICAL: Fetch all lots from ESTOQUE MÓVEL (both UNITARIO and BANDEJA)
  useEffect(() => {
    console.log('[ReabastecerMercadoModal] useEffect triggered with dependencies:', {
      isOpen,
      produtoId,
      estoqueMovelId,
      timestamp: new Date().toISOString()
    });

    if (isOpen && produtoId && estoqueMovelId) {
      console.log('[ReabastecerMercadoModal] ✅ All conditions met - calling fetchAvailableLotes');
      console.log('[ReabastecerMercadoModal] Modal opened');
      fetchAvailableLotes();
    } else {
      console.warn('[ReabastecerMercadoModal] ⚠️ useEffect conditions NOT met:', {
        isOpen,
        produtoId: !!produtoId,
        estoqueMovelId: !!estoqueMovelId
      });
    }
  }, [isOpen, produtoId, estoqueMovelId]);

  const fetchAvailableLotes = async () => {
    console.log('[ReabastecerMercadoModal] ========== START fetchAvailableLotes ==========');
    console.log('[ReabastecerMercadoModal] Fetching lotes from ESTOQUE MÓVEL');
    console.log('[ReabastecerMercadoModal] Query parameters:', {
      empresaId,
      estoqueMovelId,
      produtoId,
      timestamp: new Date().toISOString()
    });
    console.log('[ReabastecerMercadoModal] Fetching all lotes from ESTOQUE MÓVEL (UNITARIO + BANDEJA)');
    
    console.log('[ReabastecerMercadoModal] Setting isLoadingLotes to: true');
    setIsLoadingLotes(true);
    
    try {
      console.log('[ReabastecerMercadoModal] Executing Supabase query...');
      console.log('[ReabastecerMercadoModal] Query: supabase.from("lotes").select("*").eq("empresa_id", empresaId).eq("local_id", estoqueMovelId).eq("produto_id", produtoId).gt("quantidade", 0)');
      
      // CRITICAL: Remove tipo_lote filter - fetch ALL lots for this product
      const { data, error } = await supabase
        .from('lotes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('local_id', estoqueMovelId)
        .eq('produto_id', produtoId)
        .gt('quantidade', 0)
        .order('numero_lote');

      console.log('[ReabastecerMercadoModal] Supabase query completed');

      if (error) {
        console.error('[ReabastecerMercadoModal] ❌ Supabase query error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          timestamp: new Date().toISOString()
        });
        throw error;
      }

      console.log('[ReabastecerMercadoModal] ✅ Supabase query successful');
      console.log('[ReabastecerMercadoModal] Received', data?.length || 0, 'lotes (UNITARIO + BANDEJA)');
      console.log('[ReabastecerMercadoModal] Found', data?.length || 0, 'lotes in ESTOQUE MÓVEL (UNITARIO + BANDEJA)');
      
      if (data && data.length > 0) {
        console.log('[ReabastecerMercadoModal] Lotes data sample (first 3):');
        console.table(data.slice(0, 3).map(l => ({
          ID: l.id,
          'Número Lote': l.numero_lote,
          'Tipo': l.tipo_lote || 'NULL',
          'Quantidade': l.quantidade,
          'Validade': l.data_validade,
          'Local ID': l.local_id
        })));
      } else {
        console.warn('[ReabastecerMercadoModal] ⚠️ No lotes found in query result');
      }

      // CRITICAL: Normalize tipo_lote - default to 'base' (Unitário) if null/undefined
      console.log('[ReabastecerMercadoModal] Normalizing lotes data...');
      const normalizedLotes = (data || []).map((l, index) => {
        const tipoLote = l.tipo_lote || 'base';
        
        console.log(`[ReabastecerMercadoModal] Lote ${index + 1}/${data?.length || 0}:`, {
          id: l.id,
          numero_lote: l.numero_lote,
          tipo_lote_original: l.tipo_lote,
          tipo_lote_normalized: tipoLote,
          quantidade: l.quantidade,
          data_validade: l.data_validade,
          timestamp: new Date().toISOString()
        });
        
        console.log('[ReabastecerMercadoModal] Lote', l.id, 'type:', tipoLote);
        
        return {
          ...l,
          tipo_lote: tipoLote
        };
      });

      console.log('[ReabastecerMercadoModal] Normalization complete. Total lotes:', normalizedLotes.length);
      console.log('[ReabastecerMercadoModal] Setting availableLotes state with', normalizedLotes.length, 'lotes');
      setAvailableLotes(normalizedLotes);
      console.log('[ReabastecerMercadoModal] availableLotes state updated');

      // Auto-select the lote if passed as prop
      if (lote?.lote_id) {
        console.log('[ReabastecerMercadoModal] Auto-selecting lote from prop:', lote.lote_id);
        setSelectedLoteId(lote.lote_id);
        console.log('[ReabastecerMercadoModal] selectedLoteId updated to:', lote.lote_id);
      } else if (normalizedLotes.length > 0) {
        console.log('[ReabastecerMercadoModal] Auto-selecting first lote:', normalizedLotes[0].id);
        setSelectedLoteId(normalizedLotes[0].id);
        console.log('[ReabastecerMercadoModal] selectedLoteId updated to:', normalizedLotes[0].id);
      } else {
        console.log('[ReabastecerMercadoModal] No lotes to auto-select');
      }

    } catch (err) {
      console.error('[ReabastecerMercadoModal] ❌ Error loading lotes:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      toast({
        title: 'Erro ao carregar lotes',
        description: err.message || 'Não foi possível carregar os lotes disponíveis.',
        variant: 'destructive'
      });
    } finally {
      console.log('[ReabastecerMercadoModal] Setting isLoadingLotes to: false');
      setIsLoadingLotes(false);
      console.log('[ReabastecerMercadoModal] ========== END fetchAvailableLotes ==========');
    }
  };

  const selectedLote = availableLotes.find(l => l.id === selectedLoteId);

  console.log('[ReabastecerMercadoModal] Current component state:', {
    isLoadingLotes,
    availableLotesCount: availableLotes.length,
    selectedLoteId,
    selectedLote: selectedLote ? { id: selectedLote.id, numero: selectedLote.numero_lote, tipo: selectedLote.tipo_lote } : null,
    timestamp: new Date().toISOString()
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('[ReabastecerMercadoModal] handleSubmit called');
    console.log('[ReabastecerMercadoModal] Submit data:', {
      selectedLote: selectedLote ? { id: selectedLote.id, numero: selectedLote.numero_lote } : null,
      quantidade,
      timestamp: new Date().toISOString()
    });
    
    if (!selectedLote) {
      console.warn('[ReabastecerMercadoModal] ⚠️ No lote selected');
      toast({ 
        title: 'Lote não selecionado', 
        description: 'Selecione um lote para transferir.', 
        variant: 'destructive' 
      });
      return;
    }

    const qtd = parseInt(quantidade, 10);

    // Validação de negócio
    if (isNaN(qtd) || qtd <= 0) {
      console.warn('[ReabastecerMercadoModal] ⚠️ Invalid quantity:', qtd);
      toast({ 
        title: 'Quantidade inválida', 
        description: 'Insira um valor maior que zero.', 
        variant: 'destructive' 
      });
      return;
    }
    
    if (qtd > (selectedLote?.quantidade || 0)) {
      console.warn('[ReabastecerMercadoModal] ⚠️ Insufficient quantity:', {
        requested: qtd,
        available: selectedLote?.quantidade
      });
      toast({ 
        title: 'Estoque insuficiente', 
        description: `Disponível: ${selectedLote?.quantidade}`, 
        variant: 'destructive' 
      });
      return;
    }

    // Validação de Constraint de Movimentação (Preventivo para a RPC)
    const tipoPrevisto = 'transferencia';
    const validacao = validateMovimentacaoData({ tipo: tipoPrevisto, quantidade: qtd });
    if (!validacao.valid) {
      console.error('[ReabastecerMercadoModal] ❌ Validation failed:', validacao.error);
      toast({ 
        title: 'Erro de Validação do Sistema', 
        description: validacao.error, 
        variant: 'destructive' 
      });
      return;
    }

    console.log('[ReabastecerMercadoModal] Transferring lote', selectedLote.id, 'type:', selectedLote.tipo_lote);
    console.log('[ReabastecerMercadoModal] Transfer parameters:', {
      p_empresa_id: empresaId,
      p_lote_id: selectedLote.id,
      p_local_origem_id: estoqueMovelId,
      p_local_destino_id: marketId,
      p_quantidade: qtd,
      p_produto_id: produtoId,
      p_tipo_lote: selectedLote.tipo_lote,
      p_unidades_por_bandeja: selectedLote.unidades_por_bandeja
    });

    console.log('[ReabastecerMercadoModal] Setting isSubmitting to: true');
    setIsSubmitting(true);
    try {
      console.log('[ReabastecerMercadoModal] Calling transferir_estoque_rpc...');
      const { error } = await supabase.rpc('transferir_estoque_rpc', {
        p_empresa_id: empresaId,
        p_lote_id: selectedLote.id,
        p_local_origem_id: estoqueMovelId,
        p_local_destino_id: marketId,
        p_quantidade: qtd,
        p_produto_id: produtoId,
        p_tipo_lote: selectedLote.tipo_lote,
        p_unidades_por_bandeja: selectedLote.unidades_por_bandeja
      });

      if (error) {
        console.error('[ReabastecerMercadoModal] ❌ RPC error:', error);
        throw error;
      }

      console.log('[ReabastecerMercadoModal] Transfer successful');
      console.log('[ReabastecerMercadoModal] ✅ Transfer completed successfully');

      // Marca essa movimentação como "reabastecimento fora de auditoria" —
      // dá pra rastrear nos relatórios quando o estoque foi entregue sem
      // passar pela Auditoria de Mercado completa (visita com contagem).
      try {
        const { data: movRecente } = await supabase
          .from('movimentacoes')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('lote_id', selectedLote.id)
          .eq('local_destino_id', marketId)
          .eq('tipo', 'transferencia')
          .order('data_movimentacao', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (movRecente?.id) {
          await supabase
            .from('movimentacoes')
            .update({ observacao: 'Reabastecimento rápido — fora de Auditoria de Mercado' })
            .eq('id', movRecente.id);
        }
      } catch (tagErr) {
        console.warn('[ReabastecerMercadoModal] Falha ao marcar observação (não crítico):', tagErr);
      }

      // Vibration feedback on success
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      toast({ 
        title: '✅ Reabastecimento concluído', 
        description: `${qtd} ${selectedLote.tipo_lote === 'bandeja' ? 'bandeja(s)' : 'unidade(s)'} enviada(s) para ${marketName}.`, 
        className: 'bg-green-600 text-white border-none' 
      });
      
      console.log('[ReabastecerMercadoModal] Resetting quantidade');
      setQuantidade('');
      
      if (onSuccess) {
        console.log('[ReabastecerMercadoModal] Calling onSuccess callback');
        onSuccess();
      }
      
      console.log('[ReabastecerMercadoModal] Closing modal');
      onClose();
    } catch (err) {
      console.error('[ReabastecerMercadoModal] Error during transfer:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        timestamp: new Date().toISOString()
      });
      
      // Vibration feedback on error
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      toast({ 
        title: 'Erro', 
        description: err.message || 'Falha ao reabastecer mercado.', 
        variant: 'destructive' 
      });
    } finally {
      console.log('[ReabastecerMercadoModal] Setting isSubmitting to: false');
      setIsSubmitting(false);
    }
  };

  // Helper function to get tipo badge
  const getTipoBadge = (tipoLote) => {
    if (tipoLote === 'bandeja') {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs font-bold">
          Bandeja
        </Badge>
      );
    }
    
    // Default to Unitário for 'base' or null/undefined
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs font-bold">
        Unitário
      </Badge>
    );
  };

  // Safe handler to prevent errors when lote is null
  const maxQtd = selectedLote?.quantidade || 1;

  console.log('[ReabastecerMercadoModal] Rendering modal with:', {
    isOpen,
    isLoadingLotes,
    availableLotesCount: availableLotes.length,
    selectedLote: selectedLote ? { id: selectedLote.id, numero: selectedLote.numero_lote } : null,
    timestamp: new Date().toISOString()
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      console.log('[ReabastecerMercadoModal] Dialog onOpenChange called with:', open);
      if (!open) {
        console.log('[ReabastecerMercadoModal] Closing modal - resetting state');
        setQuantidade('');
        setSelectedLoteId(null);
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ArrowDownToLine className="h-5 w-5 text-blue-600" /> 
            Reabastecer Mercado
          </DialogTitle>
          <DialogDescription>
            Enviando do <span className="font-semibold text-gray-900">ESTOQUE MÓVEL</span> para <span className="font-semibold text-gray-900">{marketName || 'Destino'}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* CRITICAL: Lot Selection with Type Badges */}
          {isLoadingLotes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Carregando lotes...</span>
            </div>
          ) : availableLotes.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                Nenhum lote disponível no ESTOQUE MÓVEL para este produto.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                Produto ID: {produtoId} | Local ID: {estoqueMovelId}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Selecionar Lote <span className="text-red-500">*</span>
              </Label>
              <div className="grid gap-2 max-h-64 overflow-y-auto border rounded-lg p-2">
                {availableLotes.map((lot) => {
                  console.log('[ReabastecerMercadoModal] Rendering lote option:', {
                    id: lot.id,
                    numero: lot.numero_lote,
                    tipo: lot.tipo_lote,
                    selected: selectedLoteId === lot.id
                  });
                  
                  return (
                    <div
                      key={lot.id}
                      onClick={() => {
                        console.log('[ReabastecerMercadoModal] Lote clicked:', lot.id);
                        setSelectedLoteId(lot.id);
                      }}
                      className={`
                        flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all
                        ${selectedLoteId === lot.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-sm text-gray-900">
                            {lot.numero_lote}
                          </span>
                          <span className="text-xs text-gray-500">
                            Validade: {lot.data_validade ? new Date(lot.data_validade).toLocaleDateString('pt-BR') : '-'}
                          </span>
                        </div>
                        {getTipoBadge(lot.tipo_lote)}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-blue-600">
                          {lot.quantidade}
                        </div>
                        <div className="text-xs text-gray-500">
                          {lot.tipo_lote === 'bandeja' ? 'bandejas' : 'unidades'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Input */}
          {selectedLote && (
            <>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Lote Selecionado:</span>
                    <div className="font-mono font-bold text-gray-900 mt-1 flex items-center gap-2">
                      {selectedLote.numero_lote}
                      {getTipoBadge(selectedLote.tipo_lote)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Disponível:</span>
                    <div className="font-bold text-blue-600 text-lg mt-1">
                      {selectedLote.quantidade} {selectedLote.tipo_lote === 'bandeja' ? 'bandejas' : 'unidades'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qtd_reabastecer" className="text-sm font-semibold">
                  Quantidade a Enviar <span className="text-red-500">*</span>
                </Label>
                <Input 
                  id="qtd_reabastecer" 
                  type="number" 
                  inputMode="decimal"
                  min="1" 
                  max={maxQtd}
                  value={quantidade}
                  onChange={(e) => {
                    console.log('[ReabastecerMercadoModal] Quantidade changed to:', e.target.value);
                    setQuantidade(e.target.value);
                  }}
                  className="text-center text-lg font-bold"
                  placeholder="0"
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500">
                  {selectedLote.tipo_lote === 'bandeja' 
                    ? 'Transferir bandejas completas (não quebrar lote)'
                    : 'Transferir unidades individuais'
                  }
                </p>
              </div>
            </>
          )}

          <DialogFooter className="gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => { 
                console.log('[ReabastecerMercadoModal] Cancel button clicked');
                setQuantidade(''); 
                setSelectedLoteId(null);
                onClose(); 
              }} 
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !selectedLote || maxQtd < 1} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferindo...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Confirmar Envio
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}