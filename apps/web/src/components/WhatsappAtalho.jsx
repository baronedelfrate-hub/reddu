import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { MessageCircle } from 'lucide-react';

// Atalho fixo no cabeçalho: mostra quantas conversas do WhatsApp têm mensagem nova e leva direto
// para a tela de conversas. Serve pra quem não está na tela e não recebeu a notificação.
// - Só aparece se a loja tem o WhatsApp conectado/configurado.
// - Atualiza sozinho (a cada 10 s, e na hora quando o realtime avisa de mensagem nova).
const INTERVALO_MS = 10000;

export default function WhatsappAtalho({ empresaId }) {
  const navigate = useNavigate();
  const [configurado, setConfigurado] = useState(false);
  const [conversas, setConversas] = useState(0);
  const [mensagens, setMensagens] = useState(0);

  useEffect(() => {
    if (!empresaId) return undefined;
    let ativo = true;
    supabase.from('whatsapp_configuracoes').select('empresa_id').eq('empresa_id', empresaId).maybeSingle()
      .then(({ data }) => { if (ativo) setConfigurado(!!data); });
    return () => { ativo = false; };
  }, [empresaId]);

  const buscar = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('whatsapp_conversas')
      .select('id, nao_lidas')
      .eq('empresa_id', empresaId)
      .eq('status', 'aberta')
      .gt('nao_lidas', 0);
    if (error) return;
    const lista = data || [];
    setConversas(lista.length);
    setMensagens(lista.reduce((s, c) => s + (Number(c.nao_lidas) || 0), 0));
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId || !configurado) return undefined;
    buscar();
    const t = setInterval(buscar, INTERVALO_MS);
    // Realtime é só um adiantamento: se não estiver habilitado na tabela, a busca periódica cobre.
    let canal = null;
    try {
      canal = supabase
        .channel(`whatsapp_atalho_${empresaId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas', filter: `empresa_id=eq.${empresaId}` }, () => buscar())
        .subscribe();
    } catch (e) { /* segue só com a busca periódica */ }
    return () => { clearInterval(t); if (canal) supabase.removeChannel(canal); };
  }, [empresaId, configurado, buscar]);

  if (!configurado) return null;

  const temNovas = conversas > 0;
  const titulo = temNovas
    ? `${conversas} conversa${conversas > 1 ? 's' : ''} com mensagem nova (${mensagens} ${mensagens > 1 ? 'mensagens' : 'mensagem'}). Clique para abrir.`
    : 'Conversas do WhatsApp. Nenhuma mensagem nova.';

  return (
    <button
      type="button"
      onClick={() => navigate('/dashboard/whatsapp/conversas')}
      title={titulo}
      aria-label={titulo}
      data-testid="atalho-whatsapp"
      className={`relative flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition-colors
        ${temNovas
          ? 'border-green-600 bg-green-600 text-white shadow-md shadow-green-600/30 hover:bg-green-700'
          : 'border-green-400 bg-green-50 text-green-700 hover:bg-green-100'}`}
    >
      <span className="relative flex">
        <MessageCircle className="h-6 w-6" />
        {temNovas && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
        )}
      </span>
      <span className="hidden sm:inline">Conversas</span>
      {temNovas && (
        <span data-testid="atalho-whatsapp-contador" className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-green-700">
          {conversas > 9 ? '9+' : conversas}
        </span>
      )}
    </button>
  );
}
