import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings, Pencil, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ConfigurarComposicaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  
  const [produtos, setProdutos] = useState([]);
  const [composicoes, setComposicoes] = useState([]);
  
  const [produtoFinalId, setProdutoFinalId] = useState('');
  const [produtoBaseId, setProdutoBaseId] = useState('');
  const [quantidadeBase, setQuantidadeBase] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (empresaId) {
      fetchData();
    }
  }, [empresaId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch products
      const { data: prodData, error: prodError } = await supabase
        .from('produtos')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (prodError) throw prodError;
      setProdutos(prodData || []);

      // Fetch composicoes
      const { data: compData, error: compError } = await supabase
        .from('produto_composicao')
        .select(`
          id,
          produto_final_id,
          produto_base_id,
          quantidade_base,
          produto_final:produtos!fk_produto_final(nome),
          produto_base:produtos!fk_produto_base(nome)
        `)
        .eq('empresa_id', empresaId);

      if (compError) throw compError;
      setComposicoes(compData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!produtoFinalId || !produtoBaseId || !quantidadeBase) {
      return toast({ title: 'Atenção', description: 'Preencha todos os campos.', variant: 'destructive' });
    }

    if (produtoFinalId === produtoBaseId) {
      return toast({ title: 'Atenção', description: 'Produto final e base não podem ser o mesmo.', variant: 'destructive' });
    }

    if (Number(quantidadeBase) <= 0) {
      return toast({ title: 'Atenção', description: 'Quantidade base deve ser maior que zero.', variant: 'destructive' });
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('produto_composicao')
          .update({
            produto_final_id: produtoFinalId,
            produto_base_id: produtoBaseId,
            quantidade_base: Number(quantidadeBase),
          })
          .eq('id', editingId)
          .eq('empresa_id', empresaId);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Composição atualizada com sucesso.' });
      } else {
        const { error } = await supabase
          .from('produto_composicao')
          .insert({
            empresa_id: empresaId,
            produto_final_id: produtoFinalId,
            produto_base_id: produtoBaseId,
            quantidade_base: Number(quantidadeBase),
          });

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Composição cadastrada com sucesso.' });
      }

      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving composicao:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar composição.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setProdutoFinalId('');
    setProdutoBaseId('');
    setQuantidadeBase('');
    setEditingId(null);
  };

  const handleEdit = (comp) => {
    setProdutoFinalId(comp.produto_final_id);
    setProdutoBaseId(comp.produto_base_id);
    setQuantidadeBase(comp.quantidade_base.toString());
    setEditingId(comp.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('produto_composicao')
        .delete()
        .eq('id', deleteId)
        .eq('empresa_id', empresaId);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Composição excluída.' });
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao excluir composição.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <Helmet>
        <title>Configurar Composição - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Configurar Composição</h1>
              <p className="text-gray-600 mt-1">
                Defina as regras de conversão (ex: 1 Bandeja = 10 Unidades Base).
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label>Produto Final (ex: Bandeja)</Label>
                    <Select value={produtoFinalId} onValueChange={setProdutoFinalId}>
                      <SelectTrigger className="bg-white text-gray-900">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Produto Base (ex: Unidade)</Label>
                    <Select value={produtoBaseId} onValueChange={setProdutoBaseId}>
                      <SelectTrigger className="bg-white text-gray-900">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Quantidade Base</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Ex: 10"
                      value={quantidadeBase}
                      onChange={(e) => setQuantidadeBase(e.target.value)}
                      className="bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || !produtoFinalId || !produtoBaseId || !quantidadeBase}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {editingId ? 'Atualizar Composição' : 'Salvar Composição'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar Edição
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Composições Cadastradas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3">Produto Final</th>
                    <th className="px-6 py-3">Produto Base</th>
                    <th className="px-6 py-3">Quantidade Base</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {composicoes.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                        Nenhuma composição cadastrada.
                      </td>
                    </tr>
                  ) : (
                    composicoes.map((comp) => (
                      <tr key={comp.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {comp.produto_final?.nome}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {comp.produto_base?.nome}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {comp.quantidade_base} un.
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(comp)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(comp.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir Composição</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir esta composição? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}