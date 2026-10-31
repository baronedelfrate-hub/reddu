import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

export default function PedidoFormDialog({ isOpen, onClose, onSuccess, pedidoToEdit }) {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [mercados, setMercados] = useState([]);
  const [produtos, setProdutos] = useState([]);

  // Form State
  const [mercadoId, setMercadoId] = useState('');
  const [dataEntrega, setDataEntrega] = useState('');
  const [status, setStatus] = useState('pendente');
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState([]);

  useEffect(() => {
    if (isOpen && empresaId) {
      fetchData();
      if (pedidoToEdit) {
        setMercadoId(pedidoToEdit.mercado_id || '');
        setDataEntrega(pedidoToEdit.data_entrega || '');
        setStatus(pedidoToEdit.status || 'pendente');
        setObservacao(pedidoToEdit.observacao || '');
        setItens(
          (pedidoToEdit.itens || []).map(i => ({
            id: i.id || crypto.randomUUID(),
            produto_id: i.produto_id,
            quantidade_bandejas: i.quantidade_bandejas
          }))
        );
      } else {
        resetForm();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, empresaId, pedidoToEdit]);

  const fetchData = async () => {
    try {
      const [mercadosRes, produtosRes] = await Promise.all([
        supabase.from('locais').select('*').eq('empresa_id', empresaId).order('nome'),
        supabase.from('produtos').select('*').eq('empresa_id', empresaId).eq('tem_bandeja', true).order('nome')
      ]);

      if (mercadosRes.error) throw mercadosRes.error;
      if (produtosRes.error) throw produtosRes.error;

      setMercados(mercadosRes.data || []);
      setProdutos(produtosRes.data || []);
    } catch (error) {
      console.error('Error fetching dependencies:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar produtos e mercados.', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setMercadoId('');
    setDataEntrega('');
    setStatus('pendente');
    setObservacao('');
    setItens([]);
  };

  const handleAddItem = () => {
    setItens([...itens, { id: crypto.randomUUID(), produto_id: '', quantidade_bandejas: 1 }]);
  };

  const handleRemoveItem = (id) => {
    setItens(itens.filter(item => item.id !== id));
  };

  const updateItem = (id, field, value) => {
    setItens(itens.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!mercadoId || !dataEntrega || itens.length === 0) {
      toast({ title: 'Atenção', description: 'Preencha todos os campos obrigatórios e adicione ao menos um item.', variant: 'destructive' });
      return;
    }
    
    if (itens.some(i => !i.produto_id || i.quantidade_bandejas <= 0)) {
      toast({ title: 'Atenção', description: 'Verifique se todos os itens têm produto e quantidade válidos.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      let pedidoId = pedidoToEdit?.id;

      if (pedidoToEdit) {
        // Update existing
        const { error: updateError } = await supabase
          .from('pedidos')
          .update({
            mercado_id: mercadoId,
            data_entrega: dataEntrega,
            status,
            observacao
          })
          .eq('id', pedidoId);

        if (updateError) throw updateError;

        // Clear old items
        const { error: deleteError } = await supabase
          .from('pedido_itens')
          .delete()
          .eq('pedido_id', pedidoId);
          
        if (deleteError) throw deleteError;
      } else {
        // Create new
        const { data: newPedido, error: insertError } = await supabase
          .from('pedidos')
          .insert({
            empresa_id: empresaId,
            mercado_id: mercadoId,
            data_entrega: dataEntrega,
            status,
            observacao
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        pedidoId = newPedido.id;
      }

      // Insert new items
      const itemsToInsert = itens.map(item => ({
        pedido_id: pedidoId,
        produto_id: item.produto_id,
        quantidade_bandejas: Number(item.quantidade_bandejas)
      }));

      const { error: itemsError } = await supabase
        .from('pedido_itens')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({ title: 'Sucesso', description: pedidoToEdit ? 'Pedido atualizado.' : 'Pedido criado com sucesso.' });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving pedido:', error);
      toast({ title: 'Erro', description: 'Falha ao salvar pedido.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const totalGeral = itens.reduce((acc, item) => {
    const produto = produtos.find(p => p.id === item.produto_id);
    const unPorBandeja = produto?.unidades_por_bandeja || 0;
    return acc + (Number(item.quantidade_bandejas) * unPorBandeja);
  }, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedidoToEdit ? 'Editar Pedido de Produção' : 'Novo Pedido de Produção'}</DialogTitle>
          <DialogDescription>
            Planeje as quantidades solicitadas. O total de unidades a produzir será calculado automaticamente com base nas unidades por bandeja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Mercado/Local</Label>
              <Select value={mercadoId} onValueChange={setMercadoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  {mercados.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Data de Entrega</Label>
              <Input 
                type="date" 
                value={dataEntrega} 
                onChange={(e) => setDataEntrega(e.target.value)} 
                className="w-full text-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_producao">Em Produção</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Input 
              placeholder="Anotações sobre o pedido..." 
              value={observacao} 
              onChange={(e) => setObservacao(e.target.value)} 
              className="text-gray-900"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Itens do Pedido (Demanda)</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar Produto
              </Button>
            </div>
            
            <div className="border rounded-lg overflow-hidden bg-slate-50">
              <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-32">Un. por Bandeja</TableHead>
                    <TableHead className="w-40 text-right">Qtd Solicitada (Bandejas)</TableHead>
                    <TableHead className="w-40 text-right">Total a Produzir (Unidades)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        Nenhum item adicionado. Clique em "Adicionar Produto" para iniciar o planejamento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itens.map((item) => {
                      const produto = produtos.find(p => p.id === item.produto_id);
                      const unPorBandeja = produto?.unidades_por_bandeja || 0;
                      const totalProduzir = Number(item.quantidade_bandejas) * unPorBandeja;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select value={item.produto_id} onValueChange={(val) => updateItem(item.id, 'produto_id', val)}>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Selecione o produto" />
                              </SelectTrigger>
                              <SelectContent>
                                {produtos.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {unPorBandeja > 0 ? `${unPorBandeja} un` : '-'}
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              min="1" 
                              className="text-right bg-white text-gray-900" 
                              value={item.quantidade_bandejas} 
                              onChange={(e) => updateItem(item.id, 'quantidade_bandejas', e.target.value)} 
                            />
                          </TableCell>
                          <TableCell className="text-right font-bold text-indigo-600 align-middle">
                            {totalProduzir > 0 ? totalProduzir : '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                {itens.length > 0 && (
                  <TableFooter className="bg-indigo-50 border-t-2 border-indigo-200">
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold text-indigo-900">
                        Total geral de unidades a produzir:
                      </TableCell>
                      <TableCell className="text-right font-bold text-indigo-700 text-lg">
                        {totalGeral}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}