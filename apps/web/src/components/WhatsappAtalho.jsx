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
      className={`relative p-2.5 rounded-full transition-colors ${temNovas ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      <MessageCircle className="h-7 w-7" />
      {temNovas && (
        <span data-testid="atalho-whatsapp-contador" className="absolute -top-1 -right-1 bg-green-600 text-white text-xs font-bold min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center border-2 border-white">
          {conversas > 9 ? '9+' : conversas}
        </span>
      )}
    </button>
  );
}
