// /src/pages/SuperAdminGuard.jsx
//
// Envolve a rota do Painel de Gestor, bloqueando quem não é super-admin.
// Uso na rota:
//   <Route path="/dashboard/gestor/empresas" element={
//     <SuperAdminGuard>
//       <DashboardLayout><GestorEmpresasPage /></DashboardLayout>
//     </SuperAdminGuard>
//   } />

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function SuperAdminGuard({ children }) {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState('checando'); // 'checando' | 'autorizado' | 'negado'

  useEffect(() => {
    let ativo = true;

    async function verificar() {
      if (!currentUser?.id) {
        if (ativo) setStatus('negado');
        return;
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('is_super_admin')
        .eq('id', currentUser.id)
        .single();

      if (!ativo) return;
      setStatus(!error && data?.is_super_admin ? 'autorizado' : 'negado');
    }

    verificar();
    return () => {
      ativo = false;
    };
  }, [currentUser?.id]);

  if (status === 'checando') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Verificando acesso…
      </div>
    );
  }

  if (status === 'negado') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-6">
        <div>
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Acesso restrito</h1>
          <p className="text-sm text-gray-500">Esta área é exclusiva para administradores da plataforma.</p>
        </div>
      </div>
    );
  }

  return children;
}