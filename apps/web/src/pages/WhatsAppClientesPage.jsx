import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Search,
  Phone,
  MessageCircle,
} from 'lucide-react';

const DEFAULT_FORM_DATA = {
  nome: '',
  telefone: '',
  tags: '',
  observacoes: '',
  ativo: true,
};

function normalizarTelefone(valor) {
  let digits = String(valor || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  // Número brasileiro sem DDI (só DDD + número: 10 ou 11 dígitos) recebe o 55 na frente.
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

function formatarTelefoneExibicao(digits) {
  if (!digits) return '-';
  // 55 19 988992192 -> +55 (19) 98899-2192 (best effort, não trava em formatos diferentes)
  const semDDI = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (semDDI.length === 11) {
    return `+55 (${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
  }
  return digits;
}

export default function WhatsAppClientesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [deletingCliente, setDeletingCliente] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);

  const fetchClientes = useCallback(async () => {
    if (!empresaId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar clientes',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter((c) => {
      const nome = (c.nome || '').toLowerCase();
      const telefone = (c.telefone || '').toLowerCase();
      const tags = (c.tags || []).join(' ').toLowerCase();
      return nome.includes(termo) || telefone.includes(termo) || tags.includes(termo);
    });
  }, [clientes, busca]);

  const handleOpenForm = (cliente = null) => {
    setEditingCliente(cliente);
    setFormData(
      cliente
        ? {
            nome: cliente.nome || '',
            telefone: cliente.telefone || '',
            tags: (cliente.tags || []).join(', '),
            observacoes: cliente.observacoes || '',
            ativo: cliente.ativo !== false,
          }
        : { ...DEFAULT_FORM_DATA }
    );
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingCliente(null);
    setFormData({ ...DEFAULT_FORM_DATA });
  };

  // Vincula automaticamente o cliente a uma conversa já existente com o
  // mesmo telefone (ex: a mensagem de teste da Fase 1), sem criar conversa nova.
  const vincularConversaExistente = async (clienteId, telefoneDigits) => {
    try {
      const jid = `${telefoneDigits}@s.whatsapp.net`;
      await supabase
        .from('whatsapp_conversas')
        .update({ cliente_id: clienteId })
        .eq('empresa_id', empresaId)
        .eq('telefone_jid', jid);
    } catch (err) {
      // Não bloqueia o cadastro do cliente se isso falhar
      console.error('Erro ao vincular conversa existente:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    const telefoneDigits = normalizarTelefone(formData.telefone);

    if (!formData.nome.trim()) {
      toast({ title: 'Informe o nome do cliente', variant: 'destructive' });
      return;
    }

    if (telefoneDigits.length < 10) {
      toast({
        title: 'Telefone inválido',
        description: 'Use o formato DDI+DDD+número, ex: 5519988992192.',
        variant: 'destructive',
      });
      return;
    }

    const tagsArray = formData.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      empresa_id: empresaId,
      nome: formData.nome.trim(),
      telefone: telefoneDigits,
      telefone_jid: `${telefoneDigits}@s.whatsapp.net`,
      tags: tagsArray,
      observacoes: formData.observacoes || null,
      ativo: formData.ativo,
    };

    setIsSaving(true);
    try {
      let clienteId = editingCliente?.id;

      if (editingCliente) {
        const { error } = await supabase
          .from('whatsapp_clientes')
          .update(payload)
          .eq('id', editingCliente.id);

        if (error) throw error;
        toast({ title: 'Cliente atualizado com sucesso!' });
      } else {
        const { data, error } = await supabase
          .from('whatsapp_clientes')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;
        clienteId = data?.id;
        toast({ title: 'Cliente cadastrado com sucesso!' });
      }

      if (clienteId) {
        await vincularConversaExistente(clienteId, telefoneDigits);
      }

      handleCloseForm();
      fetchClientes();
    } catch (error) {
      const isDuplicado = error.message?.includes('whatsapp_clientes_empresa_telefone_unique');
      toast({
        title: 'Erro ao salvar cliente',
        description: isDuplicado
          ? 'Já existe um cliente cadastrado com esse telefone.'
          : error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (cliente) => {
    setDeletingCliente(cliente);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!empresaId || !deletingCliente) return;
    try {
      const { error } = await supabase
        .from('whatsapp_clientes')
        .delete()
        .eq('id', deletingCliente.id);

      if (error) throw error;

      toast({ title: 'Cliente excluído com sucesso!' });
      setDeleteOpen(false);
      setDeletingCliente(null);
      fetchClientes();
    } catch (error) {
      toast({
        title: 'Erro ao excluir cliente',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>WhatsApp - Clientes - Estoque 360</title>
        <meta name="description" content="Cadastro de clientes/contatos do WhatsApp" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <MessageCircle className="h-7 w-7 text-primary" />
                Clientes WhatsApp
              </h1>
              <p className="text-gray-600 mt-1">Cadastre os contatos que vão receber mensagens pelo WhatsApp.</p>
            </div>
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Cliente
            </Button>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou tag..."
              className="pl-9 bg-white text-gray-900 border-gray-300"
            />
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent mb-4"></div>
                <p className="text-gray-600">Carregando clientes...</p>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {busca ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Telefone</TableHead>
                      <TableHead className="font-semibold">Tags</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="text-right font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientesFiltrados.map((cliente) => (
                      <TableRow key={cliente.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium text-gray-900">{cliente.nome}</TableCell>
                        <TableCell className="text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            {formatarTelefoneExibicao(cliente.telefone)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(cliente.tags || []).length > 0 ? (
                              cliente.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              cliente.ativo !== false
                                ? 'bg-emerald-100 text-emerald-800 border-transparent'
                                : 'bg-gray-200 text-gray-700 border-transparent'
                            }
                          >
                            {cliente.ativo !== false ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-200 text-gray-700 hover:bg-gray-100"
                            onClick={() => handleOpenForm(cliente)}
                            title="Editar cliente"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                            onClick={() => confirmDelete(cliente)}
                            title="Excluir cliente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Preencha os dados do contato de WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-gray-900 font-medium">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Maria Silva"
                  required
                  className="bg-white text-gray-900 border-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-gray-900 font-medium">
                  Telefone (DDI+DDD+número) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="5519988992192"
                  disabled={!!editingCliente}
                  required
                  className="bg-white text-gray-900 border-gray-300 font-mono disabled:bg-gray-100 disabled:text-gray-500"
                />
                {editingCliente && (
                  <p className="text-xs text-gray-500">
                    O telefone não pode ser alterado após o cadastro (é a chave de vínculo com as conversas).
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags" className="text-gray-900 font-medium">Tags</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Ex: mercado, atacado, vip (separadas por vírgula)"
                  className="bg-white text-gray-900 border-gray-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes" className="text-gray-900 font-medium">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                  className="bg-white text-gray-900 border-gray-300"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                />
                <label htmlFor="ativo" className="text-sm font-medium text-gray-900 cursor-pointer">
                  Cliente ativo
                </label>
              </div>

              <DialogFooter className="pt-4 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={handleCloseForm} className="text-gray-700 border-gray-300">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingCliente ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                Tem certeza que deseja excluir o cliente "{deletingCliente?.nome}"? As conversas e mensagens
                já registradas não serão apagadas, apenas o vínculo com este cadastro.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 text-white hover:bg-red-700 border-transparent"
              >
                Sim, Excluir Cliente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}