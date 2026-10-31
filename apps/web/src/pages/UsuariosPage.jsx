import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
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
import { Users, Plus, Pencil, Trash2, KeyRound, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import UserFormDialog from '@/components/users/UserFormDialog';
import ResetPasswordDialog from '@/components/users/ResetPasswordDialog';
import { useUserManagement } from '@/hooks/useUserManagement';

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { empresaId, isAdmin } = useAuth();
  const { toast } = useToast();
  const { deleteUser } = useUserManagement();

  const isUserAdmin = isAdmin();

  useEffect(() => {
    if (empresaId) {
      fetchUsuarios();
    } else {
      setLoading(false);
    }
  }, [empresaId]);

  const fetchUsuarios = async () => {
    try {
      setLoading(true);
      // Traz o nome do perfil (tabela perfis) junto, via o relacionamento
      // perfil_id -> perfis.id. Usuários sem perfil_id ainda (legado)
      // simplesmente vêm com perfis: null e caem no fallback do badge.
      const { data, error } = await supabase
        .from('usuarios')
        .select('*, perfis(nome, is_admin_padrao)')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar usuários',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (usuario = null) => {
    if (!isUserAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas administradores podem gerenciar usuários.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedUsuario(usuario);
    setFormOpen(true);
  };

  const handleOpenReset = (usuario) => {
    if (!isUserAdmin) return;
    setSelectedUsuario(usuario);
    setResetOpen(true);
  };

  const handleOpenDelete = (usuario) => {
    if (!isUserAdmin) return;
    setSelectedUsuario(usuario);
    setDeleteOpen(true);
  };

  const handleFormSuccess = () => {
    toast({
      title: 'Sucesso',
      description: `Usuário ${selectedUsuario ? 'atualizado' : 'criado'} com sucesso!`,
    });
    setFormOpen(false);
    fetchUsuarios();
  };

  const handleResetSuccess = (method) => {
    toast({
      title: 'Senha redefinida',
      description: method === 'email' 
        ? 'Um email de recuperação foi enviado para o usuário.' 
        : 'A nova senha foi definida com sucesso!',
    });
    setResetOpen(false);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUsuario) return;
    setIsDeleting(true);
    try {
      await deleteUser(selectedUsuario.id);
      toast({
        title: 'Sucesso',
        description: 'Usuário excluído com sucesso!',
      });
      setDeleteOpen(false);
      fetchUsuarios();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Mostra o nome real do perfil (ex: "Financeiro", "Operador") quando
  // disponível. Fallback pro texto legado admin/user só pra usuários
  // que por algum motivo ainda não têm perfil_id preenchido.
  const getPerfilBadge = (usuario) => {
    if (usuario.perfis?.nome) {
      const corAdmin = usuario.perfis.is_admin_padrao;
      return (
        <Badge
          className={
            corAdmin
              ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-none'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-none'
          }
        >
          {usuario.perfis.nome}
        </Badge>
      );
    }

    switch (usuario.perfil?.toLowerCase()) {
      case 'admin':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-none">Admin</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200 border-none">Usuário</Badge>;
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
        <title>Usuários - Sistema de Estoque</title>
        <meta name="description" content="Gerencie os usuários da sua empresa" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[var(--color-primary-light)]/20 text-[var(--color-primary)] rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
                <p className="text-gray-600 mt-1">Gerencie acessos e permissões da equipe</p>
              </div>
            </div>
            {isUserAdmin && (
              <Button onClick={() => handleOpenForm()} className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Novo Usuário
              </Button>
            )}
          </div>

          {!isUserAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4 shadow-sm">
              <div className="p-2 bg-amber-100 rounded-full">
                <ShieldAlert className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-900">Permissão Restrita</h3>
                <p className="text-amber-800 mt-1">
                  Seu perfil atual não permite a criação ou edição de usuários. 
                  Apenas administradores têm acesso a estas ferramentas de gestão.
                </p>
                <p className="text-amber-700/80 text-sm mt-2">
                  Se você acredita que isso é um erro, entre em contato com o gestor da sua conta.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)] mb-4" />
                <p className="text-gray-600">Carregando lista de colaboradores...</p>
              </div>
            ) : usuarios.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Nenhum usuário encontrado</p>
                {isUserAdmin && (
                  <Button variant="link" onClick={() => handleOpenForm()} className="mt-2">
                    Cadastrar o primeiro usuário
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50/80">
                    <TableRow>
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Perfil</TableHead>
                      <TableHead className="font-semibold">Cadastrado em</TableHead>
                      {isUserAdmin && <TableHead className="text-right font-semibold">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((usuario) => (
                      <TableRow key={usuario.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium text-gray-900">{usuario.nome}</TableCell>
                        <TableCell className="text-gray-600">{usuario.email}</TableCell>
                        <TableCell>{getPerfilBadge(usuario)}</TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {new Date(usuario.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        {isUserAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                title="Editar"
                                onClick={() => handleOpenForm(usuario)}
                                className="h-8 w-8 border-gray-200 text-gray-600 hover:text-[var(--color-primary-dark)] hover:border-[var(--color-primary-light)]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                title="Redefinir Senha"
                                onClick={() => handleOpenReset(usuario)}
                                className="h-8 w-8 border-gray-200 text-gray-600 hover:text-orange-600 hover:border-orange-200"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                title="Excluir"
                               onClick={() => handleOpenDelete(usuario)}
                                className="h-8 w-8 border-gray-200 text-gray-600 hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/10 hover:border-[var(--color-error)]/30"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <UserFormDialog 
          open={formOpen} 
          onOpenChange={setFormOpen} 
          user={selectedUsuario} 
          onSuccess={handleFormSuccess} 
        />

        <ResetPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          user={selectedUsuario}
          onSuccess={handleResetSuccess}
        />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[var(--color-error)]">Confirmar exclusão de conta</AlertDialogTitle>
              <AlertDialogDescription className="pt-2">
                Você está prestes a excluir o usuário <strong>{selectedUsuario?.nome}</strong>. 
                <br /><br />
                Esta ação é irreversível e removerá permanentemente o acesso deste colaborador ao sistema e aos dados da empresa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-4">
              <AlertDialogCancel disabled={isDeleting} className="border-gray-200">Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteConfirm} 
                disabled={isDeleting}
                className="bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 text-white"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sim, excluir usuário
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}