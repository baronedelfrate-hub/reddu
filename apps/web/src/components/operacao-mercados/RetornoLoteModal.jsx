import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2 } from 'lucide-react';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function RetornoLoteModal({ isOpen, onClose, lote, empresaId, onSuccess }) {
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qtd = parseInt(quantidade, 10);

    if (isNaN(qtd) || qtd <= 0 || qtd > lote?.quantidade_atual || !motivo) {
      toast({ title: 'Dados inválidos', variant: 'destructive' });
      return;
    }

    // A RPC rpc_devolucao usa 'devolucao' ou 'descarte' internamente dependendo do motivo
    const tipoPrevisto = motivo.toLowerCase().includes('troca') ? 'devolucao' : 'descarte';
    
    // Validação Preventiva
    const validacao = validateMovimentacaoData({ tipo: tipoPrevisto, quantidade: qtd });
    if (!validacao.valid) {
      toast({ title: 'Erro de Validação do Sistema', description: validacao.error, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('rpc_devolucao', {
        p_empresa_id: empresaId,
        p_local_origem_id: lote.local_id,
        p_produto_id: lote.produto_id,
        p_lote_id: lote.lote_id,
        p_quantidade: qtd,
        p_motivo_devolucao: motivo,
        p_observacao: observacao || `Motivo: ${motivo}`
      });

      if (error) throw error;

      toast({ title: 'Devolução processada', className: 'bg-rose-600 text-white' });
      onSuccess();
      onClose();
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="h-5 w-5" /> Registrar Avaria/Devolução
          </DialogTitle>
          <DialogDescription>
            Processa produtos com problema ou troca do lote <span className="font-mono font-bold">{lote?.numero_lote}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label>Disponível</Label>
              <div className="p-2 bg-gray-50 rounded border font-bold text-rose-700">{lote?.quantidade_atual}</div>
            </div>
            <div className="space-y-2">
              <Label>Qtd a Devolver *</Label>
              <Input 
                type="number" min="1" max={lote?.quantidade_atual || 1}
                value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo} required>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Danificado">Produto Danificado</SelectItem>
                <SelectItem value="Validade">Vencido</SelectItem>
                <SelectItem value="Troca">Troca Comercial</SelectItem>
                <SelectItem value="Outro">Outro Motivo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500 leading-tight mt-1">
              "Troca" retorna para estoque de bandejas. Outros motivos vão para Descarte.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Observação Adicional</Label>
            <Textarea 
              placeholder="Detalhes sobre a devolução..."
              value={observacao} onChange={(e) => setObservacao(e.target.value)}
              required={motivo === 'Outro'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} variant="destructive">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}