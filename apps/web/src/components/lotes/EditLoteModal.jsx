/**
 * Valid values for logs_auditoria.acao constraint:
 * - 'criar'
 * - 'editar'
 * - 'deletar'
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function EditLoteModal({ isOpen, onClose, onSave, lote }) {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    data_producao: '',
    data_validade: '',
    codigo_lote_bandeja: '',
    quantidade: ''
  });
  
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && lote) {
      setFormData({
        data_producao: lote.created_at ? lote.created_at.split('T')[0] : '',
        data_validade: lote.data_validade || '',
        codigo_lote_bandeja: lote.numero_lote || '',
        quantidade: lote.quantidade_atual !== undefined ? String(lote.quantidade_atual) : ''
      });
      setError('');
    }
  }, [isOpen, lote]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveClick = async () => {
    setError('');
    if (!formData.data_producao || !formData.data_validade || !formData.codigo_lote_bandeja || formData.quantidade === '') {
      setError('Todos os campos são obrigatórios.');
      return;
    }

    const producao = new Date(formData.data_producao + 'T00:00:00');
    const validade = new Date(formData.data_validade + 'T00:00:00');

    if (validade < producao) {
      setError('A Data de Validade deve ser maior ou igual à Data de Produção.');
      return;
    }

    setIsSaving(true);
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || currentUser?.id;

      // Update the underlying lotes table
      const { error: errorLote } = await supabase.from('lotes').update({
        numero_lote: formData.codigo_lote_bandeja,
        data_validade: formData.data_validade,
        quantidade: Number(formData.quantidade),
        created_at: new Date(formData.data_producao + 'T00:00:00').toISOString()
      }).eq('id', lote.lote_id);

      if (errorLote) throw errorLote;

      // Log to logs_auditoria with valid acao constraint value ('editar')
      await supabase.from('logs_auditoria').insert({
        empresa_id: empresaId,
        usuario_id: userId, // Ensure we use explicitly usuario_id here
        acao: 'editar', 
        entidade: 'lotes',
        entidade_id: lote.lote_id,
        dados_antes: {
          numero_lote: lote.numero_lote,
          data_validade: lote.data_validade,
          created_at: lote.created_at,
          quantidade_atual: lote.quantidade_atual
        },
        dados_depois: formData
      });

      toast({ 
        title: 'Lote atualizado', 
        description: 'As informações do lote foram salvas e auditadas.',
        className: 'bg-green-600 text-white border-none' 
      });
      
      if (onSave) {
        onSave(formData);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar o lote: ' + err.message);
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSaving && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <Pencil className="h-6 w-6 text-blue-600" />
            </div>
            <DialogTitle className="text-xl text-blue-600">Editar Lote</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-gray-600">
            Atualize as informações do lote selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium border border-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="codigo_lote_bandeja">Código do Lote (Bandeja) <span className="text-red-500">*</span></Label>
            <Input
              id="codigo_lote_bandeja"
              name="codigo_lote_bandeja"
              value={formData.codigo_lote_bandeja}
              onChange={handleChange}
              placeholder="Ex: LOTE-123"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantidade">Quantidade <span className="text-red-500">*</span></Label>
            <Input
              id="quantidade"
              name="quantidade"
              type="number"
              min="0"
              value={formData.quantidade}
              onChange={handleChange}
              placeholder="0"
              disabled={isSaving}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_producao">Data de Produção <span className="text-red-500">*</span></Label>
              <Input
                id="data_producao"
                name="data_producao"
                type="date"
                value={formData.data_producao}
                onChange={handleChange}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_validade">Data de Validade <span className="text-red-500">*</span></Label>
              <Input
                id="data_validade"
                name="data_validade"
                type="date"
                value={formData.data_validade}
                onChange={handleChange}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}