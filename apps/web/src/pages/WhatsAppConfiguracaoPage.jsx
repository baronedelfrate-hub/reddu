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
    base_url: 'https://evo.barobot.com.br',
    phone_number: '',
    status: 'desconhecido',
    resposta_automatica_ativa: false,
    resposta_automatica_mensagem: '',
  });

  const [testeNumero, setTesteNumero] = useState('');
  const [testeTexto, setTesteTexto] = useState('Olá! Esta é uma mensagem de teste do Estoque 360.');

  const fetchConfig = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_configuracoes')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFormData({
          instance_name: data.instance_name || '',
          base_url: data.base_url || 'https://evo.barobot.com.br',
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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    if (!formData.instance_name || !formData.base_url) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o nome da instância e a URL do servidor.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.base_url.startsWith('https://')) {
      toast({
        title: 'URL inválida',
        description: 'A URL do servidor deve começar com https://',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from('whatsapp_configuracoes').upsert(
        {
          empresa_id: empresaId,
          instance_name: formData.instance_name,
          base_url: formData.base_url.replace(/\/+$/, ''),
          phone_number: formData.phone_number || null,
          resposta_automatica_ativa: formData.resposta_automatica_ativa,
          resposta_automatica_mensagem: formData.resposta_automatica_mensagem || null,
        },
        { onConflict: 'empresa_id' }
      );

      if (error) throw error;

      toast({
        title: 'Configuração salva!',
        description: 'A instância do WhatsApp foi vinculada à sua empresa.',
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
    if (!formData.instance_name || !formData.base_url) {
      toast({
        title: 'Preencha e salve antes de testar',
        description: 'Informe o nome da instância e a URL do servidor.',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'status',
          base_url: formData.base_url,
          instance_name: formData.instance_name,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const estadoBruto = data?.data?.instance?.state || data?.data?.state || 'desconhecido';
      const novoStatus = estadoBruto === 'open' ? 'conectado' : 'desconectado';

      setFormData((prev) => ({ ...prev, status: novoStatus }));

      await supabase
        .from('whatsapp_configuracoes')
        .update({ status: novoStatus, last_checked_at: new Date().toISOString() })
        .eq('empresa_id', empresaId);

      toast({
        title: novoStatus === 'conectado' ? 'Instância conectada!' : 'Instância desconectada',
        description: `Estado retornado pela Evolution API: ${estadoBruto}`,
        className: novoStatus === 'conectado' ? 'bg-emerald-600 text-white' : undefined,
        variant: novoStatus === 'conectado' ? undefined : 'destructive',
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

  const handleGerarQrCode = async () => {
    if (!formData.instance_name || !formData.base_url) {
      toast({
        title: 'Preencha antes de gerar o QR Code',
        description: 'Informe o nome da instância e a URL do servidor, e salve a configuração.',
        variant: 'destructive',
      });
      return;
    }

    setIsGerandoQrCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'gerarQrCode',
          base_url: formData.base_url,
          instance_name: formData.instance_name,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setQrCodeBase64(data.base64);
      setQrCodePairing(data.pairingCode);
      setQrCodeOpen(true);

      pararPolling();

      // Confere o status a cada 3s; se conectar, fecha o diálogo sozinho
      pollingStatusRef.current = setInterval(async () => {
        try {
          const { data: statusData } = await supabase.functions.invoke('evolution-api', {
            body: { action: 'status', base_url: formData.base_url, instance_name: formData.instance_name },
          });
          const estadoBruto = statusData?.data?.instance?.state || statusData?.data?.state;
          if (estadoBruto === 'open') {
            pararPolling();
            setQrCodeOpen(false);
            setFormData((prev) => ({ ...prev, status: 'conectado' }));
            await supabase
              .from('whatsapp_configuracoes')
              .update({ status: 'conectado', last_checked_at: new Date().toISOString() })
              .eq('empresa_id', empresaId);
            toast({
              title: 'WhatsApp conectado!',
              description: 'O QR Code foi escaneado com sucesso.',
              className: 'bg-emerald-600 text-white',
            });
          }
        } catch (err) {
          console.error('Erro ao verificar status durante o QR Code:', err);
        }
      }, 3000);

      // O QR Code da Evolution API expira rápido — renova sozinho antes de vencer
      renovacaoQrRef.current = setInterval(async () => {
        try {
          const { data: novoQr } = await supabase.functions.invoke('evolution-api', {
            body: { action: 'gerarQrCode', base_url: formData.base_url, instance_name: formData.instance_name },
          });
          if (novoQr?.base64) {
            setQrCodeBase64(novoQr.base64);
            setQrCodePairing(novoQr.pairingCode);
          }
        } catch (err) {
          console.error('Erro ao renovar QR Code:', err);
        }
      }, 25000);
    } catch (err) {
      toast({
        title: 'Erro ao gerar QR Code',
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
    if (!formData.instance_name || !formData.base_url) {
      toast({
        title: 'Preencha e salve antes de ativar',
        description: 'Informe o nome da instância e a URL do servidor.',
        variant: 'destructive',
      });
      return;
    }

    setIsActivatingWebhook(true);
    try {
      const webhookUrl = `${SUPABASE_PROJECT_URL}/functions/v1/evolution-webhook`;

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'setWebhook',
          base_url: formData.base_url,
          instance_name: formData.instance_name,
          webhook_url: webhookUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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
              <p className="text-muted-foreground text-sm">Conecte a instância da Evolution API à sua empresa.</p>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Server className="w-5 h-5 text-muted-foreground" /> Servidor Evolution API
                    </CardTitle>
                    <CardDescription>
                      A API Key não é solicitada aqui — ela fica protegida no servidor (Supabase Edge Function).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="base_url">URL do servidor *</Label>
                      <Input
                        id="base_url"
                        name="base_url"
                        value={formData.base_url}
                        onChange={handleInputChange}
                        placeholder="https://evo.barobot.com.br"
                        className="text-foreground bg-background font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instance_name">Nome da instância *</Label>
                      <Input
                        id="instance_name"
                        name="instance_name"
                        value={formData.instance_name}
                        onChange={handleInputChange}
                        placeholder="Ex: ESTOQUE360"
                        className="text-foreground bg-background font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        É o nome que aparece no menu lateral do manager da Evolution API.
                      </p>
                    </div>
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
                  </CardContent>
                </Card>

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

                <div className="flex flex-wrap justify-end gap-3 pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGerarQrCode}
                    disabled={isGerandoQrCode}
                  >
                    {isGerandoQrCode ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
                    ) : (
                      <><QrCode className="w-4 h-4 mr-2" /> Conectar via QR Code</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestStatus}
                    disabled={isTestingStatus}
                  >
                    {isTestingStatus ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando...</>
                    ) : (
                      <>
                        {formData.status === 'conectado' ? (
                          <Wifi className="w-4 h-4 mr-2" />
                        ) : (
                          <WifiOff className="w-4 h-4 mr-2" />
                        )}
                        Testar conexão
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleActivateWebhook}
                    disabled={isActivatingWebhook}
                  >
                    {isActivatingWebhook ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ativando...</>
                    ) : (
                      <><Radio className="w-4 h-4 mr-2" /> Ativar recebimento de mensagens</>
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
              </form>

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

              {formData.status !== 'conectado' && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 text-red-900">
                  <AlertTitle className="font-bold flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4" /> Instância não confirmada como conectada
                  </AlertTitle>
                  <AlertDescription>
                    Salve a configuração e clique em "Testar conexão" para confirmar que a instância está ativa
                    antes de enviar mensagens de teste.
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