import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/customSupabaseClient';

// Conexão usada só pelas páginas públicas (ex.: cardápio do cliente). Não guarda
// nem renova sessão de login: quem pede pelo cardápio é anônimo, então as
// consultas não precisam esperar a renovação do login (que podia deixar a tela
// carregando para sempre numa rede instável).
//
// É criada só no primeiro uso, para não gerar um segundo cliente (e o aviso de
// "Multiple GoTrueClient") nas demais telas do sistema.
let cliente = null;

function obterCliente() {
  if (!cliente) {
    cliente = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sb-publico-cardapio',
      },
    });
  }
  return cliente;
}

export const supabasePublico = new Proxy({}, {
  get(_, propriedade) {
    const instancia = obterCliente();
    const valor = Reflect.get(instancia, propriedade);
    return typeof valor === 'function' ? valor.bind(instancia) : valor;
  },
});
