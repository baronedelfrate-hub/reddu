import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Bot, Store, Loader2 } from 'lucide-react';

// Botões fixos (cabeçalho) para ligar/desligar o robô do WhatsApp e abrir/fechar
// a loja no app, sem precisar entrar nas configurações do cardápio.
//  - robô:  cardapio_config.whatsapp_bot_ativo (mesma chave da tela WhatsApp)
//  - loja:  cardapio_config.loja_status_manual = 'fechada' | 'aberta' | null
//           ('fechada' fecha na hora; 'aberta' ignora o horário; null = segue os horários)
//           + loja_status_manual_em = dia (AAAA-MM-DD) em que o ajuste foi feito: o ajuste vale só
//           até o fim desse dia, e no dia seguinte a loja volta a seguir os horários sozinha.
//           O botão mostra o status REAL (inclui o horário de funcionamento) e um clique inverte esse status.
const hojeLocal = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

// Pelo horário de funcionamento cadastrado, a loja estaria aberta agora?
const abertaPeloHorario = (config) => {
  const horarios = config?.horarios;
  if (!horarios) return true; // sem horários cadastrados = não restringe
  const agora = new Date();
  const h = horarios[agora.getDay()];
  if (!h || !h.ativo) return false;
  const hhmm = agora.toTimeString().slice(0, 5);
  return hhmm >= h.abertura && hhmm <= h.fechamento;
};

export default function StatusRapidoBar() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [cardapioAtivo, setCardapioAtivo] = useState(true);
  const [salvando, setSalvando] = useState(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const { data } = await supabase
      .from('empresas')
      .select('cardapio_config, cardapio_ativo')
      .eq('id', empresaId)
      .single();
    if (data) {
      setConfig(data.cardapio_config || {});
      setCardapioAtivo(!!data.cardapio_ativo);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Mantém sincronizado se outra tela/usuário mudar
  useEffect(() => {
    if (!empresaId) return;
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [empresaId, carregar]);

  const salvarChave = async (chave, valor, extra = {}) => {
    setSalvando(chave);
    try {
      // lê a config mais recente para não sobrescrever outras chaves
      const { data: atual, error: e1 } = await supabase
        .from('empresas').select('cardapio_config').eq('id', empresaId).single();
      if (e1) throw e1;
      const novo = { ...(atual?.cardapio_config || {}), [chave]: valor, ...extra };
      // .select() devolve a linha gravada: se o banco bloquear a gravação (sem permissão), vem vazio e avisamos
      const { data: gravado, error: e2 } = await supabase.from('empresas').update({ cardapio_config: novo }).eq('id', empresaId).select('id');
      if (e2) throw e2;
      if (!gravado || gravado.length === 0) throw new Error('Sem permissão para alterar a loja. Peça a um administrador.');
      setConfig(novo);
      return true;
    } catch (err) {
      toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSalvando(null);
    }
  };

  if (!empresaId || !config || !cardapioAtivo) return null;

  const botAtivo = !!config.whatsapp_bot_ativo;
  const manualVale = !!config.loja_status_manual && (!config.loja_status_manual_em || config.loja_status_manual_em === hojeLocal());
  const manualAtual = manualVale ? config.loja_status_manual : null;
  const horarioAberto = abertaPeloHorario(config);
  const lojaAberta = manualAtual === 'fechada' ? false : manualAtual === 'aberta' ? true : horarioAberto;
  const lojaFechadaManual = !lojaAberta; // (nome mantido: usado só para cor/texto do botão)

  const alternarBot = () => salvarChave('whatsapp_bot_ativo', !botAtivo);
  // Clique = inverte o status real. Se o novo status é o que o horário já daria, volta ao automático.
  const alternarLoja = async () => {
    const alvoAberta = !lojaAberta;
    const voltaAoAutomatico = alvoAberta === horarioAberto;
    const gravou = await salvarChave(
      'loja_status_manual',
      voltaAoAutomatico ? null : (alvoAberta ? 'aberta' : 'fechada'),
      { loja_status_manual_em: voltaAoAutomatico ? null : hojeLocal() },
    );
    if (!gravou) return;
    toast({
      title: alvoAberta ? 'Loja aberta no app' : 'Loja fechada no app',
      description: voltaAoAutomatico
        ? 'Voltou a seguir o horário de funcionamento.'
        : 'Vale até o fim do dia. Quem está com o cardápio aberto vê a mudança em até 1 minuto.',
    });
  };

  const Chip = ({ onClick, loading, on, icon: Icon, label, estado, title }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60
        ${on ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${on ? 'bg-green-600' : 'bg-red-600'}`}>{estado}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <Chip
        onClick={alternarBot} loading={salvando === 'whatsapp_bot_ativo'} on={botAtivo} icon={Bot}
        label="Robô WhatsApp" estado={botAtivo ? 'ON' : 'OFF'}
        title={botAtivo ? 'Robô respondendo. Clique para desativar.' : 'Robô desativado. Clique para ativar.'}
      />
      <Chip
        onClick={alternarLoja} loading={salvando === 'loja_status_manual'} on={!lojaFechadaManual} icon={Store}
        label="Loja no app" estado={lojaFechadaManual ? 'FECHADA' : 'ABERTA'}
        title={lojaAberta
          ? (manualAtual === 'aberta' ? 'Loja aberta manualmente (fora do horário) até o fim do dia. Clique para fechar.' : 'Clique para fechar a loja no app agora.')
          : (manualAtual === 'fechada' ? 'Loja fechada manualmente até o fim do dia. Clique para reabrir.' : 'Fechada pelo horário de funcionamento. Clique para abrir agora.')}
      />
    </div>
  );
}