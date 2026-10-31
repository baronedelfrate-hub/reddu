import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ClipboardCheck, CheckCircle } from 'lucide-react';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function ConferenciaLoteModal({ isOpen, onClose, lote, empresaId, onSuccess, onConferenceRegistered }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    quantidade_conferida: '',
    status: 'Conforme',
    observacao: ''
  });

  const qtdEsperada = lote?.quantidade_atual || 0;
  const qtdConferida = parseInt(formData.quantidade_conferida, 10);
  const divergencia = isNaN(qtdConferida) ? 0 : qtdConferida - qtdEsperada;

  // CRITICAL: Validate and log onConferenceRegistered prop on component mount/update
  useEffect(() => {
    if (isOpen) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ConferenciaLoteModal] Component opened/rendered`);
      console.log(`[${timestamp}] [ConferenciaLoteModal] Received onConferenceRegistered callback:`, {
        type: typeof onConferenceRegistered,
        exists: !!onConferenceRegistered,
        isFunction: typeof onConferenceRegistered === 'function'
      });
      
      if (typeof onConferenceRegistered !== 'function') {
        console.warn(`[${timestamp}] [ConferenciaLoteModal] ⚠️ WARNING: onConferenceRegistered is not a function!`, {
          received_type: typeof onConferenceRegistered,
          received_value: onConferenceRegistered
        });
      } else {
        console.log(`[${timestamp}] [ConferenciaLoteModal] ✓ onConferenceRegistered callback is valid`);
      }
    }
  }, [isOpen, onConferenceRegistered]);

  const timestamp0 = new Date().toISOString();
  console.log(`[${timestamp0}] [ConferenciaLoteModal] Modal state:`, {
    isOpen,
    lote: lote?.numero_lote,
    qtdEsperada,
    qtdConferida,
    divergencia
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ConferenciaLoteModal] Form submitted with data:`, formData);
    console.log(`[${timestamp}] [ConferenciaLoteModal] Starting conference registration for lote_id:`, lote.lote_id, 'numero_lote:', lote.numero_lote, 'quantidade:', qtdConferida);
    console.log(`[${timestamp}] [FLOW] Step 1: Operator initiating conference via ConferenciaLoteModal`);
    
    if (isNaN(qtdConferida) || qtdConferida < 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    if (formData.status !== 'Conforme' && !formData.observacao.trim()) {
      toast({ title: 'Observação necessária', description: 'Por favor, detalhe a divergência.', variant: 'destructive' });
      return;
    }

    const tipoMovimento = 'ajuste';
    const quantidadeMovimento = Math.abs(divergencia);
    
    console.log(`[${timestamp}] [ConferenciaLoteModal] Prepared movimento data:`, {
      tipo: tipoMovimento,
      quantidade: quantidadeMovimento,
      divergencia
    });
    
    // Validação Centralizada antes da inserção direta
    const validacao = validateMovimentacaoData({ tipo: tipoMovimento, quantidade: quantidadeMovimento });
    if (!validacao.valid) {
      console.error(`[${timestamp}] [ConferenciaLoteModal] Validation failed:`, validacao.error);
      toast({ title: 'Erro de Validação do Sistema', description: validacao.error, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const fullObs = `Conferência. Status: ${formData.status}. Esperado: ${qtdEsperada}, Conferido: ${qtdConferida}, Divergência: ${divergencia}. ${formData.observacao}`.trim();

      console.log(`[${timestamp}] [ConferenciaLoteModal] Inserting movimentacao with observation:`, fullObs);

      const { data: insertedData, error } = await supabase.from('movimentacoes').insert({
        empresa_id: empresaId,
        tipo: tipoMovimento,
        produto_id: lote.produto_id,
        lote_id: lote.lote_id,
        local_origem_id: lote.local_id,
        quantidade: quantidadeMovimento,
        observacao: fullObs,
        status: 'conferido',
        data_movimentacao: new Date().toISOString()
      }).select().single();

      if (error) {
        console.error(`[${timestamp}] [ConferenciaLoteModal] Database error:`, error);
        throw error;
      }

      const timestamp2 = new Date().toISOString();
      console.log(`[${timestamp2}] [ConferenciaLoteModal] Conference registered successfully in Supabase`);
      console.log(`[${timestamp2}] [ConferenciaLoteModal] Movimentacao inserted successfully:`, insertedData);
      console.log(`[${timestamp2}] [ConferenciaLoteModal] Conference result:`, {
        success: true,
        error: null,
        id: insertedData.id
      });

      console.log(`[${timestamp2}] [ConferenciaLoteModal] Conference registered:`, {
        numero_lote: lote.numero_lote,
        quantidade: qtdConferida
      });

      // CRITICAL: Prepare complete conference data with conferencias_data structure
      const conferenceData = {
        id: insertedData.id,
        lote_id: lote.lote_id,
        numero_lote: lote.numero_lote,
        produto_id: lote.produto_id,
        produto_nome: lote.produto_nome,
        mercado_id: lote.local_id,
        usuario_id: currentUser?.id || null,
        estoque_esperado: qtdEsperada,
        estoque_contado: qtdConferida,
        quantidade: qtdConferida,
        divergencia,
        data_auditoria: insertedData.data_movimentacao,
        observacao: formData.observacao
      };

      // CRITICAL: Validate conferenceData completeness
      const hasId = !!conferenceData.id;
      const hasLoteId = !!conferenceData.lote_id;
      const hasNumeroLote = !!conferenceData.numero_lote;
      const hasQuantidade = conferenceData.quantidade !== undefined && conferenceData.quantidade !== null;
      const hasEstoqueEsperado = conferenceData.estoque_esperado !== undefined && conferenceData.estoque_esperado !== null;
      const hasEstoqueContado = conferenceData.estoque_contado !== undefined && conferenceData.estoque_contado !== null;

      console.log(`[${timestamp2}] [ConferenciaLoteModal] Validating conferenceData completeness:`, {
        hasId,
        hasLoteId,
        hasNumeroLote,
        hasQuantidade,
        hasEstoqueEsperado,
        hasEstoqueContado,
        allFieldsValid: hasId && hasLoteId && hasNumeroLote && hasQuantidade && hasEstoqueEsperado && hasEstoqueContado
      });

      console.log(`[${timestamp2}] [ConferenciaLoteModal] Complete conferenceData object:`, conferenceData);

      if (!hasId || !hasLoteId || !hasNumeroLote || !hasQuantidade || !hasEstoqueEsperado || !hasEstoqueContado) {
        console.error(`[${timestamp2}] [ConferenciaLoteModal] ❌ Incomplete conferenceData, aborting callback. Missing fields:`, {
          id: hasId ? '✓' : '✗ MISSING',
          lote_id: hasLoteId ? '✓' : '✗ MISSING',
          numero_lote: hasNumeroLote ? '✓' : '✗ MISSING',
          quantidade: hasQuantidade ? '✓' : '✗ MISSING',
          estoque_esperado: hasEstoqueEsperado ? '✓' : '✗ MISSING',
          estoque_contado: hasEstoqueContado ? '✓' : '✗ MISSING'
        });
        
        toast({ 
          title: 'Erro ao registrar conferência',
          description: 'Dados incompletos retornados. Tente novamente.',
          variant: 'destructive' 
        });
        
        return;
      }

      console.log(`[${timestamp2}] [FLOW] Step 2: ConferenciaLoteModal calling onConferenceRegistered callback`);
      console.log(`[${timestamp2}] [ConferenciaLoteModal] About to call onConferenceRegistered with data:`, {
        lote_id: conferenceData.lote_id,
        numero_lote: conferenceData.numero_lote,
        quantidade: conferenceData.quantidade,
        observacao: conferenceData.observacao
      });

      // Display data being passed to callback in table format
      console.table([{
        'ID': conferenceData.id,
        'Lote ID': conferenceData.lote_id,
        'Número Lote': conferenceData.numero_lote,
        'Produto ID': conferenceData.produto_id,
        'Quantidade': conferenceData.quantidade,
        'Estoque Esperado': conferenceData.estoque_esperado,
        'Estoque Contado': conferenceData.estoque_contado,
        'Divergência': conferenceData.divergencia,
        'Observação': conferenceData.observacao
      }]);

      // CRITICAL: Call onConferenceRegistered callback BEFORE closing modal
      if (typeof onConferenceRegistered === 'function') {
        try {
          const timestamp3 = new Date().toISOString();
          console.log(`[${timestamp3}] [ConferenciaLoteModal] Invoking onConferenceRegistered callback...`);
          console.log(`[${timestamp3}] [ConferenciaLoteModal] Calling onConferenceRegistered with data:`, {
            lote_id: conferenceData.lote_id,
            numero_lote: conferenceData.numero_lote,
            quantidade: conferenceData.quantidade,
            observacao: conferenceData.observacao
          });
          
          const callbackResult = onConferenceRegistered(conferenceData);
          
          if (callbackResult && typeof callbackResult.then === 'function') {
            console.log(`[${timestamp3}] [ConferenciaLoteModal] Callback is async, awaiting...`);
            await callbackResult;
          }
          
          const timestamp4 = new Date().toISOString();
          console.log(`[${timestamp4}] [ConferenciaLoteModal] ✅ onConferenceRegistered callback executed successfully`);
          console.log(`[${timestamp4}] [FLOW] Step 3: onConferenceRegistered callback completed, data should be in auditSessionData now`);
          
        } catch (callbackError) {
          const timestamp5 = new Date().toISOString();
          console.error(`[${timestamp5}] [ConferenciaLoteModal] ❌ ERROR calling onConferenceRegistered:`, callbackError.message);
          console.error(`[${timestamp5}] [ConferenciaLoteModal] Error stack:`, callbackError.stack);
          console.error(`[${timestamp5}] [ConferenciaLoteModal] Full error object:`, callbackError);
          // Don't break flow - log error but continue
        }
      } else {
        const timestamp6 = new Date().toISOString();
        console.error(`[${timestamp6}] [ConferenciaLoteModal] ❌ ERROR: onConferenceRegistered is not a function, type:`, typeof onConferenceRegistered);
        console.warn(`[${timestamp6}] [ConferenciaLoteModal] This means the callback was not properly passed from parent component`);
      }

      // CRITICAL: Success vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      // CRITICAL: Display success toast AFTER callback completes
      toast({ 
        title: '✅ Conferência Registrada com Sucesso!',
        description: 'Os dados foram salvos e registrados no sistema.',
        duration: 3000,
      });

      const timestamp7 = new Date().toISOString();
      console.log(`[${timestamp7}] [ConferenciaLoteModal] Success toast displayed`);

      // CRITICAL: Clear form fields
      setFormData({
        quantidade_conferida: '',
        status: 'Conforme',
        observacao: ''
      });

      console.log(`[${timestamp7}] [ConferenciaLoteModal] Form fields cleared`);

      // CRITICAL: Trigger parent refresh
      if (onSuccess) {
        console.log(`[${timestamp7}] [ConferenciaLoteModal] Calling onSuccess callback...`);
        onSuccess();
      }

      // CRITICAL: Wait 500ms before closing modal (allows toast to display)
      console.log(`[${timestamp7}] [ConferenciaLoteModal] Waiting 500ms before closing modal...`);
      setTimeout(() => {
        const timestamp8 = new Date().toISOString();
        console.log(`[${timestamp8}] [ConferenciaLoteModal] Closing modal after successful conference registration`);
        onClose();
      }, 500);

    } catch (err) {
      const timestamp9 = new Date().toISOString();
      console.error(`[${timestamp9}] [ConferenciaLoteModal] ❌ Error during conference registration:`, err);
      console.error(`[${timestamp9}] [ConferenciaLoteModal] Error stack:`, err.stack);
      
      // CRITICAL: Error vibration pattern
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      
      // Display error toast and keep modal open
      toast({ 
        title: 'Erro ao Registrar Conferência', 
        description: err.message || 'Ocorreu um erro ao salvar a conferência. Tente novamente.', 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-teal-600" /> Conferir Lote no Mercado
          </DialogTitle>
          <DialogDescription>
            Verifique fisicamente o lote <span className="font-mono font-bold">{lote?.numero_lote}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Sistema</Label>
              <div className="p-2 bg-gray-50 border rounded text-center font-bold">{qtdEsperada}</div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qtd_conf" className="text-xs text-teal-700 font-bold">Físico *</Label>
              <Input 
                id="qtd_conf" 
                type="number"
                inputMode="decimal"
                min="0" 
                value={formData.quantidade_conferida}
                onChange={(e) => setFormData({...formData, quantidade_conferida: e.target.value})}
                required
                className="text-center font-bold"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dif.</Label>
              <div className={`p-2 border rounded text-center font-bold ${divergencia === 0 ? 'bg-gray-50 text-gray-700' : divergencia > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {divergencia > 0 ? '+' : ''}{isNaN(qtdConferida) ? '-' : divergencia}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Conforme">OK / Conforme</SelectItem>
                <SelectItem value="Divergência">Divergência de Qtd</SelectItem>
                <SelectItem value="Danificado">Produto Avariado/Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas (obrigatório se houver problema)</Label>
            <Textarea 
              placeholder="Descreva o problema encontrado..."
              value={formData.observacao}
              onChange={(e) => setFormData({...formData, observacao: e.target.value})}
              required={formData.status !== 'Conforme' || divergencia !== 0}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-teal-600 hover:bg-teal-700">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Salvar Conferência
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}