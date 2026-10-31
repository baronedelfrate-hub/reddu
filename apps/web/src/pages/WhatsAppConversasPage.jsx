import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  MessageCircle,
  MessageSquarePlus,
  Search,
  User,
  Image as ImageIcon,
  FileText,
  Mic,
  Video,
  Sticker,
  ArrowLeft,
  AlertCircle,
  Send,
  Check,
  CheckCheck,
  Loader2,
  Paperclip,
  Download,
  X,
  Trash2,
  MoreVertical,
  Archive,
  ArchiveRestore,
  ArrowUpDown,
} from 'lucide-react';

const ICONE_TIPO = {
  image: ImageIcon,
  document: FileText,
  audio: Mic,
  video: Video,
  sticker: Sticker,
};

function nomeConversa(conversa) {
  return conversa.whatsapp_clientes?.nome || conversa.nome_exibicao || conversa.telefone_jid?.split('@')[0] || 'Contato';
}

function formatarHora(dataIso) {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  const hoje = new Date();
  const mesmodia = data.toDateString() === hoje.toDateString();
  if (mesmodia) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return data.toLocaleDateString('pt-BR');
}

function IconeStatusMensagem({ status }) {
  if (status === 'lido') return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />;
  if (status === 'entregue') return <CheckCheck className="h-3.5 w-3.5 text-emerald-100" />;
  if (status === 'erro') return <AlertCircle className="h-3.5 w-3.5 text-red-200" />;
  return <Check className="h-3.5 w-3.5 text-emerald-100" />;
}

export default function WhatsAppConversasPage() {
  const { empresaId, user } = useAuth();
  const { toast } = useToast();

  const [conversas, setConversas] = useState([]);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('aberta');
  const [ordenacao, setOrdenacao] = useState('recentes');
  const [usuariosMap, setUsuariosMap] = useState({});

  const [conversaParaApagar, setConversaParaApagar] = useState(null);
  const [isApagando, setIsApagando] = useState(false);
  const [conversaParaEncerrar, setConversaParaEncerrar] = useState(null);

  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [loadingMensagens, setLoadingMensagens] = useState(false);

  const [config, setConfig] = useState(null);
  const [textoNovo, setTextoNovo] = useState('');
  const [isEnviando, setIsEnviando] = useState(false);
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);

  const [novaConversaOpen, setNovaConversaOpen] = useState(false);
  const [clientesDisponiveis, setClientesDisponiveis] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [iniciandoConversaId, setIniciandoConversaId] = useState(null);

  const [isGravando, setIsGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const gravacaoIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const mensagensEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from('whatsapp_configuracoes')
      .select('base_url, instance_name')
      .eq('empresa_id', empresaId)
      .maybeSingle()
      .then(({ data }) => setConfig(data || null));
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from('usuarios')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((u) => {
          mapa[u.id] = u.nome;
        });
        setUsuariosMap(mapa);
      });
  }, [empresaId]);

  const fetchConversas = useCallback(async () => {
    if (!empresaId) return;
    try {
      setLoadingConversas(true);
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .select('*, whatsapp_clientes(nome)')
        .eq('empresa_id', empresaId)
        .eq('status', filtroStatus)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setConversas(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar conversas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingConversas(false);
    }
  }, [empresaId, filtroStatus, toast]);

  useEffect(() => {
    fetchConversas();
  }, [fetchConversas]);

  // Realtime: qualquer mudança nas conversas da empresa atualiza a lista
  useEffect(() => {
    if (!empresaId) return;

    const channel = supabase
      .channel(`whatsapp_conversas_${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversas', filter: `empresa_id=eq.${empresaId}` },
        () => {
          fetchConversas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [empresaId, fetchConversas]);

  const fetchMensagens = useCallback(
    async (conversaId) => {
      try {
        setLoadingMensagens(true);
        const { data, error } = await supabase
          .from('whatsapp_mensagens')
          .select('*')
          .eq('conversa_id', conversaId)
          .order('timestamp_mensagem', { ascending: true });

        if (error) throw error;
        setMensagens(data || []);
      } catch (error) {
        toast({
          title: 'Erro ao carregar mensagens',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoadingMensagens(false);
      }
    },
    [toast]
  );

  const handleApagarConversa = async () => {
    if (!conversaParaApagar) return;
    setIsApagando(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .delete()
        .eq('id', conversaParaApagar.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('A conversa não foi removida (sem permissão ou já tinha sido apagada).');
      }

      setConversas((prev) => prev.filter((c) => c.id !== conversaParaApagar.id));
      if (conversaSelecionada?.id === conversaParaApagar.id) {
        setConversaSelecionada(null);
        setMensagens([]);
      }
      toast({ title: 'Conversa apagada.', description: 'Todo o histórico foi removido.' });
      setConversaParaApagar(null);
    } catch (error) {
      toast({ title: 'Erro ao apagar conversa', description: error.message, variant: 'destructive' });
    } finally {
      setIsApagando(false);
    }
  };

  const handleEncerrarConversa = async () => {
    if (!conversaParaEncerrar) return;
    try {
      const { error } = await supabase
        .from('whatsapp_conversas')
        .update({ status: 'arquivada', bot_pausado: false, bot_pausado_em: null })
        .eq('id', conversaParaEncerrar.id);
      if (error) throw error;

      setConversas((prev) => prev.filter((c) => c.id !== conversaParaEncerrar.id));
      if (conversaSelecionada?.id === conversaParaEncerrar.id) {
        setConversaSelecionada(null);
        setMensagens([]);
      }
      toast({ title: 'Conversa encerrada e arquivada.' });
      setConversaParaEncerrar(null);
    } catch (error) {
      toast({ title: 'Erro ao encerrar conversa', description: error.message, variant: 'destructive' });
    }
  };

  const handleReabrirConversa = async (conversa) => {
    try {
      const { error } = await supabase.from('whatsapp_conversas').update({ status: 'aberta' }).eq('id', conversa.id);
      if (error) throw error;
      setConversas((prev) => prev.filter((c) => c.id !== conversa.id));
      toast({ title: 'Conversa reaberta.' });
    } catch (error) {
      toast({ title: 'Erro ao reabrir conversa', description: error.message, variant: 'destructive' });
    }
  };

  // Rede de segurança contra o bug conhecido do Radix (abrir um AlertDialog a
  // partir de um item de DropdownMenu às vezes deixa a página com cliques
  // bloqueados). Se nenhum diálogo estiver aberto, garante que o body está liberado.
  useEffect(() => {
    if (!conversaParaApagar && !conversaParaEncerrar && !novaConversaOpen) {
      document.body.style.pointerEvents = '';
    }
  });

  const handleSelecionarConversa = async (conversa) => {
    setConversaSelecionada(conversa);
    fetchMensagens(conversa.id);

    if (conversa.nao_lidas > 0) {
      await supabase.from('whatsapp_conversas').update({ nao_lidas: 0 }).eq('id', conversa.id);
      setConversas((prev) => prev.map((c) => (c.id === conversa.id ? { ...c, nao_lidas: 0 } : c)));
    }
  };

  // Realtime: novas mensagens da conversa aberta aparecem sozinhas
  useEffect(() => {
    if (!conversaSelecionada) return;

    const channel = supabase
      .channel(`whatsapp_mensagens_${conversaSelecionada.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_mensagens',
          filter: `conversa_id=eq.${conversaSelecionada.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMensagens((prev) => [...prev, payload.new]);
            supabase.from('whatsapp_conversas').update({ nao_lidas: 0 }).eq('id', conversaSelecionada.id);
          } else if (payload.eventType === 'UPDATE') {
            setMensagens((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversaSelecionada]);

  useEffect(() => {
    mensagensEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const handleSelecionarArquivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImagem = file.type.startsWith('image/');
    const limite = isImagem ? 15 * 1024 * 1024 : 20 * 1024 * 1024;

    if (file.size > limite) {
      toast({
        title: 'Arquivo muito grande',
        description: `Tamanho máximo: ${isImagem ? '15MB para imagens' : '20MB para documentos'}.`,
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setArquivoSelecionado(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (!novaConversaOpen || !empresaId) return;
    setLoadingClientes(true);
    supabase
      .from('whatsapp_clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
        }
        setClientesDisponiveis(data || []);
        setLoadingClientes(false);
      });
  }, [novaConversaOpen, empresaId, toast]);

  const clientesFiltrados = clientesDisponiveis.filter((c) => {
    const termo = buscaCliente.trim().toLowerCase();
    if (!termo) return true;
    return (c.nome || '').toLowerCase().includes(termo) || (c.telefone || '').includes(termo);
  });

  const handleIniciarConversa = async (cliente) => {
    if (!empresaId) return;
    const jid = cliente.telefone_jid || `${cliente.telefone}@s.whatsapp.net`;

    // Já existe uma conversa com esse cliente? Só abre ela.
    const existente = conversas.find((c) => c.telefone_jid === jid);
    if (existente) {
      setNovaConversaOpen(false);
      setBuscaCliente('');
      handleSelecionarConversa(existente);
      return;
    }

    setIniciandoConversaId(cliente.id);
    try {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .upsert(
          {
            empresa_id: empresaId,
            telefone_jid: jid,
            cliente_id: cliente.id,
            nome_exibicao: cliente.nome,
            status: 'aberta',
          },
          { onConflict: 'empresa_id,telefone_jid' }
        )
        .select('*, whatsapp_clientes(nome)')
        .single();

      if (error) throw error;

      setFiltroStatus('aberta');
      setConversas((prev) => {
        const jaExiste = prev.some((c) => c.id === data.id);
        return jaExiste ? prev : [data, ...prev];
      });

      setNovaConversaOpen(false);
      setBuscaCliente('');
      handleSelecionarConversa(data);
    } catch (error) {
      toast({
        title: 'Erro ao iniciar conversa',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIniciandoConversaId(null);
    }
  };

  // Libera o microfone se a pessoa sair da tela no meio de uma gravação
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(gravacaoIntervalRef.current);
    };
  }, []);

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setIsGravando(true);
      setTempoGravacao(0);
      gravacaoIntervalRef.current = setInterval(() => setTempoGravacao((t) => t + 1), 1000);
    } catch (err) {
      toast({
        title: 'Não foi possível acessar o microfone',
        description: 'Verifique se o navegador tem permissão para usar o microfone.',
        variant: 'destructive',
      });
    }
  };

  const pararGravacao = (manterAudio) =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        clearInterval(gravacaoIntervalRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setIsGravando(false);
        if (!manterAudio) {
          resolve(null);
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob);
      };
      recorder.stop();
    });

  const handleCancelarGravacao = () => {
    pararGravacao(false);
  };

  const handleEnviarGravacao = async () => {
    const blob = await pararGravacao(true);
    if (!blob || !conversaSelecionada) return;

    if (!config?.base_url || !config?.instance_name) {
      toast({
        title: 'Instância não configurada',
        description: 'Configure a instância em WhatsApp > Configuração antes de enviar mensagens.',
        variant: 'destructive',
      });
      return;
    }

    const numero = conversaSelecionada.telefone_jid?.split('@')[0];
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const fileName = `audio-${Date.now()}.${ext}`;

    setIsEnviando(true);
    try {
      const path = `${empresaId}/${conversaSelecionada.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(path, blob, { contentType: blob.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'sendAudio',
          base_url: config.base_url,
          instance_name: config.instance_name,
          numero,
          media_url: publicUrl,
          mimetype: blob.type,
          filename: fileName,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (error) {
      toast({
        title: 'Erro ao enviar áudio',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsEnviando(false);
    }
  };

  const formatarTempoGravacao = (segundos) => {
    const m = String(Math.floor(segundos / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleEnviarMensagem = async (e) => {
    e.preventDefault();
    if (!conversaSelecionada) return;
    if (!textoNovo.trim() && !arquivoSelecionado) return;

    if (!config?.base_url || !config?.instance_name) {
      toast({
        title: 'Instância não configurada',
        description: 'Configure a instância em WhatsApp > Configuração antes de enviar mensagens.',
        variant: 'destructive',
      });
      return;
    }

    const numero = conversaSelecionada.telefone_jid?.split('@')[0];

    setIsEnviando(true);
    try {
      if (arquivoSelecionado) {
        const file = arquivoSelecionado;
        const isImagem = file.type.startsWith('image/');
        const mediatype = isImagem ? 'image' : 'document';

        const path = `${empresaId}/${conversaSelecionada.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

        const { data, error } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'sendMedia',
            base_url: config.base_url,
            instance_name: config.instance_name,
            numero,
            media_url: publicUrl,
            mediatype,
            mimetype: file.type,
            filename: file.name,
            caption: textoNovo.trim() || undefined,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setArquivoSelecionado(null);
        setTextoNovo('');
      } else {
        const texto = textoNovo.trim();
        setTextoNovo('');

        const { data, error } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'sendText',
            base_url: config.base_url,
            instance_name: config.instance_name,
            numero,
            texto,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }
      // A própria evolution-api function já grava a mensagem no banco;
      // o Realtime desta tela cuida de fazer ela aparecer na conversa.
    } catch (error) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsEnviando(false);
    }
  };

  const conversasFiltradas = conversas
    .filter((c) => {
      const termo = busca.trim().toLowerCase();
      if (!termo) return true;
      return nomeConversa(c).toLowerCase().includes(termo) || (c.telefone_jid || '').includes(termo);
    })
    .sort((a, b) => {
      if (ordenacao === 'nao_lidas') {
        if ((b.nao_lidas || 0) !== (a.nao_lidas || 0)) return (b.nao_lidas || 0) - (a.nao_lidas || 0);
        return new Date(b.ultima_mensagem_at || 0) - new Date(a.ultima_mensagem_at || 0);
      }
      if (ordenacao === 'nome') {
        return nomeConversa(a).localeCompare(nomeConversa(b), 'pt-BR');
      }
      // 'recentes' (padrão): última mensagem mais nova primeiro
      return new Date(b.ultima_mensagem_at || 0) - new Date(a.ultima_mensagem_at || 0);
    });

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>WhatsApp - Conversas - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="h-7 w-7 text-primary" />
              Conversas
            </h1>
            <p className="text-gray-600 mt-1">
              Converse com seus clientes em tempo real, direto pelo WhatsApp conectado.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden" style={{ height: '70vh' }}>
            <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full min-h-0">
              {/* Lista de conversas */}
              <div
                className={`border-r border-gray-200 flex flex-col h-full min-h-0 ${
                  conversaSelecionada ? 'hidden md:flex' : 'flex'
                }`}
              >
                <div className="p-3 border-b border-gray-200 space-y-2 flex-shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setNovaConversaOpen(true)}
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    Nova conversa
                  </Button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar conversa..."
                      className="pl-9 bg-gray-50 text-gray-900 border-gray-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex bg-gray-100 rounded-md p-0.5 text-sm">
                      <button
                        type="button"
                        onClick={() => setFiltroStatus('aberta')}
                        className={`flex-1 rounded px-2 py-1 transition-colors ${
                          filtroStatus === 'aberta' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'
                        }`}
                      >
                        Abertas
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroStatus('arquivada')}
                        className={`flex-1 rounded px-2 py-1 transition-colors ${
                          filtroStatus === 'arquivada' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'
                        }`}
                      >
                        Arquivadas
                      </button>
                    </div>
                    <Select value={ordenacao} onValueChange={setOrdenacao}>
                      <SelectTrigger className="w-9 h-9 p-0 flex items-center justify-center bg-gray-100 border-none [&>svg:last-child]:hidden">
                        <ArrowUpDown className="h-4 w-4 text-gray-500" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="recentes">Mais recentes primeiro</SelectItem>
                        <SelectItem value="nao_lidas">Não lidas primeiro</SelectItem>
                        <SelectItem value="nome">Nome (A-Z)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                  {loadingConversas ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Carregando...</div>
                  ) : conversasFiltradas.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      {busca
                        ? 'Nenhuma conversa encontrada.'
                        : filtroStatus === 'arquivada'
                        ? 'Nenhuma conversa arquivada.'
                        : 'Nenhuma conversa ainda. Envie ou receba uma mensagem para começar.'}
                    </div>
                  ) : (
                    conversasFiltradas.map((conversa) => {
                      const ativa = conversaSelecionada?.id === conversa.id;
                      return (
                        <div
                          key={conversa.id}
                          className={`group w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                            ativa ? 'bg-gray-100' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleSelecionarConversa(conversa)}
                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                              <User className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-900 truncate">{nomeConversa(conversa)}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {formatarHora(conversa.ultima_mensagem_at)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <span className="text-sm text-gray-500 truncate">
                                  {conversa.ultima_mensagem_preview || 'Sem mensagens'}
                                </span>
                                {conversa.nao_lidas > 0 && (
                                  <Badge className="bg-emerald-600 text-white flex-shrink-0">{conversa.nao_lidas}</Badge>
                                )}
                              </div>
                            </div>
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-gray-700 p-1 flex-shrink-0 mt-1"
                                title="Mais ações"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {filtroStatus === 'aberta' ? (
                                <DropdownMenuItem onClick={() => setTimeout(() => setConversaParaEncerrar(conversa), 0)}>
                                  <Archive className="h-4 w-4 mr-2" /> Encerrar conversa
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleReabrirConversa(conversa)}>
                                  <ArchiveRestore className="h-4 w-4 mr-2" /> Reabrir conversa
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setTimeout(() => setConversaParaApagar(conversa), 0)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Apagar conversa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Thread da conversa selecionada */}
              <div
                className={`flex-col h-full min-h-0 ${conversaSelecionada ? 'flex' : 'hidden md:flex'}`}
                style={{ backgroundColor: '#e5ddd5' }}
              >
                {!conversaSelecionada ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <MessageCircle className="h-10 w-10 mx-auto mb-2" />
                      <p>Selecione uma conversa para ver o histórico</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
                      <button
                        className="text-gray-500 hover:text-gray-800 flex items-center gap-1 md:hidden"
                        onClick={() => setConversaSelecionada(null)}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      <button
                        className="hidden md:flex text-gray-400 hover:text-gray-700 items-center"
                        onClick={() => setConversaSelecionada(null)}
                        title="Voltar para a lista"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{nomeConversa(conversaSelecionada)}</p>
                        <p className="text-xs text-gray-500">{conversaSelecionada.telefone_jid?.split('@')[0]}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-gray-400 hover:text-gray-700 p-1" title="Mais ações">
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setTimeout(() => setConversaParaEncerrar(conversaSelecionada), 0)}>
                            <Archive className="h-4 w-4 mr-2" /> Encerrar conversa
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setTimeout(() => setConversaParaApagar(conversaSelecionada), 0)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Apagar conversa
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
                      {loadingMensagens ? (
                        <div className="text-center text-gray-500 text-sm">Carregando mensagens...</div>
                      ) : mensagens.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm">Nenhuma mensagem nessa conversa.</div>
                      ) : (
                        mensagens.map((msg) => {
                          const Icone = ICONE_TIPO[msg.tipo];
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                                  msg.from_me
                                    ? 'bg-emerald-600 text-white rounded-br-none'
                                    : 'bg-white text-gray-900 rounded-bl-none border border-gray-200'
                                }`}
                              >
                                {msg.from_me && msg.remetente_user_id && (
                                  <p className="text-[11px] font-semibold mb-0.5 text-emerald-100">
                                    {msg.remetente_user_id === user?.id
                                      ? 'Você'
                                      : usuariosMap[msg.remetente_user_id] || 'Atendente'}
                                  </p>
                                )}
                                {Icone && !(msg.tipo === 'audio' && msg.media_url) && (
                                  <div className={`flex items-center gap-1 mb-1 text-xs ${msg.from_me ? 'text-emerald-100' : 'text-gray-500'}`}>
                                    <Icone className="h-3.5 w-3.5" />
                                    <span className="uppercase tracking-wide">{msg.tipo}</span>
                                  </div>
                                )}
                                {msg.tipo === 'image' && msg.media_url ? (
                                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={msg.media_url}
                                      alt={msg.conteudo || 'Imagem'}
                                      className="rounded-md max-w-full max-h-64 object-contain mb-1"
                                    />
                                  </a>
                                ) : msg.tipo === 'document' && msg.media_url ? (
                                  <a
                                    href={msg.media_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 rounded-md p-2 mb-1 ${
                                      msg.from_me ? 'bg-emerald-700/40' : 'bg-gray-100'
                                    }`}
                                  >
                                    <FileText className="h-5 w-5 flex-shrink-0" />
                                    <span className="text-sm truncate">{msg.media_filename || 'Documento'}</span>
                                    <Download className="h-4 w-4 flex-shrink-0 ml-auto" />
                                  </a>
                                ) : msg.tipo === 'audio' && msg.media_url ? (
                                  <audio controls src={msg.media_url} className="max-w-full mb-1" style={{ height: 32 }} />
                                ) : null}
                                {(() => {
                                  const placeholders = ['[Imagem]', '[Documento]', '[Áudio]', '[Vídeo]', '[Figurinha]'];
                                  const legendaRedundante =
                                    !msg.conteudo ||
                                    placeholders.includes(msg.conteudo) ||
                                    msg.conteudo === msg.media_filename;
                                  if (legendaRedundante && msg.tipo !== 'text') return null;
                                  return <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>;
                                })()}
                                <p
                                  className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${
                                    msg.from_me ? 'text-emerald-100' : 'text-gray-400'
                                  }`}
                                >
                                  {formatarHora(msg.timestamp_mensagem)}
                                  {msg.from_me && <IconeStatusMensagem status={msg.status} />}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={mensagensEndRef} />
                    </div>

                    <div className="border-t border-gray-200 bg-white flex-shrink-0">
                      {isGravando ? (
                        <div className="p-3 flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleCancelarGravacao}
                            title="Cancelar gravação"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          <div className="flex-1 flex items-center gap-2 text-gray-700">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                            <span className="text-sm">Gravando... {formatarTempoGravacao(tempoGravacao)}</span>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            onClick={handleEnviarGravacao}
                            disabled={isEnviando}
                            title="Enviar áudio"
                          >
                            {isEnviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      ) : (
                        <form onSubmit={handleEnviarMensagem}>
                          {arquivoSelecionado && (
                            <div className="flex items-center gap-2 px-3 pt-2">
                              <div className="flex items-center gap-2 bg-gray-100 rounded-md px-2 py-1 text-xs text-gray-700">
                                {arquivoSelecionado.type.startsWith('image/') ? (
                                  <ImageIcon className="h-3.5 w-3.5" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5" />
                                )}
                                <span className="truncate max-w-[200px]">{arquivoSelecionado.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setArquivoSelecionado(null)}
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="p-3 flex items-center gap-2">
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleSelecionarArquivo}
                              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={!config || isEnviando}
                              title="Anexar imagem ou documento"
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                            <Input
                              value={textoNovo}
                              onChange={(e) => setTextoNovo(e.target.value)}
                              placeholder={
                                !config
                                  ? 'Configure a instância para enviar mensagens'
                                  : arquivoSelecionado
                                  ? 'Legenda (opcional)...'
                                  : 'Digite uma mensagem...'
                              }
                              disabled={!config || isEnviando}
                              className="bg-gray-50 text-gray-900 border-gray-200"
                            />
                            {!textoNovo.trim() && !arquivoSelecionado ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={iniciarGravacao}
                                disabled={!config || isEnviando}
                                title="Gravar áudio"
                              >
                                <Mic className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                type="submit"
                                size="icon"
                                disabled={!config || isEnviando || (!textoNovo.trim() && !arquivoSelecionado)}
                              >
                                {isEnviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              </Button>
                            )}
                          </div>
                        </form>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Dialog open={novaConversaOpen} onOpenChange={setNovaConversaOpen}>
          <DialogContent className="sm:max-w-[450px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Nova conversa</DialogTitle>
              <DialogDescription className="text-gray-600">
                Escolha um cliente cadastrado para iniciar (ou retomar) uma conversa.
              </DialogDescription>
            </DialogHeader>

            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="pl-9 bg-white text-gray-900 border-gray-300"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
              {loadingClientes ? (
                <div className="py-8 text-center text-gray-500 text-sm">Carregando clientes...</div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">
                  {clientesDisponiveis.length === 0 ? (
                    <>
                      Nenhum cliente cadastrado ainda.
                      <br />
                      Cadastre em WhatsApp {'>'} Clientes primeiro.
                    </>
                  ) : (
                    'Nenhum cliente encontrado para essa busca.'
                  )}
                </div>
              ) : (
                <div className="space-y-1 py-1">
                  {clientesFiltrados.map((cliente) => (
                    <button
                      key={cliente.id}
                      onClick={() => handleIniciarConversa(cliente)}
                      disabled={iniciandoConversaId === cliente.id}
                      className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{cliente.nome}</p>
                        <p className="text-xs text-gray-500">{cliente.telefone}</p>
                      </div>
                      {iniciandoConversaId === cliente.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!conversaParaApagar} onOpenChange={(open) => !open && setConversaParaApagar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Apagar conversa</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                Tem certeza que deseja apagar a conversa com "{conversaParaApagar ? nomeConversa(conversaParaApagar) : ''}"?
                Todo o histórico de mensagens será removido permanentemente. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApagarConversa}
                disabled={isApagando}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {isApagando ? 'Apagando...' : 'Sim, apagar conversa'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!conversaParaEncerrar} onOpenChange={(open) => !open && setConversaParaEncerrar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Encerrar conversa</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                A conversa com "{conversaParaEncerrar ? nomeConversa(conversaParaEncerrar) : ''}" vai para a aba
                "Arquivadas". O histórico continua salvo e você pode reabrir quando quiser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleEncerrarConversa} className="bg-amber-600 text-white hover:bg-amber-700">
                Sim, encerrar conversa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}