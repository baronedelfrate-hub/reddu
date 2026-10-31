import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { CalendarClock, Printer, BellRing, Play, Check } from 'lucide-react';
import { imprimirCupomPedido, formatarDataHoraAgendamento } from '@/utils/cupomPedidoCardapio';

// Aviso GLOBAL dos pedidos agendados (montado no DashboardLayout, então funciona
// em qualquer tela do dashboard):
//  1) Pedido agendado do app que acabou de ser PAGO (Pix) é aceito sozinho.
//  2) Pedido agendado ACEITO, quando chega "X min antes" do horário marcado
//     (parâmetro da loja, padrão 120 min): campainha repetindo + pop-up fixo
//     até alguém clicar em "Iniciar produção" ou "Ciente" + impressão automática.
// Parâmetros em empresas.cardapio_config (editáveis na tela Pedidos Agendados):
//   agendados_antecedencia_min (padrão 120), agendados_alerta_som (padrão true),
//   agendados_impressao_automatica (padrão true).

const LS_DISPENSADOS = 'agendados_dispensados_v1';
const LS_IMPRESSOS = 'agendados_impressos_v1';

const lerSet = (chave) => {
  try { return new Set(JSON.parse(localStorage.getItem(chave) || '[]')); } catch { return new Set(); }
};
const salvarSet = (chave, set) => {
  try { localStorage.setItem(chave, JSON.stringify([...set].slice(-300))); } catch (e) { /* ignore */ }
};

const tocarCampainha = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (inicio, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.3);
    };
    beep(0, 1040); beep(0.35, 1040); beep(0.7, 1320);
    setTimeout(() => { try { ctx.close(); } catch (e) { /* ignore */ } }, 1500);
  } catch (e) {
    console.warn('Não foi possível tocar a campainha:', e);
  }
};

export default function AgendadosAlertas() {
  const { empresaId, empresaNome } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [config, setConfig] = useState({});
  const [aceitos, setAceitos] = useState([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [dispensados, setDispensados] = useState(() => lerSet(LS_DISPENSADOS));
  const [falhaImpressao, setFalhaImpressao] = useState({});
  const impressosRef = useRef(lerSet(LS_IMPRESSOS));
  const autoAceitosRef = useRef(new Set());

  const antecedenciaMin = Number(config.agendados_antecedencia_min ?? 120);
  const somAtivo = config.agendados_alerta_som !== false;
  const impressaoAuto = config.agendados_impressao_automatica !== false;

  // Relógio (a cada 15s é suficiente — o limite é em minutos)
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Configuração da loja (recarrega a cada 2 min, pega mudança feita em outro terminal)
  useEffect(() => {
    if (!empresaId) return undefined;
    let ativo = true;
    const carregar = async () => {
      const { data } = await supabase.from('empresas').select('cardapio_config').eq('id', empresaId).maybeSingle();
      if (ativo && data) setConfig(data.cardapio_config || {});
    };
    carregar();
    const t = setInterval(carregar, 120000);
    const aoMudar = () => carregar();
    window.addEventListener('agendados-config-atualizada', aoMudar);
    return () => { ativo = false; clearInterval(t); window.removeEventListener('agendados-config-atualizada', aoMudar); };
  }, [empresaId]);

  const buscar = useCallback(async () => {
    if (!empresaId) return;
    try {
      // 1) Pagos (Pix) ainda não aceitos → aceita sozinho
      const { data: pagos } = await supabase
        .from('pedidos_cardapio')
        .select('id, numero_pedido')
        .eq('empresa_id', empresaId)
        .eq('status', 'PENDENTE')
        .eq('arquivado', false)
        .is('aceito_em', null)
        .not('data_agendamento', 'is', null)
        .eq('status_pagamento', 'pago');
      for (const p of pagos || []) {
        if (autoAceitosRef.current.has(p.id)) continue;
        autoAceitosRef.current.add(p.id);
        const { error } = await supabase.rpc('rpc_aceitar_pedido_cardapio', { p_pedido_id: p.id, p_pagamento_confirmado: false, p_origem: null });
        if (error) {
          autoAceitosRef.current.delete(p.id);
          console.error('Erro ao aceitar pedido pago automaticamente:', error);
        } else {
          toast({ title: `Pedido agendado #${p.numero_pedido} pago`, description: 'Aceito automaticamente — aparece em "Aceitos" em Pedidos Agendados.' });
        }
      }

      // 2) Aceitos aguardando produção
      const { data } = await supabase
        .from('pedidos_cardapio')
        .select('*, pedidos_cardapio_itens(*), vendas(forma_pagamento)')
        .eq('empresa_id', empresaId)
        .eq('status', 'PENDENTE')
        .eq('arquivado', false)
        .not('aceito_em', 'is', null)
        .not('data_agendamento', 'is', null)
        .order('data_agendamento', { ascending: true });
      setAceitos(data || []);
    } catch (e) {
      console.error('Erro ao buscar pedidos agendados:', e);
    }
  }, [empresaId, toast]);

  useEffect(() => {
    buscar();
    const t = setInterval(buscar, 30000);
    return () => clearInterval(t);
  }, [buscar]);

  const vencidos = aceitos.filter((p) => new Date(p.data_agendamento).getTime() - antecedenciaMin * 60000 <= agora);
  const alertasAtivos = vencidos.filter((p) => !dispensados.has(p.id));

  // Impressão automática (uma vez por pedido, por aparelho)
  useEffect(() => {
    if (!impressaoAuto) return;
    vencidos.forEach((p) => {
      if (impressosRef.current.has(p.id)) return;
      impressosRef.current.add(p.id);
      salvarSet(LS_IMPRESSOS, impressosRef.current);
      const ok = imprimirCupomPedido(p, empresaNome);
      if (!ok) setFalhaImpressao((prev) => ({ ...prev, [p.id]: true }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencidos.map((p) => p.id).join(','), impressaoAuto]);

  // Campainha repetindo enquanto houver aviso sem resposta
  useEffect(() => {
    if (!somAtivo || alertasAtivos.length === 0) return undefined;
    tocarCampainha();
    const t = setInterval(tocarCampainha, 5000);
    return () => clearInterval(t);
  }, [somAtivo, alertasAtivos.length]);

  const dispensar = (id) => {
    setDispensados((prev) => {
      const novo = new Set(prev);
      novo.add(id);
      salvarSet(LS_DISPENSADOS, novo);
      return novo;
    });
  };

  const iniciarProducao = async (pedido) => {
    const { error } = await supabase.rpc('rpc_atualizar_status_pedido_cardapio', { p_pedido_id: pedido.id, p_novo_status: 'CONFIRMADO' });
    if (error) {
      toast({ title: 'Erro ao iniciar produção', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
      return;
    }
    setAceitos((prev) => prev.filter((p) => p.id !== pedido.id));
    toast({ title: `Pedido #${pedido.numero_pedido} em produção`, description: 'Agora está no quadro de Pedidos do Cardápio.' });
    navigate('/dashboard/cardapio/pedidos');
  };

  const reimprimir = (pedido) => {
    const ok = imprimirCupomPedido(pedido, empresaNome);
    if (!ok) {
      toast({ title: 'Popup bloqueado', description: 'Permita popups para este site para imprimir.', variant: 'destructive' });
    } else {
      setFalhaImpressao((prev) => ({ ...prev, [pedido.id]: false }));
    }
  };

  if (alertasAtivos.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] w-[380px] max-w-[calc(100vw-2rem)] space-y-3" role="alert" aria-live="assertive">
      {alertasAtivos.slice(0, 3).map((p) => {
        const minutos = Math.round((new Date(p.data_agendamento).getTime() - agora) / 60000);
        const quando = minutos > 0
          ? `faltam ${minutos >= 60 ? `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}` : `${minutos} min`}`
          : `atrasado ${Math.abs(minutos)} min`;
        return (
          <div key={p.id} className={`rounded-xl border-2 shadow-2xl bg-white p-4 ${minutos <= 0 ? 'border-red-500' : 'border-amber-400'}`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg text-white ${minutos <= 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                <BellRing className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 leading-tight">Pedido #{p.numero_pedido} — começar a produzir</p>
                <p className="text-sm text-gray-700 mt-0.5 truncate">{p.cliente_nome}</p>
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 mt-1">
                  <CalendarClock className="h-4 w-4" /> {formatarDataHoraAgendamento(p.data_agendamento)}
                  <span className={`ml-1 text-xs font-bold ${minutos <= 0 ? 'text-red-600' : 'text-amber-600'}`}>({quando})</span>
                </p>
                {falhaImpressao[p.id] && (
                  <p className="text-xs text-red-600 mt-1">O navegador bloqueou a impressão automática. Clique em Imprimir.</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" className="gap-1.5 font-bold" onClick={() => iniciarProducao(p)}>
                <Play className="h-4 w-4" /> Iniciar produção
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => reimprimir(p)}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-gray-600" onClick={() => dispensar(p.id)}>
                <Check className="h-4 w-4" /> Ciente
              </Button>
            </div>
          </div>
        );
      })}
      {alertasAtivos.length > 3 && (
        <p className="text-xs text-center font-semibold text-white bg-gray-800/90 rounded-lg py-1">
          + {alertasAtivos.length - 3} pedido(s) agendado(s) aguardando
        </p>
      )}
    </div>
  );
}