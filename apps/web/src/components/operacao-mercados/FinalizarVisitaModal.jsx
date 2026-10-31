import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useFinalizarVisitaCompleto } from '@/hooks/useFinalizarVisitaCompleto';
import { Loader2, CheckCircle, Flag, Package, DollarSign, ShoppingCart, Clock, FileCheck } from 'lucide-react';
import { formatMoney } from '@/utils/currencyFormatter';

export default function FinalizarVisitaModal({ 
  isOpen, 
  onClose, 
  mercadoId, 
  mercadoNome, 
  empresaId, 
  auditSessionData = null,
  onSuccess 
}) {
  const { toast } = useToast();
  const { loading, finalizarVisita } = useFinalizarVisitaCompleto();
  
  const [observacao, setObservacao] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);

  const MAX_CHARS = 500;
  const remainingChars = MAX_CHARS - observacao.length;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setObservacao('');
      setShowConfirmDialog(false);
      setShowSuccessState(false);
    }
  }, [isOpen]);

  // CRITICAL: Debug - Log auditSessionData when modal opens
  useEffect(() => {
    if (isOpen && auditSessionData) {
      console.log('[FinalizarVisitaModal] useEffect triggered');
      console.log('[FinalizarVisitaModal] auditSessionData:', auditSessionData);
      console.log('[FinalizarVisitaModal] vendas_data count:', auditSessionData?.vendas_data?.length);
      console.log('[FinalizarVisitaModal] conferencias_data count:', auditSessionData?.conferencias_data?.length);
      console.table(auditSessionData);
    }
  }, [isOpen, auditSessionData]);

  // CRITICAL: Calculate totals from auditSessionData with FULL PRECISION
  const sessionTotals = useMemo(() => {
    if (!auditSessionData) {
      return {
        total_vendido: 0,
        total_itens: 0,
        total_itens_conferidos: 0,
        vendas_count: 0,
        conferencias_count: 0
      };
    }

    const { vendas_data = [], conferencias_data = [] } = auditSessionData;

    // Calculate vendas totals with FULL PRECISION (no intermediate rounding)
    const vendas_count = vendas_data.length;
    const total_itens = vendas_data.reduce((sum, v) => sum + (v.quantidade || 0), 0);
    
    // CRITICAL: Sum all total_final values with full precision, round only at the end
    const total_vendido_raw = vendas_data.reduce((sum, v) => {
      const valor = parseFloat(v.total_final || 0);
      return sum + valor;
    }, 0);
    
    // Round to 2 decimals only once at the end using Math.round
    const total_vendido = Math.round(total_vendido_raw * 100) / 100;

    // CRITICAL: Calculate conferências totals - Sum quantidade from each conference record
    const conferencias_count = conferencias_data.length;
    
    const total_itens_conferidos = conferencias_data.reduce((sum, conf) => {
      const qtd = conf.quantidade || conf.estoque_contado || 0;
      return sum + qtd;
    }, 0);

    return {
      total_vendido,
      total_itens,
      total_itens_conferidos,
      vendas_count,
      conferencias_count
    };
  }, [auditSessionData]);

  const hasVendas = sessionTotals.vendas_count > 0;
  const hasConferencias = sessionTotals.conferencias_count > 0;
  const hasData = hasVendas || hasConferencias;

  const handleConfirm = () => {
    setShowConfirmDialog(true);
  };

  const handleFinalSubmit = async () => {
    console.log('[FinalizarVisitaModal] handleFinalize clicked');
    console.log('[FinalizarVisitaModal] auditSessionData in state:', auditSessionData);
    console.log('[FinalizarVisitaModal] vendas_data count:', auditSessionData?.vendas_data?.length);
    console.log('[FinalizarVisitaModal] conferencias_data count:', auditSessionData?.conferencias_data?.length);
    console.log('[FinalizarVisitaModal] Calling finalizarVisita with:', auditSessionData);
    console.table(auditSessionData);
    
    setShowConfirmDialog(false);

    // Prepare complete session data with observations
    const completeSessionData = {
      mercadoId,
      conferenceRecords: auditSessionData?.conferencias_data || [],
      salesRecords: auditSessionData?.vendas_data || [],
      stockData: [],
      generalObservations: observacao,
      startTime: auditSessionData?.startTime || new Date().toISOString(),
      endTime: auditSessionData?.endTime || new Date().toISOString(),
      vendas_data: auditSessionData?.vendas_data || [],
      conferencias_data: auditSessionData?.conferencias_data || []
    };

    const result = await finalizarVisita(completeSessionData);

    if (result.success) {
      // Vibration feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      // Show success state
      setShowSuccessState(true);

      // Wait 2 seconds, then close modal and trigger callback
      setTimeout(() => {
        setShowSuccessState(false);
        onClose();
        
        if (onSuccess) {
          onSuccess(result);
        }
      }, 2000);
    } else {
      // Error vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Flag className="h-6 w-6 text-blue-600" />
              Finalizar Auditoria - Resumo da Sessão
            </DialogTitle>
            <DialogDescription>
              Mercado: <span className="font-bold text-gray-900">{mercadoNome}</span>
            </DialogDescription>
          </DialogHeader>

          {showSuccessState ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <CheckCircle className="h-24 w-24 text-green-600 animate-bounce" />
                <div className="absolute inset-0 h-24 w-24 bg-green-600 rounded-full opacity-20 animate-ping" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-green-900 mb-2">Auditoria Finalizada!</h3>
                <p className="text-green-700">Dados enviados para administrativo com sucesso.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* No Data Message */}
              {!hasData && (
                <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-lg text-center">
                  <Package className="h-16 w-16 text-amber-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-amber-900 mb-2">Nenhuma operação registrada durante esta visita</h3>
                  <p className="text-sm text-amber-700">Realize vendas ou conferências antes de finalizar a auditoria.</p>
                </div>
              )}

              {/* Summary Cards - Only show if has data */}
              {hasData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Vendas Card */}
                  <Card className={`p-4 ${hasVendas ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingCart className={`h-5 w-5 ${hasVendas ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-bold uppercase ${hasVendas ? 'text-blue-700' : 'text-gray-500'}`}>
                        Vendas Realizadas
                      </span>
                    </div>
                    <p className={`text-3xl font-bold ${hasVendas ? 'text-blue-900' : 'text-gray-400'}`}>
                      {hasVendas ? sessionTotals.vendas_count : 'Nenhuma'}
                    </p>
                    {hasVendas && sessionTotals.total_itens > 0 && (
                      <p className="text-sm text-blue-700 mt-1">{sessionTotals.total_itens} itens vendidos</p>
                    )}
                  </Card>

                  {/* Valor Total Card */}
                  <Card className={`p-4 ${hasVendas ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className={`h-5 w-5 ${hasVendas ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-bold uppercase ${hasVendas ? 'text-green-700' : 'text-gray-500'}`}>
                        Valor Total
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${hasVendas ? 'text-green-900' : 'text-gray-400'}`}>
                      {formatMoney(sessionTotals.total_vendido)}
                    </p>
                  </Card>

                  {/* CRITICAL: Conferências Card - FIXED */}
                  <Card className={`p-4 ${hasConferencias ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <FileCheck className={`h-5 w-5 ${hasConferencias ? 'text-purple-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-bold uppercase ${hasConferencias ? 'text-purple-700' : 'text-gray-500'}`}>
                        Itens Conferidos
                      </span>
                    </div>
                    <p className={`text-3xl font-bold ${hasConferencias ? 'text-purple-900' : 'text-gray-400'}`}>
                      {sessionTotals.total_itens_conferidos > 0 ? sessionTotals.total_itens_conferidos : 'Nenhum'}
                    </p>
                    {hasConferencias && sessionTotals.conferencias_count > 0 && (
                      <p className="text-sm text-purple-700 mt-1">{sessionTotals.conferencias_count} conferências realizadas</p>
                    )}
                  </Card>

                  {/* Duração Card */}
                  <Card className="bg-gray-50 p-4 border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5 text-gray-600" />
                      <span className="text-xs text-gray-700 font-bold uppercase">Duração da Sessão</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">
                      {auditSessionData?.startTime 
                        ? `${formatTime(auditSessionData.startTime)} - ${formatTime(auditSessionData.endTime || new Date().toISOString())}` 
                        : '-'}
                    </p>
                  </Card>
                </div>
              )}

              {/* Detailed Sales Table - Only show if vendas_data exists and has items */}
              {hasVendas && auditSessionData?.vendas_data && auditSessionData.vendas_data.length > 0 && (
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-blue-600" />
                    Detalhes das Vendas ({auditSessionData.vendas_data.length})
                  </h3>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-xs font-bold text-gray-700">Produto</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Qtd</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Preço Unit.</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Subtotal</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Desconto</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditSessionData.vendas_data.map((venda, idx) => (
                          <tr key={venda.id || idx} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-gray-900 text-xs">{venda.produto_nome || 'Produto'}</td>
                            <td className="p-2 text-right text-gray-900 font-semibold">{venda.quantidade}</td>
                            <td className="p-2 text-right text-gray-900">{formatMoney(venda.preco_unitario)}</td>
                            <td className="p-2 text-right text-gray-900">{formatMoney(venda.subtotal)}</td>
                            <td className="p-2 text-right text-amber-700">{formatMoney(venda.desconto || 0)}</td>
                            <td className="p-2 text-right text-green-700 font-bold">{formatMoney(venda.total_final)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detailed Conferências Table - Only show if conferencias_data exists and has items */}
              {hasConferencias && auditSessionData?.conferencias_data && auditSessionData.conferencias_data.length > 0 && (
                <div className="bg-white border rounded-lg p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-purple-600" />
                    Detalhes das Conferências ({auditSessionData.conferencias_data.length})
                  </h3>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-xs font-bold text-gray-700">Lote</th>
                          <th className="text-right p-2 text-xs font-bold text-gray-700">Quantidade</th>
                          <th className="text-left p-2 text-xs font-bold text-gray-700">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditSessionData.conferencias_data.map((conf, idx) => (
                          <tr key={conf.id || idx} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-gray-900 text-xs font-mono">{conf.numero_lote || 'Lote'}</td>
                            <td className="p-2 text-right text-gray-900 font-semibold">{conf.quantidade || conf.estoque_contado}</td>
                            <td className="p-2 text-gray-600 text-xs">{conf.observacao || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Observação Field */}
              <div className="space-y-2">
                <Label htmlFor="obs_auditoria" className="text-sm font-semibold text-gray-700">
                  Observações Gerais da Auditoria <span className="text-gray-500 font-normal">(Opcional)</span>
                </Label>
                <Textarea
                  id="obs_auditoria"
                  value={observacao}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS) {
                      setObservacao(e.target.value);
                    }
                  }}
                  placeholder="Digite observações sobre a auditoria (ex: 'Estoque conferido e organizado', 'Produtos vencidos removidos', 'Necessita reabastecimento urgente', etc.)"
                  className="min-h-[120px] resize-none"
                  maxLength={MAX_CHARS}
                  disabled={loading}
                />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Máximo {MAX_CHARS} caracteres</span>
                  <span className={`font-semibold ${remainingChars < 50 ? 'text-amber-600' : 'text-gray-600'}`}>
                    {remainingChars} restantes
                  </span>
                </div>
              </div>

              {/* Info Alert */}
              <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-lg">
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-blue-900 mb-1">O que acontece ao finalizar?</h4>
                    <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                      <li>Auditoria será registrada no sistema administrativo</li>
                      <li>Todos os lotes conferidos serão ativados para venda no PDV</li>
                      <li>Divergências identificadas serão enviadas para análise</li>
                      <li>Relatório completo ficará disponível no histórico</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading || showSuccessState}
            >
              {showSuccessState ? 'Fechando...' : 'Cancelar'}
            </Button>
            {!showSuccessState && (
              <Button 
                type="button" 
                onClick={handleConfirm}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Finalizar Auditoria
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-amber-600" />
              Confirmar Finalização da Auditoria
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 mt-2">
                <p>Tem certeza que deseja finalizar esta auditoria?</p>
                
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
                  <p className="font-semibold text-amber-900 mb-2">Esta ação irá:</p>
                  <ul className="list-disc list-inside text-amber-800 space-y-1">
                    {sessionTotals.vendas_count > 0 && (
                      <li>Registrar {sessionTotals.vendas_count} venda(s) realizada(s)</li>
                    )}
                    {sessionTotals.conferencias_count > 0 && (
                      <li>Registrar {sessionTotals.conferencias_count} conferência(s) realizada(s)</li>
                    )}
                    <li>Ativar todos os lotes para venda no PDV</li>
                    <li>Enviar dados para administrativo</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFinalSubmit}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalizando...
                </>
              ) : (
                'Sim, Finalizar Agora'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}