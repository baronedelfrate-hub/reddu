import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Save,
  MessageCircle,
  Wifi,
  WifiOff,
  Send,
  Server,
  RefreshCcw,
  Radio,
  Sparkles,
  QrCode,
  Bell,
  PowerOff,
} from 'lucide-react';

const STATUS_BADGE = {
  conectado: { label: 'Conectado', className: 'bg-emerald-600 text-white' },
  desconectado: { label: 'Desconectado', className: 'bg-red-600 text-white' },
  erro: { label: 'Erro', className: 'bg-red-600 text-white' },
  desconhecido: { label: 'Não verificado', className: 'bg-muted text-muted-foreground' },
};

// URL fixa do projeto Supabase, usada para montar o endereço público da
// Edge Function evolution-webhook. Mesma URL já usada no restante do sistema.
const SUPABASE_PROJECT_URL = 'https://daptthtsvqjspavvvhax.supabase.co';

export default function WhatsAppConfiguracaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [configExiste, setConfigExiste] = useState(false);
  const [isDesconectando, setIsDesconectando] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingStatus, setIsTestingStatus] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isActivatingWebhook, setIsActivatingWebhook] = useState(false);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('whatsapp_notificacoes_ativas') === 'true'
  );
  const [isGerandoQrCode, setIsGerandoQrCode] = useState(false);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState(null);
  const [qrCodePairing, setQrCodePairing] = useState(null);

  const pollingStatusRef = useRef(null);
  const renovacaoQrRef = useRef(null);

  const [formData, setFormData] = useState({
    instance_name: '',
    base_url: '',
    phone_number: '',
    status: 'desconhecido',
    resposta_automatica_ativa: false,
    resposta_automatica_mensagem: '',
  });

  const [testeNumero, setTesteNumero] = useState('');
  const [testeTexto, setTesteTexto] = useState('Olá! Esta é uma mensagem de teste do Estoque 360.');

  const fetchConfig = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    if (silencioso !== true) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_configuracoes')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) throw error;

      setConfigExiste(!!data);
      if (data) {
        setFormData({
          instance_name: data.instance_name || '',
          base_url: data.base_url || '',
          phone_number: data.phone_number || '',
          status: data.status || 'desconhecido',
          resposta_automatica_ativa: data.resposta_automatica_ativa || false,
          resposta_automatica_mensagem: data.resposta_automatica_mensagem || '',
        });
      }
    } catch (err) {
      console.error('Erro ao buscar configuração do WhatsApp:', err);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Chama a função de servidor que cria/gerencia a instância da empresa. A URL do
  // servidor e o nome da instância nunca saem do navegador: a função usa os gravados no banco.
  const invocarInstancia = async (action) => {
    const { data, error } = await supabase.functions.invoke('whatsapp-instancia', { body: { action } });
    if (error) {
      let mensagem = error.message;
      try {
        const corpo = await error.context?.json?.();
        if (corpo?.error) mensagem = corpo.error;
      } catch (_) { /* mantém a mensagem padrão */ }
      throw new Error(mensagem);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!empresaId || !configExiste) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_configuracoes')
        .update({
          phone_number: formData.phone_number || null,
          resposta_automatica_ativa: formData.resposta_automatica_ativa,
          resposta_automatica_mensagem: formData.resposta_automatica_mensagem || null,
        })
        .eq('empresa_id', empresaId);

      if (error) throw error;

      toast({
        title: 'Configuração salva!',
        description: 'As alterações do WhatsApp foram salvas.',
        className: 'bg-emerald-600 text-white',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestStatus = async () => {
    setIsTestingStatus(true);
    try {
      const data = await invocarInstancia('status');
      setFormData((prev) => ({ ...prev, status: data.status }));

      const conectado = data.status === 'conectado';
      toast({
        title: conectado
          ? 'Instância conectada!'
          : data.existe ? 'Instância desconectada' : 'Instância ainda não criada no servidor',
        description: data.existe
          ? `Estado retornado pela Evolution API: ${data.estado || 'desconhecido'}`
          : 'Clique em "Conectar via QR Code" para criá-la e conectar.',
        className: conectado ? 'bg-emerald-600 text-white' : undefined,
        variant: conectado ? undefined : 'destructive',
      });
    } catch (err) {
      console.error(err);
      setFormData((prev) => ({ ...prev, status: 'erro' }));
      toast({
        title: 'Erro ao testar conexão',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsTestingStatus(false);
    }
  };

  const pararPolling = () => {
    if (pollingStatusRef.current) clearInterval(pollingStatusRef.current);
    if (renovacaoQrRef.current) clearInterval(renovacaoQrRef.current);
    pollingStatusRef.current = null;
    renovacaoQrRef.current = null;
  };

  // Libera os timers se a pessoa sair da tela com o QR Code aberto
  useEffect(() => {
    return () => pararPolling();
  }, []);

  const handleToggleNotificacoes = async (checked) => {
    if (checked) {
      if (typeof Notification === 'undefined') {
        toast({
          title: 'Não suportado',
          description: 'Esse navegador não suporta notificações.',
          variant: 'destructive',
        });
        return;
      }
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        toast({
          title: 'Permissão não concedida',
          description: 'Autorize as notificações nas configurações do navegador para ativar.',
          variant: 'destructive',
        });
        return;
      }
    }
    localStorage.setItem('whatsapp_notificacoes_ativas', String(checked));
    setNotificacoesAtivas(checked);
    toast({ title: checked ? 'Notificações ativadas!' : 'Notificações desativadas.' });
  };

  const marcarConectado = async () => {
    pararPolling();
    setQrCodeOpen(false);
    setFormData((prev) => ({ ...prev, status: 'conectado' }));
    toast({
      title: 'WhatsApp conectado!',
      description: 'O QR Code foi escaneado com sucesso.',
      className: 'bg-emerald-600 text-white',
    });
  };

  // Cria a instância da empresa se ainda não existir (sem ninguém precisar criar na mão)
  // e abre o QR Code para conectar o número.
  const handleGerarQrCode = async () => {
    setIsGerandoQrCode(true);
    try {
      const data = await invocarInstancia('provisionar');
      await fetchConfig(true); // empresa nova passa a ter a configuração salva

      if (data.webhook === 'sem_segredo') {
        toast({
          title: 'Recebimento de mensagens não ativado',
          description: 'A conexão foi criada, mas falta configurar o segredo do webhook no servidor (WHATSAPP_WEBHOOK_SECRET).',
          variant: 'destructive',
        });
      } else if (data.webhook === 'falhou') {
        toast({
          title: 'Recebimento de mensagens não ativado',
          description: 'A conexão foi criada, mas o recebimento falhou. Use "Reaplicar recebimento de mensagens" em Avançado.',
          variant: 'destructive',
        });
      }

      if (data.conectado) {
        setFormData((prev) => ({ ...prev, status: 'conectado' }));
        toast({
          title: 'WhatsApp já está conectado',
          className: 'bg-emerald-600 text-white',
        });
        return;
      }

      setQrCodeBase64(data.base64);
      setQrCodePairing(data.pairingCode);
      setQrCodeOpen(true);

      pararPolling();

      // Confere o status a cada 3s; se conectar, fecha o diálogo sozinho
      pollingStatusRef.current = setInterval(async () => {
        try {
          const statusData = await invocarInstancia('status');
          if (statusData?.status === 'conectado') await marcarConectado();
        } catch (err) {
          console.error('Erro ao verificar status durante o QR Code:', err);
        }
      }, 3000);

      // O QR Code da Evolution API expira rápido — renova sozinho antes de vencer
      renovacaoQrRef.current = setInterval(async () => {
        try {
          const novoQr = await invocarInstancia('qrcode');
          if (novoQr?.conectado) {
            await marcarConectado();
          } else if (novoQr?.base64) {
            setQrCodeBase64(novoQr.base64);
            setQrCodePairing(novoQr.pairingCode);
          }
        } catch (err) {
          console.error('Erro ao renovar QR Code:', err);
        }
      }, 25000);
    } catch (err) {
      toast({
        title: 'Erro ao conectar o WhatsApp',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsGerandoQrCode(false);
    }
  };

  const handleFecharQrCode = () => {
    setQrCodeOpen(false);
    pararPolling();
  };

  const handleActivateWebhook = async () => {
    setIsActivatingWebhook(true);
    try {
      await invocarInstancia('ativarWebhook');
      toast({
        title: 'Recebimento de mensagens ativado!',
        description: 'A partir de agora, mensagens recebidas vão aparecer na tela de Conversas.',
        className: 'bg-emerald-600 text-white',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Erro ao ativar recebimento de mensagens',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsActivatingWebhook(false);
    }
  };

  const handleDesconectar = async () => {
    if (!window.confirm('Desconectar o WhatsApp desta empresa? O atendimento e os disparos ficam parados até você conectar de novo pelo QR Code.')) return;
    setIsDesconectando(true);
    try {
      const data = await invocarInstancia('desconectar');
      setFormData((prev) => ({ ...prev, status: data.status || 'desconectado' }));
      toast({ title: 'WhatsApp desconectado.' });
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsDesconectando(false);
    }
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testeNumero || !testeTexto) {
      toast({
        title: 'Preencha número e mensagem',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'sendText',
          base_url: formData.base_url,
          instance_name: formData.instance_name,
          numero: testeNumero,
          texto: testeTexto,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Mensagem enviada!',
        description: `Enviada para ${testeNumero} via Evolution API.`,
        className: 'bg-emerald-600 text-white',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Erro ao enviar mensagem',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const statusBadge = STATUS_BADGE[formData.status] || STATUS_BADGE.desconhecido;

  return (
    <>
      <Helmet><title>WhatsApp - Configuração - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-3 rounded-lg text-primary-foreground shadow">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">WhatsApp - Configuração</h1>
              <p className="text-muted-foreground text-sm">Conecte o WhatsApp da sua empresa lendo um QR Code.</p>
            </div>
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <form onSubmit={handleSave} className="space-y-6">
                {!configExiste ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MessageCircle className="w-5 h-5 text-muted-foreground" /> Conectar o WhatsApp da empresa
                      </CardTitle>
                      <CardDescription>
                        A conexão da sua empresa é criada automaticamente. Você só precisa ler um QR Code com o
                        WhatsApp do celular que vai fazer o atendimento.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button type="button" onClick={handleGerarQrCode} disabled={isGerandoQrCode}>
                        {isGerandoQrCode ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando...</>
                        ) : (
                          <><QrCode className="w-4 h-4 mr-2" /> Conectar WhatsApp</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Server className="w-5 h-5 text-muted-foreground" /> Conexão
                      </CardTitle>
                      <CardDescription>
                        A conexão é gerenciada automaticamente. A API Key fica protegida no servidor.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone_number">Número conectado</Label>
                        <Input
                          id="phone_number"
                          name="phone_number"
                          value={formData.phone_number}
                          onChange={handleInputChange}
                          placeholder="5519988992192"
                          className="text-foreground bg-background font-mono"
                        />
                        <p className="text-xs text-muted-foreground">Apenas informativo, não precisa ser exato.</p>
                      </div>

                      <details className="rounded-md border border-border p-3">
                        <summary className="cursor-pointer text-sm font-medium text-foreground">Avançado</summary>
                        <div className="mt-3 space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="instance_name">Nome da instância</Label>
                            <Input id="instance_name" value={formData.instance_name} readOnly className="text-foreground bg-muted font-mono" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="base_url">Servidor</Label>
                            <Input id="base_url" value={formData.base_url} readOnly className="text-foreground bg-muted font-mono" />
                          </div>
                          <Button type="button" variant="outline" onClick={handleActivateWebhook} disabled={isActivatingWebhook}>
                            {isActivatingWebhook ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reaplicando...</>
                            ) : (
                              <><Radio className="w-4 h-4 mr-2" /> Reaplicar recebimento de mensagens</>
                            )}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Use só se as mensagens recebidas pararem de aparecer em Conversas.
                          </p>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )}

                {configExiste && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Sparkles className="w-5 h-5 text-muted-foreground" /> Resposta automática de boas-vindas
                    </CardTitle>
                    <CardDescription>
                      Dispara uma única vez, só na primeira mensagem de um contato que nunca tinha conversado com
                      você antes. Não dispara de novo depois disso, nem se o cliente mandar outras mensagens.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="resposta_automatica_ativa"
                        checked={formData.resposta_automatica_ativa}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, resposta_automatica_ativa: checked }))
                        }
                      />
                      <label
                        htmlFor="resposta_automatica_ativa"
                        className="text-sm font-medium text-foreground cursor-pointer"
                      >
                        Ativar resposta automática
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resposta_automatica_mensagem">Mensagem</Label>
                      <Textarea
                        id="resposta_automatica_mensagem"
                        value={formData.resposta_automatica_mensagem}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, resposta_automatica_mensagem: e.target.value }))
                        }
                        rows={4}
                        placeholder={'Seja bem-vindo(a) à Tô Coxinha! Nosso atendimento é de segunda a sábado, das 9h às 18h.'}
                        disabled={!formData.resposta_automatica_ativa}
                        className="text-foreground bg-background disabled:opacity-60"
                      />
                    </div>
                  </CardContent>
                </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Bell className="w-5 h-5 text-muted-foreground" /> Notificações do navegador
                    </CardTitle>
                    <CardDescription>
                      Avisa quando chega uma mensagem nova e a aba do sistema não está em primeiro plano. Vale por
                      navegador/dispositivo (não sincroniza entre computadores).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="notificacoes_ativas"
                        checked={notificacoesAtivas}
                        onCheckedChange={handleToggleNotificacoes}
                      />
                      <label htmlFor="notificacoes_ativas" className="text-sm font-medium text-foreground cursor-pointer">
                        Ativar notificações de novas mensagens
                      </label>
                    </div>
                  </CardContent>
                </Card>

                {configExiste && (
                  <div className="flex flex-wrap justify-end gap-3 pb-2">
                    {formData.status === 'conectado' && (
                      <Button type="button" variant="outline" onClick={handleDesconectar} disabled={isDesconectando}>
                        {isDesconectando ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Desconectando...</>
                        ) : (
                          <><PowerOff className="w-4 h-4 mr-2" /> Desconectar</>
                        )}
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={handleGerarQrCode} disabled={isGerandoQrCode}>
                      {isGerandoQrCode ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                      ) : (
                        <><QrCode className="w-4 h-4 mr-2" /> Conectar via QR Code</>
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleTestStatus} disabled={isTestingStatus}>
                      {isTestingStatus ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando...</>
                      ) : (
                        <>
                          {formData.status === 'conectado' ? <Wifi className="w-4 h-4 mr-2" /> : <WifiOff className="w-4 h-4 mr-2" />}
                          Testar conexão
                        </>
                      )}
                    </Button>
                    <Button type="submit" disabled={isSaving} className="min-w-[150px]">
                      {isSaving ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /> Salvar Configuração</>
                      )}
                    </Button>
                  </div>
                )}
              </form>

              {configExiste && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Send className="w-5 h-5 text-muted-foreground" /> Enviar mensagem de teste
                  </CardTitle>
                  <CardDescription>
                    Use isto para validar o envio ponta a ponta antes de seguir para as próximas fases do módulo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendTest} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="teste_numero">Número de destino (DDI+DDD+número)</Label>
                      <Input
                        id="teste_numero"
                        value={testeNumero}
                        onChange={(e) => setTesteNumero(e.target.value)}
                        placeholder="5519988992192"
                        className="text-foreground bg-background font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teste_texto">Mensagem</Label>
                      <Textarea
                        id="teste_texto"
                        value={testeTexto}
                        onChange={(e) => setTesteTexto(e.target.value)}
                        rows={3}
                        className="text-foreground bg-background"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSendingTest}>
                        {isSendingTest ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                        ) : (
                          <><Send className="w-4 h-4 mr-2" /> Enviar teste</>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              )}

              {configExiste && formData.status !== 'conectado' && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 text-red-900">
                  <AlertTitle className="font-bold flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4" /> Instância não confirmada como conectada
                  </AlertTitle>
                  <AlertDescription>
                    Clique em "Conectar via QR Code" para conectar o número, ou em "Testar conexão" para confirmar
                    que a instância está ativa antes de enviar mensagens de teste.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <Dialog open={qrCodeOpen} onOpenChange={(open) => !open && handleFecharQrCode()}>
          <DialogContent className="sm:max-w-[400px] text-center">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5" /> Conectar WhatsApp
              </DialogTitle>
              <DialogDescription>
                No celular: WhatsApp {'>'} Configurações {'>'} Aparelhos conectados {'>'} Conectar um aparelho, e
                aponte a câmera para o código abaixo.
              </DialogDescription>
            </DialogHeader>

            {qrCodeBase64 ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <img
                  src={qrCodeBase64}
                  alt="QR Code para conectar o WhatsApp"
                  className="w-56 h-56 border border-gray-200 rounded-lg"
                />
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Aguardando leitura... o código se renova sozinho
                </p>
                {qrCodePairing && (
                  <p className="text-xs text-gray-400">
                    Código alternativo: <span className="font-mono">{qrCodePairing}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}