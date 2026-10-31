import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function useUserManagement() {
  const { empresaId } = useAuth();

  // perfilId: id do perfil selecionado (tabela perfis)
  // isAdminPadrao: flag do perfil (perfis.is_admin_padrao) — usada só para
  // manter o campo legado "perfil" (texto 'admin'/'user') sincronizado,
  // já que isAdmin() no AuthContext e outras partes do sistema ainda
  // dependem dele. Perfis customizados (não-admin-padrão) gravam 'user'.
  const createUser = async (email, password, nome, perfilId, isAdminPadrao) => {
    if (!empresaId) throw new Error('Empresa ID não encontrado.');

    const perfilLegado = isAdminPadrao ? 'admin' : 'user';

    // 1. Criar usuário no Supabase Auth via Edge Function
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create', email, password }
    });

    if (edgeError || edgeData?.error) {
      throw new Error(edgeData?.error || edgeError?.message || 'Erro ao criar usuário no Auth.');
    }

    const userId = edgeData.userId;

    // 2. Inserir na tabela public.usuarios
    const { error: dbError } = await supabase.from('usuarios').insert({
      id: userId,
      empresa_id: empresaId,
      nome,
      email,
      perfil_id: perfilId,
      perfil: perfilLegado
    });

    if (dbError) {
      // Rollback: Deleta o usuário criado no Auth se falhar ao salvar no BD
      await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', userId }
      });
      throw new Error(dbError.message || 'Erro ao salvar dados do usuário.');
    }

    return { success: true, userId };
  };

  const updateUser = async (userId, nome, perfilId, isAdminPadrao) => {
    const perfilLegado = isAdminPadrao ? 'admin' : 'user';

    const { error } = await supabase
      .from('usuarios')
      .update({
        nome,
        perfil_id: perfilId,
        perfil: perfilLegado
      })
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return { success: true };
  };

  const resetUserPassword = async (userId, method, email = null, password = null) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'resetPassword', userId, method, email, password }
    });

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Erro ao redefinir senha.');
    }

    return { success: true };
  };

  const deleteUser = async (userId) => {
    // 1. Deletar do BD primeiro
    const { error: dbError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', userId);

    if (dbError) throw new Error(dbError.message || 'Erro ao deletar dados do usuário.');

    // 2. Deletar do Supabase Auth via Edge Function
    const { data, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete', userId }
    });

    if (edgeError || data?.error) {
      throw new Error(data?.error || edgeError?.message || 'Erro ao deletar credenciais.');
    }

    return { success: true };
  };

  return {
    createUser,
    updateUser,
    resetUserPassword,
    deleteUser
  };
}