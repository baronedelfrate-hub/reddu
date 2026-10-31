import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProtectedRoute({ children }) {
  const { currentUser, empresaId, loading, logout, clearAuthSession } = useAuth();
  const [isTimeout, setIsTimeout] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!loading) {
      setIsTimeout(false);
      return;
    }
    
    // Reduzido para 1 segundo conforme solicitado para evitar esperas longas em casos de falha de token
    const timer = setTimeout(() => {
      console.warn('[ProtectedRoute] Auth check timeout reached. State might be invalid.');
      setIsTimeout(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleForceLogout = async () => {
    if (clearAuthSession) {
      await clearAuthSession();
    } else {
      await logout();
    }
    window.location.href = '/login';
  };

  if (loading && !isTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center flex flex-col items-center">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary)] mb-4" />
          <p className="text-gray-600 font-medium">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (isTimeout && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center border-t-4 border-yellow-500">
          <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Demora na resposta</h2>
          <p className="text-gray-600 mb-6">
            A verificação de segurança está demorando mais que o normal. Sua sessão pode ter expirado.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full gap-2">
              <RefreshCcw className="h-4 w-4" /> Tentar Novamente
            </Button>
            <Button onClick={handleForceLogout} className="w-full" variant="default">
              Ir para o Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && !currentUser) {
    // Redireciona para login preservando a URL de origem
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!loading && currentUser && !empresaId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center border-t-4 border-red-500">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
          <p className="text-gray-600 mb-6">
            Nenhuma empresa associada. Por favor, contate o administrador.
          </p>
          <Button onClick={handleForceLogout} className="w-full" variant="destructive">
            Sair e Voltar ao Início
          </Button>
        </div>
      </div>
    );
  }

  // Render children se autenticado
  return children;
}