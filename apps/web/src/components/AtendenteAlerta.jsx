import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Headset, MessageCircle } from 'lucide-react';

// Alarme GLOBAL de "cliente pediu atendente no WhatsApp" (montado no DashboardLayout).
// SÓ NO COMPUTADOR: em celular/tablet não toca nem mostra nada.
// Toca sirene repetindo + pop-up fixo até alguém assumir:
//   - clicando em "Assumir" (abre a conversa), ou
//   - respondendo o cliente (pelo sistema ou pelo celular da loja) — o banco
//     marca atendente_assumido_em sozinho, ou
//   - encerrando a conversa.
// Parâmetro: empresas.cardapio_config.whatsapp_alarme_atendente (padrão ligado).

const ehComputador = () => {
  try {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return false;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) return false;
    return true;
  } catch { return true; }
};

const tocarSirene = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tom = (inicio, f1, f2) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f1, ctx.currentTime + inicio);
      osc.frequency.linearRampToValueAtTime(f2, ctx.currentTime + inicio + 0.5);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + inicio);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.55);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio); osc.stop(ctx.currentTime + inicio + 0.55);
    };
    tom(0, 700, 1100); tom(0.6, 700, 1100); tom(1.2, 700, 1100);
    setTimeout(() => { try { ctx.close(); } catch (e) { /* ignore */ } }, 2500);
  } catch (e) {
    console.warn('Não foi possível tocar o alarme:', e);
  }
};

const nomeDe = (c) => c.nome_exibicao || String(c.telefone_jid || '').split('@')[0];

export default function AtendenteAlerta() {
  const { empresaId } = useAuth();
  const navigate = useNavigate();
  const [pc] = useState(ehComputador);
  const [somAtivo, setSomAtivo] = useState(true);
  const [pendentes, setPendentes] = useState([]);

  useEffect(() => {
    if (!empresaId || !pc) return undefined;
    let ativo = true;
    const carregar = async () => {
      const { data } = await supabase.from('empresas').select('cardapio_config').eq('id', empresaId).maybeSingle();
      if (ativo && data) setSomAtivo(data.cardapio_config?.whatsapp_alarme_atendente !== false);
    };
    carregar();
    const t = setInterval(carregar, 120000);
    return () => { ativo = false; clearInterval(t); };
  }, [empresaId, pc]);

  const buscar = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('whatsapp_conversas')
      .select('id, nome_exibicao, telefone_jid, ultima_mensagem_preview, atendente_solicitado_em')
      .eq('empresa_id', empresaId)
      .eq('status', 'aberta')
      .eq('bot_pausado', true)
      .not('atendente_solicitado_em', 'is', null)
      .is('atendente_assumido_em', null)
      .order('atendente_solicitado_em', { ascending: true });
    if (!error) setPendentes(data || []);
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId || !pc) return undefined;
    buscar();
    const t = setInterval(buscar, 4000);
    return () => clearInterval(t);
  }, [empresaId, pc, buscar]);

  const ativo = pc && somAtivo && pendentes.length > 0;

  useEffect(() => {
    if (!ativo) return undefined;
    tocarSirene();
    const t = setInterval(tocarSirene, 4000);
    return () => clearInterval(t);
  }, [ativo]);

  // Título da aba piscando
  useEffect(() => {
    if (!pc || pendentes.length === 0) return undefined;
    const original = document.title;
    let alt = false;
    const t = setInterval(() => {
      alt = !alt;
      document.title = alt ? '🔔 CLIENTE CHAMANDO!' : original;
    }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [pc, pendentes.length]);

  const assumir = async (c) => {
    await supabase.from('whatsapp_conversas').update({ atendente_assumido_em: new Date().toISOString() }).eq('id', c.id);
    setPendentes((prev) => prev.filter((p) => p.id !== c.id));
    navigate('/dashboard/whatsapp/conversas', { state: { conversaId: c.id } });
  };

  if (!pc || pendentes.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[110] w-[380px] max-w-[calc(100vw-2rem)] space-y-3" role="alert" aria-live="assertive">
      {pendentes.slice(0, 3).map((c) => (
        <div key={c.id} className="rounded-xl border-2 border-red-500 bg-white shadow-2xl p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500 text-white"><Headset className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-900 leading-tight">Cliente pediu atendente!</p>
              <p className="text-sm text-gray-700 mt-0.5 truncate">{nomeDe(c)}</p>
              {c.ultima_mensagem_preview && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.ultima_mensagem_preview}</p>}
            </div>
          </div>
          <Button size="sm" className="gap-1.5 font-bold mt-3 w-full bg-red-600 hover:bg-red-700 text-white" onClick={() => assumir(c)}>
            <MessageCircle className="h-4 w-4" /> Assumir atendimento
          </Button>
        </div>
      ))}
      {pendentes.length > 3 && (
        <p className="text-xs text-center font-semibold text-white bg-gray-800/90 rounded-lg py-1">+ {pendentes.length - 3} cliente(s) aguardando</p>
      )}
    </div>
  );
}