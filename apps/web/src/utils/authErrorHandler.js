export const handleAuthError = (error) => {
  if (!error) {
    return { 
      message: 'Ocorreu um erro desconhecido.', 
      requiresLogout: false 
    };
  }

  const msg = (error.message || error.error_description || '').toLowerCase();

  // Detect specific Supabase auth errors related to tokens
  if (
    msg.includes('refresh token not found') || 
    msg.includes('invalid refresh token') || 
    msg.includes('session expired') ||
    msg.includes('jwt expired') ||
    error.status === 401
  ) {
    return {
      message: 'Sua sessão expirou. Por favor, faça login novamente.',
      requiresLogout: true
    };
  }

  // Common authentication errors
  if (msg.includes('invalid login credentials')) {
    return { 
      message: 'Email ou senha incorretos.', 
      requiresLogout: false 
    };
  }

  if (msg.includes('user not found')) {
    return { 
      message: 'Usuário não encontrado.', 
      requiresLogout: false 
    };
  }

  if (msg.includes('email not confirmed')) {
    return { 
      message: 'Email não confirmado. Verifique sua caixa de entrada.', 
      requiresLogout: false 
    };
  }

  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return { 
      message: 'Erro de conexão. Verifique sua conexão com a internet e tente novamente.', 
      requiresLogout: false 
    };
  }

  return {
    message: `Erro de autenticação: ${error.message || 'Falha na operação.'}`,
    requiresLogout: false
  };
};