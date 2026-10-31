import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { handleAuthError } from '@/utils/authErrorHandler';
import EsqueciSenhaForm from '@/components/auth/EsqueciSenhaForm';
import loginHero from '@/assets/loginHero';
import { LogIn, Eye, EyeOff, Loader2, AlertCircle, Package, RefreshCw } from 'lucide-react';

// Símbolo Reddu: três pontos conectados (rede de mercados/operação)
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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [recuperando, setRecuperando] = useState(() => new URLSearchParams(window.location.search).get('recuperar') === '1');

  const emailRef = useRef(null);
  const { login, resendConfirmation, clearAuthSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'session_expired') {
      setGlobalError('Sua sessão expirou. Por favor, faça login novamente.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (emailRef.current && !globalError) emailRef.current.focus();
  }, [globalError]);

  const handleInputChange = (field, value) => {
    if (field === 'email') { setEmail(value); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: null })); }
    else { setPassword(value); if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: null })); }
    if (globalError) setGlobalError('');
  };

  const handleClearError = () => { setGlobalError(''); if (emailRef.current) emailRef.current.focus(); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError('');
    setNeedsConfirmation(false);

    const errors = {};
    if (!email.trim()) errors.email = 'E-mail é obrigatório';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'E-mail inválido';
    if (!password) errors.password = 'Senha é obrigatória';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setLoading(true);
    try {
      const { error } = await login({ email, password });
      if (error) {
        const { message, requiresLogout } = handleAuthError(error);
        if (requiresLogout && clearAuthSession) await clearAuthSession();
        if (message.includes('não confirmado') || error.message?.toLowerCase().includes('email not confirmed')) {
          setNeedsConfirmation(true);
          setGlobalError('Sua conta precisa ser confirmada. Verifique seu e-mail.');
        } else {
          setGlobalError(message);
        }
      } else {
        toast({ title: 'Login realizado!', description: 'Redirecionando...' });
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    } catch (err) {
      setGlobalError('Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    try {
      await resendConfirmation(email);
      toast({ title: 'E-mail enviado!', description: 'Verifique sua caixa de entrada.' });
    } catch {
      toast({ title: 'Erro ao reenviar', variant: 'destructive' });
    }
  };

  return (
    <>
      <Helmet><title>Entrar — Reddu</title></Helmet>

      <div className="min-h-screen flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

        {/* Left side — branding com foto */}
        <div className="hidden lg:flex lg:w-1/2 bg-white p-4">
          <div className="relative flex-1 rounded-3xl overflow-hidden bg-[#0F172A] flex flex-col justify-between p-10">
            {/* Foto de fundo + degradês pra garantir leitura do texto */}
            <img
              src={loginHero}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: '50% 30%' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-transparent h-1/4" />
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/85 to-transparent" />

            {/* Logo */}
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
                <ReddulIcon className="h-8 w-8 text-white" />
              </div>
              <span className="font-bold tracking-tight text-3xl text-white lowercase drop-shadow">
                reddu
              </span>
            </div>

            {/* Texto sobre a foto */}
            <div className="relative">
              <h2 style={{ lineHeight: 1.15 }}
                className="font-black tracking-tight text-4xl text-white mb-4">
                Gestão inteligente<br />
                para quem <span className="text-red-500">produz</span><br />
                e <span className="text-red-500">vende.</span>
              </h2>
              <p className="text-gray-300 text-base leading-relaxed max-w-sm">
                Do freezer até a venda — controle de estoque por lote, PDV com NF-e e relatórios que realmente ajudam a decidir.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 mt-6">
                {['PDV + NF-e', 'Estoque por lote', 'Cardápio digital', 'Mercados', 'WhatsApp', 'Assistente IA'].map(f => (
                  <span key={f} className="bg-white/10 backdrop-blur-sm border border-white/15 text-gray-100 text-xs px-3 py-1.5 rounded-full">
                    {f}
                  </span>
                ))}
              </div>

              <p className="text-gray-500 text-xs mt-8">© 2026 Reddu. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>

        {/* Right side — form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-6 py-12">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center">
              <ReddulIcon className="h-7 w-7 text-white" />
            </div>
            <span className="font-bold tracking-tight text-2xl text-gray-900 lowercase">
              reddu
            </span>
          </div>

          <div className="w-full max-w-sm">
            {recuperando ? (
              <EsqueciSenhaForm emailInicial={email} onVoltar={() => setRecuperando(false)} />
            ) : (<>
            <div className="mb-8">
              <h1
                className="font-bold tracking-tight text-2xl text-gray-900 mb-1">
                Bem-vindo de volta
              </h1>
              <p className="text-gray-500 text-sm">Entre na sua conta para continuar</p>
            </div>

            {/* Error */}
            {globalError && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">{globalError}</p>
                  {needsConfirmation && (
                    <button onClick={handleResendConfirmation}
                      className="text-xs text-red-600 underline mt-1 hover:text-red-800">
                      Reenviar e-mail de confirmação
                    </button>
                  )}
                </div>
                <button onClick={handleClearError} className="text-red-400 hover:text-red-600">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-semibold text-gray-700">E-mail</label>
                <input
                  ref={emailRef}
                  id="email"
                  type="text"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: null })); if (globalError) setGlobalError(''); }}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  disabled={loading}
                  className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition-all ${
                    fieldErrors.email
                      ? 'border-red-400 bg-red-50 focus:border-red-500'
                      : 'border-gray-200 bg-gray-50 focus:border-red-500 focus:bg-white'
                  }`}
                  style={{ fontSize: '16px' }}
                />
                {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-semibold text-gray-700">Senha</label>
                  <button type="button" onClick={() => setRecuperando(true)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700">
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: null })); if (globalError) setGlobalError(''); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    className={`w-full h-11 px-4 pr-11 rounded-xl border text-sm outline-none transition-all ${
                      fieldErrors.password
                        ? 'border-red-400 bg-red-50 focus:border-red-500'
                        : 'border-gray-200 bg-gray-50 focus:border-red-500 focus:bg-white'
                    }`}
                    style={{ fontSize: '16px' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-red-500">{fieldErrors.password}</p>}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  loading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white active:scale-95 shadow-lg shadow-red-600/20'
                }`}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Entrando...</>
                ) : (
                  <><LogIn className="h-4 w-4" /> Entrar</>
                )}
              </button>
            </form>
            </>)}

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Ainda não tem uma conta?{' '}
                <a href="https://wa.me/5519988992192?text=Olá!%20Tenho%20interesse%20no%20Reddu."
                  target="_blank" rel="noreferrer"
                  className="text-red-600 hover:text-red-700 font-semibold">
                  Fale conosco →
                </a>
              </p>
            </div>

            <div className="mt-4 text-center">
              <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
                ← Voltar ao site
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}