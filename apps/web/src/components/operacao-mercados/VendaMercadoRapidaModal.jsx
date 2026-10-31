import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Package, DollarSign } from 'lucide-react';
import { useVendaMercadoRapida } from '@/hooks/useVendaMercadoRapida';

export default function VendaMercadoRapidaModal({ isOpen, onClose, lote, onSuccess, onSaleRegistered }) {
  const { toast } = useToast();
  const { isProcessing, registrarVendaRapida } = useVendaMercadoRapida();
  
  const [quantidade, setQuantidade] = useState('');
  const [error, setError] = useState('');

  // CRITICAL: Validate and log onSaleRegistered prop on component mount/update
  useEffect(() => {
    if (isOpen) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [VendaMercadoRapidaModal] Component opened/rendered`);
      console.log(`[${timestamp}] [VendaMercadoRapidaModal] Received onSaleRegistered callback:`, {
        type: typeof onSaleRegistered,
        exists: !!onSaleRegistered,
        isFunction: typeof onSaleRegistered === 'function'
      });
      
      if (typeof onSaleRegistered !== 'function') {
        console.warn(`[${timestamp}] [VendaMercadoRapidaModal] ⚠️ WARNING: onSaleRegistered is not a function!`, {
          received_type: typeof onSaleRegistered,
          received_value: onSaleRegistered
        });
      } else {
        console.log(`[${timestamp}] [VendaMercadoRapidaModal] ✓ onSaleRegistered callback is valid`);
      }
    }
  }, [isOpen, onSaleRegistered]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuantidade('');
      setError('');
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [VendaMercadoRapidaModal] Modal opened for lote:`, lote);
      console.log(`[${timestamp}] [FLOW] Step 1: Operator initiating sale via VendaMercadoRapidaModal`);
    }
  }, [isOpen, lote]);

  if (!lote) return null;

  // Determine price based on tipo_lote
  const precoAplicado = lote.tipo_lote === 'bandeja' 
    ? parseFloat(lote.preco_bandeja || 0)
    : parseFloat(lote.preco_unitario || 0);

  const tipoDisplay = lote.tipo_lote === 'bandeja' ? 'Bandeja' : 'Unitário';
  const quantidadeDisponivel = lote.quantidade_atual || lote.quantidade || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const qtd = parseInt(quantidade, 10);
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] [VendaMercadoRapidaModal] Form submitted with quantidade:`, qtd);
    console.log(`[${timestamp}] [VendaMercadoRapidaModal] Submitting sale...`);

    // Validation
    if (isNaN(qtd) || qtd <= 0) {
      setError('Quantidade deve ser maior que zero.');
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      toast({
        title: 'Quantidade Inválida',
        description: 'Digite uma quantidade válida maior que zero.',
        variant: 'destructive',
      });
      return;
    }

    if (qtd > quantidadeDisponivel) {
      setError(`Quantidade excede o disponível (${quantidadeDisponivel}).`);
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      toast({
        title: 'Quantidade Insuficiente',
        description: `Disponível: ${quantidadeDisponivel}. Solicitado: ${qtd}.`,
        variant: 'destructive',
      });
      return;
    }

    if (precoAplicado <= 0) {
      setError('Preço não configurado para este tipo de venda.');
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      toast({
        title: 'Erro de Preço',
        description: `Produto não possui preço ${tipoDisplay} configurado.`,
        variant: 'destructive',
      });
      return;
    }

    console.log(`[${timestamp}] [VendaMercadoRapidaModal] Submitting sale with data:`, {
      lote_id: lote.lote_id,
      produto_id: lote.produto_id,
      mercado_id: lote.local_id,
      quantidade: qtd,
      preco: precoAplicado,
      tipo_lote: lote.tipo_lote,
      numero_lote: lote.numero_lote
    });

    // Call hook to process sale
    const result = await registrarVendaRapida({
      lote_id: lote.lote_id,
      produto_id: lote.produto_id,
      mercado_id: lote.local_id,
      quantidade: qtd,
      preco: precoAplicado,
      tipo_lote: lote.tipo_lote,
      numero_lote: lote.numero_lote,
    });

    const timestamp2 = new Date().toISOString();
    console.log(`[${timestamp2}] [VendaMercadoRapidaModal] Sale result:`, {
      success: result.success,
      error: result.error,
      movimentacao: result.movimentacao ? {
        id: result.movimentacao.id,
        produto_id: result.movimentacao.produto_id,
        quantidade: result.movimentacao.quantidade,
        total_final: result.movimentacao.total_final,
        venda_id: result.movimentacao.venda_id
      } : null
    });

    if (result.success && result.movimentacao) {
      // CRITICAL: Calculate subtotal and desconto
      const subtotal = qtd * precoAplicado;
      const desconto = result.movimentacao.desconto_valor || 0;
      const total_final = result.movimentacao.total_final;

      // CRITICAL: Prepare complete sale data for callback with vendas_data structure
      const saleData = {
        id: result.movimentacao.id,
        produto_id: lote.produto_id,
        produto_nome: lote.produto_nome,
        lote_id: lote.lote_id,
        mercado_id: lote.local_id,
        usuario_id: result.movimentacao.usuario_id,
        quantidade: qtd,
        preco_unitario: precoAplicado,
        subtotal: subtotal,
        desconto: desconto,
        total_final: total_final,
        forma_pagamento: result.movimentacao.forma_pagamento || 'pendente',
        valor_unitario: precoAplicado,
        data_movimentacao: result.movimentacao.data_movimentacao,
        venda_id: result.movimentacao.venda_id,
        cliente_referencia: result.movimentacao.cliente_referencia,
        canal_venda: result.movimentacao.canal_venda,
        status: result.movimentacao.status,
        financeiro_baixado: result.movimentacao.financeiro_baixado
      };

      const timestamp3 = new Date().toISOString();
      console.log(`[${timestamp3}] [VendaMercadoRapidaModal] Sale registered:`, {
        produto_nome: lote.produto_nome,
        quantidade: qtd,
        total_final: total_final
      });

      // CRITICAL: Validate saleData completeness
      const hasId = !!saleData.id;
      const hasProdutoId = !!saleData.produto_id;
      const hasQuantidade = saleData.quantidade !== undefined && saleData.quantidade !== null;
      const hasTotalFinal = saleData.total_final !== undefined && saleData.total_final !== null;
      const hasVendaId = !!saleData.venda_id;

      console.log(`[${timestamp3}] [VendaMercadoRapidaModal] Validating saleData completeness:`, {
        hasId,
        hasProdutoId,
        hasQuantidade,
        hasTotalFinal,
        hasVendaId,
        allFieldsValid: hasId && hasProdutoId && hasQuantidade && hasTotalFinal && hasVendaId
      });

      console.log(`[${timestamp3}] [VendaMercadoRapidaModal] Complete saleData object:`, saleData);

      if (!hasId || !hasProdutoId || !hasQuantidade || !hasTotalFinal) {
        console.error(`[${timestamp3}] [VendaMercadoRapidaModal] ❌ Incomplete saleData, aborting callback. Missing fields:`, {
          id: hasId ? '✓' : 'X MISSING',
          produto_id: hasProdutoId ? '✓' : 'X MISSING',
          quantidade: hasQuantidade ? '✓' : 'X MISSING',
          total_final: hasTotalFinal ? '✓' : 'X MISSING'
        });
        
        toast({
          title: 'Erro ao registrar venda',
          description: 'Dados incompletos retornados. Tente novamente.',
          variant: 'destructive',
        });
        
        return;
      }

      console.log(`[${timestamp3}] [FLOW] Step 2: VendaMercadoRapidaModal calling onSaleRegistered callback`);
      console.log(`[${timestamp3}] [VendaMercadoRapidaModal] Calling onSaleRegistered with vendaData:`, {
        id: saleData.id,
        produto_id: saleData.produto_id,
        produto_nome: saleData.produto_nome,
        lote_id: saleData.lote_id,
        quantidade: saleData.quantidade,
        preco_unitario: saleData.preco_unitario,
        subtotal: saleData.subtotal,
        desconto: saleData.desconto,
        total_final: saleData.total_final,
        forma_pagamento: saleData.forma_pagamento,
        venda_id: saleData.venda_id
      });

      // CRITICAL: Call onSaleRegistered callback BEFORE closing modal
      if (typeof onSaleRegistered === 'function') {
        try {
          const timestamp4 = new Date().toISOString();
          console.log(`[${timestamp4}] [VendaMercadoRapidaModal] Invoking onSaleRegistered callback...`);
          
          // Check if callback returns a Promise
          const callbackResult = onSaleRegistered(saleData);
          
          if (callbackResult && typeof callbackResult.then === 'function') {
            console.log(`[${timestamp4}] [VendaMercadoRapidaModal] Callback is async, awaiting...`);
            await callbackResult;
          }
          
          const timestamp5 = new Date().toISOString();
          console.log(`[${timestamp5}] [VendaMercadoRapidaModal] ✅ onSaleRegistered callback completed successfully`);
          console.log(`[${timestamp5}] [FLOW] Step 3: onSaleRegistered callback completed, data should be in auditSessionData now`);
          
        } catch (callbackError) {
          const timestamp6 = new Date().toISOString();
          console.error(`[${timestamp6}] [VendaMercadoRapidaModal] ❌ Error calling onSaleRegistered callback:`, callbackError);
          console.error(`[${timestamp6}] [VendaMercadoRapidaModal] Error stack:`, callbackError.stack);
          // Don't break flow - log error but continue
        }
      } else {
        const timestamp7 = new Date().toISOString();
        console.warn(`[${timestamp7}] [VendaMercadoRapidaModal] ⚠️ onSaleRegistered is not a function! Type:`, typeof onSaleRegistered);
        console.warn(`[${timestamp7}] [VendaMercadoRapidaModal] This means the callback was not properly passed from parent component`);
      }

      // CRITICAL: Success vibration feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      // CRITICAL: Display success toast AFTER callback completes
      toast({
        title: '✅ Venda Registrada com Sucesso!',
        description: `${qtd} ${tipoDisplay}(s) vendidas. A venda aguarda baixa no financeiro.`,
        duration: 3000,
      });

      const timestamp8 = new Date().toISOString();
      console.log(`[${timestamp8}] [VendaMercadoRapidaModal] Success toast displayed`);

      // CRITICAL: Clear form fields
      setQuantidade('');
      setError('');

      // CRITICAL: Trigger parent refresh callback
      if (onSuccess) {
        console.log(`[${timestamp8}] [VendaMercadoRapidaModal] Calling onSuccess callback...`);
        onSuccess();
      }

      // CRITICAL: Wait 500ms before closing modal (allows toast to display and state to update)
      console.log(`[${timestamp8}] [VendaMercadoRapidaModal] Waiting 500ms before closing modal...`);
      setTimeout(() => {
        const timestamp9 = new Date().toISOString();
        console.log(`[${timestamp9}] [VendaMercadoRapidaModal] Closing modal now`);
        onClose();
      }, 500);

    } else {
      // Error handling - vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      const timestamp10 = new Date().toISOString();
      console.error(`[${timestamp10}] [VendaMercadoRapidaModal] ❌ Sale registration failed:`, result.error);
      
      // Display error toast and keep modal open
      toast({
        title: 'Erro ao Registrar Venda',
        description: result.error || 'Ocorreu um erro ao processar a venda. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  // CRITICAL: Calculate total with full precision (no intermediate rounding)
  const calcularTotal = () => {
    if (!quantidade || isNaN(parseInt(quantidade, 10))) {
      return 0;
    }
    const qtd = parseInt(quantidade, 10);
    const total = qtd * precoAplicado;
    return Math.round(total * 100) / 100;
  };

  const totalVenda = calcularTotal();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShoppingCart className="h-5 w-5 text-green-600" />
            Venda Rápida - Mercado
          </DialogTitle>
          <DialogDescription>
            Registrar venda direta do lote <span className="font-mono font-bold">{lote.numero_lote}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Product Info Card */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Package className="h-4 w-4" />
              <span className="font-semibold">{lote.produto_nome || 'Produto'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Tipo:</span>
                <span className="ml-1 font-bold text-gray-900">{tipoDisplay}</span>
              </div>
              <div>
                <span className="text-gray-500">Disponível:</span>
                <span className="ml-1 font-bold text-gray-900">{quantidadeDisponivel}</span>
              </div>
            </div>
          </div>

          {/* Quantity Input */}
          <div className="space-y-2">
            <Label htmlFor="qtd_venda" className="text-sm font-semibold">
              Quantidade a Vender *
            </Label>
            <Input
              id="qtd_venda"
              type="number"
              inputMode="decimal"
              min="1"
              max={quantidadeDisponivel}
              value={quantidade}
              onChange={(e) => {
                setQuantidade(e.target.value);
                setError('');
              }}
              required
              className={`text-center text-lg font-bold ${error ? 'border-red-500' : ''}`}
              placeholder="0"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>

          {/* Price Display */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Preço {tipoDisplay}:</span>
              <span className="font-bold text-gray-900">
                R$ {precoAplicado.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-green-300">
              <div className="flex items-center gap-1 text-gray-700 font-semibold">
                <DollarSign className="h-4 w-4" />
                <span>Total da Venda:</span>
              </div>
              <span className="text-2xl font-bold text-green-700">
                R$ {totalVenda.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Status Information */}
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Atenção:</strong> Esta venda será registrada como <strong>PENDENTE</strong> e 
              aguardará baixa no financeiro através da página "Vendas Pendentes".
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isProcessing || !quantidade || parseInt(quantidade, 10) <= 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Confirmar Venda
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}