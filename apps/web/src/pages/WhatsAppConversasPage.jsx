import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  RefreshCw,
} from 'lucide-react';
import AvatarContato from '@/components/whatsapp/AvatarContato';
import { nomeConversa, formatarTelefone, rotuloDia, normalizarNumeroBR, formatarSoHora } from '@/components/whatsapp/utils';
import { invocarFuncao } from '@/lib/invocarFuncao';

const ICONE_TIPO = {
  image: ImageIcon,
  document: FileText,
  audio: Mic,
  video: Video,
  sticker: Sticker,
};

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
  if (status === 'lido') return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === 'entregue') return <CheckCheck className="h-3.5 w-3.5 text-gray-500" />;
  if (status === 'erro') return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Check className="h-3.5 w-3.5 text-gray-500" />;
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
  const [contatosEncontrados, setContatosEncontrados] = useState([]);
  const [loadingContatos, setLoadingContatos] = useState(false);

  const [sincronizando, setSincronizando] = useState(false);
  const [progressoFotos, setProgressoFotos] = useState(null);
  const fotosTentadasRef = useRef(new Set());
  const buscandoFotosRef = useRef(false);
  const montadoRef = useRef(true);

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

  const fetchConversas = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    try {
      if (silencioso !== true) setLoadingConversas(true);
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
          fetchConversas(true);
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

  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // Busca em segundo plano a foto de quem ainda não tem (uma vez por contato nesta sessão).
  useEffect(() => {
    if (!config || buscandoFotosRef.current) return;
    const novos = conversas.filter((c) => !c.foto_url && !fotosTentadasRef.current.has(c.telefone_jid));
    if (novos.length === 0) return;
    novos.forEach((c) => fotosTentadasRef.current.add(c.telefone_jid));

    buscandoFotosRef.current = true;
    (async () => {
      let atualizou = false;
      try {
        for (let rodada = 0; rodada < 8 && montadoRef.current; rodada += 1) {
          const r = await invocarFuncao('whatsapp-contatos', { action: 'fotos' });
          if (r.com_foto > 0) atualizou = true;
          if (!r.restantes || r.processados === 0) break;
        }
      } catch (err) {
        console.error('Erro ao buscar fotos de perfil:', err);
      } finally {
        buscandoFotosRef.current = false;
        if (atualizou && montadoRef.current) fetchConversas(true);
      }
    })();
  }, [conversas, config, fetchConversas]);

  // Importa os contatos do WhatsApp conectado e depois busca as fotos, em lotes.
  const handleImportarContatos = async () => {
    setSincronizando(true);
    setProgressoFotos(null);
    try {
      const r = await invocarFuncao('whatsapp-contatos', { action: 'sincronizar' });
      toast({
        title: 'Contatos importados!',
        description: `${r.total} contato(s), ${r.com_nome} com nome.${r.conversas_nomeadas ? ` ${r.conversas_nomeadas} conversa(s) ganharam nome.` : ''}`,
        className: 'bg-emerald-600 text-white',
      });
      await fetchConversas(true);

      let feitas = 0;
      let restantes = 1;
      for (let rodada = 0; rodada < 300 && restantes > 0 && montadoRef.current; rodada += 1) {
        const f = await invocarFuncao('whatsapp-contatos', { action: 'fotos', todos: true });
        feitas += f.processados;
        restantes = f.restantes;
        setProgressoFotos({ feitas, restantes });
        if (f.processados === 0) break;
      }
      await fetchConversas(true);
      if (montadoRef.current) toast({ title: 'Fotos de perfil atualizadas.' });
    } catch (err) {
      toast({
        title: 'Não foi possível importar os contatos',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSincronizando(false);
      setProgressoFotos(null);
    }
  };

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

  // Contatos importados do WhatsApp (a busca espera a pessoa parar de digitar)
  useEffect(() => {
    if (!novaConversaOpen || !empresaId) return undefined;
    let cancelado = false;
    const timer = setTimeout(async () => {
      setLoadingContatos(true);
      const termo = buscaCliente.trim();
      const soNumero = /^[\d\s()+-]+$/.test(termo);
      let consulta = supabase
        .from('whatsapp_contatos')
        .select('id, telefone_jid, telefone, nome, foto_url')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true, nullsFirst: false })
        .limit(50);
      if (termo) {
        consulta = soNumero
          ? consulta.ilike('telefone', `%${termo.replace(/\D/g, '')}%`)
          : consulta.ilike('nome', `%${termo.replace(/[%,]/g, '')}%`);
      }
      const { data } = await consulta;
      if (!cancelado) {
        setContatosEncontrados(data || []);
        setLoadingContatos(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [novaConversaOpen, empresaId, buscaCliente]);

  const clientesFiltrados = clientesDisponiveis.filter((c) => {
    const termo = buscaCliente.trim().toLowerCase();
    if (!termo) return true;
    return (c.nome || '').toLowerCase().includes(termo) || (c.telefone || '').includes(termo);
  });

  const telefonesDeClientes = new Set(clientesDisponiveis.map((c) => c.telefone));
  const contatosFiltrados = contatosEncontrados.filter((c) => !telefonesDeClientes.has(c.telefone));
  const numeroDigitado = normalizarNumeroBR(buscaCliente);
  const mostrarNumeroDigitado = !!numeroDigitado
    && !clientesDisponiveis.some((c) => c.telefone === numeroDigitado)
    && !contatosEncontrados.some((c) => c.telefone === numeroDigitado);

  // alvo: { chave, jid, nome, clienteId, fotoUrl } — cliente cadastrado, contato do WhatsApp ou número digitado
  const handleIniciarConversa = async (alvo) => {
    if (!empresaId) return;

    // Já existe uma conversa com essa pessoa? Só abre ela.
    const existente = conversas.find((c) => c.telefone_jid === alvo.jid);
    if (existente) {
      setNovaConversaOpen(false);
      setBuscaCliente('');
      handleSelecionarConversa(existente);
      return;
    }

    setIniciandoConversaId(alvo.chave);
    try {
      const registro = { empresa_id: empresaId, telefone_jid: alvo.jid, status: 'aberta' };
      if (alvo.clienteId) registro.cliente_id = alvo.clienteId;
      if (alvo.nome) registro.nome_exibicao = alvo.nome;
      if (alvo.fotoUrl) registro.foto_url = alvo.fotoUrl;

      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .upsert(registro, { onConflict: 'empresa_id,telefone_jid' })
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

  const conversaAtual = conversaSelecionada
    ? conversas.find((c) => c.id === conversaSelecionada.id) || conversaSelecionada
    : null;

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

          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: 520 }}>
            <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-full min-h-0">
              {/* Lista de conversas */}
              <div
                className={`border-r border-gray-200 flex flex-col h-full min-h-0 ${
                  conversaSelecionada ? 'hidden md:flex' : 'flex'
                }`}
              >
                <div className="p-3 border-b border-gray-200 space-y-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className="flex-1 justify-start gap-2 bg-[#00a884] hover:bg-[#019271] text-white"
                      onClick={() => setNovaConversaOpen(true)}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      Nova conversa
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleImportarContatos}
                      disabled={!config || sincronizando}
                      title="Importar contatos e fotos do WhatsApp"
                    >
                      {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </div>
                  {sincronizando && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {progressoFotos
                        ? `Buscando fotos de perfil... faltam ${progressoFotos.restantes}`
                        : 'Importando contatos do WhatsApp...'}
                    </p>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar conversa..."
                      className="pl-9 bg-[#f0f2f5] text-gray-900 border-transparent rounded-lg"
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
                          className={`group w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 hover:bg-[#f5f6f6] transition-colors ${
                            ativa ? 'bg-[#f0f2f5]' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleSelecionarConversa(conversa)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          >
                            <AvatarContato
                              nome={nomeConversa(conversa)}
                              fotoUrl={conversa.foto_url}
                              chave={conversa.telefone_jid}
                              tamanho={48}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-900 truncate">{nomeConversa(conversa)}</span>
                                <span className={`text-xs flex-shrink-0 ${conversa.nao_lidas > 0 ? 'text-[#00a884] font-medium' : 'text-gray-400'}`}>
                                  {formatarHora(conversa.ultima_mensagem_at)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <span className="text-sm text-gray-500 truncate">
                                  {conversa.ultima_mensagem_preview || 'Sem mensagens'}
                                </span>
                                {conversa.nao_lidas > 0 && (
                                  <span className="bg-[#25d366] text-white text-xs font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-shrink-0">
                                    {conversa.nao_lidas}
                                  </span>
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
                style={{ backgroundColor: '#efeae2' }}
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
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-[#f0f2f5] flex items-center gap-3 flex-shrink-0">
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
                      <AvatarContato
                        nome={nomeConversa(conversaAtual)}
                        fotoUrl={conversaAtual.foto_url}
                        chave={conversaAtual.telefone_jid}
                        tamanho={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{nomeConversa(conversaAtual)}</p>
                        <p className="text-xs text-gray-500">{formatarTelefone(conversaAtual.telefone_jid)}</p>
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
                        mensagens.map((msg, indice) => {
                          const Icone = ICONE_TIPO[msg.tipo];
                          const rotulo = rotuloDia(msg.timestamp_mensagem);
                          const mostrarDia = indice === 0 || rotulo !== rotuloDia(mensagens[indice - 1].timestamp_mensagem);
                          return (
                            <React.Fragment key={msg.id}>
                              {mostrarDia && rotulo && (
                                <div className="flex justify-center py-1">
                                  <span className="bg-white/90 text-gray-600 text-xs px-3 py-1 rounded-lg shadow-sm">{rotulo}</span>
                                </div>
                              )}
                            <div
                              className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                                  msg.from_me
                                    ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none'
                                    : 'bg-white text-gray-900 rounded-tl-none'
                                }`}
                              >
                                {msg.from_me && msg.remetente_user_id && (
                                  <p className="text-[11px] font-semibold mb-0.5 text-emerald-700">
                                    {msg.remetente_user_id === user?.id
                                      ? 'Você'
                                      : usuariosMap[msg.remetente_user_id] || 'Atendente'}
                                  </p>
                                )}
                                {Icone && !(msg.tipo === 'audio' && msg.media_url) && (
                                  <div className="flex items-center gap-1 mb-1 text-xs text-gray-500">
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
                                      msg.from_me ? 'bg-black/5' : 'bg-gray-100'
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
                                  className="text-[10px] mt-1 text-right flex items-center justify-end gap-1 text-gray-500"
                                >
                                  {formatarSoHora(msg.timestamp_mensagem)}
                                  {msg.from_me && <IconeStatusMensagem status={msg.status} />}
                                </p>
                              </div>
                            </div>
                            </React.Fragment>
                          );
                        })
                      )}
                      <div ref={mensagensEndRef} />
                    </div>

                    <div className="border-t border-gray-200 bg-[#f0f2f5] flex-shrink-0">
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
                              variant="ghost"
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
                              className="bg-white text-gray-900 border-transparent rounded-lg"
                            />
                            {!textoNovo.trim() && !arquivoSelecionado ? (
                              <Button
                                type="button"
                                variant="ghost"
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
                                className="rounded-full bg-[#00a884] hover:bg-[#019271] text-white"
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
                Escolha um contato do WhatsApp ou um cliente cadastrado, ou digite um número com DDD.
              </DialogDescription>
            </DialogHeader>

            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="Buscar por nome ou digitar um número..."
                className="pl-9 bg-white text-gray-900 border-gray-300"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
              {(() => {
                const linha = (alvo, titulo, subtitulo) => (
                  <button
                    key={alvo.chave}
                    onClick={() => handleIniciarConversa(alvo)}
                    disabled={iniciandoConversaId === alvo.chave}
                    className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <AvatarContato nome={titulo} fotoUrl={alvo.fotoUrl} chave={alvo.jid} tamanho={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{titulo}</p>
                      <p className="text-xs text-gray-500">{subtitulo}</p>
                    </div>
                    {iniciandoConversaId === alvo.chave && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  </button>
                );
                const cabecalho = (texto) => (
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{texto}</p>
                );
                const carregando = loadingClientes || loadingContatos;
                const vazio = clientesFiltrados.length === 0 && contatosFiltrados.length === 0 && !mostrarNumeroDigitado;

                if (carregando && vazio) {
                  return <div className="py-8 text-center text-gray-500 text-sm">Carregando...</div>;
                }
                if (vazio) {
                  return (
                    <div className="py-8 text-center text-gray-500 text-sm">
                      {buscaCliente.trim()
                        ? 'Nenhum contato encontrado. Digite o número com DDD para iniciar uma conversa.'
                        : (
                          <>
                            Nenhum contato ainda.
                            <br />
                            Use o botão de importar contatos na lista de conversas.
                          </>
                        )}
                    </div>
                  );
                }
                return (
                  <div className="py-1">
                    {mostrarNumeroDigitado && (
                      <>
                        {cabecalho('Número digitado')}
                        {linha(
                          { chave: 'numero', jid: `${numeroDigitado}@s.whatsapp.net`, nome: null },
                          `Conversar com ${formatarTelefone(numeroDigitado)}`,
                          'Número que ainda não está nos seus contatos',
                        )}
                      </>
                    )}
                    {clientesFiltrados.length > 0 && (
                      <>
                        {cabecalho('Clientes')}
                        {clientesFiltrados.map((cliente) =>
                          linha(
                            {
                              chave: cliente.id,
                              jid: cliente.telefone_jid || `${cliente.telefone}@s.whatsapp.net`,
                              nome: cliente.nome,
                              clienteId: cliente.id,
                              fotoUrl: contatosEncontrados.find((c) => c.telefone === cliente.telefone)?.foto_url || null,
                            },
                            cliente.nome,
                            formatarTelefone(cliente.telefone),
                          ),
                        )}
                      </>
                    )}
                    {contatosFiltrados.length > 0 && (
                      <>
                        {cabecalho('Contatos do WhatsApp')}
                        {contatosFiltrados.map((contato) =>
                          linha(
                            { chave: contato.id, jid: contato.telefone_jid, nome: contato.nome, fotoUrl: contato.foto_url },
                            contato.nome || formatarTelefone(contato.telefone_jid),
                            formatarTelefone(contato.telefone_jid),
                          ),
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
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