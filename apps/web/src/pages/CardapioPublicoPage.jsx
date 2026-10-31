import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, UtensilsCrossed, ImageOff, Plus, Minus, ShoppingCart, CheckCircle2, Trash2,
  Home, ClipboardList, Info, ArrowLeft, Tag, Clock, CreditCard, MapPin, Search,
Coins, User, Smartphone, Store, CalendarDays, Zap, MessageCircle, ExternalLink, Pencil } from 'lucide-react';

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const RESTRICOES_ALIMENTARES_LABELS = {
  vegetariano: 'Vegetariano',
  vegano: 'Vegano',
  organico: 'Orgânico',
  sem_gluten: 'Sem glúten',
  sem_acucar: 'Sem açúcar',
  zero_lactose: 'Zero lactose',
};

const formatarTelefone = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(t || '');
};

// O rodapé da loja é um texto livre (ex.: "Whatsapp: 5519... - Instagram: @loja").
// Reconhece WhatsApp e Instagram pra mostrar como ícones clicáveis; o resto do texto continua como texto.
function analisarRodape(texto) {
  let resto = String(texto || '');
  const contatos = [];
  const reWa = /whats(?:app)?\s*:?\s*(\+?[\d\s().-]{10,})/i;
  const reIg = /insta(?:gram)?\s*:?\s*@?([\w.]+)/i;
  const reArroba = /(^|\s)@([\w.]{3,})/;
  const wa = resto.match(reWa);
  if (wa) {
    let d = wa[1].replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    const local = d.startsWith('55') ? d.slice(2) : d;
    contatos.push({ tipo: 'whatsapp', href: `https://wa.me/${d}`, rotulo: formatarTelefone(local) });
    resto = resto.replace(wa[0], ' ');
  }
  const ig = resto.match(reIg) || resto.match(reArroba);
  if (ig) {
    const handle = ig[ig.length - 1].replace(/^@/, '');
    contatos.push({ tipo: 'instagram', href: `https://instagram.com/${handle}`, rotulo: `@${handle}` });
    resto = resto.replace(ig[0], ' ');
  }
  resto = resto.replace(/\s+/g, ' ').replace(/^[\s\-–|•·,;:]+|[\s\-–|•·,;:]+$/g, '').trim();
  return { contatos, resto };
}

function IconeRede({ tipo }) {
  if (tipo === 'instagram') {
    return (
      <span className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(45deg,#f9a03f,#e1306c 55%,#833ab4)' }}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="#fff" />
        </svg>
      </span>
    );
  }
  return (
    <span className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-green-500">
      <MessageCircle className="h-4 w-4 text-white" />
    </span>
  );
}

// Etapa do "Finalizar pedido\": aberta (cor da loja), concluída (resumo + Trocar) ou bloqueada (cinza).
function SecaoCheckout({ id, titulo, estado, cor, resumo, onTrocar, bloqueadaMsg, children }) {
  const ativa = estado === 'ativa';
  return (
    <div id={`sec-${id}`} className="rounded-lg overflow-hidden border" style={ativa ? { borderColor: cor, borderWidth: 2 } : { borderColor: '#e5e7eb' }}>
      <div
        className={`px-4 py-3 font-bold text-base ${ativa ? 'text-white' : estado === 'bloqueada' ? 'text-gray-400 bg-gray-100' : 'text-gray-800 bg-gray-100'}`}
        style={ativa ? { backgroundColor: cor } : undefined}
      >
        {titulo}
      </div>
      {ativa && <div className="p-3 space-y-2 bg-white">{children}</div>}
      {estado === 'concluida' && (
        <div className="px-4 py-3 bg-white flex items-center justify-between gap-3">
          <div className="min-w-0 text-base text-gray-800">{resumo}</div>
          <Button type="button" variant="outline" size="sm" onClick={onTrocar} style={{ borderColor: cor, color: cor }}>Trocar</Button>
        </div>
      )}
      {estado === 'bloqueada' && <div className="px-4 py-3 bg-white text-sm text-gray-400 text-center">{bloqueadaMsg}</div>}
    </div>
  );
}

function OpcaoCheckout({ icone, titulo, subtitulo, selecionada, onClick, disabled, extra, cor }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-3 ${disabled ? 'opacity-50' : 'hover:bg-gray-50'}`}
      style={selecionada ? { borderColor: cor, backgroundColor: `${cor}0d` } : undefined}
    >
      {icone && <span className="shrink-0 text-gray-600">{icone}</span>}
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-base text-gray-900">{titulo}</span>
        {subtitulo && <span className="block text-sm text-gray-500">{subtitulo}</span>}
        {extra}
      </span>
      <span className="h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center" style={{ borderColor: selecionada ? cor : '#d1d5db' }}>
        {selecionada && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />}
      </span>
    </button>
  );
}

// Campo de quantidade digitável (ao lado do +/-). Mantém um rascunho enquanto
// a pessoa digita e só aplica ao sair do campo / apertar Enter.
// No celular, janelas (combo/adicionais e finalizar pedido) ocupam a tela inteira, com o botão
// de ação fixo no rodapé. No computador continuam como janela centralizada.
const DIALOG_TELA_CHEIA = '!bg-[#eceef1] overflow-y-auto max-h-[90vh] max-sm:!left-0 max-sm:!top-0 max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!w-screen max-sm:!max-w-none max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!rounded-none max-sm:!border-0 max-sm:!p-4 max-sm:!flex max-sm:flex-col max-sm:[&>*]:shrink-0';
const RODAPE_FIXO = 'max-sm:mt-auto max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-white max-sm:-mx-4 max-sm:-mb-4 max-sm:px-4 max-sm:py-3 max-sm:border-t max-sm:shadow-[0_-4px_12px_rgba(0,0,0,0.06)] max-sm:gap-2';

// Tela do cartão de crédito (Mercado Pago). Usa o "Card Payment Brick" do Mercado Pago: os campos do
// cartão ficam num iframe DELES — número, validade e CVV nunca passam pelo nosso site nem pelo Reddu.
// Só um token de uso único volta pra cá e vai pra função mercadopago-pagar-cartao, que cobra o valor
// que está gravado no pedido (não o que o navegador mandar).
function carregarSdkMercadoPago() {
  if (window.MercadoPago) return Promise.resolve();
  if (window.__mpSdkPromise) return window.__mpSdkPromise;
  window.__mpSdkPromise = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://sdk.mercadopago.com/js/v2';
    sc.async = true;
    sc.onload = () => resolve();
    sc.onerror = () => { window.__mpSdkPromise = null; reject(new Error('Não foi possível carregar o pagamento por cartão.')); };
    document.head.appendChild(sc);
  });
  return window.__mpSdkPromise;
}

function TelaCartaoMP({ publicKey, maxParcelas, total, pedidoId, numeroPedido, aguardando, formatPreco, onAprovado, onAguardando, onFechar, toast }) {
  const [erroCarga, setErroCarga] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const callbacksRef = useRef({});
  callbacksRef.current = { onAprovado, onAguardando, toast };

  useEffect(() => {
    if (aguardando) return undefined;
    let brick = null;
    let cancelado = false;
    setErroCarga(''); setCarregando(true);
    (async () => {
      try {
        // Marca o pedido como "pagamento por cartão pendente" (a loja já vê o aviso).
        await supabase.functions.invoke('mercadopago-pagar-cartao', { body: { pedido_id: pedidoId, preparar: true } });
        await carregarSdkMercadoPago();
        if (cancelado) return;
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        brick = await mp.bricks().create('cardPayment', 'mp-card-brick', {
          initialization: { amount: Number(total) },
          customization: {
            paymentMethods: {
              types: { excluded: ['debit_card'] },
              minInstallments: 1,
              maxInstallments: Math.max(1, Number(maxParcelas) || 1),
            },
            visual: { hidePaymentButton: false },
          },
          callbacks: {
            onReady: () => { if (!cancelado) setCarregando(false); },
            onError: (err) => { console.error('Erro no formulário do cartão:', err); },
            onSubmit: (formData) => new Promise((resolve, reject) => {
              supabase.functions.invoke('mercadopago-pagar-cartao', {
                body: {
                  pedido_id: pedidoId,
                  token: formData.token,
                  payment_method_id: formData.payment_method_id,
                  issuer_id: formData.issuer_id,
                  installments: formData.installments,
                  payer: formData.payer,
                },
              }).then(async ({ data, error }) => {
                if (error) {
                  let msg = 'Não foi possível processar o cartão.';
                  try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (e) { /* ignore */ }
                  throw new Error(msg);
                }
                if (!data?.success) throw new Error(data?.error || 'Não foi possível processar o cartão.');
                if (data.status === 'pago') { resolve(); callbacksRef.current.onAprovado(); return; }
                if (data.status === 'falhou') {
                  callbacksRef.current.toast({ title: 'Cartão recusado', description: data.motivo || 'Tente outro cartão ou pague com PIX.', variant: 'destructive' });
                  reject(); return;
                }
                resolve(); callbacksRef.current.onAguardando();
              }).catch((e) => {
                callbacksRef.current.toast({ title: 'Pagamento não concluído', description: e.message, variant: 'destructive' });
                reject();
              });
            }),
          },
        });
      } catch (e) {
        console.error(e);
        if (!cancelado) { setErroCarga(e.message || 'Não foi possível carregar o pagamento por cartão.'); setCarregando(false); }
      }
    })();
    return () => { cancelado = true; try { brick?.unmount?.(); } catch (e) { /* ignore */ } };
  }, [aguardando, tentativa, publicKey, pedidoId, total, maxParcelas]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#eceef1] p-4 pt-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Pedido #{numeroPedido} — Cartão de crédito</h1>
        <p className="text-gray-500 mt-1 mb-4 text-center">{formatPreco(total)}</p>
        {aguardando ? (
          <div className="bg-white border rounded-xl p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
            <p className="font-semibold text-gray-800 mt-3">Pagamento em análise</p>
            <p className="text-sm text-gray-500 mt-1">O banco está analisando a compra. Assim que for aprovada, seu pedido é confirmado aqui.</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl p-3">
            {carregando && !erroCarga && (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregando pagamento seguro...</div>
            )}
            {erroCarga && (
              <div className="text-center py-6">
                <p className="text-red-600 text-sm">{erroCarga}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</Button>
              </div>
            )}
            <div id="mp-card-brick" />
            <p className="text-xs text-gray-400 text-center mt-2">🔒 Pagamento processado pelo Mercado Pago. Os dados do cartão não passam pelo nosso site.</p>
          </div>
        )}
        <div className="text-center">
          <Button type="button" variant="ghost" size="sm" className="mt-4 text-gray-500" onClick={onFechar}>Fechar e pagar depois</Button>
          <p className="text-sm text-gray-400 mt-1">O pedido já foi registrado. Você pode voltar em "Meus Pedidos" pra terminar o pagamento.</p>
        </div>
      </div>
    </div>
  );
}

function QtdInput({ value, onCommit, className = '', campo = false }) {
  const [draft, setDraft] = useState(String(value));
  const [focado, setFocado] = useState(false);
  useEffect(() => { if (!focado) setDraft(String(value)); }, [value, focado]);
  const aplicar = () => {
    setFocado(false);
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onCommit(n); else setDraft(String(value));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label="Quantidade"
      value={draft}
      onFocus={(e) => { setFocado(true); e.target.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))}
      onBlur={aplicar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={campo ? undefined : { width: `${Math.max(2, draft.length + 0.6)}ch` }}
      className={campo
        ? `w-14 h-9 text-center font-bold bg-white border border-gray-300 rounded-md shadow-inner outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-300 ${className}`
        : `text-center font-bold bg-transparent outline-none rounded focus:bg-white focus:ring-1 focus:ring-gray-300 ${className}`}
    />
  );
}

// Combo em modo "mínimo" = livre OU "permite comprar acima do pacote".
const comboEhMinimo = (item) => item.combo_modo === 'livre' || !!item.combo_permite_acima;
// Total máximo de unidades que o cliente pode escolher num combo.
const comboLimiteTotal = (item) => (comboEhMinimo(item) ? (item.quantidade_maxima || Infinity) : item.combo_quantidade_total);
// Acima do pacote o preço é proporcional (preço × total / pacote).
const fatorPrecoCombo = (item, total) => (
  item.combo_permite_acima && Number(item.preco) > 0 && total > item.combo_quantidade_total
    ? total / item.combo_quantidade_total : 1
);
// Janela de horário do item (além dos dias da semana). Aceita janela que vira a noite.
const itemNoHorario = (item, agora) => {
  const ini = item.horario_disponivel_inicio?.slice(0, 5);
  const fim = item.horario_disponivel_fim?.slice(0, 5);
  if (!ini || !fim) return true;
  const hhmm = agora.toTimeString().slice(0, 5);
  return ini <= fim ? (hhmm >= ini && hhmm <= fim) : (hhmm >= ini || hhmm <= fim);
};

// Quando uma Edge Function responde com status de erro (400/500...), o
// supabase-js só expõe um texto genérico em error.message ("Edge Function
// returned a non-2xx status code") - a mensagem real que a função mandou
// (ex: "A loja ainda não configurou a taxa de entrega") fica no corpo da
// resposta, acessível via error.context. Essa função tenta ler o corpo de
// verdade e cai pro texto genérico só se não conseguir.
async function extrairErroFuncao(error, fallback = 'Tente novamente em instantes.') {
  if (!error) return fallback;
  try {
    if (error.context && typeof error.context.json === 'function') {
      const corpo = await error.context.clone().json();
      if (corpo?.error) return corpo.error;
    }
  } catch (e) { /* corpo não era JSON ou já foi consumido - segue pro fallback */ }
  return error.message || fallback;
}

// modoBalcao: o MESMO cardápio que o cliente vê, usado pelo atendente na loja
// (tela "Pedidos Balcão"). Diferenças: usa o slug passado por prop, ignora loja
// fechada/horário, não oferece PIX, não guarda nem preenche dados de cliente
// anterior, não mexe no manifest/PWA e o pedido já entra como ACEITO em
// "Pedidos Agendados" (origem 'balcao').
// InfinitePay: guarda o que a tela de confirmação precisa mostrar quando o cliente volta da página de pagamento.
const guardarPedidoIP = (info) => {
  try {
    localStorage.setItem(`cardapio_ip_pedido_${info.id}`, JSON.stringify({
      numeroPedido: info.numeroPedido, total: info.total,
      dataAgendamento: info.dataAgendamento || null, previsao: info.previsao || null,
    }));
  } catch (e) { /* sem localStorage, segue */ }
};

export default function CardapioPublicoPage({ modoBalcao = false, slugOverride = null }) {
  const paramsRota = useParams();
  const slug = slugOverride || paramsRota.slug;
  const chaveClienteLS = `${modoBalcao ? 'cardapio_balcao_' : 'cardapio_cliente_'}${slug}`;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [empresa, setEmpresa] = useState(null);
  const [categoriasBrutas, setCategoriasBrutas] = useState([]);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [agoraTick, setAgoraTick] = useState(() => new Date());
  // Itens/categorias visíveis agora (dia da semana + horário do item). Reavalia a cada minuto.
  const itensPorCategoria = useMemo(() => {
    const dia = agoraTick.getDay();
    const grouped = {};
    itensBrutos
      .filter((item) => (!item.dias_disponiveis || item.dias_disponiveis.length === 0 || item.dias_disponiveis.includes(dia)) && itemNoHorario(item, agoraTick))
      .forEach((item) => {
        grouped[item.categoria_id] = grouped[item.categoria_id] || [];
        grouped[item.categoria_id].push(item);
      });
    return grouped;
  }, [itensBrutos, agoraTick]);
  const categorias = useMemo(
    () => categoriasBrutas.filter((c) => itensPorCategoria[c.id]?.length > 0),
    [categoriasBrutas, itensPorCategoria]
  );
  useEffect(() => {
    const t = setInterval(() => setAgoraTick(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const headerRef = useRef(null);
  const abasRef = useRef(null);
  const travaScrollAteRef = useRef(0);
  const [categoriaAtivaId, setCategoriaAtivaId] = useState(null);
  const [saboresPorItem, setSaboresPorItem] = useState({});
  const [gruposPorItem, setGruposPorItem] = useState({});

  // Carrinho: array de entradas (não objeto por id), porque um item combo
  // pode ter mais de uma combinação de sabores diferente ao mesmo tempo.
  const [cart, setCart] = useState([]);
  const [comboItemAberto, setComboItemAberto] = useState(null);
  const [comboSelecoes, setComboSelecoes] = useState({});
  const [adicionaisSelecionados, setAdicionaisSelecionados] = useState({});

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [form, setForm] = useState(() => {
    let salvo = {};
    try {
      salvo = JSON.parse(localStorage.getItem(chaveClienteLS) || '{}');
    } catch (e) { /* ignora se der erro */ }
    return {
      nome: salvo.nome || '', telefone: salvo.telefone || '', tipo_entrega: 'retirada',
      enderecoRua: '', enderecoNumero: '', enderecoComplemento: '',
      observacao: '', quando: 'agora', dataAgendamento: '',
    };
  });
  const [cupomInput, setCupomInput] = useState('');
  const [cupomAplicado, setCupomAplicado] = useState(null); // { codigo, desconto }
  const [validandoCupom, setValidandoCupom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taxaEntregaInfo, setTaxaEntregaInfo] = useState(null); // { distanciaKm, taxa, dentroDaArea }
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [sugestoesEndereco, setSugestoesEndereco] = useState([]);
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);

  const [viewAtual, setViewAtual] = useState('inicio'); // inicio | perfil | promocoes | pedidos
  const [buscaProduto, setBuscaProduto] = useState('');
  const [promocoes, setPromocoes] = useState([]);
  const [promocoesCarregadas, setPromocoesCarregadas] = useState(false);
  const [buscaNome, setBuscaNome] = useState(() => {
    try { return JSON.parse(localStorage.getItem(chaveClienteLS) || '{}').nome || ''; } catch (e) { return ''; }
  });
  const [buscaTelefone, setBuscaTelefone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(chaveClienteLS) || '{}').telefone || ''; } catch (e) { return ''; }
  });
  const [pedidosCliente, setPedidosCliente] = useState(null);
  const [historicoPedidos, setHistoricoPedidos] = useState(null); // histórico do cliente (alimenta o "Peça de novo")
  const [buscandoPedidos, setBuscandoPedidos] = useState(false);
  const [pedidoDetalheAberto, setPedidoDetalheAberto] = useState(null);
  const [pedidoEmAndamento, setPedidoEmAndamento] = useState(null);
  const [pagamentoConfigPublico, setPagamentoConfigPublico] = useState({ provider: 'cielo', pix_ativo: false, cartao_ativo: false, pagamento_obrigatorio: false });
  const [formaPagamento, setFormaPagamento] = useState('entrega'); // 'pix' | 'entrega'
  const [pagamentoEntregaTipo, setPagamentoEntregaTipo] = useState('dinheiro'); // 'dinheiro' | 'cartao' (quando paga na entrega/retirada)
  const [trocoPara, setTrocoPara] = useState('');
  const [pagamentoAtual, setPagamentoAtual] = useState(null); // { pedidoId, numeroPedido, qrCodeBase64, qrCodeString }
  const [retomandoPagamentoId, setRetomandoPagamentoId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [verificandoPagamento, setVerificandoPagamento] = useState(false);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [cashbackInfo, setCashbackInfo] = useState(null); // resposta de rpc_cashback_consultar (config + saldo + extrato)
  const [usarCashback, setUsarCashback] = useState(true); // cliente pode desmarcar no checkout
  const [carregandoCashback, setCarregandoCashback] = useState(false);

  // Finalizar pedido em etapas (cliente só avança conforme responde a etapa anterior)
  const [dadosSalvos] = useState(() => {
    try {
      const sv = JSON.parse(localStorage.getItem(chaveClienteLS) || '{}');
      return !modoBalcao && String(sv.nome || '').trim().length >= 2 && String(sv.telefone || '').replace(/\D/g, '').length >= 10;
    } catch (e) { return false; }
  });
  const [enderecoSalvo, setEnderecoSalvo] = useState(() => {
    try {
      const sv = JSON.parse(localStorage.getItem(chaveClienteLS) || '{}');
      return !modoBalcao && sv.endereco && sv.endereco.rua ? sv.endereco : null;
    } catch (e) { return null; }
  });
  const [enderecosServidor, setEnderecosServidor] = useState([]); // endereços do cliente guardados no sistema (por telefone + nome)
  const [enderecoIdx, setEnderecoIdx] = useState(null); // índice do endereço escolhido, 'outro' ou null
  const [dadosConfirmados, setDadosConfirmados] = useState(false);
  const [editandoDados, setEditandoDados] = useState(false);
  const [quandoEscolhido, setQuandoEscolhido] = useState(false);
  const [receberSel, setReceberSel] = useState(null); // 'retirada' | 'entrega' | null
  const [receberEscolhido, setReceberEscolhido] = useState(false);
  const [pagamentoEscolhido, setPagamentoEscolhido] = useState(false);
  const [secaoAberta, setSecaoAberta] = useState(null); // etapa reaberta pelo "Trocar"
  const [calcPendente, setCalcPendente] = useState(false);
  const [mostrarItens, setMostrarItens] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const { data: empresaRows, error: empresaErr } = await supabase
          .rpc('rpc_get_cardapio_empresa', { p_slug: slug });

        const empresaData = empresaRows?.[0] || null;
        if (empresaErr || !empresaData) { setNotFound(true); setLoading(false); return; }
        setEmpresa(empresaData);

        const { data: cats, error: catsErr } = await supabase
          .from('cardapio_categorias')
          .select('*')
          .eq('empresa_id', empresaData.id)
          .eq('ativo', true)
          .order('ordem').order('nome');
        if (catsErr) throw catsErr;

        const mostrarEsgotados = empresaData.cardapio_config?.esgotado_comportamento === 'mostrar_desabilitado';
        let itensQuery = supabase
          .from('cardapio_itens')
          .select('*')
          .eq('empresa_id', empresaData.id)
          .order('ordem').order('nome');
        if (!mostrarEsgotados) itensQuery = itensQuery.eq('ativo', true);
        const { data: itens, error: itensErr } = await itensQuery;
        if (itensErr) throw itensErr;

        const comboItemIds = (itens || []).filter((i) => i.combo_quantidade_total != null).map((i) => i.id);
        let sabores = [];
        if (comboItemIds.length > 0) {
          const { data: saboresData, error: saboresErr } = await supabase
            .from('cardapio_combo_opcoes')
            .select('*')
            .in('cardapio_item_id', comboItemIds)
            .eq('ativo', true)
            .order('ordem');
          if (saboresErr) throw saboresErr;
          sabores = saboresData || [];
        }
        const saboresAgrupados = {};
        sabores.forEach((s) => {
          saboresAgrupados[s.cardapio_item_id] = saboresAgrupados[s.cardapio_item_id] || [];
          saboresAgrupados[s.cardapio_item_id].push(s);
        });
        setSaboresPorItem(saboresAgrupados);

        // Grupos de adicionais reaproveitáveis vinculados a cada item (ex:
        // "Molhos extras" usado tanto num salgado quanto numa bebida).
        const itemIds = (itens || []).map((i) => i.id);
        let gruposAgrupados = {};
        if (itemIds.length > 0) {
          const { data: vinculos, error: vinculosErr } = await supabase
            .from('cardapio_itens_grupos_adicionais')
            .select('cardapio_item_id, obrigatorio_override, minimo_override, maximo_override, ordem, cardapio_grupos_adicionais(id, nome, obrigatorio, minimo, maximo, ativo, cardapio_grupos_adicionais_opcoes(id, nome, preco_adicional, ativo, ordem))')
            .in('cardapio_item_id', itemIds)
            .order('ordem');
          if (!vinculosErr) {
            (vinculos || []).forEach((v) => {
              const g = v.cardapio_grupos_adicionais;
              if (!g || !g.ativo) return;
              const opcoes = (g.cardapio_grupos_adicionais_opcoes || [])
                .filter((o) => o.ativo)
                .sort((a, b) => a.ordem - b.ordem);
              if (opcoes.length === 0) return;
              gruposAgrupados[v.cardapio_item_id] = gruposAgrupados[v.cardapio_item_id] || [];
              gruposAgrupados[v.cardapio_item_id].push({
                id: g.id,
                nome: g.nome,
                obrigatorio: v.obrigatorio_override ?? g.obrigatorio,
                minimo: v.minimo_override ?? g.minimo,
                maximo: v.maximo_override ?? g.maximo,
                opcoes,
              });
            });
          }
        }
        setGruposPorItem(gruposAgrupados);

        // O filtro por dia da semana e horário do item é feito em useMemo (itensPorCategoria),
        // pra reavaliar sozinho conforme o relógio anda.
        setCategoriasBrutas(cats || []);
        setItensBrutos(itens || []);
      } catch (error) {
        console.error('Erro ao carregar cardápio público:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    if (slug) load();
  }, [slug]);

  // Abas de categoria: rolar até a seção e destacar a aba da seção visível.
  const irParaCategoria = (id) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    const offset = (headerRef.current?.offsetHeight || 0) + 8;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    travaScrollAteRef.current = Date.now() + 900; // ignora o detector durante a rolagem animada
    setCategoriaAtivaId(id);
  };
  useEffect(() => {
    if (viewAtual !== 'inicio' || categorias.length === 0) return undefined;
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (Date.now() < travaScrollAteRef.current) return;
        const limite = (headerRef.current?.offsetHeight || 0) + 24;
        let atual = categorias[0].id;
        for (const c of categorias) {
          const el = document.getElementById(`cat-${c.id}`);
          if (el && el.getBoundingClientRect().top <= limite) atual = c.id;
        }
        // no fim da página a última categoria nunca chega ao topo: marca ela.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) atual = categorias[categorias.length - 1].id;
        setCategoriaAtivaId(atual);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [viewAtual, categorias]);
  useEffect(() => {
    const barra = abasRef.current;
    if (!barra || !categoriaAtivaId) return;
    const btn = barra.querySelector(`[data-cat="${categoriaAtivaId}"]`);
    if (btn) barra.scrollTo({ left: btn.offsetLeft - barra.clientWidth / 2 + btn.clientWidth / 2, behavior: 'smooth' });
  }, [categoriaAtivaId]);

  // Se já tem nome/telefone salvos (pedido anterior nesse aparelho), confere
  // em segundo plano se existe pedido em andamento, pra avisar na tela inicial.
  useEffect(() => {
    if (!empresa || !buscaNome.trim() || !buscaTelefone.trim()) return;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_buscar_pedidos_cliente', {
          p_empresa_id: empresa.id,
          p_telefone: buscaTelefone.trim(),
          p_nome: buscaNome.trim(),
        });
        if (error) throw error;
        const ativo = (data || []).find((p) => !['ENTREGUE', 'CANCELADO'].includes(p.status));
        setPedidoEmAndamento(ativo || null);
        setHistoricoPedidos(data || []);
      } catch (error) {
        console.error('Erro ao checar pedido em andamento:', error);
      }
    })();
  }, [empresa]);

  // Busca a config pública de pagamento (provider + o que está ativo,
  // nunca as credenciais) assim que a empresa carrega.
  useEffect(() => {
    if (!empresa) return;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_get_pagamento_config_publico', { p_empresa_id: empresa.id });
        if (error) throw error;
        if (data) {
          setPagamentoConfigPublico(data);
          if (data.pagamento_obrigatorio && !modoBalcao) setFormaPagamento(data.provider === 'infinitepay' && (data.pix_ativo || data.cartao_ativo) ? 'infinitepay' : (data.pix_ativo ? 'pix' : (data.cartao_online ? 'cartao_online' : 'pix')));
        }
      } catch (error) {
        console.error('Erro ao carregar config de pagamento:', error);
      }
    })();
  }, [empresa]);

  const formatPreco = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // InfinitePay: o cliente paga na página deles e volta pra cá com ?order_nsu=...&transaction_nsu=...&slug=...
  // Mostra "Confirmando pagamento" e confere (a função só dá baixa se a InfinitePay confirmar o valor).
  const [ipLink, setIpLink] = useState(null);
  useEffect(() => {
    if (modoBalcao) return undefined;
    const aoVoltar = (e) => { if (e.persisted) setGerandoPix(false); }; // botão "voltar" do navegador
    window.addEventListener('pageshow', aoVoltar);
    try {
      const params = new URLSearchParams(window.location.search);
      const orderNsu = params.get('order_nsu');
      if (orderNsu && /^[0-9a-f-]{36}$/i.test(orderNsu)) {
        let info = {};
        try { info = JSON.parse(localStorage.getItem(`cardapio_ip_pedido_${orderNsu}`) || '{}'); } catch (e) { /* ignore */ }
        setPagamentoAtual({
          tipo: 'infinitepay', pedidoId: orderNsu, numeroPedido: info.numeroPedido ?? null,
          pedidoInfo: { id: orderNsu, ...info },
          retorno: { transaction_nsu: params.get('transaction_nsu'), slug: params.get('slug') },
        });
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) { /* sem URLSearchParams, ignora */ }
    return () => window.removeEventListener('pageshow', aoVoltar);
  }, []);

  // Enquanto o QR code do PIX está na tela, confere a cada 4s se já foi pago.
  useEffect(() => {
    if (!pagamentoAtual || (pagamentoAtual.tipo === 'cartao' && !pagamentoAtual.aguardando)) return;
    let cancelado = false;
    const intervalo = setInterval(async () => {
      if (cancelado) return;
      setVerificandoPagamento(true);
      try {
        const ehIP = pagamentoAtual.tipo === 'infinitepay';
        const funcaoVerificar = ehIP ? 'infinitepay-verificar-pagamento' : (pagamentoConfigPublico.provider === 'mercadopago' ? 'mercadopago-verificar-pagamento' : 'cielo-verificar-pagamento');
        const { data, error } = await supabase.functions.invoke(funcaoVerificar, {
          body: ehIP
            ? { pedido_id: pagamentoAtual.pedidoId, transaction_nsu: pagamentoAtual.retorno?.transaction_nsu || undefined, slug: pagamentoAtual.retorno?.slug || undefined }
            : { pedido_id: pagamentoAtual.pedidoId },
        });
        if (error) throw error;
        if (ehIP && data?.status === 'pendente' && data?.url) setIpLink(data.url);
        if (data?.status === 'pago') {
          clearInterval(intervalo);
          supabase.functions.invoke('enviar-confirmacao-pedido', { body: { pedido_id: pagamentoAtual.pedidoId } })
            .catch((e) => console.error('Erro ao notificar pedido por WhatsApp:', e));
          setPedidoConfirmado(ehIP
            ? { ...pagamentoAtual.pedidoInfo, numeroPedido: data.numeroPedido ?? pagamentoAtual.pedidoInfo?.numeroPedido ?? pagamentoAtual.numeroPedido, total: data.total ?? pagamentoAtual.pedidoInfo?.total }
            : pagamentoAtual.pedidoInfo);
          setPagamentoAtual(null);
        } else if (data?.status === 'falhou') {
          clearInterval(intervalo);
          toast({ title: 'Pagamento não aprovado', description: 'Tente novamente ou fale com a loja.', variant: 'destructive' });
        }
      } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
      } finally {
        setVerificandoPagamento(false);
      }
    }, 4000);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, [pagamentoAtual]);
  const formatHora = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const renderItemCard = (item) => {
    const isCombo = item.combo_quantidade_total != null;
    const temAdicionais = (gruposPorItem[item.id] || []).length > 0;
    const qtdNoCarrinho = qtdSimplesNoCarrinho(item);
    const esgotado = !item.ativo;
    return (
      <div key={item.id} className={`flex gap-3 p-3 ${esgotado ? 'opacity-50' : ''}`}>
        <div className="h-20 w-20 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
          {item.imagem_url ? (
            <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-lg text-gray-900 ${esgotado ? 'line-through' : ''}`}>{item.nome}</h3>
          {item.descricao && <p className="text-base text-gray-500 line-clamp-2 mt-0.5">{item.descricao}</p>}
          {(item.restricoes_alimentares || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.restricoes_alimentares.map((r) => (
                <span key={r} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {RESTRICOES_ALIMENTARES_LABELS[r] || r}
                </span>
              ))}
            </div>
          )}
          <p className="text-lg font-extrabold mt-1" style={{ color: esgotado ? '#9ca3af' : (corCapa || '#dc2626') }}>
            {item.combo_modo === 'livre'
              ? (() => {
                const precos = (saboresPorItem[item.id] || []).map((s) => Number(s.preco_adicional)).filter((p) => p > 0);
                return precos.length > 0 ? `A partir de ${formatPreco(Math.min(...precos))}` : 'Monte o seu';
              })()
              : formatPreco(item.preco)}
            {isCombo && item.combo_modo !== 'livre' && (
              <span className="text-sm font-medium text-gray-400">
                {' '}· {item.combo_permite_acima ? `a partir de ${item.combo_quantidade_total} un` : `${item.combo_quantidade_total} un`}
              </span>
            )}
          </p>
          {cashbackAtivo && !esgotado && item.combo_modo !== 'livre' && Number(item.preco) > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-md bg-green-100 text-green-800">
              <Coins className="h-3 w-3" />{Number(cashbackInfo.percentual)}% cashback
            </span>
          )}
        </div>
        <div className="flex items-center shrink-0">
          {esgotado ? (
            <span className="text-sm text-red-400 font-medium">Esgotado</span>
          ) : !podePedir(item) ? (
            <span className="text-sm text-gray-400 italic">Indisponível</span>
          ) : isCombo ? (
            <Button
              size="sm" variant="outline" onClick={() => abrirCombo(item)}
              style={{ borderColor: corCapa || '#dc2626', color: corCapa || '#dc2626' }}
            >
              Montar
            </Button>
          ) : temAdicionais ? (
            <Button
              size="sm" variant="outline" onClick={() => abrirCombo(item)}
              style={{ borderColor: corCapa || '#dc2626', color: corCapa || '#dc2626' }}
            >
              Adicionar
            </Button>
          ) : qtdNoCarrinho === 0 ? (
            <Button
              size="sm" onClick={() => addSimplesToCart(item)} className="rounded-full h-9 w-9 p-0"
              style={{ backgroundColor: corCapa || '#dc2626' }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-gray-100 rounded-full px-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => removeSimplesFromCart(item)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <QtdInput value={qtdNoCarrinho} onCommit={(n) => definirQtdSimples(item, n)} className="text-base" />
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => addSimplesToCart(item)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };


  // Item pedível: ativo, e (simples com produto+local OU combo com pelo menos 1 sabor cadastrado)
  const podePedir = (item) => {
    if (!item.ativo) return false;
    if (item.combo_quantidade_total != null) return (saboresPorItem[item.id]?.length || 0) > 0;
    return !!item.produto_id && !!item.local_id;
  };

  // --- Itens simples: comportamento direto, igual antes ---
  const avisarMaximo = (item) => toast({
    title: `Máximo de ${item.quantidade_maxima} por pedido`,
    description: item.nome,
    variant: 'destructive',
  });
  const addSimplesToCart = (item) => {
    const atual = cart.find((c) => c.chave === item.id)?.quantidade || 0;
    if (item.quantidade_maxima && atual + 1 > item.quantidade_maxima) { avisarMaximo(item); return; }
    setCart((prev) => {
      const existente = prev.find((c) => c.chave === item.id);
      if (existente) {
        return prev.map((c) => (c.chave === item.id ? { ...c, quantidade: c.quantidade + 1 } : c));
      }
      return [...prev, { chave: item.id, item, isCombo: false, quantidade: 1, sabores: [] }];
    });
  };
  // Quantidade digitada direto no campo.
  const definirQtdSimples = (item, n) => {
    let q = Math.max(0, Math.floor(n) || 0);
    if (item.quantidade_maxima && q > item.quantidade_maxima) { q = item.quantidade_maxima; avisarMaximo(item); }
    setCart((prev) => {
      if (q === 0) return prev.filter((c) => c.chave !== item.id);
      if (prev.some((c) => c.chave === item.id)) return prev.map((c) => (c.chave === item.id ? { ...c, quantidade: q } : c));
      return [...prev, { chave: item.id, item, isCombo: false, quantidade: q, sabores: [] }];
    });
  };
  const removeSimplesFromCart = (item) => {
    setCart((prev) => {
      const existente = prev.find((c) => c.chave === item.id);
      if (!existente) return prev;
      if (existente.quantidade <= 1) return prev.filter((c) => c.chave !== item.id);
      return prev.map((c) => (c.chave === item.id ? { ...c, quantidade: c.quantidade - 1 } : c));
    });
  };
  const qtdSimplesNoCarrinho = (item) => cart.find((c) => c.chave === item.id)?.quantidade || 0;

  // --- Itens combo e/ou com adicionais: abre customizador ---
  const abrirCombo = (item) => {
    setComboItemAberto(item);
    setComboSelecoes({});
    setAdicionaisSelecionados({});
  };
  const fecharCombo = () => {
    setComboItemAberto(null);
    setComboSelecoes({});
    setAdicionaisSelecionados({});
  };
  // Define a quantidade de um sabor respeitando o limite total do combo
  // (exato = tamanho do pacote; mínimo/acima = máximo configurado, se houver).
  const definirSabor = (opcaoId, valor) => {
    if (!comboItemAberto) return;
    const limite = comboLimiteTotal(comboItemAberto);
    setComboSelecoes((prev) => {
      const outros = Object.entries(prev).reduce((soma, [k, v]) => (k === opcaoId ? soma : soma + v), 0);
      const permitido = Math.max(0, limite - outros);
      const novo = Math.min(Math.max(0, Math.floor(valor) || 0), permitido);
      return { ...prev, [opcaoId]: novo };
    });
  };
  const ajustarSabor = (opcaoId, delta) => definirSabor(opcaoId, (comboSelecoes[opcaoId] || 0) + delta);
  const comboTotalSelecionado = Object.values(comboSelecoes).reduce((s, v) => s + v, 0);
  const comboAtingiuMinimo = (item, total) => (
    comboEhMinimo(item)
      ? total >= item.combo_quantidade_total && total <= comboLimiteTotal(item)
      : total === item.combo_quantidade_total
  );

  // --- Adicionais (grupos reaproveitáveis): seleção por checkbox, respeitando mínimo/máximo de cada grupo ---
  const toggleAdicional = (grupo, opcaoId) => {
    setAdicionaisSelecionados((prev) => {
      const atuais = prev[grupo.id] || [];
      const jaMarcado = atuais.includes(opcaoId);
      if (jaMarcado) {
        return { ...prev, [grupo.id]: atuais.filter((id) => id !== opcaoId) };
      }
      if (atuais.length >= grupo.maximo) {
        // No máximo de 1, marcar outra opção troca a selecionada em vez de ignorar o clique.
        return grupo.maximo === 1 ? { ...prev, [grupo.id]: [opcaoId] } : prev;
      }
      return { ...prev, [grupo.id]: [...atuais, opcaoId] };
    });
  };
  const gruposAdicionaisAtendidos = (item) => (gruposPorItem[item?.id] || [])
    .every((grupo) => {
      const qtd = (adicionaisSelecionados[grupo.id] || []).length;
      return qtd >= grupo.minimo && (!grupo.obrigatorio || qtd >= Math.max(grupo.minimo, 1));
    });

  const confirmarCombo = () => {
    if (!comboItemAberto) return;
    const isComboItem = comboItemAberto.combo_quantidade_total != null;
    if (isComboItem && !comboAtingiuMinimo(comboItemAberto, comboTotalSelecionado)) return;
    if (!gruposAdicionaisAtendidos(comboItemAberto)) return;

    const sabores = isComboItem
      ? (saboresPorItem[comboItemAberto.id] || [])
        .filter((s) => (comboSelecoes[s.id] || 0) > 0)
        .map((s) => ({ opcaoId: s.id, nome: s.nome, quantidade: comboSelecoes[s.id], precoAdicional: Number(s.preco_adicional) }))
      : [];

    const adicionais = (gruposPorItem[comboItemAberto.id] || []).flatMap((grupo) => (adicionaisSelecionados[grupo.id] || [])
      .map((opcaoId) => {
        const opcao = grupo.opcoes.find((o) => o.id === opcaoId);
        return opcao ? { opcaoId: opcao.id, grupoId: grupo.id, nome: opcao.nome, precoAdicional: Number(opcao.preco_adicional) } : null;
      })
      .filter(Boolean));

    setCart((prev) => [...prev, {
      chave: `${comboItemAberto.id}-${Date.now()}`,
      item: comboItemAberto,
      isCombo: isComboItem,
      quantidade: 1,
      sabores,
      adicionais,
      fatorPreco: isComboItem ? fatorPrecoCombo(comboItemAberto, comboTotalSelecionado) : 1,
    }]);
    fecharCombo();
  };

  const definirQuantidadeCaixa = (chave, n) => {
    const linha = cart.find((c) => c.chave === chave);
    if (!linha) return;
    let q = Math.max(0, Math.floor(n) || 0);
    if (!linha.isCombo && linha.item.quantidade_maxima && q > linha.item.quantidade_maxima) {
      q = linha.item.quantidade_maxima;
      avisarMaximo(linha.item);
    }
    setCart((prev) => prev
      .map((c) => (c.chave === chave ? { ...c, quantidade: q } : c))
      .filter((c) => c.quantidade > 0));
  };
  const ajustarQuantidadeCaixa = (chave, delta) => {
    const linha = cart.find((c) => c.chave === chave);
    if (linha) definirQuantidadeCaixa(chave, linha.quantidade + delta);
  };
  const removerDoCarrinho = (chave) => setCart((prev) => prev.filter((c) => c.chave !== chave));

  const precoLinha = (c) => {
    const extrasSabores = c.sabores.reduce((s, sabor) => s + sabor.precoAdicional * sabor.quantidade, 0);
    const extrasAdicionais = (c.adicionais || []).reduce((s, a) => s + a.precoAdicional, 0);
    return (c.item.preco * (c.fatorPreco || 1) + extrasSabores + extrasAdicionais) * c.quantidade;
  };
  const cartTotal = cart.reduce((sum, c) => sum + precoLinha(c), 0);
  const enderecoCompleto = form.enderecoRua.trim()
    ? `${form.enderecoRua.trim()}, ${form.enderecoNumero.trim()}${form.enderecoComplemento.trim() ? ` - ${form.enderecoComplemento.trim()}` : ''}`
    : '';
  // Pagando na entrega: quando o cliente escolhe CARTÃO e a faixa de distância tem "taxa de retorno"
  // cadastrada (motoboy volta com a maquininha), essa taxa substitui a taxa de entrega normal.
  const pagOnline = formaPagamento === 'pix' || formaPagamento === 'cartao_online' || formaPagamento === 'infinitepay';
  const infinitePayAtivo = pagamentoConfigPublico.provider === 'infinitepay' && (!!pagamentoConfigPublico.pix_ativo || !!pagamentoConfigPublico.cartao_ativo);
  const pixInternoAtivo = !!pagamentoConfigPublico.pix_ativo && pagamentoConfigPublico.provider !== 'infinitepay';
  const onlineMulti = !!pagamentoConfigPublico.cartao_online || infinitePayAtivo;
  const pagaNaEntrega = !pagOnline;
  const faixaEntregaAtual = (() => {
    const tabela = empresa?.cardapio_config?.taxa_entrega?.tabela;
    if (!taxaEntregaInfo || !Array.isArray(tabela) || tabela.length === 0) return null;
    const ordenada = [...tabela].sort((a, b) => a.ate_km - b.ate_km);
    return ordenada.find((f) => taxaEntregaInfo.distanciaKm <= f.ate_km) || ordenada[ordenada.length - 1];
  })();
  const taxaRetornoFaixa = faixaEntregaAtual && faixaEntregaAtual.taxa_retorno != null && faixaEntregaAtual.taxa_retorno !== ''
    ? Number(faixaEntregaAtual.taxa_retorno) : null;
  const usaTaxaRetorno = form.tipo_entrega === 'entrega' && pagaNaEntrega && pagamentoEntregaTipo === 'cartao' && taxaRetornoFaixa != null && !isNaN(taxaRetornoFaixa);
  const taxaEntregaAplicada = form.tipo_entrega === 'entrega' && taxaEntregaInfo
    ? (usaTaxaRetorno ? taxaRetornoFaixa : (taxaEntregaInfo.taxa || 0))
    : 0;
  const totalComDesconto = Math.max(0, cartTotal - (cupomAplicado?.desconto || 0)) + taxaEntregaAplicada;

  // Cashback: o saldo só é usado no pagamento online (Pix ou cartão online). Sempre sobra pelo menos R$ 1,00 pra pagar.
  const cashbackAtivo = !modoBalcao && !!cashbackInfo?.ativo;
  const cashbackSaldo = cashbackAtivo ? Number(cashbackInfo?.saldo || 0) : 0;
  const cashbackUsoPrevisto = cashbackAtivo && usarCashback && pagOnline && cashbackSaldo > 0
    ? Math.round(Math.max(0, Math.min(cashbackSaldo, totalComDesconto - 1)) * 100) / 100
    : 0;
  const totalAPagar = Math.max(0, totalComDesconto - cashbackUsoPrevisto);
  const cashbackGanhoPrevisto = (() => {
    if (!cashbackAtivo) return 0;
    if (cashbackInfo.so_online && !pagOnline) return 0;
    const base = Math.max(0, totalAPagar - taxaEntregaAplicada);
    return Math.round(base * Number(cashbackInfo.percentual || 0)) / 100;
  })();

  const carregarCashback = async (telefone) => {
    if (modoBalcao || !empresa?.id) return;
    setCarregandoCashback(true);
    try {
      const { data, error } = await supabase.rpc('rpc_cashback_consultar', { p_empresa_id: empresa.id, p_telefone: telefone || '' });
      if (error) throw error;
      setCashbackInfo(data || null);
    } catch (e) {
      console.error('Erro ao consultar cashback:', e);
    } finally {
      setCarregandoCashback(false);
    }
  };
  const telefoneCashback = (form.telefone || buscaTelefone || '').replace(/\D/g, '');
  useEffect(() => {
    if (modoBalcao || !empresa?.id) return undefined;
    const t = setTimeout(() => { carregarCashback(telefoneCashback.length >= 10 ? telefoneCashback : ''); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, telefoneCashback, modoBalcao]);

  const debounceRef = useRef(null);
  const handleDigitarRua = (texto) => {
    setForm((f) => ({ ...f, enderecoRua: texto }));
    setTaxaEntregaInfo(null);
    setMostrarSugestoes(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 3) {
      setSugestoesEndereco([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoSugestoes(true);
      try {
        const { data, error } = await supabase.functions.invoke('autocompletar-endereco', { body: { input: texto } });
        if (error) throw error;
        setSugestoesEndereco(data?.sugestoes || []);
      } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
      } finally {
        setBuscandoSugestoes(false);
      }
    }, 400);
  };
  const selecionarSugestao = (sugestao) => {
    setForm((f) => ({ ...f, enderecoRua: sugestao.descricao }));
    setSugestoesEndereco([]);
    setMostrarSugestoes(false);
  };

  const handleCalcularTaxaEntrega = async () => {
    if (!form.enderecoRua.trim() || !form.enderecoNumero.trim()) {
      toast({ title: 'Informe rua e número primeiro', variant: 'destructive' });
      return;
    }
    setCalculandoTaxa(true);
    setTaxaEntregaInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('calcular-taxa-entrega', {
        body: { empresa_id: empresa.id, endereco_destino: enderecoCompleto },
      });
      if (error) {
        toast({ title: 'Não foi possível calcular a taxa', description: await extrairErroFuncao(error), variant: 'destructive' });
        return;
      }
      if (!data.success) {
        toast({ title: 'Não foi possível calcular a taxa', description: data.error, variant: 'destructive' });
        return;
      }
      if (!data.dentro_da_area) {
        toast({ title: 'Fora da área de entrega', description: `Sua distância (${data.distancia_km}km) está fora do que entregamos.`, variant: 'destructive' });
        return;
      }
      setTaxaEntregaInfo({ distanciaKm: data.distancia_km, taxa: data.taxa, bairro: data.bairro || null });
    } catch (error) {
      toast({ title: 'Erro ao calcular taxa de entrega', description: await extrairErroFuncao(error), variant: 'destructive' });
    } finally {
      setCalculandoTaxa(false);
    }
  };

  const handleAplicarCupom = async () => {
    if (!cupomInput.trim()) return;
    setValidandoCupom(true);
    try {
      const { data, error } = await supabase.rpc('rpc_validar_cupom_cardapio', {
        p_empresa_id: empresa.id,
        p_codigo: cupomInput.trim(),
        p_subtotal: cartTotal,
        p_cliente_telefone: form.telefone.trim() || null,
      });
      if (error) throw error;
      if (!data.valido) {
        toast({ title: data.motivo || 'Cupom inválido', variant: 'destructive' });
        setCupomAplicado(null);
        return;
      }
      setCupomAplicado({ codigo: data.codigo, desconto: data.desconto });
      toast({ title: 'Cupom aplicado!', description: `Desconto de ${formatPreco(data.desconto)}` });
    } catch (error) {
      toast({ title: 'Erro ao validar cupom', description: error.message, variant: 'destructive' });
    } finally {
      setValidandoCupom(false);
    }
  };
  const handleRemoverCupom = () => { setCupomAplicado(null); setCupomInput(''); };
  const cartCount = cart.reduce((sum, c) => sum + c.quantidade, 0);

  const whatsapp = empresa?.cardapio_config?.whatsapp;
  const mensagemTopo = empresa?.cardapio_config?.mensagem_topo;
  const corCapa = empresa?.cardapio_config?.cor_capa || null;
  const capaUrl = empresa?.cardapio_config?.capa_url || null;
  const iconeAppUrl = empresa?.cardapio_config?.icone_app_url || null;

  // PWA por empresa: o app principal (Reddu) já tem seu próprio manifest
  // fixo em index.html, mas essa página é multi-tenant (uma pra cada
  // negócio em /cardapio/:slug) — então o cardápio de cada cliente precisa
  // do seu próprio manifest, com o nome/ícone/cor daquela loja, não do
  // Reddu. Gerado na hora via data URI (sem precisar de arquivo/edge
  // function), com fallback pro ícone genérico do Reddu se a loja não
  // configurou o próprio em Loja & Publicação.
  const iconeAppPwa = iconeAppUrl || `${window.location.origin}/icon-512x512.png`;
  const manifestPwaHref = empresa ? `data:application/json,${encodeURIComponent(JSON.stringify({
    name: `${empresa.nome} - Cardápio`,
    short_name: empresa.nome,
    start_url: `/cardapio/${slug}`,
    scope: `/cardapio/${slug}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: corCapa || '#dc2626',
    icons: [
      { src: iconeAppPwa, sizes: '192x192' },
      { src: iconeAppPwa, sizes: '512x512' },
    ],
  }))}` : null;

  const descricaoLoja = empresa?.cardapio_config?.descricao_loja || null;
  const rodape = empresa?.cardapio_config?.rodape || null;
  const enderecoLoja = empresa?.cardapio_config?.endereco || null;
  const taxaEntregaTabela = empresa?.cardapio_config?.taxa_entrega?.tabela || [];
  const valorMinimoEntrega = Number(empresa?.cardapio_config?.valor_minimo_entrega) || 0;
  const tempoPreparo = empresa?.cardapio_config?.tempo_preparo || {};
  const previsaoAtual = form.tipo_entrega === 'entrega'
    ? { min: tempoPreparo.entrega_min, max: tempoPreparo.entrega_max }
    : { min: tempoPreparo.retirada_min, max: tempoPreparo.retirada_max };
  const temPrevisao = previsaoAtual.min != null && previsaoAtual.max != null;
  const formasPagamentoLoja = empresa?.cardapio_config?.formas_pagamento || [];
  const idsDestaque = empresa?.cardapio_config?.produtos_destaque || [];
  const itensDestaque = idsDestaque
    .map((id) => Object.values(itensPorCategoria).flat().find((i) => i.id === id))
    .filter((i) => i && podePedir(i));
  const todosItens = Object.values(itensPorCategoria).flat();
  const termoBusca = buscaProduto.trim().toLowerCase();
  const itensBuscados = termoBusca
    ? todosItens.filter((i) => i.nome.toLowerCase().includes(termoBusca) || i.descricao?.toLowerCase().includes(termoBusca))
    : [];
  const agendamentoAtivo = !!empresa?.cardapio_config?.agendamento_ativo;
  const antecedenciaHoras = Number(empresa?.cardapio_config?.antecedencia_minima_horas ?? 0);
  const horariosConfig = empresa?.cardapio_config?.horarios || null;
  const getHorarioDoDia = (date) => horariosConfig?.[date.getDay()] || null;
  const lojaStatusManual = empresa?.cardapio_config?.loja_status_manual || null; // 'fechada' | 'aberta' | null
  const lojaAbertaAgora = modoBalcao || (() => {
    if (lojaStatusManual === 'fechada') return false;
    if (lojaStatusManual === 'aberta') return true;
    if (!horariosConfig) return true; // não configurado ainda = não restringe (comportamento de sempre)
    const h = getHorarioDoDia(new Date());
    if (!h || !h.ativo) return false;
    const agora = new Date().toTimeString().slice(0, 5);
    return agora >= h.abertura && agora <= h.fechamento;
  })();
  // Linha "Aberto até 18h00 / Abre amanhã às 09h20" da tela inicial.
  const infoHorario = (() => {
    if (lojaStatusManual === 'fechada') return 'Loja fechada no momento';
    if (!horariosConfig) return null;
    const fmt = (h) => String(h || '').replace(':', 'h');
    const agora = new Date();
    const hoje = horariosConfig[agora.getDay()];
    const hhmm = agora.toTimeString().slice(0, 5);
    if (hoje?.ativo) {
      if (hhmm < hoje.abertura) return `Abre hoje às ${fmt(hoje.abertura)}`;
      if (hhmm <= hoje.fechamento) return `Aberto até ${fmt(hoje.fechamento)}`;
    }
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const h = horariosConfig[d.getDay()];
      if (h?.ativo) {
        return i === 1
          ? `Abre amanhã às ${fmt(h.abertura)}`
          : `Abre ${DIAS_SEMANA[d.getDay()].split('-')[0].toLowerCase()} às ${fmt(h.abertura)}`;
      }
    }
    return null;
  })();
  const minDataAgendamento = new Date(Date.now() + antecedenciaHoras * 60 * 60 * 1000);
  const minDataAgendamentoStr = new Date(minDataAgendamento.getTime() - minDataAgendamento.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  // Se a loja estiver fechada agora e agendamento estiver ativo, já sugere agendar
  useEffect(() => {
    if (empresa && agendamentoAtivo && !lojaAbertaAgora) {
      setForm((f) => (f.quando === 'agora' ? { ...f, quando: 'agendar' } : f));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa]);

  const abrirPromocoes = async () => {
    setViewAtual('promocoes');
    if (promocoesCarregadas) return;
    try {
      const { data, error } = await supabase
        .from('cardapio_cupons')
        .select('codigo, tipo_desconto, valor_desconto, valor_pedido_minimo, validade_fim')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true);
      if (error) throw error;
      setPromocoes(data || []);
      setPromocoesCarregadas(true);
    } catch (error) {
      console.error('Erro ao carregar promoções:', error);
    }
  };

  const handleBuscarPedidos = async () => {
    if (!buscaTelefone.trim() || !buscaNome.trim()) {
      toast({ title: 'Informe nome e telefone', description: 'Precisamos dos dois pra localizar seus pedidos com segurança.', variant: 'destructive' });
      return;
    }
    setBuscandoPedidos(true);
    try {
      const { data, error } = await supabase.rpc('rpc_buscar_pedidos_cliente', {
        p_empresa_id: empresa.id,
        p_telefone: buscaTelefone.trim(),
        p_nome: buscaNome.trim(),
      });
      if (error) throw error;
      setPedidosCliente(data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar pedidos', description: error.message, variant: 'destructive' });
    } finally {
      setBuscandoPedidos(false);
    }
  };

  const STATUS_LABEL_CLIENTE = {
    PENDENTE: 'Recebido', CONFIRMADO: 'Confirmado', EM_PREPARO: 'Em preparo',
    PRONTO: 'Pronto', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
  };

  // Cliente só pode cancelar sozinho enquanto o pedido ainda está "Recebido"
  // (loja não confirmou ainda) e, se for PIX, só antes de ter caído o
  // pagamento - depois disso precisa falar com a loja.
  const podeClienteCancelar = (pedido) => pedido.status === 'PENDENTE' && pedido.status_pagamento !== 'pago';

  const handleCancelarPedidoCliente = async () => {
    if (!cancelTarget) return;
    setCancelando(true);
    try {
      const { error } = await supabase.rpc('rpc_cliente_cancelar_pedido', {
        p_pedido_id: cancelTarget.id,
        p_telefone: buscaTelefone.trim(),
        p_nome: buscaNome.trim(),
      });
      if (error) throw error;
      toast({ title: `Pedido #${cancelTarget.numero_pedido} cancelado` });
      setCancelTarget(null);
      handleBuscarPedidos();
    } catch (error) {
      toast({ title: 'Não foi possível cancelar', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setCancelando(false);
    }
  };

  // Reabre a tela de QR code PIX pra um pedido que ficou com pagamento
  // pendente (ex: cliente fechou a aba sem terminar de pagar). Chama a
  // mesma função de verificação, que devolve o QR code de novo enquanto o
  // pagamento ainda não caiu.
  const handleRetomarPagamento = async (pedido) => {
    if (pedido.status === 'CANCELADO') {
      toast({ title: 'Esse pedido foi cancelado', description: 'Não é possível pagar um pedido cancelado.', variant: 'destructive' });
      return;
    }
    setRetomandoPagamentoId(pedido.id);
    try {
      if (pagamentoConfigPublico.provider === 'infinitepay') {
        const { data: ipData, error: ipErr } = await supabase.functions.invoke('infinitepay-verificar-pagamento', { body: { pedido_id: pedido.id } });
        if (ipErr) throw new Error(await extrairErroFuncao(ipErr));
        if (ipData?.status === 'pago') {
          toast({ title: 'Esse pedido já está pago!' });
          supabase.functions.invoke('enviar-confirmacao-pedido', { body: { pedido_id: pedido.id } })
            .catch((e) => console.error('Erro ao notificar pedido por WhatsApp:', e));
          handleBuscarPedidos();
          return;
        }
        if (!ipData?.url) {
          toast({ title: 'Não foi possível abrir o pagamento', description: 'Fale com a loja pra combinar o pagamento.', variant: 'destructive' });
          return;
        }
        guardarPedidoIP({ id: pedido.id, numeroPedido: ipData.numeroPedido ?? pedido.numero_pedido, total: ipData.total ?? pedido.total });
        window.location.href = ipData.url;
        return;
      }
      const funcaoVerificar = pagamentoConfigPublico.provider === 'mercadopago' ? 'mercadopago-verificar-pagamento' : 'cielo-verificar-pagamento';
      const { data, error } = await supabase.functions.invoke(funcaoVerificar, {
        body: { pedido_id: pedido.id },
      });
      if (error) throw new Error(await extrairErroFuncao(error));
      if (data?.status === 'pago') {
        toast({ title: 'Esse pedido já está pago!' });
        supabase.functions.invoke('enviar-confirmacao-pedido', { body: { pedido_id: pedido.id } })
          .catch((e) => console.error('Erro ao notificar pedido por WhatsApp:', e));
        handleBuscarPedidos();
        return;
      }
      if (data?.status === 'falhou') {
        toast({ title: 'Esse pagamento não foi aprovado', description: 'Fale com a loja pra combinar outra forma de pagamento.', variant: 'destructive' });
        return;
      }
      if (!data?.qrCodeBase64 && !data?.qrCodeString) {
        toast({ title: 'Não foi possível recuperar o QR code', description: 'Fale com a loja pra combinar o pagamento.', variant: 'destructive' });
        return;
      }
      setPagamentoAtual({
        pedidoId: pedido.id,
        numeroPedido: data.numeroPedido ?? pedido.numero_pedido,
        qrCodeBase64: data.qrCodeBase64,
        qrCodeString: data.qrCodeString,
        pedidoInfo: { total: data.total ?? pedido.total },
      });
    } catch (error) {
      toast({ title: 'Erro ao carregar o pagamento', description: error.message, variant: 'destructive' });
    } finally {
      setRetomandoPagamentoId(null);
    }
  };

  // Agrupa as linhas de um pedido antigo: item simples fica solto, item combo
  // junta o cabeçalho (produto_id nulo) com os sabores dele.
  const agruparItensPedido = (itens) => {
    const grupos = {};
    const linhas = [];
    (itens || []).forEach((it) => {
      if (it.combo_grupo_id) {
        grupos[it.combo_grupo_id] = grupos[it.combo_grupo_id] || { header: null, sabores: [] };
        if (it.produto_id === null) grupos[it.combo_grupo_id].header = it;
        else grupos[it.combo_grupo_id].sabores.push(it);
      } else {
        linhas.push({ tipo: 'simples', item: it });
      }
    });
    Object.values(grupos).forEach((g) => { if (g.header) linhas.push({ tipo: 'combo', header: g.header, sabores: g.sabores }); });
    return linhas;
  };

  // "Peça de novo" real: itens que ESTE cliente já pediu (histórico pelo
  // telefone+nome salvos nesse aparelho), os mais pedidos primeiro e, em empate,
  // os mais recentes. Só entram itens que ainda existem e podem ser pedidos.
  // Sem histórico, cai na vitrine configurada pela loja (produtos_destaque).
  const itensRecompra = (() => {
    if (modoBalcao) return [];
    const pedidos = (pedidosCliente || historicoPedidos || []).filter((p) => p.status !== 'CANCELADO');
    if (pedidos.length === 0) return [];
    const mapa = {};
    pedidos.forEach((p, idx) => { // pedidos vêm do mais novo para o mais antigo
      const vistos = new Set();
      agruparItensPedido(p.itens).forEach((l) => {
        const it = l.tipo === 'simples' ? l.item : l.header;
        const id = it?.cardapio_item_id;
        if (!id || vistos.has(id)) return;
        vistos.add(id);
        const m = mapa[id] || (mapa[id] = { id, vezes: 0, recente: idx });
        m.vezes += 1;
        m.recente = Math.min(m.recente, idx);
      });
    });
    return Object.values(mapa)
      .sort((a, b) => b.vezes - a.vezes || a.recente - b.recente)
      .map((m) => todosItens.find((i) => i.id === m.id))
      .filter((i) => i && podePedir(i))
      .slice(0, 8);
  })();
  const pecaDeNovoPorHistorico = itensRecompra.length > 0;
  const listaPecaDeNovo = pecaDeNovoPorHistorico ? itensRecompra : itensDestaque;

  // Pedir de novo: tenta recriar o carrinho a partir de um pedido antigo.
  // Item simples é fácil (mesmo cardapio_item_id). Combo é reconstruído
  // batendo o produto de cada sabor contra as opções atuais do item — se
  // algo mudou ou saiu do cardápio, aquele item é pulado e avisamos.
  const handlePedirDeNovo = (pedido) => {
    const linhas = agruparItensPedido(pedido.itens);
    const novasEntradas = [];
    let pulados = 0;

    linhas.forEach((linha) => {
      if (linha.tipo === 'simples') {
        const itemAtual = todosItens.find((i) => i.id === linha.item.cardapio_item_id);
        if (itemAtual && podePedir(itemAtual)) {
          novasEntradas.push({ chave: `${itemAtual.id}-repeat-${Date.now()}-${Math.random()}`, item: itemAtual, isCombo: false, quantidade: linha.item.quantidade, sabores: [] });
        } else {
          pulados++;
        }
        return;
      }

      const itemAtual = todosItens.find((i) => i.id === linha.header.cardapio_item_id);
      if (!itemAtual || itemAtual.combo_quantidade_total == null) { pulados++; return; }
      const opcoesAtuais = saboresPorItem[itemAtual.id] || [];
      const saboresReconstruidos = [];
      let faltouAlgum = false;
      linha.sabores.forEach((s) => {
        const opcao = opcoesAtuais.find((o) => o.produto_id === s.produto_id);
        if (!opcao) { faltouAlgum = true; return; }
        saboresReconstruidos.push({ opcaoId: opcao.id, nome: opcao.nome, quantidade: s.quantidade, precoAdicional: Number(opcao.preco_adicional) });
      });
      const totalReconstruido = saboresReconstruidos.reduce((s, x) => s + x.quantidade, 0);
      if (faltouAlgum || !comboAtingiuMinimo(itemAtual, totalReconstruido)) { pulados++; return; }

      novasEntradas.push({ chave: `${itemAtual.id}-repeat-${Date.now()}-${Math.random()}`, item: itemAtual, isCombo: true, quantidade: linha.header.quantidade, sabores: saboresReconstruidos, fatorPreco: fatorPrecoCombo(itemAtual, totalReconstruido) });
    });

    if (novasEntradas.length === 0) {
      toast({ title: 'Não foi possível repetir esse pedido', description: 'Os itens não estão mais disponíveis.', variant: 'destructive' });
      return;
    }

    setCart((prev) => [...prev, ...novasEntradas]);
    toast({
      title: 'Itens adicionados ao carrinho!',
      description: pulados > 0 ? `${pulados} item(ns) não estavam mais disponíveis e foram pulados.` : undefined,
    });
    setViewAtual('inicio');
  };


  // ---- Finalizar pedido em etapas ----
  const cor = corCapa || '#dc2626';
  const digitosTel = (form.telefone || '').replace(/\D/g, '');
  const dadosValidos = form.nome.trim().length >= 2 && digitosTel.length >= 10;
  const temTaxaConfigurada = taxaEntregaTabela.length > 0;
  const minimoEntregaOk = !(valorMinimoEntrega > 0 && cartTotal < valorMinimoEntrega);
  const enderecoPronto = !!form.enderecoRua.trim() && !!form.enderecoNumero.trim() && (!temTaxaConfigurada || !!taxaEntregaInfo) && minimoEntregaOk;
  const dadosOk = dadosConfirmados && dadosValidos;
  const quandoOk = !agendamentoAtivo || (quandoEscolhido && (form.quando === 'agora' || !!form.dataAgendamento));
  const receberOk = receberEscolhido && (form.tipo_entrega === 'retirada' || enderecoPronto);
  const pagamentoOk = pagamentoEscolhido;
  const todasEtapasOk = dadosOk && quandoOk && receberOk && pagamentoOk;
  const secoesCheckout = ['dados', ...(agendamentoAtivo ? ['quando'] : []), 'receber', 'pagamento', 'resumo'];
  const okSecao = { dados: dadosOk, quando: quandoOk, receber: receberOk, pagamento: pagamentoOk, resumo: false };
  const primeiraPendente = secoesCheckout.find((k) => !okSecao[k]);
  const secaoAtiva = secaoAberta && secoesCheckout.includes(secaoAberta) ? secaoAberta : primeiraPendente;
  const estadoSecao = (k) => (k === secaoAtiva ? 'ativa' : okSecao[k] ? 'concluida' : 'bloqueada');
  const numSecao = (k) => secoesCheckout.indexOf(k) + 1;
  const mostrarCartaoDados = dadosSalvos && !editandoDados;
  const tempoTexto = (tipo) => {
    const mn = tipo === 'entrega' ? tempoPreparo.entrega_min : tempoPreparo.retirada_min;
    const mx = tipo === 'entrega' ? tempoPreparo.entrega_max : tempoPreparo.retirada_max;
    return mn != null && mx != null ? `${mn} - ${mx} min` : null;
  };

  const confirmarDados = () => {
    if (!dadosValidos) {
      toast({ title: 'Confira nome e telefone', description: 'Informe seu nome e o telefone com DDD.', variant: 'destructive' });
      return;
    }
    setDadosConfirmados(true); setEditandoDados(false); setSecaoAberta(null);
  };
  const escolherPagamento = (tipo) => {
    if (tipo === 'pix') setFormaPagamento('pix');
    else if (tipo === 'cartao_online') setFormaPagamento('cartao_online');
    else if (tipo === 'infinitepay') setFormaPagamento('infinitepay');
    else { setFormaPagamento('entrega'); setPagamentoEntregaTipo(tipo); }
    setPagamentoEscolhido(true); setSecaoAberta(null);
  };
  // Endereços do cliente: o último usado neste aparelho + os guardados no sistema (valem em qualquer aparelho).
  const enderecosCliente = (() => {
    const vistos = new Set();
    const lista = [];
    [enderecoSalvo, ...enderecosServidor].forEach((e) => {
      if (!e || !e.rua) return;
      const k = `${e.rua}|${e.numero || ''}|${e.complemento || ''}`.toLowerCase().trim();
      if (vistos.has(k)) return;
      vistos.add(k);
      lista.push({ rua: e.rua, numero: e.numero || '', complemento: e.complemento || '' });
    });
    return lista.slice(0, 5);
  })();
  useEffect(() => {
    if (modoBalcao || !dadosConfirmados || !empresa?.id) return;
    const tel = String(form.telefone || '').replace(/\D/g, '');
    if (tel.length < 10 || String(form.nome || '').trim().length < 2) return;
    let cancelado = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_enderecos_cliente', { p_empresa_id: empresa.id, p_nome: form.nome.trim(), p_telefone: form.telefone.trim() });
        if (error) throw error;
        if (!cancelado) setEnderecosServidor(Array.isArray(data) ? data : []);
      } catch (e) { console.error('Erro ao buscar endereços do cliente:', e); }
    })();
    return () => { cancelado = true; };
  }, [dadosConfirmados, form.nome, form.telefone, empresa?.id, modoBalcao]);
  const usarEndereco = (end, idx) => {
    if (!end) return;
    setReceberSel('entrega'); setEnderecoIdx(idx);
    setForm((f) => ({ ...f, tipo_entrega: 'entrega', enderecoRua: end.rua || '', enderecoNumero: end.numero || '', enderecoComplemento: end.complemento || '' }));
    setTaxaEntregaInfo(null); setReceberEscolhido(false); setCalcPendente(true);
  };
  const usarOutroEndereco = () => {
    setReceberSel('entrega'); setEnderecoIdx('outro');
    setForm((f) => ({ ...f, tipo_entrega: 'entrega', enderecoRua: '', enderecoNumero: '', enderecoComplemento: '' }));
    setTaxaEntregaInfo(null); setReceberEscolhido(false); setCalcPendente(false);
  };
  useEffect(() => {
    if (!checkoutOpen || modoBalcao) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(`sec-${secaoAtiva}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
    return () => clearTimeout(t);
  }, [secaoAtiva, checkoutOpen, modoBalcao]);
  useEffect(() => {
    if (calcPendente && form.enderecoRua.trim() && form.enderecoNumero.trim()) {
      setCalcPendente(false);
      handleCalcularTaxaEntrega();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcPendente, form.enderecoRua, form.enderecoNumero]);

  const handleAbrirCarrinho = () => {
    if (cartCount === 0) {
      toast({ title: 'Seu carrinho está vazio', description: 'Adicione itens do cardápio antes de finalizar.' });
      return;
    }
    setCheckoutOpen(true);
  };

  const trocoNumero = parseFloat(String(trocoPara).replace(',', '.')) || 0;

  const handleSubmitPedido = async () => {
    if (!form.nome.trim() || !form.telefone.trim()) {
      toast({ title: 'Informe nome e telefone', variant: 'destructive' });
      return;
    }
    if (form.tipo_entrega === 'entrega' && (!form.enderecoRua.trim() || !form.enderecoNumero.trim())) {
      toast({ title: 'Informe rua e número de entrega', variant: 'destructive' });
      return;
    }
    const temTaxaConfigurada = (empresa?.cardapio_config?.taxa_entrega?.tabela?.length || 0) > 0;
    if (form.tipo_entrega === 'entrega' && temTaxaConfigurada && !taxaEntregaInfo) {
      toast({ title: 'Calcule o frete antes de confirmar', description: 'Clique em "Calcular frete" ao lado do endereço.', variant: 'destructive' });
      return;
    }
    const valorMinimoEntrega = Number(empresa?.cardapio_config?.valor_minimo_entrega) || 0;
    if (form.tipo_entrega === 'entrega' && valorMinimoEntrega > 0 && cartTotal < valorMinimoEntrega) {
      toast({
        title: `Pedido mínimo para entrega: ${formatPreco(valorMinimoEntrega)}`,
        description: `Faltam ${formatPreco(valorMinimoEntrega - cartTotal)} pra atingir o mínimo.`,
        variant: 'destructive',
      });
      return;
    }
    if (!modoBalcao && lojaStatusManual === 'fechada' && form.quando !== 'agendar') {
      toast({
        title: 'Loja fechada no momento',
        description: agendamentoAtivo ? 'Escolha "Agendar" para pedir para outro horário.' : 'Volte mais tarde.',
        variant: 'destructive',
      });
      return;
    }
    if (form.quando === 'agendar' && !form.dataAgendamento) {
      toast({ title: 'Escolha a data e hora do agendamento', variant: 'destructive' });
      return;
    }
    if (!modoBalcao && form.quando === 'agendar' && horariosConfig) {
      const dt = new Date(form.dataAgendamento);
      const h = getHorarioDoDia(dt);
      if (!h || !h.ativo) {
        toast({ title: 'A loja não atende nesse dia da semana', variant: 'destructive' });
        return;
      }
      const hhmm = dt.toTimeString().slice(0, 5);
      if (hhmm < h.abertura || hhmm > h.fechamento) {
        toast({ title: `Escolha um horário entre ${h.abertura} e ${h.fechamento}`, variant: 'destructive' });
        return;
      }
    }
    if (cart.length === 0) {
      toast({ title: 'Seu carrinho está vazio', variant: 'destructive' });
      return;
    }
    if (!modoBalcao && pagamentoConfigPublico.pagamento_obrigatorio && !pagOnline) {
      toast({ title: 'Pagamento online obrigatório', description: 'Essa loja só aceita pedidos pagos online (PIX ou cartão).', variant: 'destructive' });
      return;
    }
    if (!pagOnline && pagamentoEntregaTipo === 'dinheiro' && trocoNumero > 0 && trocoNumero < totalComDesconto) {
      toast({
        title: 'Valor do troco menor que o total',
        description: `Informe com quanto você vai pagar (a partir de ${formatPreco(totalComDesconto)}) ou deixe em branco.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('rpc_criar_pedido_cardapio', {
        p_empresa_id: empresa.id,
        p_cliente_nome: form.nome.trim(),
        p_cliente_telefone: form.telefone.trim(),
        p_tipo_entrega: form.tipo_entrega,
        p_endereco_entrega: form.tipo_entrega === 'entrega' ? enderecoCompleto : null,
        p_observacao: form.observacao.trim() || null,
        p_itens: cart.map((c) => ({
          cardapio_item_id: c.item.id,
          quantidade: c.quantidade,
          ...(c.isCombo ? { sabores: c.sabores.map((s) => ({ opcao_id: s.opcaoId, quantidade: s.quantidade })) } : {}),
          ...((c.adicionais || []).length > 0 ? { adicionais: c.adicionais.map((a) => ({ opcao_id: a.opcaoId })) } : {}),
        })),
        p_data_agendamento: form.quando === 'agendar' ? new Date(form.dataAgendamento).toISOString() : null,
        p_cupom_codigo: cupomAplicado?.codigo || null,
        p_taxa_entrega: taxaEntregaAplicada,
      });

      if (error) throw error;

      // Cashback: abate o saldo do total ANTES de gerar o Pix (o Pix cobra o total do pedido no banco).
      // Se falhar, o pedido segue com o valor cheio e o cliente é avisado.
      let totalFinalPedido = totalComDesconto;
      if (pagOnline && cashbackUsoPrevisto > 0) {
        try {
          const { data: cb, error: cbError } = await supabase.rpc('rpc_cashback_resgatar', { p_pedido_id: data.id, p_valor: cashbackUsoPrevisto });
          if (cbError) throw cbError;
          totalFinalPedido = Number(cb?.novo_total ?? totalComDesconto);
          toast({ title: `Cashback de ${formatPreco(cb?.valor || cashbackUsoPrevisto)} aplicado!` });
        } catch (cbErr) {
          console.error('Erro ao aplicar cashback:', cbErr);
          toast({ title: 'Não foi possível usar o cashback', description: 'Seu pedido segue com o valor cheio.', variant: 'destructive' });
        }
      }

      // Balcão: o pedido já nasce ACEITO e aparece em "Pedidos Agendados". Se
      // essa marcação falhar, o pedido existe do mesmo jeito (fica em
      // Pendentes pra alguém aceitar) — só avisa.
      if (modoBalcao) {
        const { error: aceiteError } = await supabase.rpc('rpc_aceitar_pedido_cardapio', {
          p_pedido_id: data.id,
          p_pagamento_confirmado: false,
          p_origem: 'balcao',
        });
        if (aceiteError) {
          console.error('Erro ao aceitar pedido do balcão:', aceiteError);
          toast({ title: `Pedido #${data.numero_pedido} criado, mas não foi aceito automaticamente`, description: 'Abra Pedidos Agendados e aceite manualmente.', variant: 'destructive' });
        }
      }

      // Como o cliente vai pagar na entrega/retirada (dinheiro/cartão, troco). Não trava o pedido se falhar.
      if (!pagOnline) {
        const { error: pagEntregaError } = await supabase.rpc('rpc_definir_pagamento_entrega', {
          p_pedido_id: data.id,
          p_tipo: pagamentoEntregaTipo,
          p_troco_para: pagamentoEntregaTipo === 'dinheiro' && trocoNumero > 0 ? trocoNumero : null,
          p_taxa_retorno_aplicada: usaTaxaRetorno,
        });
        if (pagEntregaError) console.error('Erro ao salvar forma de pagamento na entrega:', pagEntregaError);
      }

      // Bairro: só alimenta o Relatório de Áreas de Entrega, nunca deve
      // travar a confirmação do pedido se falhar por qualquer motivo.
      if (form.tipo_entrega === 'entrega' && taxaEntregaInfo?.bairro) {
        supabase.rpc('rpc_atualizar_bairro_pedido_cardapio', { p_pedido_id: data.id, p_bairro: taxaEntregaInfo.bairro })
          .then(({ error: bairroError }) => {
            if (bairroError) console.error('Erro ao salvar bairro do pedido:', bairroError);
          });
      }

      // Confirmação por WhatsApp: dispara e esquece — se falhar, não deve
      // travar a confirmação visual do pedido pro cliente. Pedido com PIX
      // só notifica depois que o pagamento cair (ver polling mais abaixo).
      if (!pagOnline) {
        supabase.functions.invoke('enviar-confirmacao-pedido', { body: { pedido_id: data.id } })
          .catch((e) => console.error('Erro ao notificar pedido por WhatsApp:', e));
      }

      try {
        // Balcão atende vários clientes: nunca guarda nome/telefone pro próximo pedido.
        if (!modoBalcao) {
          let salvoAnt = {};
          try { salvoAnt = JSON.parse(localStorage.getItem(chaveClienteLS) || '{}'); } catch (e) { salvoAnt = {}; }
          const enderecoParaSalvar = form.tipo_entrega === 'entrega' && form.enderecoRua.trim()
            ? { rua: form.enderecoRua.trim(), numero: form.enderecoNumero.trim(), complemento: form.enderecoComplemento.trim() }
            : (salvoAnt.endereco || null);
          localStorage.setItem(chaveClienteLS, JSON.stringify({ nome: form.nome.trim(), telefone: form.telefone.trim(), endereco: enderecoParaSalvar }));
          setEnderecoSalvo(enderecoParaSalvar);
          if (form.tipo_entrega === 'entrega' && enderecoParaSalvar?.rua) {
            supabase.rpc('rpc_salvar_endereco_cliente', {
              p_empresa_id: empresa.id, p_nome: form.nome.trim(), p_telefone: form.telefone.trim(),
              p_rua: enderecoParaSalvar.rua, p_numero: enderecoParaSalvar.numero, p_complemento: enderecoParaSalvar.complemento,
            }).then(({ error: endErr }) => { if (endErr) console.error('Erro ao guardar endereço do cliente:', endErr); });
          }
        }
      } catch (e) { /* localStorage indisponível, segue sem salvar */ }
      setBuscaNome(form.nome.trim());
      setBuscaTelefone(form.telefone.trim());

      const pedidoInfo = {
        id: data.id,
        numeroPedido: data.numero_pedido,
        total: totalFinalPedido,
        dataAgendamento: form.quando === 'agendar' ? form.dataAgendamento : null,
        previsao: form.quando === 'agora' && temPrevisao ? previsaoAtual : null,
      };

      setCart([]);
      setQuandoEscolhido(false); setReceberSel(null); setReceberEscolhido(false);
      setPagamentoEscolhido(false); setSecaoAberta(null); setUsarCashback(true); setMostrarItens(false);
      setCupomAplicado(null);
      setCupomInput('');
      setTaxaEntregaInfo(null);
      setPagamentoEntregaTipo('dinheiro');
      setTrocoPara('');
      setCheckoutOpen(false);
      if (modoBalcao) {
        // Limpa o formulário pro próximo cliente do balcão
        setForm({
          nome: '', telefone: '', tipo_entrega: 'retirada',
          enderecoRua: '', enderecoNumero: '', enderecoComplemento: '',
          observacao: '', quando: 'agora', dataAgendamento: '',
        });
      }

      if (formaPagamento === 'pix') {
        setGerandoPix(true);
        try {
          const funcaoCriar = pagamentoConfigPublico.provider === 'mercadopago' ? 'mercadopago-criar-pagamento' : 'cielo-criar-pagamento';
          const { data: pixData, error: pixError } = await supabase.functions.invoke(funcaoCriar, {
            body: { pedido_id: data.id },
          });
          if (pixError || !pixData?.success) throw new Error(pixData?.error || (pixError ? await extrairErroFuncao(pixError) : null) || 'Falha ao gerar PIX');
          setPagamentoAtual({
            pedidoId: data.id,
            numeroPedido: data.numero_pedido,
            qrCodeBase64: pixData.qrCodeBase64,
            qrCodeString: pixData.qrCodeString,
            pedidoInfo,
          });
        } catch (pixErr) {
          toast({ title: 'Erro ao gerar o PIX', description: pixErr.message, variant: 'destructive' });
          // Mesmo sem conseguir gerar o PIX, o pedido já foi criado — mostra a
          // confirmação normal pra não deixar o cliente sem retorno nenhum.
          setPedidoConfirmado(pedidoInfo);
        } finally {
          setGerandoPix(false);
        }
      } else if (formaPagamento === 'infinitepay') {
        setGerandoPix(true);
        let redirecionando = false;
        try {
          const { data: ipData, error: ipError } = await supabase.functions.invoke('infinitepay-criar-pagamento', {
            body: { pedido_id: data.id, retorno_url: `${window.location.origin}${window.location.pathname}` },
          });
          if (ipError || !ipData?.success || !ipData?.url) throw new Error(ipData?.error || (ipError ? await extrairErroFuncao(ipError) : null) || 'Falha ao abrir o pagamento');
          guardarPedidoIP(pedidoInfo);
          redirecionando = true;
          window.location.href = ipData.url;
        } catch (ipErr) {
          toast({ title: 'Erro ao abrir o pagamento', description: ipErr.message, variant: 'destructive' });
          // O pedido já foi criado: mostra a confirmação normal e o cliente paga depois em "Meus Pedidos".
          setPedidoConfirmado(pedidoInfo);
        } finally {
          if (!redirecionando) setGerandoPix(false);
        }
      } else if (formaPagamento === 'cartao_online') {
        setPagamentoAtual({
          tipo: 'cartao', aguardando: false,
          pedidoId: data.id, numeroPedido: data.numero_pedido, pedidoInfo,
        });
      } else {
        setPedidoConfirmado(pedidoInfo);
      }
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      toast({
        title: 'Não foi possível concluir o pedido',
        description: error.message?.replace(/^.*ERROR:\s*/i, '') || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eceef1]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#eceef1] text-center p-6">
        <UtensilsCrossed className="h-10 w-10 text-gray-300 mb-3" />
        <h1 className="text-xl font-semibold text-gray-700">Cardápio não encontrado</h1>
        <p className="text-gray-500 text-base mt-1">Verifique se o link está correto.</p>
      </div>
    );
  }

  if (gerandoPix && formaPagamento === 'infinitepay') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#eceef1] text-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Abrindo o pagamento seguro…</h1>
        <p className="text-gray-500 mt-1">Você vai pagar na página da InfinitePay.</p>
      </div>
    );
  }

  if (pagamentoAtual?.tipo === 'infinitepay') {
    const numIP = pagamentoAtual.numeroPedido ?? pagamentoAtual.pedidoInfo?.numeroPedido;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#eceef1] text-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">{numIP ? `Pedido #${numIP} — ` : ''}Confirmando seu pagamento</h1>
        <p className="text-gray-500 mt-2 max-w-xs">Isso leva só alguns segundos. Não feche esta tela.</p>
        {ipLink && (
          <Button type="button" className="mt-6" onClick={() => { window.location.href = ipLink; }}>
            Ainda não paguei — abrir pagamento
          </Button>
        )}
        <Button
          type="button" variant="ghost" size="sm" className="mt-4 text-gray-500"
          onClick={() => { setPagamentoAtual(null); setViewAtual('pedidos'); handleBuscarPedidos(); }}
        >
          Ver meus pedidos
        </Button>
        <p className="text-sm text-gray-400 mt-1 max-w-xs">
          O pedido já foi registrado. Se você já pagou, a confirmação chega sozinha.
        </p>
      </div>
    );
  }

  if (pagamentoAtual?.tipo === 'cartao') {
    return (
      <TelaCartaoMP
        publicKey={pagamentoConfigPublico.public_key}
        maxParcelas={pagamentoConfigPublico.cartao_max_parcelas}
        total={pagamentoAtual.pedidoInfo.total}
        pedidoId={pagamentoAtual.pedidoId}
        numeroPedido={pagamentoAtual.numeroPedido}
        aguardando={!!pagamentoAtual.aguardando}
        formatPreco={formatPreco}
        toast={toast}
        onAprovado={() => { setPedidoConfirmado(pagamentoAtual.pedidoInfo); setPagamentoAtual(null); }}
        onAguardando={() => setPagamentoAtual((p) => (p ? { ...p, aguardando: true } : p))}
        onFechar={() => { setPagamentoAtual(null); setViewAtual('pedidos'); handleBuscarPedidos(); }}
      />
    );
  }

  if (pagamentoAtual) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#eceef1] text-center p-6">
        <h1 className="text-2xl font-bold text-gray-900">Pedido #{pagamentoAtual.numeroPedido} — Pague com PIX</h1>
        <p className="text-gray-500 mt-1 mb-4">{formatPreco(pagamentoAtual.pedidoInfo.total)}</p>
        {pagamentoAtual.qrCodeBase64 ? (
          <img
            src={`data:image/png;base64,${pagamentoAtual.qrCodeBase64}`}
            alt="QR Code PIX" className="w-56 h-56 border rounded-lg bg-white p-2"
          />
        ) : (
          <div className="w-56 h-56 border rounded-lg bg-white flex items-center justify-center text-base text-gray-400">
            QR code indisponível
          </div>
        )}
        {pagamentoAtual.qrCodeString && (
          <div className="mt-4 w-full max-w-xs">
            <Label className="text-sm text-gray-500">Ou copie o código PIX</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={pagamentoAtual.qrCodeString} className="text-sm" />
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => { navigator.clipboard.writeText(pagamentoAtual.qrCodeString); toast({ title: 'Código copiado!' }); }}
              >
                Copiar
              </Button>
            </div>
          </div>
        )}
        <p className="text-base text-gray-500 mt-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do pagamento...
        </p>
        <Button
          type="button" variant="ghost" size="sm" className="mt-6 text-gray-500"
          onClick={() => { setPagamentoAtual(null); setViewAtual('pedidos'); handleBuscarPedidos(); }}
        >
          Fechar e pagar depois
        </Button>
        <p className="text-sm text-gray-400 mt-1 max-w-xs">
          O pedido já foi registrado. Você pode voltar em "Meus Pedidos" a qualquer momento pra terminar o pagamento.
        </p>
      </div>
    );
  }

  if (pedidoConfirmado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#eceef1] text-center p-6">
        <CheckCircle2 className="h-14 w-14 text-green-500 mb-3" />
        <h1 className="text-2xl font-bold text-gray-900">Pedido #{pedidoConfirmado.numeroPedido} enviado!</h1>
        <p className="text-gray-500 mt-1">Total: {formatPreco(pedidoConfirmado.total)}</p>
        {pedidoConfirmado.dataAgendamento && (
          <p className="text-gray-700 font-medium mt-1">
            Agendado para {new Date(pedidoConfirmado.dataAgendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
        {pedidoConfirmado.previsao && (
          <p className="text-gray-700 font-medium mt-1">
            Previsão: entre {pedidoConfirmado.previsao.min} e {pedidoConfirmado.previsao.max} minutos
          </p>
        )}
        {modoBalcao ? (
          <p className="text-gray-600 text-base mt-3 max-w-xs">
            Pedido aceito e enviado para <strong>Pedidos Agendados</strong>. Inicie a produção por lá quando for a hora.
          </p>
        ) : (
          <p className="text-gray-500 text-base mt-3 max-w-xs">
            {empresa.nome} vai confirmar seu pedido em breve.
            {whatsapp && ' Se precisar, chame no WhatsApp.'}
          </p>
        )}
        {modoBalcao && (
          <Button className="mt-4 w-full max-w-xs" style={{ backgroundColor: corCapa || '#dc2626' }} onClick={() => setPedidoConfirmado(null)}>
            Novo pedido do balcão
          </Button>
        )}
        {!modoBalcao && <Button
          className="mt-4 w-full max-w-xs"
          style={{ backgroundColor: corCapa || '#dc2626' }}
          onClick={() => {
            setPedidoConfirmado(null);
            setViewAtual('pedidos');
            handleBuscarPedidos();
          }}
        >
          <ClipboardList className="h-4 w-4 mr-2" /> Acompanhar meu pedido
        </Button>}
        {!modoBalcao && whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Acabei de fazer o pedido #${pedidoConfirmado.numeroPedido} pelo cardápio online.`)}`}
            target="_blank" rel="noreferrer"
            className="mt-3 bg-green-500 text-white rounded-full px-5 py-2.5 font-medium"
          >
            Falar no WhatsApp
          </a>
        )}
        {!modoBalcao && <Button variant="link" className="mt-2" onClick={() => setPedidoConfirmado(null)}>
          Voltar ao cardápio
        </Button>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eceef1] pb-32">
      {!modoBalcao && <Helmet>
        <title>{empresa.nome} - Cardápio</title>
        {manifestPwaHref && <link rel="manifest" href={manifestPwaHref} />}
        <meta name="theme-color" content={corCapa || '#dc2626'} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={empresa.nome} />
        <link rel="apple-touch-icon" href={iconeAppPwa} />
      </Helmet>}

      {viewAtual === 'inicio' && (
        <>
          {capaUrl ? (
            <div className="w-full h-32" style={{ backgroundColor: corCapa || '#dc2626' }}>
              <div className="max-w-2xl mx-auto h-full">
                <img src={capaUrl} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
          ) : (
            <div className="h-16 w-full" style={{ backgroundColor: corCapa || '#dc2626' }} />
          )}

          <header ref={headerRef} className="bg-white border-b sticky top-0 z-10">
            <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
              {empresa.logo_url ? (
                <img src={empresa.logo_url} alt={empresa.nome} className="h-14 w-14 rounded-full object-cover border-2 border-white -mt-8 shadow" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center -mt-8 border-2 border-white shadow">
                  <UtensilsCrossed className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">{empresa.nome}</h1>
                {(horariosConfig || lojaStatusManual) && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 mt-1 ${lojaAbertaAgora ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${lojaAbertaAgora ? 'bg-green-500' : 'bg-red-500'}`} />
                    {lojaAbertaAgora
                      ? 'Aberta agora'
                      : agendamentoAtivo ? 'Fechada · aceita agendamento' : 'Fechada agora'}
                  </span>
                )}
                {descricaoLoja ? (
                  <p className="text-base text-gray-600 mt-0.5">{descricaoLoja}</p>
                ) : mensagemTopo ? (
                  <p className="text-base text-gray-600 mt-0.5">{mensagemTopo}</p>
                ) : null}
              </div>
              <button
                onClick={() => setViewAtual('perfil')}
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
                aria-label="Perfil da loja"
              >
                <Info className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            {(infoHorario || valorMinimoEntrega > 0) && (
              <div className="max-w-2xl mx-auto px-4 pb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
                {infoHorario && (
                  <span className="inline-flex items-center gap-1 font-bold text-gray-800"><Clock className="h-3.5 w-3.5" />{infoHorario}</span>
                )}
                {infoHorario && valorMinimoEntrega > 0 && <span aria-hidden="true">•</span>}
                {valorMinimoEntrega > 0 && <span className="font-bold text-gray-800">Pedido mín. {formatPreco(valorMinimoEntrega)}</span>}
              </div>
            )}
            {!termoBusca && categorias.length > 1 && (
              <nav
                ref={abasRef}
                aria-label="Categorias"
                className="max-w-2xl mx-auto flex overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {categorias.map((cat) => {
                  const ativa = categoriaAtivaId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      data-cat={cat.id}
                      type="button"
                      onClick={() => irParaCategoria(cat.id)}
                      className={`shrink-0 px-3 py-2.5 text-base font-bold whitespace-nowrap border-b-[3px] transition-colors ${ativa ? '' : 'border-transparent text-gray-500'}`}
                      style={ativa ? { borderColor: corCapa || '#dc2626', color: corCapa || '#dc2626' } : undefined}
                    >
                      {cat.nome}
                    </button>
                  );
                })}
              </nav>
            )}
          </header>

          {agendamentoAtivo && !lojaAbertaAgora && (
            <div className="bg-red-50 text-red-700 text-base text-center py-2 px-4">
              Loja fechada agora — só aceitamos pedidos agendados.
            </div>
          )}
        </>
      )}

      {viewAtual === 'inicio' && (
        <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
          {pedidoEmAndamento && (
            <button
              onClick={() => { setViewAtual('pedidos'); handleBuscarPedidos(); }}
              className="w-full flex items-center justify-between rounded-xl p-3 text-left"
              style={{ backgroundColor: `${corCapa || '#dc2626'}15`, border: `1px solid ${corCapa || '#dc2626'}40` }}
            >
              <span className="flex items-center gap-2 text-base font-medium" style={{ color: corCapa || '#dc2626' }}>
                <ClipboardList className="h-4 w-4" />
                Pedido #{pedidoEmAndamento.numero_pedido} em andamento — {STATUS_LABEL_CLIENTE[pedidoEmAndamento.status] || pedidoEmAndamento.status}
              </span>
              <span className="text-sm font-medium" style={{ color: corCapa || '#dc2626' }}>Acompanhar</span>
            </button>
          )}
          {cashbackAtivo && (
            <button
              onClick={() => setViewAtual('cashback')}
              className="relative w-full overflow-hidden rounded-2xl text-left text-white shadow-md"
              style={{ backgroundColor: corCapa || '#dc2626', backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0.30) 100%)' }}
              aria-label="Ver meu cashback"
            >
              {/* círculos decorativos */}
              <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
              <span className="absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-black/10" aria-hidden="true" />
              <div className="relative flex items-center justify-between gap-2 pl-4 pr-2 py-4">
                <div className="min-w-0">
                  <span className="inline-block text-[11px] font-extrabold tracking-widest uppercase bg-white/20 rounded-full px-2.5 py-0.5">Cashback</span>
                  {cashbackSaldo > 0 ? (
                    <>
                      <p className="text-sm font-medium opacity-90 mt-2 leading-none">Você tem</p>
                      <p className="text-4xl font-black leading-tight tracking-tight">{formatPreco(cashbackSaldo)}</p>
                      <p className="text-sm opacity-95 leading-snug">para usar no próximo pedido{cashbackInfo.so_online ? (onlineMulti ? ' pagando online' : ' com PIX') : ''}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl font-black leading-tight tracking-tight mt-1">{Number(cashbackInfo.percentual)}% <span className="text-2xl font-extrabold">de volta</span></p>
                      <p className="text-sm opacity-95 leading-snug">
                        {cashbackInfo.so_online ? (onlineMulti ? 'pagando online, para usar no próximo pedido' : 'pagando com PIX, para usar no próximo pedido') : 'em todos os pedidos, para usar no próximo'}
                      </p>
                    </>
                  )}
                  <span className="inline-flex items-center gap-1 mt-3 bg-white rounded-full px-3.5 py-1.5 text-sm font-extrabold" style={{ color: corCapa || '#dc2626' }}>
                    {cashbackSaldo > 0 ? 'Ver meu saldo' : 'Aproveite já'} <span aria-hidden="true">→</span>
                  </span>
                </div>
                <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 drop-shadow-md" aria-hidden="true">
                  <ellipse cx="58" cy="106" rx="38" ry="7" fill="rgba(0,0,0,0.25)" />
                  {[92, 80, 68].map((y) => (
                    <g key={y}>
                      <rect x="26" y={y} width="64" height="12" fill="#f59e0b" />
                      <ellipse cx="58" cy={y + 12} rx="32" ry="9" fill="#f59e0b" />
                      <ellipse cx="58" cy={y} rx="32" ry="9" fill="#fcd34d" stroke="#d97706" strokeWidth="1.5" />
                    </g>
                  ))}
                  <ellipse cx="58" cy="68" rx="22" ry="5.5" fill="none" stroke="#d97706" strokeWidth="1.2" opacity="0.7" />
                  <circle cx="92" cy="34" r="19" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
                  <circle cx="92" cy="34" r="14" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7" />
                  <text x="92" y="41" textAnchor="middle" fontSize="20" fontWeight="900" fill="#b45309" fontFamily="sans-serif">%</text>
                  <path d="M22 28 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#fff" opacity="0.9" />
                  <path d="M108 74 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" fill="#fff" opacity="0.8" />
                  <path d="M10 64 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="#fff" opacity="0.7" />
                </svg>
              </div>
            </button>
          )}
          {listaPecaDeNovo.length > 0 && (
            <section>
              <h2 className="text-xl font-extrabold mb-2 px-1" style={{ color: corCapa || '#dc2626' }}>Peça de novo</h2>
              {pecaDeNovoPorHistorico && <p className="text-sm text-gray-500 px-1 -mt-1 mb-2">Seus favoritos, pelos pedidos que você já fez</p>}
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {listaPecaDeNovo.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => (item.combo_quantidade_total != null || (gruposPorItem[item.id] || []).length > 0 ? abrirCombo(item) : addSimplesToCart(item))}
                    className="shrink-0 w-32 bg-white border rounded-xl overflow-hidden text-left"
                  >
                    <div className="h-20 w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.imagem_url ? (
                        <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-5 w-5 text-gray-300" />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-bold text-gray-900 line-clamp-2">{item.nome}</p>
                      <p className="text-sm font-extrabold mt-0.5" style={{ color: corCapa || '#dc2626' }}>{formatPreco(item.preco)}</p>
                      {cashbackAtivo && item.combo_modo !== 'livre' && Number(item.preco) > 0 && (
                        <span className="inline-flex items-center gap-0.5 mt-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                          {Number(cashbackInfo.percentual)}% cashback
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={buscaProduto}
              onChange={(e) => setBuscaProduto(e.target.value)}
              placeholder="Buscar item no cardápio"
              className="pl-9"
            />
          </div>

          {termoBusca ? (
            <section>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2 px-1">Resultado da busca</h2>
              {itensBuscados.length === 0 ? (
                <p className="text-center text-gray-400 py-10">Nenhum item encontrado pra "{buscaProduto}".</p>
              ) : (
                <div className="bg-white rounded-xl border divide-y overflow-hidden">
                  {itensBuscados.map((item) => renderItemCard(item))}
                </div>
              )}
            </section>
          ) : (
            <>
              {categorias.length === 0 && (
                <div className="text-center text-gray-400 py-16">Cardápio ainda sem itens publicados.</div>
              )}

              {categorias.map((cat) => (
                <section key={cat.id} id={`cat-${cat.id}`}>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-2 px-1 flex items-center gap-2">
                    <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: corCapa || '#dc2626' }} />
                    {cat.nome}
                  </h2>
                  <div className="bg-white rounded-xl border divide-y overflow-hidden">
                    {itensPorCategoria[cat.id].map((item) => renderItemCard(item))}
                  </div>
                </section>
              ))}

              {rodape && (() => {
                const { contatos, resto } = analisarRodape(rodape);
                return (
                  <div className="pt-4 pb-2 space-y-2">
                    {contatos.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                        {contatos.map((c) => (
                          <a
                            key={c.tipo} href={c.href} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                            aria-label={c.tipo === 'instagram' ? 'Instagram' : 'WhatsApp'}
                          >
                            <IconeRede tipo={c.tipo} />{c.rotulo}
                          </a>
                        ))}
                      </div>
                    )}
                    {resto && <p className="text-center text-sm text-gray-400">{resto}</p>}
                  </div>
                );
              })()}
            </>
          )}
        </main>
      )}

      {viewAtual === 'perfil' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border-b sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
            <button onClick={() => setViewAtual('inicio')} className="p-1"><ArrowLeft className="h-5 w-5 text-gray-700" /></button>
            <h1 className="font-bold text-lg text-gray-900">Perfil da loja</h1>
          </div>
          <div className="p-4 space-y-4">
            {agendamentoAtivo && !lojaAbertaAgora && (
              <div className="bg-red-50 text-red-700 text-sm text-center py-2 px-4 rounded-lg">
                Loja fechada agora — só aceitamos pedidos agendados.
              </div>
            )}
            {horariosConfig && (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 font-bold text-gray-900">
                  <Clock className="h-4 w-4" /> Horário de atendimento
                </div>
                <div className="divide-y">
                  {DIAS_SEMANA.map((nomeDia, idx) => {
                    const h = horariosConfig[idx];
                    return (
                      <div key={idx} className="flex justify-between px-4 py-2 text-base">
                        <span className="font-medium text-gray-700">{nomeDia}</span>
                        <span className="text-gray-500">{h?.ativo ? `${h.abertura} às ${h.fechamento}` : 'Fechado'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {formasPagamentoLoja.length > 0 && (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 font-bold text-gray-900">
                  <CreditCard className="h-4 w-4" /> Formas de pagamento
                </div>
                <div className="divide-y">
                  {formasPagamentoLoja.map((forma) => (
                    <div key={forma} className="px-4 py-2 text-base text-gray-700">{forma}</div>
                  ))}
                </div>
              </div>
            )}

            {enderecoLoja && (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 font-bold text-gray-900">
                  <MapPin className="h-4 w-4" /> Endereço
                </div>
                <div className="px-4 py-3 text-base text-gray-700">{enderecoLoja}</div>
                <iframe
                  title="Mapa da loja"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(enderecoLoja)}&output=embed`}
                  className="w-full h-56 border-0 block"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoLoja)}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold border-t"
                  style={{ color: corCapa || '#dc2626' }}
                >
                  <ExternalLink className="h-4 w-4" /> Abrir no Google Maps
                </a>
              </div>
            )}

            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                target="_blank" rel="noreferrer"
                className="block text-center bg-green-500 text-white rounded-full px-5 py-2.5 font-medium"
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {viewAtual === 'cashback' && (
        <div className="max-w-2xl mx-auto pb-24">
          <div className="bg-white border-b sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
            <button onClick={() => setViewAtual('inicio')} className="p-1"><ArrowLeft className="h-5 w-5 text-gray-700" /></button>
            <h1 className="font-bold text-lg text-gray-900">Meu cashback</h1>
          </div>
          <div className="p-4 space-y-4">
            {!cashbackAtivo ? (
              <div className="text-center text-gray-400 py-16">O cashback não está ativo nessa loja.</div>
            ) : (
              <>
                <div className="rounded-xl p-4 text-white" style={{ backgroundColor: corCapa || '#dc2626' }}>
                  <p className="text-sm opacity-90">Saldo disponível</p>
                  <p className="text-3xl font-extrabold">{formatPreco(cashbackSaldo)}</p>
                  {cashbackSaldo > 0 && cashbackInfo.proximo_vencimento && (
                    <p className="text-sm opacity-90 mt-1">
                      {formatPreco(cashbackInfo.valor_proximo_vencimento)} vence em {new Date(cashbackInfo.proximo_vencimento).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                {telefoneCashback.length < 10 && (
                  <div className="bg-white border rounded-xl p-3">
                    <Label htmlFor="cb-tel">Seu telefone (para ver o saldo)</Label>
                    <Input id="cb-tel" inputMode="tel" placeholder="(19) 99999-9999" value={buscaTelefone}
                      onChange={(e) => setBuscaTelefone(e.target.value)} className="mt-1" />
                  </div>
                )}

                <div className="bg-white border rounded-xl p-4 space-y-2">
                  <h2 className="font-bold text-gray-900">Como funciona</h2>
                  <ul className="text-base text-gray-700 space-y-1.5 list-disc pl-5">
                    <li>Você ganha <strong>{Number(cashbackInfo.percentual)}%</strong> do valor dos itens de volta, sem contar a taxa de entrega.</li>
                    {cashbackInfo.so_online
                      ? <li>O cashback vale para pedidos pagos <strong>online ({onlineMulti ? 'PIX ou cartão' : 'PIX'})</strong>.</li>
                      : <li>O cashback vale para todos os pedidos entregues.</li>}
                    <li>O crédito entra quando o pedido é entregue e vale por <strong>{cashbackInfo.validade_dias} dias</strong>.</li>
                    <li>Para usar, escolha <strong>pagar online</strong> no pedido e marque "Usar meu cashback".</li>
                    <li>Sempre é preciso pagar pelo menos R$ 1,00 no pedido.</li>
                  </ul>
                </div>

                <div className="bg-white border rounded-xl p-4">
                  <h2 className="font-bold text-gray-900 mb-2">Extrato</h2>
                  {(cashbackInfo.extrato || []).length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhuma movimentação ainda.</p>
                  ) : (
                    <div className="divide-y">
                      {cashbackInfo.extrato.map((m, i) => {
                        const entrada = m.tipo === 'credito' || m.tipo === 'estorno';
                        const rotulo = { credito: 'Cashback ganho', resgate: 'Cashback usado', expiracao: 'Cashback vencido', estorno: 'Cashback devolvido', cancelamento_credito: 'Cashback cancelado' }[m.tipo] || m.tipo;
                        return (
                          <div key={i} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-base text-gray-800">{rotulo}{m.numero_pedido ? ` · pedido #${m.numero_pedido}` : ''}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(m.created_at).toLocaleDateString('pt-BR')}
                                {entrada && m.expira_em ? ` · vence em ${new Date(m.expira_em).toLocaleDateString('pt-BR')}` : ''}
                              </p>
                            </div>
                            <span className={`text-base font-semibold ${entrada ? 'text-green-700' : 'text-gray-500'}`}>
                              {entrada ? '+' : '-'}{formatPreco(m.valor)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewAtual === 'promocoes' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border-b sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
            <button onClick={() => setViewAtual('inicio')} className="p-1"><ArrowLeft className="h-5 w-5 text-gray-700" /></button>
            <h1 className="font-bold text-lg text-gray-900">Promoções</h1>
          </div>
          <div className="p-4 space-y-3">
            {promocoes.length === 0 ? (
              <div className="text-center text-gray-400 py-16">Nenhuma promoção ativa no momento.</div>
            ) : (
              promocoes.map((cupom) => (
                <div key={cupom.codigo} className="bg-white border-2 border-dashed rounded-xl p-4" style={{ borderColor: corCapa || '#dc2626' }}>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" style={{ color: corCapa || '#dc2626' }} />
                    <span className="font-mono font-extrabold text-xl" style={{ color: corCapa || '#dc2626' }}>{cupom.codigo}</span>
                  </div>
                  <p className="text-base text-gray-700 mt-1">
                    {cupom.tipo_desconto === 'percentual' ? `${cupom.valor_desconto}% de desconto` : `${formatPreco(cupom.valor_desconto)} de desconto`}
                    {cupom.valor_pedido_minimo > 0 && ` em pedidos acima de ${formatPreco(cupom.valor_pedido_minimo)}`}
                  </p>
                  {cupom.validade_fim && (
                    <p className="text-sm text-gray-400 mt-1">Válido até {new Date(cupom.validade_fim).toLocaleDateString('pt-BR')}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {viewAtual === 'pedidos' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border-b sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
            <button onClick={() => setViewAtual('inicio')} className="p-1"><ArrowLeft className="h-5 w-5 text-gray-700" /></button>
            <h1 className="font-bold text-lg text-gray-900">Meus Pedidos</h1>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Input
                value={buscaNome}
                onChange={(e) => setBuscaNome(e.target.value)}
                placeholder="Seu nome (como usou no pedido)"
              />
              <div className="flex gap-2">
                <Input
                  value={buscaTelefone}
                  onChange={(e) => setBuscaTelefone(e.target.value)}
                  placeholder="Seu telefone (com DDD)"
                  className="flex-1"
                />
                <Button onClick={handleBuscarPedidos} disabled={buscandoPedidos || !buscaTelefone.trim() || !buscaNome.trim()}>
                  {buscandoPedidos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-gray-400">Pedimos os dois pra proteger a privacidade do seu histórico de pedidos.</p>
            </div>

            {pedidosCliente === null ? (
              <p className="text-base text-gray-400 text-center py-8">Digite seu nome e telefone pra consultar.</p>
            ) : pedidosCliente.length === 0 ? (
              <p className="text-base text-gray-400 text-center py-8">Nenhum pedido encontrado pra esse telefone.</p>
            ) : (
              <div className="space-y-3">
                {pedidosCliente.map((pedido) => {
                  const detalheAberto = pedidoDetalheAberto === pedido.id;
                  const linhas = agruparItensPedido(pedido.itens);
                  return (
                    <div key={pedido.id} className="bg-white border rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">#{pedido.numero_pedido}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{STATUS_LABEL_CLIENTE[pedido.status] || pedido.status}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{formatHora(pedido.created_at)}</p>
                      {pedido.status !== 'CANCELADO' && pedido.forma_pagamento_online === 'pix' && pedido.status_pagamento === 'pendente' && (
                        <span className="inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Pagamento PIX pendente
                        </span>
                      )}
                      {pedido.status !== 'CANCELADO' && pedido.forma_pagamento_online === 'cartao' && ['pendente', 'falhou'].includes(pedido.status_pagamento) && (
                        <span className="inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {pedido.status_pagamento === 'falhou' ? 'Pagamento no cartão não aprovado' : 'Pagamento no cartão pendente'}
                        </span>
                      )}
                      {pedido.forma_pagamento_online && pedido.status_pagamento === 'pago' && (
                        <span className="inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          ✓ Pagamento confirmado
                        </span>
                      )}

                      {!detalheAberto ? (
                        <div className="mt-2 space-y-0.5">
                          {linhas.map((linha, idx) => (
                            <p key={idx} className="text-base text-gray-600">
                              {linha.tipo === 'simples' ? `${linha.item.quantidade}x ${linha.item.nome}` : `${linha.header.quantidade}x ${linha.header.nome}`}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2 border-t pt-2">
                          {(pedido.historico || []).length > 0 && (
                            <div className="pb-2 mb-1 border-b">
                              <p className="text-sm font-semibold text-gray-500 mb-1.5">Status</p>
                              <div className="space-y-2">
                                {pedido.historico.map((h, idx) => {
                                  const ultimo = idx === pedido.historico.length - 1;
                                  const cancelado = h.status === 'CANCELADO';
                                  return (
                                    <div key={idx} className="flex items-start gap-2">
                                      <span
                                        className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                                        style={{ backgroundColor: cancelado ? '#ef4444' : ultimo ? (corCapa || '#dc2626') : '#d1d5db' }}
                                      />
                                      <p className="text-base">
                                        <span className="text-gray-400">{formatHora(h.criado_em)}</span>{' — '}
                                        <span className={ultimo ? 'font-medium text-gray-900' : 'text-gray-500'}>
                                          {STATUS_LABEL_CLIENTE[h.status] || h.status}
                                        </span>
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {linhas.map((linha, idx) => (
                            <div key={idx} className="text-base">
                              {linha.tipo === 'simples' ? (
                                <div className="flex justify-between text-gray-700">
                                  <span>{linha.item.quantidade}x {linha.item.nome}</span>
                                  <span>{formatPreco(linha.item.subtotal)}</span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex justify-between text-gray-900 font-medium">
                                    <span>{linha.header.quantidade}x {linha.header.nome}</span>
                                    <span>{formatPreco(linha.header.subtotal + linha.sabores.reduce((s, x) => s + x.subtotal, 0))}</span>
                                  </div>
                                  <div className="pl-3 text-gray-500">
                                    {linha.sabores.map((s, i2) => (
                                      <p key={i2}>{s.quantidade}x {s.nome}{s.subtotal > 0 ? ` — ${formatPreco(s.subtotal)}` : ''}</p>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                          <div className="border-t pt-2 text-base text-gray-600 space-y-0.5">
                            <p>{pedido.tipo_entrega === 'entrega' ? `Entrega: ${pedido.endereco_entrega || ''}` : 'Retirada no local'}</p>
                            {pedido.data_agendamento && <p>Agendado: {formatHora(pedido.data_agendamento)}</p>}
                            {pedido.observacao && <p>Obs: {pedido.observacao}</p>}
                          </div>
                        </div>
                      )}

                      <p className="font-bold text-gray-900 mt-2">{formatPreco(pedido.total)}</p>

                      {pedido.status !== 'CANCELADO' && pedido.forma_pagamento_online === 'cartao' && ['pendente', 'falhou'].includes(pedido.status_pagamento) && pagamentoConfigPublico.cartao_online && (
                        <Button
                          size="sm" className="w-full mt-2 bg-amber-500 hover:bg-amber-600"
                          onClick={() => setPagamentoAtual({ tipo: 'cartao', aguardando: false, pedidoId: pedido.id, numeroPedido: pedido.numero_pedido, pedidoInfo: { total: pedido.total } })}
                        >
                          Pagar agora (cartão)
                        </Button>
                      )}
                      {pedido.status !== 'CANCELADO' && pedido.forma_pagamento_online === 'pix' && pedido.status_pagamento === 'pendente' && (
                        <Button
                          size="sm" className="w-full mt-2 bg-amber-500 hover:bg-amber-600"
                          disabled={retomandoPagamentoId === pedido.id}
                          onClick={() => handleRetomarPagamento(pedido)}
                        >
                          {retomandoPagamentoId === pedido.id ? <Loader2 className="h-4 w-4 animate-spin" /> : pagamentoConfigPublico.provider === 'infinitepay' ? 'Pagar agora' : 'Pagar agora (PIX)'}
                        </Button>
                      )}

                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm" variant="outline" className="flex-1"
                          onClick={() => setPedidoDetalheAberto(detalheAberto ? null : pedido.id)}
                        >
                          {detalheAberto ? 'Ocultar detalhes' : 'Ver detalhes'}
                        </Button>
                        <Button
                          size="sm" className="flex-1"
                          style={{ backgroundColor: corCapa || '#dc2626' }}
                          onClick={() => handlePedirDeNovo(pedido)}
                        >
                          Pedir de novo
                        </Button>
                      </div>

                      {podeClienteCancelar(pedido) && (
                        <Button
                          size="sm" variant="ghost" className="w-full mt-1.5 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setCancelTarget(pedido)}
                        >
                          Cancelar pedido
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {viewAtual === 'inicio' && cartCount > 0 && (
        <button
          onClick={() => setCheckoutOpen(true)}
          className="fixed bottom-16 left-4 right-4 max-w-2xl mx-auto bg-gray-900 text-white rounded-2xl px-5 py-3 shadow-lg flex items-center justify-between font-semibold text-base z-20"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> {cartCount} {cartCount === 1 ? 'item' : 'itens'}
          </span>
          <span>{formatPreco(cartTotal)}</span>
        </button>
      )}

      {/* Barra de navegação inferior, sempre visível */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-30">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          <button onClick={() => setViewAtual('inicio')} className="flex flex-col items-center gap-0.5 py-2">
            <Home className="h-5 w-5" style={{ color: viewAtual === 'inicio' ? (corCapa || '#dc2626') : '#9ca3af' }} />
            <span className="text-[11px]" style={{ color: viewAtual === 'inicio' ? (corCapa || '#dc2626') : '#9ca3af' }}>Início</span>
          </button>
          <button onClick={handleAbrirCarrinho} className="flex flex-col items-center gap-0.5 py-2 relative">
            <ShoppingCart className="h-5 w-5 text-gray-400" />
            {cartCount > 0 && (
              <span
                className="absolute top-1 right-[calc(50%-16px)] h-4 w-4 rounded-full text-white text-[10px] flex items-center justify-center"
                style={{ backgroundColor: corCapa || '#dc2626' }}
              >
                {cartCount}
              </span>
            )}
            <span className="text-[11px] text-gray-400">Carrinho</span>
          </button>
          <button onClick={abrirPromocoes} className="flex flex-col items-center gap-0.5 py-2">
            <Tag className="h-5 w-5" style={{ color: viewAtual === 'promocoes' ? (corCapa || '#dc2626') : '#9ca3af' }} />
            <span className="text-[11px]" style={{ color: viewAtual === 'promocoes' ? (corCapa || '#dc2626') : '#9ca3af' }}>Promoções</span>
          </button>
          <button onClick={() => setViewAtual('pedidos')} className="flex flex-col items-center gap-0.5 py-2">
            <ClipboardList className="h-5 w-5" style={{ color: viewAtual === 'pedidos' ? (corCapa || '#dc2626') : '#9ca3af' }} />
            <span className="text-[11px]" style={{ color: viewAtual === 'pedidos' ? (corCapa || '#dc2626') : '#9ca3af' }}>Pedidos</span>
          </button>
        </div>
      </nav>

      {/* Customizador de combo: distribuir o total entre os sabores */}
      <Dialog open={!!comboItemAberto} onOpenChange={(open) => !open && fecharCombo()}>
        <DialogContent className={DIALOG_TELA_CHEIA}>
          {comboItemAberto && (() => {
            const isComboItem = comboItemAberto.combo_quantidade_total != null;
            const gruposDoItem = gruposPorItem[comboItemAberto.id] || [];
            const saboresDoItem = saboresPorItem[comboItemAberto.id] || [];
            // Foto principal do item; sem ela, uma faixa com as fotos dos sabores
            const fotosSabores = comboItemAberto.imagem_url ? [] : saboresDoItem.map((sb) => sb.imagem_url).filter(Boolean).slice(0, 4);
            return (
            <>
              {comboItemAberto.imagem_url ? (
                <img src={comboItemAberto.imagem_url} alt={comboItemAberto.nome} className="mt-6 w-full h-44 sm:h-52 object-cover rounded-2xl shadow-sm" />
              ) : fotosSabores.length >= 2 ? (
                <div className="mt-6 grid gap-1 h-28 rounded-2xl overflow-hidden shadow-sm" style={{ gridTemplateColumns: `repeat(${fotosSabores.length}, 1fr)` }}>
                  {fotosSabores.map((url, i) => <img key={i} src={url} alt="" className="h-full w-full object-cover" />)}
                </div>
              ) : null}
              <DialogHeader>
                <DialogTitle>{comboItemAberto.nome}</DialogTitle>
                <DialogDescription>
                  {comboItemAberto.descricao}
                  {isComboItem && (
                    comboEhMinimo(comboItemAberto)
                      ? ` Escolha no mínimo ${comboItemAberto.combo_quantidade_total} itens${comboItemAberto.quantidade_maxima ? `, no máximo ${comboItemAberto.quantidade_maxima}` : ''}.${comboItemAberto.combo_permite_acima && Number(comboItemAberto.preco) > 0 ? ' Acima do pacote, o valor é proporcional.' : ''}`
                      : ` Escolha exatamente ${comboItemAberto.combo_quantidade_total} itens.`
                  )}
                </DialogDescription>
              </DialogHeader>

              {isComboItem && (
                <div className={`text-base font-medium rounded-lg px-3 py-2 text-center ${comboAtingiuMinimo(comboItemAberto, comboTotalSelecionado)
                    ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                  {comboEhMinimo(comboItemAberto)
                    ? `${comboTotalSelecionado} escolhidos (mínimo ${comboItemAberto.combo_quantidade_total}${comboItemAberto.quantidade_maxima ? `, máx. ${comboItemAberto.quantidade_maxima}` : ''})`
                    : `${comboTotalSelecionado} / ${comboItemAberto.combo_quantidade_total} escolhidos`}
                  {comboEhMinimo(comboItemAberto) && comboTotalSelecionado >= comboItemAberto.combo_quantidade_total && (
                    <span className="block text-sm font-normal mt-0.5">
                      Total: {formatPreco(
                        Number(comboItemAberto.preco) * fatorPrecoCombo(comboItemAberto, comboTotalSelecionado)
                        + (saboresPorItem[comboItemAberto.id] || []).reduce(
                          (s, sabor) => s + (comboSelecoes[sabor.id] || 0) * Number(sabor.preco_adicional), 0
                        )
                      )}
                    </span>
                  )}
                </div>
              )}

              {isComboItem && saboresDoItem.length > 0 && (
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5 -mb-1">
                  <Pencil className="h-3.5 w-3.5" /> Use + e −, ou toque no número para digitar a quantidade
                </p>
              )}

              {isComboItem && (
                <div className="space-y-2 max-h-80 max-sm:max-h-none overflow-y-auto max-sm:overflow-visible">
                  {saboresDoItem.map((sabor) => (
                    <div key={sabor.id} className="flex items-center gap-3 bg-white border rounded-xl p-2.5 shadow-sm">
                      <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                        {sabor.imagem_url ? (
                          <img src={sabor.imagem_url} alt={sabor.nome} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-gray-900">{sabor.nome}</p>
                        {sabor.preco_adicional > 0 && (
                          <p className="text-sm text-gray-500">+{formatPreco(sabor.preco_adicional)} cada</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="icon" className="h-9 w-9 bg-white" onClick={() => ajustarSabor(sabor.id, -1)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <QtdInput campo value={comboSelecoes[sabor.id] || 0} onCommit={(n) => definirSabor(sabor.id, n)} className="text-base" />
                        <Button variant="outline" size="icon" className="h-9 w-9 bg-white" onClick={() => ajustarSabor(sabor.id, 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {gruposDoItem.length > 0 && (
                <div className="space-y-4">
                  {gruposDoItem.map((grupo) => {
                    const selecionados = adicionaisSelecionados[grupo.id] || [];
                    return (
                      <div key={grupo.id} className="space-y-1.5">
                        <p className="text-base font-medium text-gray-900">
                          {grupo.nome}
                          <span className="ml-1 text-sm font-normal text-gray-500">
                            {grupo.obrigatorio ? '(obrigatório' : '(opcional'}
                            {grupo.maximo ? `, máx. ${grupo.maximo}` : ''})
                          </span>
                        </p>
                        <div className="space-y-1.5">
                          {(grupo.opcoes || []).map((opcao) => {
                            const checked = selecionados.includes(opcao.id);
                            return (
                              <label key={opcao.id} className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={() => toggleAdicional(grupo, opcao.id)}
                                />
                                <span className="flex-1 text-base text-gray-800">{opcao.nome}</span>
                                {Number(opcao.preco_adicional) > 0 && (
                                  <span className="text-sm text-gray-500">+{formatPreco(opcao.preco_adicional)}</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <DialogFooter className={RODAPE_FIXO}>
                <Button variant="outline" onClick={fecharCombo}>Cancelar</Button>
                <Button
                  onClick={confirmarCombo}
                  disabled={
                    (isComboItem && !comboAtingiuMinimo(comboItemAberto, comboTotalSelecionado)) ||
                    !gruposAdicionaisAtendidos(comboItemAberto)
                  }
                >
                  Adicionar ao carrinho
                </Button>
              </DialogFooter>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className={DIALOG_TELA_CHEIA}>
          <DialogHeader>
            <DialogTitle>Finalizar pedido</DialogTitle>
            <DialogDescription>{cartCount} {cartCount === 1 ? 'item' : 'itens'} · {formatPreco(totalComDesconto)}</DialogDescription>
          </DialogHeader>

          {!modoBalcao && cashbackAtivo && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-white text-sm"
              style={{ backgroundColor: cor, backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0.28) 100%)' }}
            >
              <Coins className="h-5 w-5 shrink-0" />
              <span>
                {cashbackSaldo > 0
                  ? <>Você tem <b>{formatPreco(cashbackSaldo)}</b> de cashback para usar{cashbackInfo.so_online ? (onlineMulti ? ' pagando online' : ' pagando com PIX') : ''}</>
                  : cashbackInfo.so_online
                    ? <>Pague {onlineMulti ? 'online' : 'com PIX'} e ganhe <b>{Number(cashbackInfo.percentual)}% de cashback</b></>
                    : <>Ganhe <b>{Number(cashbackInfo.percentual)}% de cashback</b> neste pedido</>}
              </span>
            </div>
          )}
          {!modoBalcao && (
            <button
              type="button" onClick={() => setMostrarItens((v) => !v)}
              className="w-full flex items-center justify-between text-left border rounded-lg px-3 py-2 text-base"
            >
              <span className="font-medium">{cartCount} {cartCount === 1 ? 'item' : 'itens'} no pedido</span>
              <span className="text-sm font-medium" style={{ color: cor }}>{mostrarItens ? 'Ocultar' : 'Ver / editar'}</span>
            </button>
          )}
          {(modoBalcao || mostrarItens) && (
          <div className="space-y-3 max-h-48 overflow-y-auto border rounded-lg p-2">
            {cart.map((c) => (
              <div key={c.chave} className="text-base border-b last:border-b-0 pb-2 last:pb-0">
                <div className="flex justify-between items-center">
                  <span className="font-medium">
                    {c.quantidade}x {c.item.nome}
                    {c.isCombo && (c.sabores || []).length > 0 && ` (${c.sabores.reduce((t, x) => t + x.quantidade, 0)} un)`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{formatPreco(precoLinha(c))}</span>
                    <button onClick={() => removerDoCarrinho(c.chave)} className="text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {c.isCombo && (c.sabores || []).length > 0 && (
                  <div className="mt-1 pl-2 space-y-0.5">
                    {c.sabores.map((s) => (
                      <p key={s.opcaoId} className="text-sm text-gray-500">{s.quantidade}x {s.nome}</p>
                    ))}
                  </div>
                )}
                {(c.adicionais || []).length > 0 && (
                  <div className="mt-1 pl-2 space-y-0.5">
                    {c.adicionais.map((a) => (
                      <p key={a.opcaoId} className="text-sm text-gray-500">+ {a.nome}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => ajustarQuantidadeCaixa(c.chave, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <QtdInput value={c.quantidade} onCommit={(n) => definirQuantidadeCaixa(c.chave, n)} className="text-sm" />
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => ajustarQuantidadeCaixa(c.chave, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          )}

          {modoBalcao && (
          <>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-nome">Nome</Label>
              <Input id="p-nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="p-telefone">Telefone / WhatsApp</Label>
              <Input id="p-telefone" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(19) 99999-9999" />
            </div>
            <div>
              <Label>Como prefere receber?</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button" variant={form.tipo_entrega === 'retirada' ? 'default' : 'outline'} className="flex-1"
                  onClick={() => { setForm((f) => ({ ...f, tipo_entrega: 'retirada' })); setTaxaEntregaInfo(null); }}
                >
                  Retirar
                </Button>
                <Button
                  type="button" variant={form.tipo_entrega === 'entrega' ? 'default' : 'outline'} className="flex-1"
                  onClick={() => setForm((f) => ({ ...f, tipo_entrega: 'entrega' }))}
                >
                  Entrega
                </Button>
              </div>
              {temPrevisao && (
                <p className="text-base text-gray-500 mt-1.5 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Previsão: entre {previsaoAtual.min} e {previsaoAtual.max} minutos
                </p>
              )}
              {form.tipo_entrega === 'entrega' && valorMinimoEntrega > 0 && cartTotal < valorMinimoEntrega && (
                <p className="text-base text-amber-600 mt-1.5">
                  Pedido mínimo para entrega: {formatPreco(valorMinimoEntrega)} (faltam {formatPreco(valorMinimoEntrega - cartTotal)})
                </p>
              )}
            </div>
            {form.tipo_entrega === 'entrega' && (
              <div>
                <Label htmlFor="p-rua">Endereço de entrega</Label>
                <div className="relative">
                  <Input
                    id="p-rua" value={form.enderecoRua}
                    onChange={(e) => handleDigitarRua(e.target.value)}
                    onFocus={() => setMostrarSugestoes(true)}
                    onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                    placeholder="Rua, avenida..."
                    className="mb-2"
                    autoComplete="off"
                  />
                  {mostrarSugestoes && (buscandoSugestoes || sugestoesEndereco.length > 0) && (
                    <div className="absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {buscandoSugestoes ? (
                        <div className="p-2 text-base text-gray-400 flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                        </div>
                      ) : (
                        sugestoesEndereco.map((s) => (
                          <button
                            key={s.placeId}
                            type="button"
                            className="w-full text-left px-3 py-2 text-base text-gray-700 hover:bg-gray-50 border-b last:border-b-0"
                            onMouseDown={() => selecionarSugestao(s)}
                          >
                            {s.descricao}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={form.enderecoNumero}
                    onChange={(e) => { setForm((f) => ({ ...f, enderecoNumero: e.target.value })); setTaxaEntregaInfo(null); }}
                    placeholder="Número"
                    className="w-24"
                  />
                  <Input
                    value={form.enderecoComplemento}
                    onChange={(e) => { setForm((f) => ({ ...f, enderecoComplemento: e.target.value })); setTaxaEntregaInfo(null); }}
                    placeholder="Complemento (opcional)"
                    className="flex-1"
                  />
                </div>
                <Button
                  type="button" variant="outline" className="w-full mt-2"
                  onClick={handleCalcularTaxaEntrega}
                  disabled={calculandoTaxa || !form.enderecoRua.trim() || !form.enderecoNumero.trim()}
                >
                  {calculandoTaxa ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calcular frete'}
                </Button>
                {taxaEntregaInfo && (
                  <p className="text-base text-green-700 mt-1">
                    {taxaEntregaInfo.distanciaKm}km · Taxa de entrega: {formatPreco(taxaEntregaInfo.taxa)}
                  </p>
                )}
              </div>
            )}
            {agendamentoAtivo && (
              <div>
                <Label>Quando você quer?</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button" variant={form.quando === 'agora' ? 'default' : 'outline'} className="flex-1"
                    onClick={() => setForm((f) => ({ ...f, quando: 'agora' }))}
                    disabled={!lojaAbertaAgora}
                  >
                    O quanto antes
                  </Button>
                  <Button
                    type="button" variant={form.quando === 'agendar' ? 'default' : 'outline'} className="flex-1"
                    onClick={() => setForm((f) => ({ ...f, quando: 'agendar' }))}
                  >
                    Agendar
                  </Button>
                </div>
                {form.quando === 'agendar' && (
                  <Input
                    type="datetime-local"
                    className="mt-2"
                    min={minDataAgendamentoStr}
                    value={form.dataAgendamento}
                    onChange={(e) => setForm((f) => ({ ...f, dataAgendamento: e.target.value }))}
                  />
                )}
                {form.quando === 'agendar' && antecedenciaHoras > 0 && (
                  <p className="text-sm text-gray-400 mt-1">Agendamentos precisam de pelo menos {antecedenciaHoras}h de antecedência.</p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="p-cupom">Cupom de desconto (opcional)</Label>
              {cupomAplicado ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-1">
                  <span className="text-base text-green-700 font-medium">{cupomAplicado.codigo} · -{formatPreco(cupomAplicado.desconto)}</span>
                  <button onClick={handleRemoverCupom} className="text-sm text-green-700 underline">Remover</button>
                </div>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Input
                    id="p-cupom" value={cupomInput}
                    onChange={(e) => setCupomInput(e.target.value.toUpperCase())}
                    placeholder="Ex: PROMO10"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={handleAplicarCupom} disabled={validandoCupom || !cupomInput.trim()}>
                    {validandoCupom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="p-obs">Observação (opcional)</Label>
              <Textarea id="p-obs" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={2} />
            </div>

            {!modoBalcao && pagamentoConfigPublico.pix_ativo && (
              <div>
                <Label>Forma de pagamento</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button" variant={formaPagamento === 'pix' ? 'default' : 'outline'} className="flex-1"
                    onClick={() => setFormaPagamento('pix')}
                  >
                    Pagar com PIX agora
                  </Button>
                  {!pagamentoConfigPublico.pagamento_obrigatorio && (
                    <Button
                      type="button" variant={formaPagamento === 'entrega' ? 'default' : 'outline'} className="flex-1"
                      onClick={() => setFormaPagamento('entrega')}
                    >
                      Pagar na entrega
                    </Button>
                  )}
                </div>
              </div>
            )}

            {cashbackAtivo && formaPagamento === 'pix' && cashbackSaldo > 0 && (
              <label className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={usarCashback} onChange={(e) => setUsarCashback(e.target.checked)} />
                <span className="text-base text-green-800">
                  Usar meu cashback ({formatPreco(cashbackSaldo)} disponível)
                  <span className="block text-sm text-green-700">Vale só no pagamento com PIX.</span>
                </span>
              </label>
            )}
            {cashbackAtivo && cashbackInfo?.so_online && formaPagamento !== 'pix' && pagamentoConfigPublico.pix_ativo && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Coins className="h-4 w-4" /> Pague com PIX para ganhar {Number(cashbackInfo.percentual)}% de cashback.
              </p>
            )}

            {pagaNaEntrega && (
              <div>
                <Label>{form.tipo_entrega === 'entrega' ? 'Como você vai pagar na entrega?' : 'Como você vai pagar na retirada?'}</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button" variant={pagamentoEntregaTipo === 'dinheiro' ? 'default' : 'outline'} className="flex-1"
                    onClick={() => setPagamentoEntregaTipo('dinheiro')}
                  >
                    Dinheiro
                  </Button>
                  <Button
                    type="button" variant={pagamentoEntregaTipo === 'cartao' ? 'default' : 'outline'} className="flex-1"
                    onClick={() => setPagamentoEntregaTipo('cartao')}
                  >
                    Cartão (maquininha)
                  </Button>
                </div>
                {pagamentoEntregaTipo === 'dinheiro' ? (
                  <div className="mt-2">
                    <Label htmlFor="p-troco" className="text-sm text-gray-600">Precisa de troco? Pagar com quanto (opcional)</Label>
                    <Input
                      id="p-troco" inputMode="decimal" value={trocoPara} placeholder="Ex: 200,00"
                      onChange={(e) => setTrocoPara(e.target.value.replace(/[^0-9.,]/g, ''))}
                    />
                  </div>
                ) : (
                  form.tipo_entrega === 'entrega' && taxaRetornoFaixa != null && (
                    <p className="text-sm text-gray-500 mt-2">
                      {taxaEntregaInfo
                        ? `No cartão, a taxa de entrega é ${formatPreco(taxaRetornoFaixa)} (inclui o retorno da maquininha).`
                        : 'No cartão a taxa de entrega inclui o retorno da maquininha — calcule o frete para ver o valor.'}
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          </>
          )}

          {!modoBalcao && (
          <div className="space-y-3">
            {lojaStatusManual === 'fechada' && !agendamentoAtivo && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">Loja fechada no momento.</div>
            )}

            {/* 1. Dados */}
            <SecaoCheckout
              id="dados" titulo={`${numSecao('dados')}. Seus dados`} estado={estadoSecao('dados')} cor={cor}
              onTrocar={() => { setSecaoAberta('dados'); setEditandoDados(true); }}
              resumo={<><p className="font-bold">{form.nome}</p><p className="text-sm text-gray-500">{formatarTelefone(form.telefone)}</p></>}
            >
              {mostrarCartaoDados ? (
                <div className="space-y-3">
                  <p className="text-center font-bold text-lg text-gray-900">Confirme seus dados</p>
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><User className="h-5 w-5" style={{ color: cor }} /></span>
                    <div className="min-w-0"><p className="text-xs text-gray-500">Eu sou</p><p className="font-bold text-lg text-gray-900 truncate">{form.nome}</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><Smartphone className="h-5 w-5" style={{ color: cor }} /></span>
                    <div><p className="text-xs text-gray-500">Meu telefone é</p><p className="font-bold text-lg text-gray-900">{formatarTelefone(form.telefone)}</p></div>
                  </div>
                  <Button type="button" variant="outline" className="w-full" style={{ borderColor: cor, color: cor }} onClick={() => setEditandoDados(true)}>Editar informações</Button>
                  <Button type="button" className="w-full text-white" style={{ backgroundColor: cor }} onClick={confirmarDados}>Confirmar</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="p-nome">Nome</Label>
                    <Input id="p-nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="p-telefone">Telefone / WhatsApp</Label>
                    <Input id="p-telefone" inputMode="tel" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(19) 99999-9999" />
                  </div>
                  <Button type="button" className="w-full text-white" style={{ backgroundColor: cor }} disabled={!dadosValidos} onClick={confirmarDados}>Continuar</Button>
                </div>
              )}
            </SecaoCheckout>

            {/* 2. Quando (só se a loja aceita agendamento) */}
            {agendamentoAtivo && (
              <SecaoCheckout
                id="quando" titulo={`${numSecao('quando')}. Quando receber o pedido`} estado={estadoSecao('quando')} cor={cor}
                bloqueadaMsg="Confirme seus dados para continuar"
                onTrocar={() => setSecaoAberta('quando')}
                resumo={form.quando === 'agendar'
                  ? <><p className="font-bold">Agendado</p><p className="text-sm text-gray-500">{form.dataAgendamento ? formatHora(form.dataAgendamento) : ''}</p></>
                  : <p className="font-bold">Agora, o quanto antes</p>}
              >
                <OpcaoCheckout
                  cor={cor} icone={<Clock className="h-5 w-5" />} titulo="Agora"
                  subtitulo={lojaAbertaAgora ? 'O quanto antes' : 'Loja fechada agora'}
                  disabled={!lojaAbertaAgora}
                  selecionada={quandoEscolhido && form.quando === 'agora'}
                  onClick={() => { setForm((f) => ({ ...f, quando: 'agora' })); setQuandoEscolhido(true); setSecaoAberta(null); }}
                />
                <OpcaoCheckout
                  cor={cor} icone={<CalendarDays className="h-5 w-5" />} titulo="Agendar pedido" subtitulo="Já deixe pago"
                  selecionada={form.quando === 'agendar'}
                  onClick={() => { setForm((f) => ({ ...f, quando: 'agendar' })); setQuandoEscolhido(false); }}
                />
                {form.quando === 'agendar' && (
                  <div className="space-y-2">
                    <Input
                      type="datetime-local" id="p-agendar" min={minDataAgendamentoStr} value={form.dataAgendamento}
                      onChange={(e) => setForm((f) => ({ ...f, dataAgendamento: e.target.value }))}
                    />
                    {antecedenciaHoras > 0 && <p className="text-sm text-gray-400">Agendamentos precisam de pelo menos {antecedenciaHoras}h de antecedência.</p>}
                    <Button
                      type="button" className="w-full text-white" style={{ backgroundColor: cor }}
                      disabled={!form.dataAgendamento}
                      onClick={() => { setQuandoEscolhido(true); setSecaoAberta(null); }}
                    >
                      Confirmar horário
                    </Button>
                  </div>
                )}
              </SecaoCheckout>
            )}

            {/* 3. Como receber */}
            <SecaoCheckout
              id="receber" titulo={`${numSecao('receber')}. Como receber o pedido`} estado={estadoSecao('receber')} cor={cor}
              bloqueadaMsg={agendamentoAtivo ? 'Escolha quando receber para continuar' : 'Confirme seus dados para continuar'}
              onTrocar={() => setSecaoAberta('receber')}
              resumo={form.tipo_entrega === 'retirada'
                ? <><p className="font-bold">Buscar o pedido</p><p className="text-sm text-green-600">Grátis</p></>
                : <><p className="font-bold">Entrega</p><p className="text-sm text-gray-500">{enderecoCompleto}</p>{taxaEntregaInfo && <p className="text-sm text-gray-500">Taxa de entrega: {formatPreco(taxaEntregaInfo.taxa)}</p>}</>}
            >
              <OpcaoCheckout
                cor={cor} icone={<Store className="h-5 w-5" />} titulo="Buscar o pedido"
                subtitulo={<><span className="text-green-600 font-medium">Grátis</span>{tempoTexto('retirada') ? ` · ${tempoTexto('retirada')}` : ''}</>}
                selecionada={receberSel === 'retirada'}
                onClick={() => { setReceberSel('retirada'); setEnderecoIdx(null); setForm((f) => ({ ...f, tipo_entrega: 'retirada' })); setTaxaEntregaInfo(null); setReceberEscolhido(true); setSecaoAberta(null); }}
              />
              <OpcaoCheckout
                cor={cor} icone={<Home className="h-5 w-5" />} titulo="Receber em casa"
                subtitulo={tempoTexto('entrega') || 'Calculamos o frete pelo endereço'}
                selecionada={receberSel === 'entrega'}
                onClick={() => {
                  if (receberSel !== 'entrega' && enderecosCliente.length > 0) { usarEndereco(enderecosCliente[0], 0); return; }
                  setReceberSel('entrega'); setForm((f) => ({ ...f, tipo_entrega: 'entrega' })); setReceberEscolhido(false);
                }}
              />
              {receberSel === 'entrega' && enderecosCliente.length > 0 && (
                <div className="pt-1 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Meus endereços</p>
                  {enderecosCliente.map((e, i) => (
                    <OpcaoCheckout
                      key={`${e.rua}|${e.numero}|${e.complemento}`}
                      cor={cor} icone={<Home className="h-5 w-5" />}
                      titulo={`${e.rua}, ${e.numero}`}
                      subtitulo={e.complemento || (i === 0 ? 'Usado por último' : 'Entregar aqui')}
                      selecionada={enderecoIdx === i}
                      onClick={() => usarEndereco(e, i)}
                    />
                  ))}
                  <OpcaoCheckout
                    cor={cor} icone={<Plus className="h-5 w-5" />} titulo="Outro endereço"
                    subtitulo="Digitar um endereço novo"
                    selecionada={enderecoIdx === 'outro'}
                    onClick={usarOutroEndereco}
                  />
                </div>
              )}
              {receberSel === 'entrega' && (enderecosCliente.length === 0 || enderecoIdx !== null) && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="p-rua">Endereço de entrega</Label>
                  <div className="relative">
                    <Input
                      id="p-rua" value={form.enderecoRua}
                      onChange={(e) => handleDigitarRua(e.target.value)}
                      onFocus={() => setMostrarSugestoes(true)}
                      onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                      placeholder="Rua, avenida..." autoComplete="off"
                    />
                    {mostrarSugestoes && (buscandoSugestoes || sugestoesEndereco.length > 0) && (
                      <div className="absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {buscandoSugestoes ? (
                          <div className="p-2 text-base text-gray-400 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...</div>
                        ) : (
                          sugestoesEndereco.map((sg) => (
                            <button
                              key={sg.placeId} type="button"
                              className="w-full text-left px-3 py-2 text-base text-gray-700 hover:bg-gray-50 border-b last:border-b-0"
                              onMouseDown={() => selecionarSugestao(sg)}
                            >
                              {sg.descricao}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={form.enderecoNumero} placeholder="Número" className="w-24"
                      onChange={(e) => { setForm((f) => ({ ...f, enderecoNumero: e.target.value })); setTaxaEntregaInfo(null); }}
                    />
                    <Input
                      value={form.enderecoComplemento} placeholder="Complemento (opcional)" className="flex-1"
                      onChange={(e) => { setForm((f) => ({ ...f, enderecoComplemento: e.target.value })); setTaxaEntregaInfo(null); }}
                    />
                  </div>
                  {temTaxaConfigurada && (
                    <Button
                      type="button" variant="outline" className="w-full"
                      onClick={handleCalcularTaxaEntrega}
                      disabled={calculandoTaxa || !form.enderecoRua.trim() || !form.enderecoNumero.trim()}
                    >
                      {calculandoTaxa ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calcular frete'}
                    </Button>
                  )}
                  {taxaEntregaInfo && (
                    <p className="text-base text-green-700">{taxaEntregaInfo.distanciaKm}km · Taxa de entrega: {formatPreco(taxaEntregaInfo.taxa)}</p>
                  )}
                  {!minimoEntregaOk && (
                    <p className="text-base text-amber-600">Pedido mínimo para entrega: {formatPreco(valorMinimoEntrega)} (faltam {formatPreco(valorMinimoEntrega - cartTotal)})</p>
                  )}
                  <Button
                    type="button" className="w-full text-white" style={{ backgroundColor: cor }}
                    disabled={!enderecoPronto}
                    onClick={() => { setReceberEscolhido(true); setSecaoAberta(null); }}
                  >
                    Confirmar endereço
                  </Button>
                </div>
              )}
            </SecaoCheckout>

            {/* 4. Pagamento */}
            <SecaoCheckout
              id="pagamento" titulo={`${numSecao('pagamento')}. Forma de pagamento`} estado={estadoSecao('pagamento')} cor={cor}
              bloqueadaMsg="Escolha como receber para continuar"
              onTrocar={() => setSecaoAberta('pagamento')}
              resumo={formaPagamento === 'infinitepay'
                ? <><p className="font-bold">Pagar online</p><p className="text-sm text-gray-500">PIX ou cartão, na página segura da InfinitePay</p></>
                : formaPagamento === 'cartao_online'
                ? <><p className="font-bold">Cartão de crédito</p><p className="text-sm text-gray-500">Pague agora, direto no app</p></>
                : formaPagamento === 'pix'
                ? <><p className="font-bold">PIX</p><p className="text-sm text-gray-500">Pague agora, já deixa pago</p></>
                : <><p className="font-bold">{pagamentoEntregaTipo === 'cartao' ? 'Cartão (maquininha)' : 'Dinheiro'}</p><p className="text-sm text-gray-500">Pagamento na {form.tipo_entrega === 'entrega' ? 'entrega' : 'retirada'}</p></>}
            >
              {infinitePayAtivo && (
                <OpcaoCheckout
                  cor={cor} icone={<Zap className="h-5 w-5" />} titulo="Pagar online" subtitulo="PIX ou cartão, pague agora"
                  selecionada={pagamentoEscolhido && formaPagamento === 'infinitepay'}
                  onClick={() => escolherPagamento('infinitepay')}
                  extra={cashbackAtivo ? (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-md bg-green-100 text-green-800">
                      <Coins className="h-3 w-3" />{Number(cashbackInfo.percentual)}% de cashback
                    </span>
                  ) : null}
                />
              )}
              {pixInternoAtivo && (
                <OpcaoCheckout
                  cor={cor} icone={<Zap className="h-5 w-5" />} titulo="PIX" subtitulo="Pague agora, já deixa pago"
                  selecionada={pagamentoEscolhido && formaPagamento === 'pix'}
                  onClick={() => escolherPagamento('pix')}
                  extra={cashbackAtivo ? (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-md bg-green-100 text-green-800">
                      <Coins className="h-3 w-3" />{Number(cashbackInfo.percentual)}% de cashback
                    </span>
                  ) : null}
                />
              )}
              {pagamentoConfigPublico.cartao_online && (
                <OpcaoCheckout
                  cor={cor} icone={<CreditCard className="h-5 w-5" />} titulo="Cartão de crédito" subtitulo={Number(pagamentoConfigPublico.cartao_max_parcelas) > 1 ? `Pague agora em até ${pagamentoConfigPublico.cartao_max_parcelas}x` : 'Pague agora, direto no app'}
                  selecionada={pagamentoEscolhido && formaPagamento === 'cartao_online'}
                  onClick={() => escolherPagamento('cartao_online')}
                  extra={cashbackAtivo ? (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-md bg-green-100 text-green-800">
                      <Coins className="h-3 w-3" />{Number(cashbackInfo.percentual)}% de cashback
                    </span>
                  ) : null}
                />
              )}
              {(!pagamentoConfigPublico.pagamento_obrigatorio || (!pixInternoAtivo && !pagamentoConfigPublico.cartao_online && !infinitePayAtivo)) && (
                <>
                  <OpcaoCheckout
                    cor={cor} icone={<CreditCard className="h-5 w-5" />} titulo="Dinheiro" subtitulo={`Pagar na ${form.tipo_entrega === 'entrega' ? 'entrega' : 'retirada'}`}
                    selecionada={pagamentoEscolhido && !pagOnline && pagamentoEntregaTipo === 'dinheiro'}
                    onClick={() => escolherPagamento('dinheiro')}
                  />
                  <OpcaoCheckout
                    cor={cor} icone={<CreditCard className="h-5 w-5" />} titulo="Cartão (maquininha)" subtitulo={`Pagar na ${form.tipo_entrega === 'entrega' ? 'entrega' : 'retirada'}`}
                    selecionada={pagamentoEscolhido && !pagOnline && pagamentoEntregaTipo === 'cartao'}
                    onClick={() => escolherPagamento('cartao')}
                  />
                </>
              )}
            </SecaoCheckout>

            {/* 5. Revisão */}
            <SecaoCheckout
              id="resumo" titulo="Revise e confirme" estado={estadoSecao('resumo')} cor={cor}
              bloqueadaMsg="Responda as etapas acima para continuar"
            >
              <div>
                <Label htmlFor="p-cupom">Cupom de desconto (opcional)</Label>
                {cupomAplicado ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-1">
                    <span className="text-base text-green-700 font-medium">{cupomAplicado.codigo} · -{formatPreco(cupomAplicado.desconto)}</span>
                    <button type="button" onClick={handleRemoverCupom} className="text-sm text-green-700 underline">Remover</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <Input id="p-cupom" value={cupomInput} onChange={(e) => setCupomInput(e.target.value.toUpperCase())} placeholder="Ex: PROMO10" className="flex-1" />
                    <Button type="button" variant="outline" onClick={handleAplicarCupom} disabled={validandoCupom || !cupomInput.trim()}>
                      {validandoCupom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                    </Button>
                  </div>
                )}
              </div>
              {cashbackAtivo && pagOnline && cashbackSaldo > 0 && (
                <label className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={usarCashback} onChange={(e) => setUsarCashback(e.target.checked)} />
                  <span className="text-base text-green-800">
                    Usar meu cashback ({formatPreco(cashbackSaldo)} disponível)
                    <span className="block text-sm text-green-700">{onlineMulti ? 'Vale no pagamento online (PIX ou cartão).' : 'Vale só no pagamento com PIX.'}</span>
                  </span>
                </label>
              )}
              {pagaNaEntrega && pagamentoEntregaTipo === 'dinheiro' && (
                <div>
                  <Label htmlFor="p-troco" className="text-sm text-gray-600">Precisa de troco? Pagar com quanto (opcional)</Label>
                  <Input id="p-troco" inputMode="decimal" value={trocoPara} placeholder="Ex: 200,00" onChange={(e) => setTrocoPara(e.target.value.replace(/[^0-9.,]/g, ''))} />
                </div>
              )}
              {pagaNaEntrega && pagamentoEntregaTipo === 'cartao' && form.tipo_entrega === 'entrega' && taxaRetornoFaixa != null && (
                <p className="text-sm text-gray-500">
                  {taxaEntregaInfo
                    ? `No cartão, a taxa de entrega é ${formatPreco(taxaRetornoFaixa)} (inclui o retorno da maquininha).`
                    : 'No cartão a taxa de entrega inclui o retorno da maquininha — calcule o frete para ver o valor.'}
                </p>
              )}
              <div>
                <Label htmlFor="p-obs">Observação (opcional)</Label>
                <Textarea id="p-obs" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={2} />
              </div>
            </SecaoCheckout>
          </div>
          )}

          <div className="text-base space-y-1 border-t pt-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span>{formatPreco(cartTotal)}</span>
            </div>
            {cupomAplicado && (
              <div className="flex justify-between text-green-700">
                <span>Desconto ({cupomAplicado.codigo})</span><span>-{formatPreco(cupomAplicado.desconto)}</span>
              </div>
            )}
            {form.tipo_entrega === 'entrega' && taxaEntregaInfo && (
              <div className="flex justify-between text-gray-600">
                <span>Taxa de entrega{usaTaxaRetorno ? ' (com retorno da maquininha)' : ''}</span><span>{formatPreco(taxaEntregaAplicada)}</span>
              </div>
            )}
            {cashbackUsoPrevisto > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Cashback usado</span><span>-{formatPreco(cashbackUsoPrevisto)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-lg">
              <span>Total</span><span>{formatPreco(totalAPagar)}</span>
            </div>
            {cashbackGanhoPrevisto > 0 && (
              <p className="text-sm text-green-700 flex items-center gap-1">
                <Coins className="h-4 w-4" /> Você vai ganhar {formatPreco(cashbackGanhoPrevisto)} de cashback neste pedido
              </p>
            )}
          </div>

          {!modoBalcao && (
          <DialogFooter className={RODAPE_FIXO}>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Voltar</Button>
            <Button onClick={handleSubmitPedido} disabled={submitting || gerandoPix || !todasEtapasOk}>
              {submitting || gerandoPix
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : !todasEtapasOk ? 'Responda as etapas acima'
                  : formaPagamento === 'infinitepay' ? `Pagar online · ${formatPreco(totalAPagar)}`
                  : formaPagamento === 'pix' ? `Gerar PIX · ${formatPreco(totalAPagar)}`
                    : formaPagamento === 'cartao_online' ? `Pagar com cartão · ${formatPreco(totalAPagar)}`
                    : `Confirmar pedido · ${formatPreco(totalAPagar)}`}
            </Button>
          </DialogFooter>
          )}
          {modoBalcao && (
          <>
          <DialogFooter className={RODAPE_FIXO}>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Voltar</Button>
            <Button
              onClick={handleSubmitPedido}
              disabled={submitting || gerandoPix || (form.tipo_entrega === 'entrega' && valorMinimoEntrega > 0 && cartTotal < valorMinimoEntrega)}
            >
              {submitting || gerandoPix ? <Loader2 className="h-4 w-4 animate-spin" /> : formaPagamento === 'pix' ? `Gerar PIX · ${formatPreco(totalAPagar)}` : `Confirmar pedido · ${formatPreco(totalComDesconto)}`}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido #{cancelTarget?.numero_pedido}?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Se quiser esse pedido depois, você vai precisar fazer um novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelarPedidoCliente} disabled={cancelando} className="bg-red-600 hover:bg-red-700">
              {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sim, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}