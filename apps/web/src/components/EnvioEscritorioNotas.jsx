import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Send, Save, CalendarClock } from 'lucide-react';

// Envio mensal dos XMLs das notas emitidas ao escritório contábil (por e-mail, em um ZIP).
// O e-mail do escritório fica nas configurações fiscais; o envio usa só esse endereço.
const mesAnterior = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const rotuloMes = (m) => { const [a, mm] = String(m).split('-'); return `${mm}/${a}`; };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

export default function EnvioEscritorioNotas({ empresaId, chamar }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [emailSalvo, setEmailSalvo] = useState('');
  const [mes, setMes] = useState(mesAnterior());
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [envios, setEnvios] = useState([]);
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [autoDia, setAutoDia] = useState(5);
  const [autoSalvo, setAutoSalvo] = useState({ ativo: false, dia: 5 });
  const [ultimoResultado, setUltimoResultado] = useState('');
  const [salvandoAuto, setSalvandoAuto] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const [cfg, hist] = await Promise.all([
      supabase.from('configuracoes_fiscais').select('email_escritorio_contabil, envio_escritorio_ativo, envio_escritorio_dia, envio_escritorio_ultimo_resultado').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('notas_fiscais_envios_escritorio').select('id, mes, email, quantidade, falhas, origem, created_at')
        .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(5),
    ]);
    const e = cfg.data?.email_escritorio_contabil || '';
    setEmail(e);
    setEmailSalvo(e);
    const ativo = !!cfg.data?.envio_escritorio_ativo;
    const dia = Number(cfg.data?.envio_escritorio_dia) || 5;
    setAutoAtivo(ativo);
    setAutoDia(dia);
    setAutoSalvo({ ativo, dia });
    setUltimoResultado(cfg.data?.envio_escritorio_ultimo_resultado || '');
    setEnvios(hist.data || []);
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarEmail = async () => {
    const limpo = email.trim();
    if (!emailOk(limpo)) {
      toast({ title: 'E-mail inválido', description: 'Confira o e-mail do escritório.', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.from('configuracoes_fiscais')
      .update({ email_escritorio_contabil: limpo }).eq('empresa_id', empresaId).select('id');
    setSalvando(false);
    if (error || !data?.length) {
      toast({ title: 'Não foi possível salvar', description: error?.message || 'Preencha antes as configurações fiscais da empresa.', variant: 'destructive' });
      return;
    }
    setEmailSalvo(limpo);
    toast({ title: 'E-mail do escritório salvo' });
  };

  const salvarAutomatico = async () => {
    const dia = Math.trunc(Number(autoDia));
    if (!(dia >= 1 && dia <= 28)) {
      toast({ title: 'Dia inválido', description: 'Escolha um dia entre 1 e 28.', variant: 'destructive' });
      return;
    }
    if (autoAtivo && !emailOk(emailSalvo)) {
      toast({ title: 'Cadastre o e-mail do escritório', description: 'Salve o e-mail antes de ligar o envio automático.', variant: 'destructive' });
      return;
    }
    setSalvandoAuto(true);
    const { data, error } = await supabase.from('configuracoes_fiscais')
      .update({ envio_escritorio_ativo: autoAtivo, envio_escritorio_dia: dia }).eq('empresa_id', empresaId).select('id');
    setSalvandoAuto(false);
    if (error || !data?.length) {
      toast({ title: 'Não foi possível salvar', description: error?.message || 'Preencha antes as configurações fiscais da empresa.', variant: 'destructive' });
      return;
    }
    setAutoDia(dia);
    setAutoSalvo({ ativo: autoAtivo, dia });
    toast({ title: autoAtivo ? `Envio automático ligado: todo dia ${dia}` : 'Envio automático desligado' });
  };

  const enviar = async (forcar = false) => {
    if (!forcar && !window.confirm(`Enviar os XMLs de ${rotuloMes(mes)} para ${emailSalvo}?`)) return;
    setEnviando(true);
    try {
      const r = await chamar({ action: 'enviar_escritorio', mes, forcar });
      toast({ title: 'E-mail enviado ao escritório', description: `${r.enviadas} nota(s) de ${rotuloMes(mes)} enviadas para ${r.email}.` });
      await carregar();
    } catch (e) {
      if (e.status === 409 && e.corpo?.falhas) {
        const lista = e.corpo.falhas.slice(0, 3).map((f) => `${f.descricao}: ${f.motivo}`).join('\n');
        if (window.confirm(`${e.message}\n\n${lista}\n\nEnviar mesmo assim, só com as ${e.corpo.incluidas} notas obtidas?`)) {
          setEnviando(false);
          await enviar(true);
          return;
        }
      } else {
        toast({ title: 'Não foi possível enviar', description: e.message, variant: 'destructive' });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="border rounded-xl bg-white p-4 space-y-3" data-testid="envio-escritorio">
      <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm"><Mail className="h-4 w-4" /> Enviar ao escritório contábil</div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <Label htmlFor="esc-email" className="text-gray-900 text-xs">E-mail do escritório</Label>
          <div className="flex gap-2">
            <Input id="esc-email" type="email" placeholder="contador@escritorio.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="outline" size="sm" onClick={salvarEmail} disabled={salvando || email.trim() === emailSalvo} className="gap-1.5 shrink-0">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </div>
        </div>
        <div>
          <Label htmlFor="esc-mes" className="text-gray-900 text-xs">Mês</Label>
          <Input id="esc-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => enviar(false)} disabled={enviando || !emailSalvo || !mes} className="gap-1.5" data-testid="btn-enviar-escritorio">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar XMLs do mês
        </Button>
      </div>
      <p className="text-xs text-gray-500">Envia um ZIP com os XMLs de todas as notas emitidas no mês (PDV, cardápio, reabastecimento e consignado) para o e-mail salvo acima.</p>
      <div className="border-t pt-3 space-y-2" data-testid="envio-automatico">
        <label className="flex items-center gap-2 text-sm text-gray-900 font-medium cursor-pointer">
          <input type="checkbox" className="h-4 w-4" checked={autoAtivo} onChange={(e) => setAutoAtivo(e.target.checked)} data-testid="auto-ativo" />
          <CalendarClock className="h-4 w-4" /> Enviar automaticamente todo mês
        </label>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="esc-dia" className="text-gray-900 text-xs">Dia do mês (1 a 28)</Label>
            <Input id="esc-dia" type="number" min={1} max={28} className="w-24" value={autoDia} onChange={(e) => setAutoDia(e.target.value)} disabled={!autoAtivo} data-testid="auto-dia" />
          </div>
          <Button variant="outline" size="sm" onClick={salvarAutomatico} disabled={salvandoAuto || (autoAtivo === autoSalvo.ativo && Number(autoDia) === autoSalvo.dia)} className="gap-1.5" data-testid="auto-salvar">
            {salvandoAuto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar rotina
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          {autoSalvo.ativo
            ? `Ligado: todo dia ${autoSalvo.dia}, por volta das 9h, o sistema envia ao escritório os XMLs das notas do mês anterior.`
            : 'Desligado. Ao ligar, todo mês no dia escolhido o sistema envia sozinho os XMLs do mês anterior.'}
        </p>
        {ultimoResultado && <p className="text-xs text-gray-700" data-testid="auto-resultado">Última execução: {ultimoResultado}</p>}
      </div>
      {envios.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5 border-t pt-2" data-testid="historico-envios">
          {envios.map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleString('pt-BR')} — {rotuloMes(e.mes)} · {e.quantidade} nota(s) → {e.email}{e.falhas > 0 ? ` (${e.falhas} sem XML)` : ''}{e.origem === 'automatico' ? ' · automático' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
