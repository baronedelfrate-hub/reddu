import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';

// Marca que o usuário chegou por um link de recuperação (usada também pelo AuthContext
// quando o link cai em outra página e é redirecionado para cá).
export const FLAG_RECUPERACAO = 'reddu_recuperacao_senha';
const TAMANHO_MINIMO = 8;

const ReddulIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none">
    <line x1="10" y1="24" x2="36" y2="10" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="10" y1="24" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="36" y1="10" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="10" cy="24" r="7" fill="currentColor" />
    <circle cx="36" cy="10" r="5.2" fill="currentColor" />
    <circle cx="36" cy="38" r="5.2" fill="currentColor" />
  </svg>
);

function mensagemDeErro(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('different from the old password') || err?.code === 'same_password') {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (msg.includes('weak') || msg.includes('pwned') || msg.includes('at least') || err?.code === 'weak_password') {
    return 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra, com letras e números.';
  }
  if (msg.includes('session') || err?.status === 401 || err?.status === 403) {
    return 'O link expirou. Peça um novo link de recuperação.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível salvar a nova senha. Tente novamente.';
}

export default function RedefinirSenhaPage() {
  // 'verificando' | 'pronto' | 'invalido'
  const [estado, setEstado] = useState('verificando');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let ativo = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const consulta = new URLSearchParams(window.location.search);

    // Link inválido ou vencido: o Supabase devolve o erro na própria URL.
    if (hash.get('error') || consulta.get('error')) {
      setEstado('invalido');
      return undefined;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(FLAG_RECUPERACAO, '1');
        if (ativo) setEstado('pronto');
      }
    });

    const veioPorLink = hash.get('type') === 'recovery' || sessionStorage.getItem(FLAG_RECUPERACAO) === '1';
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data?.session && veioPorLink) setEstado('pronto');
      else if (!data?.session) setEstado('invalido');
    });

    // Rede lenta: não deixa a tela esperando para sempre.
    const limite = setTimeout(() => {
      if (ativo) setEstado((atual) => (atual === 'verificando' ? 'invalido' : atual));
    }, 10000);

    return () => {
      ativo = false;
      clearTimeout(limite);
      subscription.unsubscribe();
    };
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha.length < TAMANHO_MINIMO) { setErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`); return; }
    if (senha !== confirmacao) { setErro('As senhas não conferem.'); return; }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      sessionStorage.removeItem(FLAG_RECUPERACAO);
      toast({ title: 'Senha alterada!', description: 'Entrando no sistema...' });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[RedefinirSenha] Erro ao salvar senha:', err);
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  };

  const campo = 'w-full h-11 px-4 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none transition-all focus:border-red-500 focus:bg-white';

  return (
    <>
      <Helmet><title>Nova senha — Reddu</title></Helmet>
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center">
            <ReddulIcon className="h-7 w-7 text-white" />
          </div>
          <span className="font-bold tracking-tight text-2xl text-gray-900 lowercase">reddu</span>
        </div>

        <div className="w-full max-w-sm">
          {estado === 'verificando' && (
            <div className="flex flex-col items-center gap-3 text-gray-500 text-sm py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
              Validando o link...
            </div>
          )}

          {estado === 'invalido' && (
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <h1 className="font-bold tracking-tight text-xl text-gray-900 mb-2">Link inválido ou expirado</h1>
              <p className="text-sm text-gray-500 mb-6">
                O link de recuperação já foi usado ou venceu. Peça um novo para continuar.
              </p>
              <Link to="/login?recuperar=1"
                className="inline-flex w-full h-11 items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shadow-lg shadow-red-600/20">
                Pedir novo link
              </Link>
              <Link to="/login" className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-800">← Voltar ao login</Link>
            </div>
          )}

          {estado === 'pronto' && (
            <>
              <div className="mb-8">
                <h1 className="font-bold tracking-tight text-2xl text-gray-900 mb-1">Crie uma nova senha</h1>
                <p className="text-gray-500 text-sm">Escolha uma senha com pelo menos {TAMANHO_MINIMO} caracteres.</p>
              </div>

              {erro && (
                <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3" role="alert">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{erro}</p>
                </div>
              )}

              <form onSubmit={salvar} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="nova-senha" className="text-sm font-semibold text-gray-700">Nova senha</label>
                  <div className="relative">
                    <input id="nova-senha" type={mostrar ? 'text' : 'password'} value={senha}
                      onChange={(e) => { setSenha(e.target.value); if (erro) setErro(''); }}
                      autoComplete="new-password" autoFocus disabled={salvando}
                      className={campo} style={{ fontSize: '16px' }} />
                    <button type="button" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmar-senha" className="text-sm font-semibold text-gray-700">Confirmar nova senha</label>
                  <input id="confirmar-senha" type={mostrar ? 'text' : 'password'} value={confirmacao}
                    onChange={(e) => { setConfirmacao(e.target.value); if (erro) setErro(''); }}
                    autoComplete="new-password" disabled={salvando}
                    className={campo} style={{ fontSize: '16px' }} />
                </div>

                <button type="submit" disabled={salvando}
                  className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    salvando ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white active:scale-95 shadow-lg shadow-red-600/20'
                  }`}>
                  {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><KeyRound className="h-4 w-4" /> Salvar nova senha</>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
