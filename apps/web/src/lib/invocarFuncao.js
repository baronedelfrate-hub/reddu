import { supabase } from '@/lib/customSupabaseClient';

// Chama uma Edge Function e devolve a mensagem de erro em português que a própria
// função enviou (o supabase-js só expõe "non-2xx status code" por padrão).
export async function invocarFuncao(nome, corpo) {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (error) {
    let mensagem = error.message;
    try {
      const resposta = await error.context?.json?.();
      if (resposta?.error) mensagem = resposta.error;
    } catch (_) { /* mantém a mensagem padrão */ }
    throw new Error(mensagem);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
