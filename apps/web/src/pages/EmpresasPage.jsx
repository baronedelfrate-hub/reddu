import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import { Building2, Pencil, Trash2, AlertCircle } from 'lucide-react';
import LogoUploadComponent from '@/components/empresas/LogoUploadComponent';

// NOTA: a criação de novas empresas foi movida para o Painel de Gestor
// (GestorEmpresasPage, /dashboard/gestor-empresas) — é uma ação de
// plataforma, não de administrador de uma empresa individual.
// Esta página mantém apenas edição (nome/logo) e exclusão.

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState(null);
  const [deletingEmpresa, setDeletingEmpresa] = useState(null);
  const [formData, setFormData] = useState({ nome: '', logo_url: '' });
  const { empresaId } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (empresaId) {
      fetchEmpresas();
    } else {
      setLoading(false);
    }
  }, [empresaId]);

  const fetchEmpresas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nome');

      if (error) throw error;
      setEmpresas(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar empresas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (empresa) => {
    setEditingEmpresa(empresa);
    setFormData({ nome: empresa.nome, logo_url: empresa.logo_url || '' });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingEmpresa(null);
    setFormData({ nome: '', logo_url: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId || !editingEmpresa) return;

    try {
      const { error } = await supabase
        .from('empresas')
        .update({ nome: formData.nome })
        .eq('id', editingEmpresa.id);

      if (error) throw error;

      toast({
        title: 'Empresa atualizada com sucesso!',
      });

      handleCloseForm();
      fetchEmpresas();
    } catch (error) {
      toast({
        title: 'Erro ao salvar empresa',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!empresaId) return;
    
    try {
      const { error } = await supabase
        .from('empresas')
        .delete()
        .eq('id', deletingEmpresa.id);

      if (error) throw error;

      toast({
        title: 'Empresa excluída com sucesso!',
      });

      setDeleteOpen(false);
      setDeletingEmpresa(null);
      fetchEmpresas();
    } catch (error) {
      toast({
        title: 'Erro ao excluir empresa',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleLogoUpdated = (newLogoUrl) => {
    setFormData(prev => ({ ...prev, logo_url: newLogoUrl }));
    // Update local state immediately to reflect changes in the table behind the modal
    setEmpresas(prev => prev.map(emp => 
      emp.id === editingEmpresa.id ? { ...emp, logo_url: newLogoUrl } : emp
    ));
    setEditingEmpresa(prev => ({ ...prev, logo_url: newLogoUrl }));
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
        <title>Empresas - Sistema de Estoque</title>
        <meta name="description" content="Gerencie as empresas cadastradas no sistema" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Empresas</h1>
              <p className="text-gray-600 mt-1">Gerencie as empresas cadastradas</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                <p className="mt-4 text-gray-600">Carregando empresas...</p>
              </div>
            ) : empresas.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma empresa cadastrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Logo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data de Criação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas.map((empresa) => (
                    <TableRow key={empresa.id}>
                      <TableCell>
                        {empresa.logo_url ? (
                          <div className="h-10 w-10 rounded overflow-hidden border border-gray-200 flex items-center justify-center bg-white">
                            <img src={empresa.logo_url} alt={`Logo ${empresa.nome}`} className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{empresa.nome}</TableCell>
                      <TableCell>
                        {new Date(empresa.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenForm(empresa)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeletingEmpresa(empresa);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Empresa</DialogTitle>
              <DialogDescription>
                Preencha os dados da empresa abaixo.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <form id="empresa-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-gray-900">Nome da Empresa</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Minha Empresa Ltda"
                    required
                    className="bg-white text-gray-900"
                  />
                </div>
              </form>

              {editingEmpresa && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Logomarca da Empresa</h3>
                  <LogoUploadComponent 
                    empresaId={editingEmpresa.id} 
                    currentLogoUrl={formData.logo_url}
                    onLogoUpdated={handleLogoUpdated}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseForm}>
                Cancelar
              </Button>
              <Button type="submit" form="empresa-form">
                Salvar Nome
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a empresa "{deletingEmpresa?.nome}"? Esta ação
                não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}