import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, CalendarClock, Phone, MapPin, Store, CheckCircle2, XCircle, Printer, Play, Eye,
  Settings2, Clock, Wallet, ArrowRight, Smartphone, Monitor, MessageCircle,
} from 'lucide-react';
import {
  imprimirCupomPedido, agruparItensPedido, rotuloFormaPagamento,
  formatarDataHoraAgendamento, formatarPreco,
} from '@/utils/cupomPedidoCardapio';

// Pedidos Agendados: fila de pedidos que NÃO vão direto pro preparo.
//  - Pendentes: pedido do app aguardando pagamento/aceite da loja.
//  - Aceitos:   pagos/aceitos, esperando a hora de produzir.
// Pedido do Balcão já entra em "Aceitos". Só vai pro quadro de Pedidos do
// Cardápio (produção) quando alguém clica em "Iniciar produção" — ou pelo
// pop-up automático, X minutos antes do horário (parâmetro desta tela).

const ORIGEM_INFO = {
  app: { label: 'App', icon: Smartphone, cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  balcao: { label: 'Balcão', icon: Monitor, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, cls: 'bg-green-50 text-green-700 border-green-200' },
};

const tocarSom = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (inicio, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio); osc.stop(ctx.currentTime + inicio + 0.35);
    };
    beep(0, 880); beep(0.18, 1180);
  } catch (e) { /* ignore */ }
};

const diaRotulo = (iso) => {
  if (!iso) return 'Agora';
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
  const mesmoDia = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia(d, hoje)) return `Hoje ${hora}`;
  if (mesmoDia(d, amanha)) return `Amanhã ${hora}`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const faltaTexto = (iso, agora) => {
  if (!iso) return null;
  const min = Math.round((new Date(iso).getTime() - agora) / 60000);
  if (min <= 0) return { texto: `atrasado ${Math.abs(min)} min`, atrasado: true };
  if (min < 60) return { texto: `em ${min} min`, atrasado: false };
  if (min < 1440) return { texto: `em ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`, atrasado: false };
  return { texto: `em ${Math.floor(min / 1440)} dia(s)`, atrasado: false };
};

const infoPagamento = (p) => {
  if (p.forma_pagamento_online) {
    if (p.status_pagamento === 'pago') {
      return { texto: `${rotuloFormaPagamento(p.forma_pagamento_online)} online — pago${p.pagamento_confirmado_manualmente ? ' (confirmado pela loja)' : ''}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', pago: true };
    }
    if (p.status_pagamento === 'falhou') return { texto: 'Pagamento online falhou', cls: 'bg-red-50 text-red-700 border-red-200', pago: false };
    return { texto: 'Aguardando pagamento online', cls: 'bg-amber-50 text-amber-700 border-amber-200', pago: false };
  }
  const quando = p.tipo_entrega === 'entrega' ? 'na entrega' : 'na retirada';
  if (p.pagamento_entrega_tipo === 'dinheiro') {
    const troco = Number(p.troco_para || 0);
    return { texto: `Dinheiro ${quando}${troco > 0 ? ` (troco p/ ${formatarPreco(troco)})` : ''}`, cls: 'bg-gray-50 text-gray-700 border-gray-200', pago: false };
  }
  if (p.pagamento_entrega_tipo === 'cartao') return { texto: `Cartão ${quando}`, cls: 'bg-gray-50 text-gray-700 border-gray-200', pago: false };
  const f = p.vendas?.forma_pagamento;
  return { texto: f && f !== 'A combinar' ? `${rotuloFormaPagamento(f)} (${quando})` : `A pagar ${quando}`, cls: 'bg-gray-50 text-gray-700 border-gray-200', pago: false };
};

export default function PedidosAgendadosPage() {
  const { empresaId, empresaNome } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [emProducao, setEmProducao] = useState(0);
  const [expandido, setExpandido] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [novosIds, setNovosIds] = useState(new Set());
  const idsConhecidosRef = useRef(null);

  const [aceitarAlvo, setAceitarAlvo] = useState(null);
  const [confirmouPagamento, setConfirmouPagamento] = useState(false);
  const [cancelarAlvo, setCancelarAlvo] = useState(null);
  const [processando, setProcessando] = useState(false);

  const [config, setConfig] = useState({});
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [antecedenciaInput, setAntecedenciaInput] = useState('120');
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async (silencioso = false) => {
    if (!empresaId) { if (!silencioso) setLoading(false); return; }
    if (!silencioso) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_cardapio')
        .select('*, pedidos_cardapio_itens(*), vendas(forma_pagamento)')
        .eq('empresa_id', empresaId)
        .eq('status', 'PENDENTE')
        .eq('arquivado', false)
        .or('data_agendamento.not.is.null,origem.eq.balcao')
        .order('data_agendamento', { ascending: true, nullsFirst: true });
      if (error) throw error;
      const lista = data || [];

      if (idsConhecidosRef.current !== null) {
        const novos = lista.filter((p) => !idsConhecidosRef.current.has(p.id));
        if (novos.length > 0) {
          tocarSom();
          novos.forEach((p) => toast({ title: `🔔 Novo pedido agendado #${p.numero_pedido}`, description: p.cliente_nome }));
          setNovosIds((prev) => new Set([...prev, ...novos.map((p) => p.id)]));
          setTimeout(() => setNovosIds((prev) => { const n = new Set(prev); novos.forEach((p) => n.delete(p.id)); return n; }), 15000);
        }
      }
      idsConhecidosRef.current = new Set(lista.map((p) => p.id));
      setPedidos(lista);

      const { count } = await supabase
        .from('pedidos_cardapio')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('arquivado', false)
        .in('status', ['CONFIRMADO', 'EM_PREPARO', 'PRONTO'])
        .not('data_agendamento', 'is', null);
      setEmProducao(count || 0);
    } catch (e) {
      console.error('Erro ao carregar pedidos agendados:', e);
      if (!silencioso) toast({ title: 'Erro ao carregar pedidos agendados', description: e.message, variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const t = setInterval(() => loadData(true), 10000);
    return () => clearInterval(t);
  }, [loadData]);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('empresas').select('cardapio_config').eq('id', empresaId).maybeSingle().then(({ data }) => {
      const cfg = data?.cardapio_config || {};
      setConfig(cfg);
      setAntecedenciaInput(String(cfg.agendados_antecedencia_min ?? 120));
    });
  }, [empresaId]);

  const salvarConfig = async (patch) => {
    setSalvandoConfig(true);
    try {
      const { data: atual } = await supabase.from('empresas').select('cardapio_config').eq('id', empresaId).single();
      const novo = { ...(atual?.cardapio_config || {}), ...patch };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novo }).eq('id', empresaId);
      if (error) throw error;
      setConfig(novo);
      window.dispatchEvent(new Event('agendados-config-atualizada'));
      toast({ title: 'Configuração salva' });
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSalvandoConfig(false);
    }
  };

  const salvarAntecedencia = () => {
    const n = Math.round(Number(antecedenciaInput));
    if (!Number.isFinite(n) || n < 0 || n > 2880) {
      toast({ title: 'Valor inválido', description: 'Use um número de minutos entre 0 e 2880.', variant: 'destructive' });
      return;
    }
    salvarConfig({ agendados_antecedencia_min: n });
  };

  const pendentes = pedidos.filter((p) => !p.aceito_em);
  const aceitos = pedidos.filter((p) => !!p.aceito_em);

  const abrirAceitar = (p) => { setConfirmouPagamento(false); setAceitarAlvo(p); };

  const confirmarAceite = async () => {
    if (!aceitarAlvo) return;
    setProcessando(true);
    try {
      const { error } = await supabase.rpc('rpc_aceitar_pedido_cardapio', {
        p_pedido_id: aceitarAlvo.id,
        p_pagamento_confirmado: confirmouPagamento,
        p_origem: null,
      });
      if (error) throw error;
      toast({ title: `Pedido #${aceitarAlvo.numero_pedido} aceito`, description: 'Está em "Aceitos" aguardando a hora de produzir.' });
      setAceitarAlvo(null);
      loadData(true);
    } catch (e) {
      toast({ title: 'Não foi possível aceitar', description: e.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setProcessando(false);
    }
  };

  const iniciarProducao = async (p) => {
    setProcessando(true);
    try {
      const { error } = await supabase.rpc('rpc_atualizar_status_pedido_cardapio', { p_pedido_id: p.id, p_novo_status: 'CONFIRMADO' });
      if (error) throw error;
      setPedidos((prev) => prev.filter((x) => x.id !== p.id));
      toast({ title: `Pedido #${p.numero_pedido} em produção`, description: 'Agora está no quadro de Pedidos do Cardápio.' });
      loadData(true);
    } catch (e) {
      toast({ title: 'Erro ao iniciar produção', description: e.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setProcessando(false);
    }
  };

  const confirmarCancelamento = async () => {
    if (!cancelarAlvo) return;
    setProcessando(true);
    try {
      const { error } = await supabase.rpc('rpc_cancelar_pedido_cardapio', { p_pedido_id: cancelarAlvo.id });
      if (error) throw error;
      toast({ title: 'Pedido cancelado' });
      setCancelarAlvo(null);
      loadData(true);
    } catch (e) {
      toast({ title: 'Erro ao cancelar', description: e.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setProcessando(false);
    }
  };

  const imprimir = (p) => {
    if (!imprimirCupomPedido(p, empresaNome)) {
      toast({ title: 'Popup bloqueado', description: 'Permita popups para este site para imprimir.', variant: 'destructive' });
    }
  };

  const renderCard = (p, coluna) => {
    const pag = infoPagamento(p);
    const origem = ORIGEM_INFO[p.origem] || ORIGEM_INFO.app;
    const OrigemIcon = origem.icon;
    const falta = faltaTexto(p.data_agendamento, agora);
    const aberto = expandido === p.id;
    const linhas = agruparItensPedido(p);
    const antecedenciaMs = Number(config.agendados_antecedencia_min ?? 120) * 60000;
    const naHoraDeProduzir = p.data_agendamento && (new Date(p.data_agendamento).getTime() - antecedenciaMs <= agora);

    return (
      <div key={p.id} className={`bg-white rounded-xl border p-3 shadow-sm space-y-2 ${novosIds.has(p.id) ? 'ring-2 ring-amber-400 animate-pulse' : 'border-gray-200'} ${coluna === 'aceitos' && naHoraDeProduzir ? 'border-red-400 ring-1 ring-red-300' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-black text-gray-900">#{p.numero_pedido} <span className="font-semibold text-gray-700">{p.cliente_nome}</span></p>
            <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" /> {p.cliente_telefone}</p>
          </div>
          <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${origem.cls}`}>
            <OrigemIcon className="h-3 w-3" /> {origem.label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900 flex items-center gap-1">
            <CalendarClock className="h-4 w-4 text-gray-500" /> {diaRotulo(p.data_agendamento)}
          </span>
          {falta && <span className={`text-xs font-bold ${falta.atrasado ? 'text-red-600' : 'text-gray-500'}`}>({falta.texto})</span>}
        </div>

        <div className="text-xs text-gray-600 flex items-start gap-1">
          {p.tipo_entrega === 'entrega' ? <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Store className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{p.tipo_entrega === 'entrega' ? (p.endereco_entrega || 'Entrega') : 'Retirada no local'}</span>
        </div>

        <div className={`text-xs font-semibold px-2 py-1 rounded-md border flex items-center gap-1 ${pag.cls}`}>
          <Wallet className="h-3.5 w-3.5" /> {pag.texto}
        </div>

        <div className="flex items-center justify-between">
          <button className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1" onClick={() => setExpandido(aberto ? null : p.id)}>
            <Eye className="h-3.5 w-3.5" /> {aberto ? 'Ocultar itens' : `${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}`}
          </button>
          <span className="font-black text-gray-900">{formatarPreco(p.total)}</span>
        </div>

        {aberto && (
          <div className="text-xs text-gray-700 space-y-1 border-t pt-2">
            {linhas.map((l, i) => (l.tipo === 'simples' ? (
              <div key={i} className="flex justify-between"><span>{l.item.quantidade}x {l.item.nome_item}</span><span>{formatarPreco(l.item.subtotal)}</span></div>
            ) : (
              <div key={i}>
                <div className="flex justify-between font-semibold"><span>{l.header.quantidade}x {l.header.nome_item}</span></div>
                {l.sabores.map((s) => <div key={s.id} className="pl-3 text-gray-500">{s.quantidade}x {s.nome_item}</div>)}
              </div>
            )))}
            {p.observacao && <p className="text-gray-500">Obs: {p.observacao}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {coluna === 'pendentes' ? (
            <>
              <Button size="sm" className="gap-1.5 font-bold" disabled={processando} onClick={() => abrirAceitar(p)}>
                <CheckCircle2 className="h-4 w-4" /> {pag.pago ? 'Aceitar' : (p.forma_pagamento_online ? 'Confirmar pagamento e aceitar' : 'Dar baixa e aceitar')}
              </Button>
            </>
          ) : (
            <Button size="sm" className="gap-1.5 font-bold" disabled={processando} onClick={() => iniciarProducao(p)}>
              <Play className="h-4 w-4" /> Iniciar produção
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => imprimir(p)}><Printer className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700" disabled={processando} onClick={() => setCancelarAlvo(p)}>
            <XCircle className="h-4 w-4" /> Cancelar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <Helmet><title>Pedidos Agendados - Reddu</title></Helmet>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><CalendarClock className="h-6 w-6" /> Pedidos Agendados</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pedidos do app aguardam aqui o pagamento/aceite; pedidos do balcão já entram como aceitos. Só vão para a produção quando você inicia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {emProducao > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/dashboard/cardapio/pedidos')}>
                {emProducao} em produção <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMostrarConfig((v) => !v)}>
              <Settings2 className="h-4 w-4" /> Avisos
            </Button>
          </div>
        </div>

        {mostrarConfig && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <p className="font-bold text-gray-900 flex items-center gap-2"><Clock className="h-4 w-4" /> Avisos de pedido agendado</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-700">Avisar quantos minutos antes do horário:</span>
              <Input type="number" min={0} max={2880} value={antecedenciaInput} onChange={(e) => setAntecedenciaInput(e.target.value)} className="w-24 h-9" />
              <Button size="sm" onClick={salvarAntecedencia} disabled={salvandoConfig}>Salvar</Button>
              <span className="text-xs text-gray-500">(120 = 2 horas antes)</span>
            </div>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={config.agendados_alerta_som !== false} disabled={salvandoConfig} onCheckedChange={(v) => salvarConfig({ agendados_alerta_som: v })} />
              Tocar campainha até alguém responder ao aviso
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={config.agendados_impressao_automatica !== false} disabled={salvandoConfig} onCheckedChange={(v) => salvarConfig({ agendados_impressao_automatica: v })} />
              Imprimir o pedido automaticamente quando o aviso disparar
            </label>
            <p className="text-xs text-gray-500">
              A impressão automática usa a janela de impressão do navegador. Se o navegador bloquear popups, o aviso mostra o botão Imprimir.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-black text-amber-800 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Pendentes</p>
                <span className="text-xs font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">{pendentes.length}</span>
              </div>
              {pendentes.length === 0 && <p className="text-sm text-amber-800/70 text-center py-6">Nenhum pedido aguardando aceite.</p>}
              {pendentes.map((p) => renderCard(p, 'pendentes'))}
            </div>
            <div className="rounded-2xl border-2 border-blue-300 bg-blue-50/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-black text-blue-800 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Aceitos</p>
                <span className="text-xs font-bold text-blue-800 bg-blue-100 rounded-full px-2 py-0.5">{aceitos.length}</span>
              </div>
              {aceitos.length === 0 && <p className="text-sm text-blue-800/70 text-center py-6">Nenhum pedido aceito aguardando produção.</p>}
              {aceitos.map((p) => renderCard(p, 'aceitos'))}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!aceitarAlvo} onOpenChange={(open) => !open && setAceitarAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aceitar pedido #{aceitarAlvo?.numero_pedido} de {aceitarAlvo?.cliente_nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {aceitarAlvo && aceitarAlvo.forma_pagamento_online && aceitarAlvo.status_pagamento !== 'pago'
                ? 'O pagamento online ainda não caiu. Só aceite se você já recebeu o valor por outro meio.'
                : 'Ele fica em "Aceitos" até a hora de produzir.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {aceitarAlvo && aceitarAlvo.forma_pagamento_online && aceitarAlvo.status_pagamento !== 'pago' && (
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" className="mt-1" checked={confirmouPagamento} onChange={(e) => setConfirmouPagamento(e.target.checked)} />
              Confirmo que recebi {formatarPreco(aceitarAlvo.total)} deste pedido.
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={processando || (aceitarAlvo && aceitarAlvo.forma_pagamento_online && aceitarAlvo.status_pagamento !== 'pago' && !confirmouPagamento)}
              onClick={(e) => { e.preventDefault(); confirmarAceite(); }}
            >
              {processando ? 'Aceitando...' : 'Aceitar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelarAlvo} onOpenChange={(open) => !open && setCancelarAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido #{cancelarAlvo?.numero_pedido} de {cancelarAlvo?.cliente_nome}?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={processando} onClick={(e) => { e.preventDefault(); confirmarCancelamento(); }}>
              Cancelar pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}