import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, X, Loader2, CreditCard, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

// Aviso de mensalidade do Reddu (dias 16 a 20) com pagamento pela InfinitePay (Pix ou cartão).
// O cliente paga na página da InfinitePay e volta pro sistema; a baixa é automática.
// Quando o mês está pago, nada aparece.
const DIA_INICIO = 16;
const DIA_VENCIMENTO = 20;

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Lê (e limpa da barra de endereço) os dados que a InfinitePay devolve ao voltar do pagamento.
const lerRetornoInfinitePay = () => {
  try {
    const p = new URLSearchParams(window.location.search);
    const orderNsu = p.get('order_nsu');
    if (!orderNsu || !p.get('transaction_nsu')) return null;
    const retorno = { transaction_nsu: p.get('transaction_nsu'), slug: p.get('slug') || undefined };
    window.history.replaceState({}, '', window.location.pathname);
    return retorno;
  } catch (e) {
    return null;
  }
};

export default function MensalidadeAlerta() {
  const hoje = new Date();
  const dia = hoje.getDate();
  const naJanela = dia >= DIA_INICIO && dia <= DIA_VENCIMENTO;
  const diasRestantes = DIA_VENCIMENTO - dia;
  const chaveModal = `mensalidade_modal_${hoje.getFullYear()}_${hoje.getMonth()}`;

  const [info, setInfo] = useState(null); // { pago, valor, configurado } — null = ainda carregando
  const [voltouDoPagamento, setVoltouDoPagamento] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState('');

  const chamar = useCallback(async (action, extra = {}) => {
    const { data, error } = await supabase.functions.invoke('reddu-mensalidade-pix', { body: { action, ...extra } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (_) { /* ignora */ }
      throw new Error(msg || 'Falha ao consultar a mensalidade.');
    }
    if (data && data.success === false) throw new Error(data.error || 'Falha ao consultar a mensalidade.');
    return data;
  }, []);

  const jaViuModal = () => {
    try { return !!sessionStorage.getItem(chaveModal); } catch (e) { return false; }
  };

  // Ao abrir o sistema: descobre se este mês já está pago (e, se o cliente acabou de voltar do pagamento, confirma).
  useEffect(() => {
    const retorno = lerRetornoInfinitePay();
    if (!naJanela && !retorno) return undefined;
    let vivo = true;
    chamar('status', retorno || {})
      .then((d) => {
        if (!vivo) return;
        setInfo(d);
        if (retorno) {
          setVoltouDoPagamento(true);
          setShowModal(true); // mostra "pagamento confirmado" ou "ainda conferindo"
        }
        if (d.pago) return;
        if (naJanela) {
          setShowBanner(true);
          if (!retorno && !jaViuModal()) setShowModal(true);
        }
      })
      .catch(() => {
        // função indisponível / sem rede: mantém o aviso de sempre, sem o botão de pagar
        if (!vivo || !naJanela) return;
        setInfo({ pago: false, configurado: false });
        setShowBanner(true);
        if (!jaViuModal()) setShowModal(true);
      });
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = () => {
    try { sessionStorage.setItem(chaveModal, 'true'); } catch (e) { /* ignore */ }
    setShowModal(false);
  };

  const pagar = async () => {
    setAbrindo(true); setErro('');
    try {
      const d = await chamar('gerar', { retorno_url: `${window.location.origin}/dashboard` });
      if (d.pago) { setInfo((i) => ({ ...(i || {}), pago: true })); setShowBanner(false); setAbrindo(false); return; }
      if (!d.url) throw new Error('Não foi possível abrir o pagamento.');
      window.location.href = d.url; // segue pra página da InfinitePay
    } catch (e) {
      setErro(e.message);
      setAbrindo(false);
    }
  };

  const conferirAgora = async () => {
    setVerificando(true); setErro('');
    try {
      const d = await chamar('status');
      setInfo((i) => ({ ...(i || {}), ...d }));
      if (d.pago) setShowBanner(false);
      else setErro('Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns segundos e confira de novo.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setVerificando(false);
    }
  };

  if (!info) return null;
  if (!naJanela && !voltouDoPagamento) return null;

  const pago = !!info.pago;
  const podePagar = !!info.configurado && !pago;

  return (
    <>
      {showBanner && !pago && (
        <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">
              Lembrete: mensalidade vence dia {DIA_VENCIMENTO}
              {diasRestantes === 0 ? ' — hoje!' : ` (faltam ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''})`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {podePagar && (
              <button
                onClick={() => { setErro(''); setShowModal(true); }}
                className="bg-white text-amber-700 hover:bg-amber-50 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" /> Pagar agora
              </button>
            )}
            <button onClick={() => setShowBanner(false)} className="hover:bg-amber-600 rounded-full p-0.5 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-y-auto">
            {pago ? (
              <>
                <div className="bg-green-600 px-6 py-5 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-white flex-shrink-0" />
                  <div>
                    <h2 className="text-white font-bold text-lg">Pagamento confirmado!</h2>
                    <p className="text-green-100 text-sm">Mensalidade deste mês em dia. Obrigado!</p>
                  </div>
                </div>
                <div className="p-6">
                  <button onClick={() => setShowModal(false)} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl">
                    Fechar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-amber-500 px-6 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">Lembrete de Mensalidade</h2>
                    <p className="text-amber-100 text-sm">
                      {naJanela ? `Vencimento em ${diasRestantes === 0 ? 'hoje' : `${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`}` : 'Mensalidade em aberto'}
                    </p>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {voltouDoPagamento ? (
                    <p className="text-gray-700 text-sm leading-relaxed">
                      Ainda não identificamos o seu pagamento. Se você acabou de pagar, pode levar alguns segundos: toque em <strong>"Já paguei, conferir"</strong>.
                    </p>
                  ) : (
                    <>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        Olá! Lembramos que o pagamento da mensalidade do sistema <strong>Reddu</strong> vence todo dia <strong>{DIA_VENCIMENTO}</strong> do mês.
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-amber-800 text-sm font-medium">📅 Vencimento: dia {DIA_VENCIMENTO} de cada mês</p>
                        {info.valor > 0 && <p className="text-amber-800 text-sm mt-1">Valor: <strong>{brl(info.valor)}</strong></p>}
                        <p className="text-amber-700 text-xs mt-1">Mantenha o pagamento em dia para evitar interrupção do serviço.</p>
                      </div>
                      {podePagar && (
                        <p className="text-gray-500 text-xs">
                          Você será levado à página segura da InfinitePay para pagar com Pix ou cartão. Depois de pagar, toque em <strong>"Continuar"</strong> para voltar ao sistema: a baixa é automática.
                        </p>
                      )}
                      {!podePagar && <p className="text-gray-500 text-xs">Em caso de dúvidas, entre em contato com o suporte.</p>}
                    </>
                  )}

                  {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{erro}</p>}
                </div>

                <div className="px-6 pb-6 space-y-2">
                  {podePagar && (
                    <button
                      onClick={pagar}
                      disabled={abrindo}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {abrindo ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                      {abrindo ? 'Abrindo pagamento...' : `Pagar com Pix ou cartão${info.valor > 0 ? ` · ${brl(info.valor)}` : ''}`}
                    </button>
                  )}
                  {podePagar && (
                    <button
                      onClick={conferirAgora}
                      disabled={verificando}
                      className="w-full bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      {verificando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Já paguei, conferir
                    </button>
                  )}
                  <button
                    onClick={fechar}
                    className={`w-full font-bold py-3 rounded-xl transition-colors ${podePagar ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                  >
                    {podePagar ? 'Pagar depois' : 'Entendido, obrigado!'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}