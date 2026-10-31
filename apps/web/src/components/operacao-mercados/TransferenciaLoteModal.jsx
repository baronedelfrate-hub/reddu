import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRightLeft } from 'lucide-react';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function TransferenciaLoteModal({ isOpen, onClose, lote, empresaId, marketName, onSuccess }) {
  const [quantidade, setQuantidade] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [outrosMercados, setOutrosMercados] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && empresaId) {
      supabase.from('locais')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .neq('id', lote?.local_id)
        .then(({ data }) => setOutrosMercados(data || []));
    }
  }, [isOpen, empresaId, lote]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qtd = parseInt(quantidade, 10);

    if (isNaN(qtd) || qtd <= 0 || qtd > lote?.quantidade_atual || !destinoId) {
      toast({ title: 'Dados inválidos', variant: 'destructive' });
      return;
    }

    // Validação de Constraint de Movimentação
    const tipoPrevisto = 'transferencia';
    const validacao = validateMovimentacaoData({ tipo: tipoPrevisto, quantidade: qtd });
    if (!validacao.valid) {
      toast({ title: 'Erro de Validação do Sistema', description: validacao.error, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('transferir_estoque_rpc', {
        p_empresa_id: empresaId,
        p_lote_id: lote.lote_id,
        p_local_origem_id: lote.local_id,
        p_local_destino_id: destinoId,
        p_quantidade: qtd,
        p_produto_id: lote.produto_id,
        p_tipo_lote: lote.tipo_lote,
        p_unidades_por_bandeja: lote.unidades_por_bandeja
      });

      if (error) throw error;

      // CRITICAL: Success vibration
      if (window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      toast({ title: 'Transferência concluída', className: 'bg-green-600 text-white' });
      onSuccess();
      onClose();
    } catch (err) {
      // CRITICAL: Error vibration pattern
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-amber-600" /> Transferir entre Locais
          </DialogTitle>
          <DialogDescription>
            Enviando do <span className="font-semibold">{marketName}</span> para outro local.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label>Disponível</Label>
              <div className="p-2 bg-gray-50 rounded border font-bold text-amber-600">{lote?.quantidade_atual}</div>
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input 
                type="number" 
                inputMode="decimal"
                min="1" 
                max={lote?.quantidade_atual || 1}
                value={quantidade} 
                onChange={(e) => setQuantidade(e.target.value)} 
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mercado/Local Destino *</Label>
            <Select value={destinoId} onValueChange={setDestinoId} required>
              <SelectTrigger><SelectValue placeholder="Selecione o destino..." /></SelectTrigger>
              <SelectContent>
                {outrosMercados.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Transferir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}