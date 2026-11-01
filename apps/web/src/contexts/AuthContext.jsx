import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { handleAuthError } from '@/utils/authErrorHandler';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresaNome, setEmpresaNome] = useState(null);
  const [userPerfil, setUserPerfil] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const currentUserIdRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  const clearAuthSession = useCallback(async (redirectToLogin = true) => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    
    try {
      await supabase.auth.signOut().catch(() => {});
    } catch (e) {
      console.error('[AuthContext] Error during server signOut:', e);
    } finally {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      });
      sessionStorage.clear();
      
      setCurrentUser(null);
      setEmpresaId(null);
      setEmpresaNome(null);
      setUserPerfil(null);
      setIsSuperAdmin(false);
      currentUserIdRef.current = null;
      setLoading(false);

      if (redirectToLogin && window.location.pathname !== '/login') {
        window.location.href = '/login';
      } else {
        // Reset flag only if we aren't redirecting away
        isLoggingOutRef.current = false;
      }
    }
  }, []);

  const refreshSessionTokens = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return data.session;
    } catch (error) {
      console.error('[AuthContext] Failed to refresh session:', error);
      await clearAuthSession(true);
      return null;
    }
  }, [clearAuthSession]);

  const fetchUserData = useCallback(async (userId, isMounted = true) => {
    try {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*, empresas(nome)')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (isMounted) {
        if (userData) {
          setCurrentUser({
            id: userId,
            nome: userData.nome,
            email: userData.email,
            is_super_admin: !!userData.is_super_admin,
            perfil_id: userData.perfil_id || null,
            perfil: userData.perfil || null,
          });
          setEmpresaId(userData.empresa_id || null);
          setEmpresaNome(userData.empresas?.nome || null);
          setUserPerfil(userData.perfil || null);
          setIsSuperAdmin(!!userData.is_super_admin);
        } else {
          setCurrentUser({ id: userId });
          setEmpresaId(null);
          setEmpresaNome(null);
          setUserPerfil(null);
          setIsSuperAdmin(false);
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error in fetchUserData execution:', error);
      const { requiresLogout } = handleAuthError(error);
      if (requiresLogout) {
        await clearAuthSession(true);
      }
    } finally {
      if (isMounted) setLoading(false);
    }
  }, [clearAuthSession]);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          const newSession = await refreshSessionTokens();
          if (!newSession) {
            if (isMounted) setLoading(false);
            return;
          }
          if (newSession?.user) {
            currentUserIdRef.current = newSession.user.id;
            await fetchUserData(newSession.user.id, isMounted);
          }
          return;
        }

        if (session?.user) {
          currentUserIdRef.current = session.user.id;
          await fetchUserData(session.user.id, isMounted);
        } else {
          if (isMounted) setLoading(false);
        }
      } catch (err) {
        console.error('[AuthContext] Unexpected error during init:', err);
        await clearAuthSession(false);
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Guard against re-entry during logout flow
      if (isLoggingOutRef.current) return;
      
      try {
        if (event === 'PASSWORD_RECOVERY') {
          // Link de recuperação aberto fora de /redefinir-senha (ex.: URL de retorno não
          // cadastrada no Supabase): leva para a tela de nova senha em vez de só logar.
          sessionStorage.setItem('reddu_recuperacao_senha', '1');
          if (window.location.pathname !== '/redefinir-senha') {
            window.location.replace('/redefinir-senha');
            return;
          }
        }
        if (event === 'SIGNED_OUT') {
          await clearAuthSession(true);
        } else if (event === 'TOKEN_REFRESHED' && !session) {
          await clearAuthSession(true);
        } else if (session?.user) {
          if (currentUserIdRef.current !== session.user.id) {
            if (isMounted) setLoading(true);
          }
          currentUserIdRef.current = session.user.id;
          await fetchUserData(session.user.id, isMounted);
        } else {
          currentUserIdRef.current = null;
          if (isMounted) {
            setCurrentUser(null);
            setEmpresaId(null);
            setEmpresaNome(null);
            setUserPerfil(null);
            setIsSuperAdmin(false);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('[AuthContext] Error in onAuthStateChange:', err);
        const { requiresLogout } = handleAuthError(err);
        if (requiresLogout) {
          await clearAuthSession(true);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, clearAuthSession, refreshSessionTokens]);

  const login = useCallback(async ({ email, password }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      return { data: null, error };
    }
  }, []);

  const signup = useCallback(async ({ email, password, nome, empresaId, empresaNome, isNewEmpresa }) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      if (authData.user) {
        let finalEmpresaId = empresaId;
        if (isNewEmpresa && empresaNome) {
          const { data: newEmpresa, error: empresaError } = await supabase
            .from('empresas')
            .insert({ nome: empresaNome })
            .select()
            .single();
          if (empresaError) throw empresaError;
          finalEmpresaId = newEmpresa.id;
        }

        const { data: existingUser } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!existingUser) {
            const { error: userError } = await supabase
              .from('usuarios')
              .insert({
                id: authData.user.id,
                empresa_id: finalEmpresaId,
                nome,
                email,
                perfil: 'admin',
              });
            if (userError) throw userError; 
        }
      }
      return { data: authData, error: null };
    } catch (error) {
      console.error('[AuthContext] Signup error:', error);
      return { data: null, error };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await clearAuthSession(true);
      return { error: null };
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
      isLoggingOutRef.current = false;
      return { error };
    }
  }, [clearAuthSession]);

  const resendConfirmation = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error };
    }
  }, []);

  const isAdmin = useCallback(() => userPerfil === 'admin', [userPerfil]);
  const checkSuperAdmin = useCallback(() => isSuperAdmin, [isSuperAdmin]);

  const value = useMemo(() => ({
    currentUser, user: currentUser, empresaId, empresaNome, userPerfil,
    loading, isLoading: loading, isAuthenticated: !!currentUser,
    login, signup, logout, resendConfirmation, isAdmin, isSuperAdmin: checkSuperAdmin, clearAuthSession, refreshSessionTokens
  }), [currentUser, empresaId, empresaNome, userPerfil, loading, login, signup, logout, resendConfirmation, isAdmin, checkSuperAdmin, clearAuthSession, refreshSessionTokens]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}