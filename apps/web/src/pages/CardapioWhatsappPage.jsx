import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageCircle, BellRing } from 'lucide-react';

// Quarta das 5 páginas que nasceram da antiga CardapioPage.jsx. Cuida do bot
// de boas-vindas no WhatsApp e das notificações automáticas por status do
// pedido — mesmas chaves de sempre dentro de empresas.cardapio_config.
export default function CardapioWhatsappPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState(null);

  const [whatsappBotAtivo, setWhatsappBotAtivo] = useState(false);
  const [siteBaseUrl, setSiteBaseUrl] = useState('');
  const [botTimeoutHoras, setBotTimeoutHoras] = useState('');
  const [botRetornoMin, setBotRetornoMin] = useState('');
  const [alarmeAtendente, setAlarmeAtendente] = useState(true);
  const [mensagemBoasVindas, setMensagemBoasVindas] = useState('');
  const [mensagemAtendente, setMensagemAtendente] = useState('');
  const [msgRecebido, setMsgRecebido] = useState('');
  const [msgConfirmado, setMsgConfirmado] = useState('');
  const [msgEmPreparo, setMsgEmPreparo] = useState('');
  const [msgPronto, setMsgPronto] = useState('');
  const [msgEntregue, setMsgEntregue] = useState('');
  const [msgCancelado, setMsgCancelado] = useState('');
  const [notifConfirmadoAtivo, setNotifConfirmadoAtivo] = useState(true);
  const [notifEmPreparoAtivo, setNotifEmPreparoAtivo] = useState(true);
  const [notifProntoAtivo, setNotifProntoAtivo] = useState(true);
  const [notifEntregueAtivo, setNotifEntregueAtivo] = useState(true);
  const [notifCanceladoAtivo, setNotifCanceladoAtivo] = useState(true);
  const [notificacoesStatusAtivo, setNotificacoesStatusAtivo] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  // Alertas do Gestor — resumo diário + avisos de pedido parado / erro fiscal,
  // enviados pro lojista (não pro cliente), por WhatsApp e/ou e-mail.
  const [alertasAtivo, setAlertasAtivo] = useState(false);
  const [alertasCanal, setAlertasCanal] = useState('whatsapp');
  const [alertasWhatsappNumero, setAlertasWhatsappNumero] = useState('');
  const [alertasEmail, setAlertasEmail] = useState('');
  const [alertasResumoDiarioAtivo, setAlertasResumoDiarioAtivo] = useState(true);
  const [alertasResumoDiarioHorario, setAlertasResumoDiarioHorario] = useState('23:00');
  const [alertasPedidoParadoAtivo, setAlertasPedidoParadoAtivo] = useState(true);
  const [alertasErroFiscalAtivo, setAlertasErroFiscalAtivo] = useState(true);
  const [savingAlertas, setSavingAlertas] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empresas').select('id, cardapio_config').eq('id', empresaId).single();
      if (error) throw error;

      const c = data?.cardapio_config || {};
      setEmpresa(data);
      setWhatsappBotAtivo(!!c.whatsapp_bot_ativo);
      setSiteBaseUrl(c.site_base_url || '');
      setBotTimeoutHoras(c.whatsapp_bot_timeout_horas != null ? String(c.whatsapp_bot_timeout_horas) : '');
      setBotRetornoMin(c.whatsapp_bot_retorno_minutos != null ? String(c.whatsapp_bot_retorno_minutos) : '');
      setAlarmeAtendente(c.whatsapp_alarme_atendente !== false);
      setMensagemBoasVindas(c.whatsapp_mensagem_boas_vindas || '');
      setMensagemAtendente(c.whatsapp_mensagem_atendente || '');
      setMsgRecebido(c.whatsapp_msg_recebido || '');
      setMsgConfirmado(c.whatsapp_msg_confirmado || '');
      setMsgEmPreparo(c.whatsapp_msg_em_preparo || '');
      setMsgPronto(c.whatsapp_msg_pronto || '');
      setMsgEntregue(c.whatsapp_msg_entregue || '');
      setMsgCancelado(c.whatsapp_msg_cancelado || '');
      setNotifConfirmadoAtivo(c.whatsapp_notif_confirmado_ativo !== false);
      setNotifEmPreparoAtivo(c.whatsapp_notif_em_preparo_ativo !== false);
      setNotifProntoAtivo(c.whatsapp_notif_pronto_ativo !== false);
      setNotifEntregueAtivo(c.whatsapp_notif_entregue_ativo !== false);
      setNotifCanceladoAtivo(c.whatsapp_notif_cancelado_ativo !== false);
      setNotificacoesStatusAtivo(!!c.whatsapp_notificacoes_pedido_ativo);

      const ag = c.alertas_gestor || {};
      setAlertasAtivo(!!ag.ativo);
      setAlertasCanal(ag.canal || 'whatsapp');
      setAlertasWhatsappNumero(ag.whatsapp_numero || '');
      setAlertasEmail(ag.email || '');
      setAlertasResumoDiarioAtivo(ag.resumo_diario_ativo !== false);
      setAlertasResumoDiarioHorario(ag.resumo_diario_horario || '23:00');
      setAlertasPedidoParadoAtivo(ag.pedido_parado_ativo !== false);
      setAlertasErroFiscalAtivo(ag.erro_fiscal_ativo !== false);
    } catch (error) {
      console.error('Erro ao carregar WhatsApp do cardápio:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveWhatsapp = async () => {
    setSavingWhatsapp(true);
    try {
      const novoConfig = {
        ...(empresa?.cardapio_config || {}),
        whatsapp_bot_ativo: whatsappBotAtivo,
        site_base_url: siteBaseUrl.trim() || null,
        whatsapp_bot_timeout_horas: botTimeoutHoras ? parseInt(botTimeoutHoras, 10) : null,
        whatsapp_bot_retorno_minutos: botRetornoMin !== '' ? Math.max(0, parseInt(botRetornoMin, 10) || 0) : null,
        whatsapp_alarme_atendente: alarmeAtendente,
        whatsapp_mensagem_boas_vindas: mensagemBoasVindas.trim() || null,
        whatsapp_mensagem_atendente: mensagemAtendente.trim() || null,
        whatsapp_msg_recebido: msgRecebido.trim() || null,
        whatsapp_msg_confirmado: msgConfirmado.trim() || null,
        whatsapp_notif_confirmado_ativo: notifConfirmadoAtivo,
        whatsapp_notif_em_preparo_ativo: notifEmPreparoAtivo,
        whatsapp_notif_pronto_ativo: notifProntoAtivo,
        whatsapp_notif_entregue_ativo: notifEntregueAtivo,
        whatsapp_notif_cancelado_ativo: notifCanceladoAtivo,
        whatsapp_msg_em_preparo: msgEmPreparo.trim() || null,
        whatsapp_msg_pronto: msgPronto.trim() || null,
        whatsapp_msg_entregue: msgEntregue.trim() || null,
        whatsapp_msg_cancelado: msgCancelado.trim() || null,
        whatsapp_notificacoes_pedido_ativo: notificacoesStatusAtivo,
      };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      toast({ title: 'Configuração de WhatsApp salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleSaveAlertas = async () => {
    if (alertasAtivo && (alertasCanal === 'whatsapp' || alertasCanal === 'ambos') && !alertasWhatsappNumero.trim()) {
      toast({ title: 'Informe o número de WhatsApp', description: 'Necessário pra receber alertas por WhatsApp.', variant: 'destructive' });
      return;
    }
    if (alertasAtivo && (alertasCanal === 'email' || alertasCanal === 'ambos') && !alertasEmail.trim()) {
      toast({ title: 'Informe o e-mail', description: 'Necessário pra receber alertas por e-mail.', variant: 'destructive' });
      return;
    }
    setSavingAlertas(true);
    try {
      const novoConfig = {
        ...(empresa?.cardapio_config || {}),
        alertas_gestor: {
          ativo: alertasAtivo,
          canal: alertasCanal,
          whatsapp_numero: alertasWhatsappNumero.trim() || null,
          email: alertasEmail.trim() || null,
          resumo_diario_ativo: alertasResumoDiarioAtivo,
          resumo_diario_horario: alertasResumoDiarioHorario,
          pedido_parado_ativo: alertasPedidoParadoAtivo,
          erro_fiscal_ativo: alertasErroFiscalAtivo,
        },
      };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      toast({ title: 'Alertas do gestor salvos!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingAlertas(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet><title>WhatsApp do Cardápio - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-6 w-6" /> WhatsApp & Notificações
          </h1>
          <p className="text-gray-500 text-sm">Bot de boas-vindas e avisos automáticos por status do pedido.</p>
        </div>

        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900 font-medium">WhatsApp — bot e notificações</Label>
            <p className="text-sm text-gray-500">Usa o WhatsApp já conectado em Configurações → WhatsApp. Precisa estar conectado antes de ligar isso.</p>
          </div>

          <div>
            <Label htmlFor="site-base-url" className="text-gray-900">Endereço do site (só o domínio, sem /cardapio/...)</Label>
            <Input
              id="site-base-url" value={siteBaseUrl}
              onChange={(e) => setSiteBaseUrl(e.target.value)}
              placeholder="https://reddu.com.br"
            />
            <p className="text-xs text-gray-400 mt-1">
              ⚠️ Só o endereço base, sem completar com "/cardapio/sua-loja" — o sistema já adiciona isso sozinho.<br />
              Ex certo: <code className="bg-gray-100 px-1 rounded">https://944b0f78-...app-preview.com</code> (por enquanto), depois troca pro domínio definitivo.
            </p>
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-gray-900">Bot de boas-vindas</Label>
              <p className="text-xs text-gray-400">Quando alguém manda mensagem pro WhatsApp da loja, responde sozinho com o link do cardápio. Cliente digita "atendente" pra falar com humano.</p>
            </div>
            <Switch checked={whatsappBotAtivo} onCheckedChange={setWhatsappBotAtivo} />
          </div>

          {whatsappBotAtivo && (
            <div>
              <Label htmlFor="bot-timeout" className="text-gray-900">Bot volta a responder sozinho após (horas)</Label>
              <Input
                id="bot-timeout" type="number" min="1" step="1"
                value={botTimeoutHoras}
                onChange={(e) => setBotTimeoutHoras(e.target.value)}
                placeholder="12"
              />
              <p className="text-xs text-gray-400 mt-1">Se o cliente pedir "atendente" e ninguém clicar em "Encerrar conversa" nesse prazo, o bot reativa sozinho na próxima mensagem dele. Padrão: 12h.</p>
            </div>
          )}

          {whatsappBotAtivo && (
            <div>
              <Label htmlFor="bot-retorno" className="text-gray-900">Depois de encerrar o atendimento, o robô volta em (minutos)</Label>
              <Input
                id="bot-retorno" type="number" min="0" step="5"
                value={botRetornoMin}
                onChange={(e) => setBotRetornoMin(e.target.value)}
                placeholder="30"
              />
              <p className="text-xs text-gray-400 mt-1">Ao clicar em "Encerrar conversa", o robô fica quieto por esse tempo (o cliente ainda pode responder "obrigado" sem receber o menu de novo). Passado o prazo, a próxima mensagem dele volta pro robô. 0 = volta na hora. Padrão: 30 min.</p>
            </div>
          )}

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-gray-900">Alarme de "cliente pediu atendente"</Label>
              <p className="text-xs text-gray-400">Toca sirene e mostra aviso no computador até alguém assumir a conversa. Não toca em celular.</p>
            </div>
            <Switch checked={alarmeAtendente} onCheckedChange={setAlarmeAtendente} />
          </div>

          {whatsappBotAtivo && (
            <div>
              <Label htmlFor="msg-boas-vindas" className="text-gray-900">Mensagem de boas-vindas</Label>
              <Textarea
                id="msg-boas-vindas" rows={4}
                value={mensagemBoasVindas}
                onChange={(e) => setMensagemBoasVindas(e.target.value)}
                placeholder={'Bem-vindo ao {nome}! 🎉\n\nAcesse nosso cardápio digital e faça seu pedido:\n{link}\n\nSe quiser falar com um atendente, é só digitar *atendente*.'}
              />
              <p className="text-xs text-gray-400 mt-1">
                Deixe em branco pra usar a mensagem padrão (mostrada acima como exemplo). Use <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> pro nome da loja e <code className="bg-gray-100 px-1 rounded">{'{link}'}</code> pro link do cardápio — o sistema troca sozinho na hora de enviar.
              </p>
            </div>
          )}

          {whatsappBotAtivo && (
            <div>
              <Label htmlFor="msg-atendente" className="text-gray-900">Mensagem ao pedir atendente</Label>
              <Textarea
                id="msg-atendente" rows={2}
                value={mensagemAtendente}
                onChange={(e) => setMensagemAtendente(e.target.value)}
                placeholder="Beleza! Já vou chamar um atendente pra te ajudar por aqui mesmo. 🙋"
              />
              <p className="text-xs text-gray-400 mt-1">Enviada quando o cliente digita "atendente". Deixe em branco pra usar a padrão.</p>
            </div>
          )}

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-gray-900">Notificar cliente por WhatsApp</Label>
              <p className="text-xs text-gray-400">Manda mensagem automática quando o pedido muda de fase no Kanban (confirmado, em preparo, pronto...).</p>
            </div>
            <Switch checked={notificacoesStatusAtivo} onCheckedChange={setNotificacoesStatusAtivo} />
          </div>

          {notificacoesStatusAtivo && (
            <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-500">
                Personalize cada etapa. Use <code className="bg-gray-100 px-1 rounded">{'{numero}'}</code> e <code className="bg-gray-100 px-1 rounded">{'{total}'}</code> — deixe em branco pra usar a padrão (mostrada como exemplo).
              </p>
              <div>
                <Label htmlFor="msg-recebido" className="text-gray-900 text-sm">Pedido recebido</Label>
                <Textarea
                  id="msg-recebido" rows={2} value={msgRecebido} onChange={(e) => setMsgRecebido(e.target.value)}
                  placeholder={'Recebemos seu pedido #{numero}! 🎉\nTotal: {total}\n\nJá estamos analisando, aguarde a confirmação.'}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-confirmado" className="text-gray-900 text-sm">Confirmado</Label>
                  <Switch checked={notifConfirmadoAtivo} onCheckedChange={setNotifConfirmadoAtivo} />
                </div>
                <Textarea
                  id="msg-confirmado" rows={2} value={msgConfirmado} onChange={(e) => setMsgConfirmado(e.target.value)}
                  placeholder="Seu pedido #{numero} foi confirmado! ✅" disabled={!notifConfirmadoAtivo}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-em-preparo" className="text-gray-900 text-sm">Em preparo</Label>
                  <Switch checked={notifEmPreparoAtivo} onCheckedChange={setNotifEmPreparoAtivo} />
                </div>
                <Textarea
                  id="msg-em-preparo" rows={2} value={msgEmPreparo} onChange={(e) => setMsgEmPreparo(e.target.value)}
                  placeholder="Seu pedido #{numero} está sendo preparado agora! 👨‍🍳" disabled={!notifEmPreparoAtivo}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-pronto" className="text-gray-900 text-sm">Pronto</Label>
                  <Switch checked={notifProntoAtivo} onCheckedChange={setNotifProntoAtivo} />
                </div>
                <Textarea
                  id="msg-pronto" rows={2} value={msgPronto} onChange={(e) => setMsgPronto(e.target.value)}
                  placeholder="Seu pedido #{numero} está pronto! 🎉" disabled={!notifProntoAtivo}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-entregue" className="text-gray-900 text-sm">Entregue</Label>
                  <Switch checked={notifEntregueAtivo} onCheckedChange={setNotifEntregueAtivo} />
                </div>
                <Textarea
                  id="msg-entregue" rows={2} value={msgEntregue} onChange={(e) => setMsgEntregue(e.target.value)}
                  placeholder="Pedido #{numero} entregue! Obrigado pela preferência 🙏" disabled={!notifEntregueAtivo}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-cancelado" className="text-gray-900 text-sm">Cancelado</Label>
                  <Switch checked={notifCanceladoAtivo} onCheckedChange={setNotifCanceladoAtivo} />
                </div>
                <Textarea
                  id="msg-cancelado" rows={2} value={msgCancelado} onChange={(e) => setMsgCancelado(e.target.value)}
                  placeholder="Seu pedido #{numero} foi cancelado." disabled={!notifCanceladoAtivo}
                />
              </div>
            </div>
          )}

          <Button onClick={handleSaveWhatsapp} disabled={savingWhatsapp}>
            {savingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar configuração de WhatsApp'}
          </Button>
        </div>

        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900 font-medium flex items-center gap-2">
              <BellRing className="h-4 w-4" /> Alertas do Gestor
            </Label>
            <p className="text-sm text-gray-500">Avisos pra você (não pro cliente): resumo diário do cardápio, pedido parado e erro na nota fiscal.</p>
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-gray-900">Receber alertas</Label>
              <p className="text-xs text-gray-400">Liga/desliga todos os alertas abaixo de uma vez.</p>
            </div>
            <Switch checked={alertasAtivo} onCheckedChange={setAlertasAtivo} />
          </div>

          {alertasAtivo && (
            <>
              <div>
                <Label className="text-gray-900">Canal de envio</Label>
                <Select value={alertasCanal} onValueChange={setAlertasCanal}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="ambos">WhatsApp e e-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(alertasCanal === 'whatsapp' || alertasCanal === 'ambos') && (
                <div>
                  <Label htmlFor="alertas-whatsapp-numero" className="text-gray-900">Número de WhatsApp (com DDD)</Label>
                  <Input
                    id="alertas-whatsapp-numero" value={alertasWhatsappNumero}
                    onChange={(e) => setAlertasWhatsappNumero(e.target.value)}
                    placeholder="19988887777"
                  />
                </div>
              )}

              {(alertasCanal === 'email' || alertasCanal === 'ambos') && (
                <div>
                  <Label htmlFor="alertas-email" className="text-gray-900">E-mail</Label>
                  <Input
                    id="alertas-email" type="email" value={alertasEmail}
                    onChange={(e) => setAlertasEmail(e.target.value)}
                    placeholder="fernando@tocoxinha.com.br"
                  />
                </div>
              )}

              <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-gray-900 text-sm">Resumo diário</Label>
                    <p className="text-xs text-gray-400">Pedidos, faturamento, bairro campeão e erros fiscais do dia.</p>
                  </div>
                  <Switch checked={alertasResumoDiarioAtivo} onCheckedChange={setAlertasResumoDiarioAtivo} />
                </div>
                {alertasResumoDiarioAtivo && (
                  <div>
                    <Label htmlFor="alertas-horario" className="text-gray-900 text-sm">Horário de envio</Label>
                    <Input
                      id="alertas-horario" type="time" value={alertasResumoDiarioHorario}
                      onChange={(e) => setAlertasResumoDiarioHorario(e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <Label className="text-gray-900 text-sm">Pedido parado</Label>
                    <p className="text-xs text-gray-400">Avisa quando um pedido passa 1,5x o tempo de preparo sem avançar.</p>
                  </div>
                  <Switch checked={alertasPedidoParadoAtivo} onCheckedChange={setAlertasPedidoParadoAtivo} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <Label className="text-gray-900 text-sm">Erro na nota fiscal</Label>
                    <p className="text-xs text-gray-400">Avisa quando a emissão da NFC-e de um pedido falha.</p>
                  </div>
                  <Switch checked={alertasErroFiscalAtivo} onCheckedChange={setAlertasErroFiscalAtivo} />
                </div>
              </div>
            </>
          )}

          <Button onClick={handleSaveAlertas} disabled={savingAlertas}>
            {savingAlertas ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar alertas do gestor'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}