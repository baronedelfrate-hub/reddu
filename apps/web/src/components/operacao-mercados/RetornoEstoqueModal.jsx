import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowUpFromLine } from 'lucide-react';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function RetornoEstoqueModal({ isOpen, onClose, lote, empresaId, marketName, onSuccess }) {
  const [quantidade, setQuantidade] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [locaisDestino, setLocaisDestino] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && empresaId) {
      supabase.from('locais')
        .select('id, nome, tipo')
        .eq('empresa_id', empresaId)
        .neq('id', lote?.local_id)
        .then(({ data }) => setLocaisDestino(data || []));
    }
  }, [isOpen, empresaId, lote]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qtd = parseInt(quantidade, 10);

    if (isNaN(qtd) || qtd <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    if (qtd > lote?.quantidade_atual) {
      toast({ title: 'Estoque insuficiente', variant: 'destructive' });
      return;
    }
    if (!destinoId) {
      toast({ title: 'Selecione o destino', variant: 'destructive' });
      return;
    }

    // Validação de Constraint de Movimentação (Preventivo para a RPC transferir_estoque_rpc)
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

      toast({ title: 'Retorno efetuado', description: `${qtd} unidades retornadas.`, className: 'bg-green-600 text-white' });
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
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5 text-indigo-600" /> Retornar ao Estoque Base
          </DialogTitle>
          <DialogDescription>
            Retirando itens de <span className="font-semibold text-gray-900">{marketName}</span> para o estoque central.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label>Lote no Mercado</Label>
              <div className="p-2 bg-gray-50 rounded border text-sm font-mono font-medium">{lote?.numero_lote}</div>
            </div>
            <div className="space-y-2">
              <Label>Disponível no Mercado</Label>
              <div className="p-2 bg-gray-50 rounded border text-sm font-bold text-indigo-600">{lote?.quantidade_atual}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destino_retorno">Local de Destino (Estoque) <span className="text-red-500">*</span></Label>
            <Select value={destinoId} onValueChange={setDestinoId} required>
              <SelectTrigger id="destino_retorno">
                <SelectValue placeholder="Selecione para onde retornar..." />
              </SelectTrigger>
              <SelectContent>
                {locaisDestino.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.nome} {loc.tipo ? `(${loc.tipo})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qtd_retornar">Quantidade <span className="text-red-500">*</span></Label>
            <Input 
              id="qtd_retornar" 
              type="number" 
              min="1" 
              max={lote?.quantidade_atual || 1}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="text-lg font-bold"
              required
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Retorno'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}