import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { BellRing, ChevronRight } from 'lucide-react';

// Mini-kanban dos pedidos do cardápio para a tela do PDV Rápido (que fica sempre aberta).
// Mostra quantos pedidos há em cada etapa e os mais recentes; qualquer clique leva para a
// tela completa (/dashboard/cardapio/pedidos), onde ficam os alertas e as ações.
// Quando chega pedido novo: faixa piscando em vermelho + beep curto repetido até o clique.
// Mesmo critério do quadro real: pedidos agendados e do Balcão pendentes ficam em "Pedidos Agendados".

const COLUNAS = [
  { chave: 'novos', titulo: 'Novos', status: ['PENDENTE'], cor: 'amber' },
  { chave: 'preparo', titulo: 'Em preparo', status: ['CONFIRMADO', 'EM_PREPARO'], cor: 'blue' },
  { chave: 'prontos', titulo: 'Prontos', status: ['PRONTO'], cor: 'green' },
];
const CORES = {
  amber: { box: 'bg-amber-50 border-amber-200', badge: 'bg-amber-500', chip: 'bg-white border-amber-200 text-amber-900' },
  blue: { box: 'bg-blue-50 border-blue-200', badge: 'bg-blue-500', chip: 'bg-white border-blue-200 text-blue-900' },
  green: { box: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-500', chip: 'bg-white border-emerald-200 text-emerald-900' },
};
const ROTA = '/dashboard/cardapio/pedidos';

const beep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = i ? 1180 : 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) { /* ignore */ } }, 900);
  } catch (e) { /* sem áudio liberado ainda */ }
};

export default function PedidosCardapioMiniKanban() {
  const { empresaId } = useAuth();
  const navigate = useNavigate();
  const [ativo, setAtivo] = useState(false);
  const [pedidos, setPedidos] = useState([]);
  const [novosIds, setNovosIds] = useState(() => new Set()); // pedidos novos ainda não "vistos"
  const conhecidosRef = useRef(null);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('empresas').select('cardapio_ativo').eq('id', empresaId).maybeSingle()
      .then(({ data }) => setAtivo(!!data?.cardapio_ativo));
  }, [empresaId]);

  const buscar = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('pedidos_cardapio')
      .select('id, numero_pedido, cliente_nome, status, status_pagamento, forma_pagamento_online, data_agendamento, origem, created_at')
      .eq('empresa_id', empresaId)
      .eq('arquivado', false)
      .in('status', ['PENDENTE', 'CONFIRMADO', 'EM_PREPARO', 'PRONTO'])
      .order('created_at', { ascending: false });
    if (error) return;
    const lista = (data || []).filter((p) => !(p.status === 'PENDENTE' && (p.data_agendamento || p.origem === 'balcao')));
    const idsPendentes = new Set(lista.filter((p) => p.status === 'PENDENTE').map((p) => p.id));
    if (conhecidosRef.current !== null) {
      const chegaram = [...idsPendentes].filter((id) => !conhecidosRef.current.has(id));
      if (chegaram.length > 0) setNovosIds((prev) => new Set([...prev, ...chegaram]));
    }
    conhecidosRef.current = idsPendentes;
    // some da lista de "novos não vistos" o que já saiu de Pendente
    setNovosIds((prev) => new Set([...prev].filter((id) => idsPendentes.has(id))));
    setPedidos(lista);
  }, [empresaId]);

  useEffect(() => {
    if (!ativo) return undefined;
    buscar();
    const t = setInterval(buscar, 8000);
    return () => clearInterval(t);
  }, [ativo, buscar]);

  const temNovo = novosIds.size > 0;
  useEffect(() => {
    if (!temNovo) return undefined;
    beep();
    const t = setInterval(beep, 6000);
    return () => clearInterval(t);
  }, [temNovo]);

  if (!ativo) return null;

  const irParaPedidos = () => { setNovosIds(new Set()); navigate(ROTA); };

  return (
    <button
      type="button" onClick={irParaPedidos}
      title="Abrir a tela completa de Pedidos do Cardápio"
      className={`hidden lg:flex flex-1 min-w-0 mx-4 items-stretch gap-2 rounded-xl border p-1.5 text-left transition-colors
        ${temNovo ? 'border-red-400 bg-red-50 animate-pulse' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
    >
      <div className={`flex flex-col items-center justify-center px-2 shrink-0 ${temNovo ? 'text-red-600' : 'text-gray-500'}`}>
        <BellRing className="h-4 w-4" />
        <span className="text-[10px] font-bold leading-tight text-center">{temNovo ? 'NOVO!' : 'Pedidos'}</span>
      </div>
      {COLUNAS.map((col) => {
        const itens = pedidos.filter((p) => col.status.includes(p.status));
        const c = CORES[col.cor];
        return (
          <div key={col.chave} className={`flex-1 min-w-0 rounded-lg border px-2 py-1 ${c.box}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide truncate">{col.titulo}</span>
              <span className={`text-[11px] font-black text-white rounded-full px-1.5 min-w-[1.25rem] text-center ${c.badge}`}>{itens.length}</span>
            </div>
            <div className="flex gap-1 mt-1 overflow-hidden">
              {itens.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  className={`truncate text-[11px] font-semibold border rounded px-1.5 py-0.5 ${c.chip} ${novosIds.has(p.id) ? 'ring-2 ring-red-400' : ''}`}
                >
                  #{p.numero_pedido}
                </span>
              ))}
              {itens.length > 3 && <span className="text-[11px] font-semibold text-gray-500 self-center">+{itens.length - 3}</span>}
              {itens.length === 0 && <span className="text-[11px] text-gray-400">—</span>}
            </div>
          </div>
        );
      })}
      <div className="flex items-center text-gray-400 shrink-0"><ChevronRight className="h-4 w-4" /></div>
    </button>
  );
}