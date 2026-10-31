import React, { useState, useEffect } from 'react';
import { Loader2, Mail, MailCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const ESPERA_REENVIO_S = 60;

function mensagemDeErro(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (err?.status === 429 || msg.includes('rate limit') || msg.includes('security purposes') || msg.includes('only request this after')) {
    return 'Você pediu o link há pouco tempo. Aguarde cerca de 1 minuto e tente de novo.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.';
}

export default function EsqueciSenhaForm({ emailInicial = '', onVoltar }) {
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const enviar = async (e) => {
    if (e) e.preventDefault();
    setErro('');
    const valor = email.trim();
    if (!valor) { setErro('Informe o e-mail da sua conta.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) { setErro('E-mail inválido.'); return; }

    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(valor, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      setEnviado(true);
      setEspera(ESPERA_REENVIO_S);
    } catch (err) {
      console.error('[EsqueciSenha] Erro ao pedir recuperação:', err);
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-bold tracking-tight text-2xl text-gray-900 mb-1">Recuperar senha</h1>
        <p className="text-gray-500 text-sm">
          Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
        </p>
      </div>

      {erro && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3" role="alert">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 font-medium">{erro}</p>
        </div>
      )}

      {enviado && (
        <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3" role="status">
          <MailCheck className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-emerald-800 font-medium">Pedido enviado!</p>
            <p className="text-xs text-emerald-700 mt-1">
              Se este e-mail estiver cadastrado, você receberá o link em instantes. Olhe também a caixa de spam.
              O link vale por tempo limitado.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={enviar} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email-recuperacao" className="text-sm font-semibold text-gray-700">E-mail</label>
          <input
            id="email-recuperacao"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (erro) setErro(''); }}
            placeholder="seu@email.com"
            autoComplete="email"
            autoFocus
            disabled={enviando}
            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none transition-all focus:border-red-500 focus:bg-white"
            style={{ fontSize: '16px' }}
          />
        </div>

        <button
          type="submit"
          disabled={enviando || espera > 0}
          className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            enviando || espera > 0
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 text-white active:scale-95 shadow-lg shadow-red-600/20'
          }`}
        >
          {enviando ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
          ) : espera > 0 ? (
            <>Reenviar em {espera}s</>
          ) : (
            <><Mail className="h-4 w-4" /> {enviado ? 'Reenviar link' : 'Enviar link de recuperação'}</>
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={onVoltar}
        className="mt-5 w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
      </button>
    </div>
  );
}
