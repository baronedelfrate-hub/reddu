import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  Plus,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  X,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  MoreVertical,
  Archive,
  ArchiveRestore,
} from 'lucide-react';

const STATUS_CAMPANHA = {
  rascunho: { label: 'Rascunho', className: 'bg-gray-200 text-gray-700' },
  em_andamento: { label: 'Em andamento', className: 'bg-emerald-600 text-white' },
  pausada: { label: 'Pausada', className: 'bg-amber-500 text-white' },
  concluida: { label: 'Concluída', className: 'bg-blue-600 text-white' },
  cancelada: { label: 'Cancelada', className: 'bg-red-600 text-white' },
};

function normalizarTelefone(valor) {
  let digits = String(valor || '').replace(/\D/g, '');
  // Remove um zero de discagem inicial, se vier (raro em planilha, mas acontece)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  // Número brasileiro sem DDI (só DDD + número: 10 ou 11 dígitos) recebe o 55 na frente.
  // Assumimos Brasil porque é o único país atendido por este sistema.
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

// Tenta reconhecer colunas de nome/telefone com nomes variados
function encontrarColuna(headers, candidatos) {
  const normalizados = headers.map((h) => String(h).toLowerCase().trim());
  for (const candidato of candidatos) {
    const idx = normalizados.indexOf(candidato);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// Transforma um cabeçalho de coluna em chave de variável: "Número Pedido" -> "numero_pedido"
function slugificarChave(header) {
  return String(header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolverMensagem(template, nome, variaveis) {
  let texto = template;
  const primeiroNome = (nome || '').trim().split(' ')[0] || 'cliente';
  texto = texto.replaceAll('{nome}', primeiroNome);
  if (variaveis) {
    for (const [chave, valor] of Object.entries(variaveis)) {
      if (chave === 'nome') continue;
      texto = texto.replaceAll(`{${chave}}`, valor == null ? '' : String(valor));
    }
  }
  return texto;
}

export default function WhatsAppDisparosPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [campanhas, setCampanhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);

  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [etapa, setEtapa] = useState(1);
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [mensagemTemplate, setMensagemTemplate] = useState('');
  const [mensagensPorMinuto, setMensagensPorMinuto] = useState(8);
  const [contatosImportados, setContatosImportados] = useState([]);
  const [colunasDetectadas, setColunasDetectadas] = useState([]);
  const [isImportando, setIsImportando] = useState(false);
  const [erroImportacao, setErroImportacao] = useState(null);
  const [isSalvandoCampanha, setIsSalvandoCampanha] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const [campanhaDetalhe, setCampanhaDetalhe] = useState(null);
  const [destinatariosDetalhe, setDestinatariosDetalhe] = useState([]);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  const [campanhaParaCancelar, setCampanhaParaCancelar] = useState(null);
  const [campanhaParaApagar, setCampanhaParaApagar] = useState(null);
  const [isApagandoCampanha, setIsApagandoCampanha] = useState(false);
  const [filtroArquivada, setFiltroArquivada] = useState(false);

  const fetchCampanhas = useCallback(async () => {
    if (!empresaId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_campanhas')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('arquivada', filtroArquivada)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampanhas(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar campanhas', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, filtroArquivada, toast]);

  useEffect(() => {
    fetchCampanhas();
  }, [fetchCampanhas]);

  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from('whatsapp_configuracoes')
      .select('base_url, instance_name, status')
      .eq('empresa_id', empresaId)
      .maybeSingle()
      .then(({ data }) => setConfig(data || null));
  }, [empresaId]);

  // Realtime: progresso das campanhas atualiza sozinho
  useEffect(() => {
    if (!empresaId) return;
    const channel = supabase
      .channel(`whatsapp_campanhas_${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_campanhas', filter: `empresa_id=eq.${empresaId}` },
        () => fetchCampanhas()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [empresaId, fetchCampanhas]);

  const resetNovaCampanha = () => {
    setEtapa(1);
    setNomeCampanha('');
    setMensagemTemplate('');
    setMensagensPorMinuto(8);
    setContatosImportados([]);
    setColunasDetectadas([]);
    setErroImportacao(null);
  };

  const handleFecharDialog = () => {
    setNovaCampanhaOpen(false);
    resetNovaCampanha();
  };

  const inserirVariavel = (chave) => {
    const el = textareaRef.current;
    const tag = `{${chave}}`;
    if (!el) {
      setMensagemTemplate((prev) => prev + tag);
      return;
    }
    const start = el.selectionStart ?? mensagemTemplate.length;
    const end = el.selectionEnd ?? mensagemTemplate.length;
    const novoTexto = mensagemTemplate.slice(0, start) + tag + mensagemTemplate.slice(end);
    setMensagemTemplate(novoTexto);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleImportarArquivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroImportacao(null);
    setIsImportando(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const primeiraAba = workbook.SheetNames[0];
        const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: '' });

        if (linhas.length === 0) {
          setErroImportacao('A planilha está vazia.');
          setIsImportando(false);
          return;
        }

        const headers = Object.keys(linhas[0]);
        const colNome = encontrarColuna(headers, ['nome', 'name', 'cliente']);
        const colTelefone = encontrarColuna(headers, ['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'número']);

        if (!colTelefone) {
          setErroImportacao(
            'Não encontrei uma coluna de telefone. Use um cabeçalho como "telefone", "celular" ou "whatsapp".'
          );
          setIsImportando(false);
          return;
        }

        // Demais colunas (fora telefone e nome) viram variáveis disponíveis na mensagem
        const colunasExtras = headers.filter((h) => h !== colTelefone && h !== colNome);
        const chavesExtras = colunasExtras.map((h) => ({ header: h, chave: slugificarChave(h) }));
        setColunasDetectadas(['nome', ...chavesExtras.map((c) => c.chave)]);

        const vistos = new Set();
        const contatos = [];
        let invalidos = 0;

        for (const linha of linhas) {
          const telefoneOriginal = linha[colTelefone];
          const telefone = normalizarTelefone(telefoneOriginal);
          const nome = colNome ? String(linha[colNome] || '').trim() : '';

          if (telefone.length < 10) {
            invalidos++;
            continue;
          }
          if (vistos.has(telefone)) continue;
          vistos.add(telefone);

          const variaveis = {};
          for (const { header, chave } of chavesExtras) {
            if (!chave) continue;
            variaveis[chave] = String(linha[header] ?? '').trim();
          }

          contatos.push({ nome: nome || null, telefone, variaveis });
        }

        if (contatos.length === 0) {
          setErroImportacao('Nenhum telefone válido encontrado na planilha.');
          setIsImportando(false);
          return;
        }

        setContatosImportados(contatos);
        if (invalidos > 0) {
          toast({
            title: `${contatos.length} contatos importados`,
            description: `${invalidos} linha(s) ignorada(s) por telefone inválido ou duplicado.`,
          });
        }
      } catch (err) {
        setErroImportacao('Não consegui ler esse arquivo. Confira se é um .csv ou .xlsx válido.');
      } finally {
        setIsImportando(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCriarCampanha = async (statusInicial) => {
    if (!nomeCampanha.trim() || !mensagemTemplate.trim() || contatosImportados.length === 0) return;

    setIsSalvandoCampanha(true);
    try {
      const { data: campanha, error: campanhaError } = await supabase
        .from('whatsapp_campanhas')
        .insert({
          empresa_id: empresaId,
          nome: nomeCampanha.trim(),
          mensagem_template: mensagemTemplate.trim(),
          mensagens_por_minuto: mensagensPorMinuto,
          status: statusInicial,
          total_contatos: contatosImportados.length,
          iniciada_em: statusInicial === 'em_andamento' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (campanhaError) throw campanhaError;

      const destinatarios = contatosImportados.map((c) => ({
        campanha_id: campanha.id,
        empresa_id: empresaId,
        nome: c.nome,
        telefone: c.telefone,
        telefone_jid: `${c.telefone}@s.whatsapp.net`,
        variaveis: c.variaveis || {},
        status: 'pendente',
      }));

      // Insere em blocos de 500 pra não estourar o limite de payload
      for (let i = 0; i < destinatarios.length; i += 500) {
        const bloco = destinatarios.slice(i, i + 500);
        const { error: destError } = await supabase.from('whatsapp_campanha_destinatarios').insert(bloco);
        if (destError) throw destError;
      }

      toast({
        title: statusInicial === 'em_andamento' ? 'Campanha iniciada!' : 'Campanha salva como rascunho',
        description: `${contatosImportados.length} contatos na fila.`,
        className: 'bg-emerald-600 text-white',
      });

      handleFecharDialog();
      fetchCampanhas();
    } catch (error) {
      toast({ title: 'Erro ao criar campanha', description: error.message, variant: 'destructive' });
    } finally {
      setIsSalvandoCampanha(false);
    }
  };

  const handleMudarStatusCampanha = async (campanha, novoStatus) => {
    try {
      const payload = { status: novoStatus };
      if (novoStatus === 'em_andamento' && !campanha.iniciada_em) {
        payload.iniciada_em = new Date().toISOString();
      }
      const { error } = await supabase.from('whatsapp_campanhas').update(payload).eq('id', campanha.id);
      if (error) throw error;
      fetchCampanhas();
    } catch (error) {
      toast({ title: 'Erro ao atualizar campanha', description: error.message, variant: 'destructive' });
    }
  };

  const handleArquivarCampanha = async (campanha) => {
    try {
      const { error } = await supabase.from('whatsapp_campanhas').update({ arquivada: true }).eq('id', campanha.id);
      if (error) throw error;
      setCampanhas((prev) => prev.filter((c) => c.id !== campanha.id));
      toast({ title: 'Campanha arquivada.' });
    } catch (error) {
      toast({ title: 'Erro ao arquivar campanha', description: error.message, variant: 'destructive' });
    }
  };

  const handleDesarquivarCampanha = async (campanha) => {
    try {
      const { error } = await supabase.from('whatsapp_campanhas').update({ arquivada: false }).eq('id', campanha.id);
      if (error) throw error;
      setCampanhas((prev) => prev.filter((c) => c.id !== campanha.id));
      toast({ title: 'Campanha desarquivada.' });
    } catch (error) {
      toast({ title: 'Erro ao desarquivar campanha', description: error.message, variant: 'destructive' });
    }
  };

  const handleApagarCampanha = async () => {
    if (!campanhaParaApagar) return;
    setIsApagandoCampanha(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_campanhas')
        .delete()
        .eq('id', campanhaParaApagar.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('A campanha não foi removida (sem permissão ou já tinha sido apagada).');
      }

      setCampanhas((prev) => prev.filter((c) => c.id !== campanhaParaApagar.id));
      toast({ title: 'Campanha apagada.', description: 'Os destinatários dessa campanha também foram removidos.' });
      setCampanhaParaApagar(null);
    } catch (error) {
      toast({ title: 'Erro ao apagar campanha', description: error.message, variant: 'destructive' });
    } finally {
      setIsApagandoCampanha(false);
    }
  };

  const handleCancelarCampanha = async () => {
    if (!campanhaParaCancelar) return;
    try {
      await supabase
        .from('whatsapp_campanhas')
        .update({ status: 'cancelada' })
        .eq('id', campanhaParaCancelar.id);
      await supabase
        .from('whatsapp_campanha_destinatarios')
        .update({ status: 'cancelado' })
        .eq('campanha_id', campanhaParaCancelar.id)
        .eq('status', 'pendente');
      toast({ title: 'Campanha cancelada.' });
      setCampanhaParaCancelar(null);
      fetchCampanhas();
    } catch (error) {
      toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' });
    }
  };

  const handleTentarNovamente = async (destinatario) => {
    try {
      const { error } = await supabase
        .from('whatsapp_campanha_destinatarios')
        .update({ status: 'pendente', erro_detalhe: null })
        .eq('id', destinatario.id);
      if (error) throw error;

      // Se a campanha já tinha sido dada como concluída, reabre ela —
      // senão o agendador ignora (só processa campanhas "em_andamento").
      if (campanhaDetalhe?.status === 'concluida') {
        await supabase
          .from('whatsapp_campanhas')
          .update({ status: 'em_andamento', concluida_em: null })
          .eq('id', campanhaDetalhe.id);
        fetchCampanhas();
      }

      setDestinatariosDetalhe((prev) =>
        prev.map((d) => (d.id === destinatario.id ? { ...d, status: 'pendente', erro_detalhe: null } : d))
      );
      toast({ title: 'Reagendado para nova tentativa no próximo minuto.' });
    } catch (error) {
      toast({ title: 'Erro ao reagendar', description: error.message, variant: 'destructive' });
    }
  };

  const handleAbrirDetalhe = async (campanha) => {
    setCampanhaDetalhe(campanha);
    setLoadingDetalhe(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_campanha_destinatarios')
        .select('*')
        .eq('campanha_id', campanha.id)
        .order('created_at');
      if (error) throw error;
      setDestinatariosDetalhe(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar destinatários', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const podeAvancarEtapa1 = nomeCampanha.trim() && mensagemTemplate.trim();
  const podeIniciar = contatosImportados.length > 0 && mensagensPorMinuto >= 1;

  const mensagemPreview = useMemo(() => {
    if (!mensagemTemplate.trim() || contatosImportados.length === 0) return '';
    const primeiro = contatosImportados[0];
    return resolverMensagem(mensagemTemplate, primeiro.nome, primeiro.variaveis);
  }, [mensagemTemplate, contatosImportados]);

  const variaveisNaoEncontradas = useMemo(() => {
    const usadas = [...mensagemTemplate.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1].toLowerCase());
    const disponiveis = new Set(colunasDetectadas);
    return [...new Set(usadas)].filter((v) => !disponiveis.has(v));
  }, [mensagemTemplate, colunasDetectadas]);

  const tempoEstimado = useMemo(() => {
    if (contatosImportados.length === 0 || mensagensPorMinuto === 0) return null;
    const minutos = Math.ceil(contatosImportados.length / mensagensPorMinuto);
    if (minutos < 60) return `~${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const restoMin = minutos % 60;
    return `~${horas}h${restoMin > 0 ? ` ${restoMin}min` : ''}`;
  }, [contatosImportados.length, mensagensPorMinuto]);

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
        <title>WhatsApp - Disparo em Massa - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Send className="h-7 w-7 text-primary" />
                Disparo em Massa
              </h1>
              <p className="text-gray-600 mt-1">Envie uma mensagem padrão para uma lista de contatos importada.</p>
            </div>
            <Button onClick={() => setNovaCampanhaOpen(true)} className="gap-2" disabled={!config?.base_url}>
              <Plus className="h-4 w-4" />
              Nova Campanha
            </Button>
          </div>

          <div className="inline-flex bg-gray-100 rounded-md p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setFiltroArquivada(false)}
              className={`rounded px-3 py-1.5 transition-colors ${!filtroArquivada ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'
                }`}
            >
              Ativas
            </button>
            <button
              type="button"
              onClick={() => setFiltroArquivada(true)}
              className={`rounded px-3 py-1.5 transition-colors ${filtroArquivada ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'
                }`}
            >
              Arquivadas
            </button>
          </div>

          {!config?.base_url && (
            <Alert variant="destructive" className="border-red-500 bg-red-50 text-red-900">
              <AlertTitle className="font-bold">Instância não configurada</AlertTitle>
              <AlertDescription>
                Configure a instância em WhatsApp {'>'} Configuração antes de criar uma campanha.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <Info className="h-4 w-4" />
            <AlertTitle className="font-bold">Sobre o risco de bloqueio</AlertTitle>
            <AlertDescription>
              Disparo em massa aumenta o risco do número ser bloqueado pelo WhatsApp, mesmo com limite de
              velocidade. Prefira mandar só para contatos que já falaram com você antes, personalize a mensagem
              (use <code className="bg-amber-100 px-1 rounded">{'{nome}'}</code>) e mantenha uma taxa baixa
              (recomendado: até 15-20 mensagens por minuto).
            </AlertDescription>
          </Alert>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent mb-4"></div>
                <p className="text-gray-600">Carregando campanhas...</p>
              </div>
            ) : campanhas.length === 0 ? (
              <div className="p-12 text-center">
                <Send className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {filtroArquivada ? 'Nenhuma campanha arquivada.' : 'Nenhuma campanha criada ainda.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold">Campanha</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Progresso</TableHead>
                      <TableHead className="font-semibold">Taxa</TableHead>
                      <TableHead className="text-right font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campanhas.map((campanha) => {
                      const statusInfo = STATUS_CAMPANHA[campanha.status] || STATUS_CAMPANHA.rascunho;
                      const progresso = campanha.total_contatos
                        ? Math.round(((campanha.total_enviados + campanha.total_erros) / campanha.total_contatos) * 100)
                        : 0;
                      return (
                        <TableRow key={campanha.id} className="hover:bg-gray-50">
                          <TableCell>
                            <button
                              className="font-medium text-gray-900 hover:underline text-left"
                              onClick={() => handleAbrirDetalhe(campanha)}
                            >
                              {campanha.nome}
                            </button>
                            <p className="text-xs text-gray-500">{campanha.total_contatos} contatos</p>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <Progress value={progresso} className="w-24" />
                              <span className="text-xs text-gray-500">
                                {campanha.total_enviados + campanha.total_erros}/{campanha.total_contatos}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">{campanha.mensagens_por_minuto}/min</TableCell>
                          <TableCell className="text-right space-x-2">
                            {campanha.status === 'rascunho' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleMudarStatusCampanha(campanha, 'em_andamento')}
                                title="Iniciar disparo"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {campanha.status === 'em_andamento' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                                onClick={() => handleMudarStatusCampanha(campanha, 'pausada')}
                                title="Pausar disparo"
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {campanha.status === 'pausada' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleMudarStatusCampanha(campanha, 'em_andamento')}
                                title="Retomar disparo"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {['rascunho', 'em_andamento', 'pausada'].includes(campanha.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => setCampanhaParaCancelar(campanha)}
                                title="Cancelar campanha"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" title="Mais ações">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {filtroArquivada ? (
                                  <DropdownMenuItem
                                    onClick={() => setTimeout(() => handleDesarquivarCampanha(campanha), 0)}
                                  >
                                    <ArchiveRestore className="h-4 w-4 mr-2" /> Desarquivar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setTimeout(() => handleArquivarCampanha(campanha), 0)}
                                  >
                                    <Archive className="h-4 w-4 mr-2" /> Arquivar campanha
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => setTimeout(() => setCampanhaParaApagar(campanha), 0)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Apagar campanha
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Diálogo: Nova Campanha */}
        <Dialog open={novaCampanhaOpen} onOpenChange={(open) => (open ? setNovaCampanhaOpen(true) : handleFecharDialog())}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Nova Campanha — Etapa {etapa} de 3</DialogTitle>
              <DialogDescription className="text-gray-600">
                {etapa === 1 && 'Importe a lista de contatos (CSV ou Excel).'}
                {etapa === 2 && 'Dê um nome e escreva a mensagem que será enviada.'}
                {etapa === 3 && 'Configure a velocidade de disparo e confirme.'}
              </DialogDescription>
            </DialogHeader>

            {etapa === 1 && (
              <div className="space-y-4 py-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportarArquivo}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                />
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-gray-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isImportando ? (
                    <Loader2 className="h-8 w-8 mx-auto mb-2 text-primary animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  )}
                  <p className="text-sm text-gray-700 font-medium">Clique para escolher um arquivo .csv ou .xlsx</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Precisa ter uma coluna de telefone (ex: "telefone", "celular" ou "whatsapp"). Qualquer outra
                    coluna (nome, pedido, hora, o que precisar) vira uma variável que você pode usar na mensagem.
                  </p>
                </div>

                {erroImportacao && (
                  <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900">
                    <AlertDescription>{erroImportacao}</AlertDescription>
                  </Alert>
                )}

                {contatosImportados.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-emerald-50 border-b border-emerald-100 px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-emerald-800 font-medium flex items-center gap-1.5">
                        <Users className="h-4 w-4" /> {contatosImportados.length} contatos prontos
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setContatosImportados([]);
                          setColunasDetectadas([]);
                        }}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                      {contatosImportados.slice(0, 8).map((c, i) => (
                        <div key={i} className="px-3 py-1.5 text-sm text-gray-700 flex justify-between">
                          <span>{c.nome || <span className="text-gray-400">Sem nome</span>}</span>
                          <span className="text-gray-500 font-mono">{c.telefone}</span>
                        </div>
                      ))}
                      {contatosImportados.length > 8 && (
                        <div className="px-3 py-1.5 text-xs text-gray-400 text-center">
                          + {contatosImportados.length - 8} outro(s)
                        </div>
                      )}
                    </div>
                    {colunasDetectadas.length > 1 && (
                      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-600">
                        Variáveis detectadas: {colunasDetectadas.map((c) => `{${c}}`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {etapa === 2 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="nome_campanha" className="text-gray-900 font-medium">
                    Nome da campanha <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nome_campanha"
                    value={nomeCampanha}
                    onChange={(e) => setNomeCampanha(e.target.value)}
                    placeholder="Ex: Promoção de aniversário - Julho"
                    className="bg-white text-gray-900 border-gray-300"
                  />
                </div>

                {colunasDetectadas.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-gray-900 font-medium">Variáveis disponíveis (clique pra inserir)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {colunasDetectadas.map((chave) => (
                        <button
                          key={chave}
                          type="button"
                          onClick={() => inserirVariavel(chave)}
                          className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
                        >
                          {`{${chave}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="mensagem_template" className="text-gray-900 font-medium">
                    Mensagem <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="mensagem_template"
                    ref={textareaRef}
                    value={mensagemTemplate}
                    onChange={(e) => setMensagemTemplate(e.target.value)}
                    rows={5}
                    placeholder={'Oi {nome}! Temos uma promoção especial essa semana...'}
                    className="bg-white text-gray-900 border-gray-300"
                  />
                </div>

                {variaveisNaoEncontradas.length > 0 && (
                  <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
                    <AlertDescription>
                      Sua mensagem usa {variaveisNaoEncontradas.map((v) => `{${v}}`).join(', ')}, mas essa
                      variável não existe na planilha importada — vai aparecer assim mesmo, sem substituir, na
                      mensagem final.
                    </AlertDescription>
                  </Alert>
                )}

                {mensagemTemplate.trim() && contatosImportados.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Prévia (contato: {contatosImportados[0].nome || contatosImportados[0].telefone})
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{mensagemPreview}</p>
                  </div>
                )}
              </div>
            )}

            {etapa === 3 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="taxa" className="text-gray-900 font-medium">
                    Mensagens por minuto
                  </Label>
                  <Input
                    id="taxa"
                    type="number"
                    min={1}
                    max={30}
                    value={mensagensPorMinuto}
                    onChange={(e) => setMensagensPorMinuto(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="bg-white text-gray-900 border-gray-300 w-32"
                  />
                  <p className="text-xs text-gray-500">
                    Recomendado: entre 5 e 15. Valores altos aumentam o risco de bloqueio do número.
                  </p>
                </div>

                <Card>
                  <CardContent className="pt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Contatos</span>
                      <span className="font-medium text-gray-900">{contatosImportados.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Taxa</span>
                      <span className="font-medium text-gray-900">{mensagensPorMinuto} por minuto</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tempo estimado</span>
                      <span className="font-medium text-gray-900">{tempoEstimado}</span>
                    </div>
                  </CardContent>
                </Card>

                <Alert className="border-gray-200 bg-gray-50">
                  <Clock className="h-4 w-4" />
                  <AlertDescription className="text-gray-700">
                    O disparo roda em segundo plano, mesmo com o navegador fechado — um processo automático manda o
                    lote a cada minuto, no ritmo configurado acima.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-gray-100 flex-row justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => (etapa === 1 ? handleFecharDialog() : setEtapa(etapa - 1))}
              >
                {etapa === 1 ? 'Cancelar' : 'Voltar'}
              </Button>
              {etapa < 3 ? (
                <Button
                  type="button"
                  onClick={() => setEtapa(etapa + 1)}
                  disabled={(etapa === 1 && contatosImportados.length === 0) || (etapa === 2 && !podeAvancarEtapa1)}
                >
                  Próximo
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCriarCampanha('rascunho')}
                    disabled={!podeIniciar || isSalvandoCampanha}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleCriarCampanha('em_andamento')}
                    disabled={!podeIniciar || isSalvandoCampanha}
                  >
                    {isSalvandoCampanha ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Iniciando...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" /> Iniciar disparo</>
                    )}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo: Detalhe da campanha */}
        <Dialog open={!!campanhaDetalhe} onOpenChange={(open) => !open && setCampanhaDetalhe(null)}>
          <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">{campanhaDetalhe?.nome}</DialogTitle>
              <DialogDescription className="text-gray-600 whitespace-pre-wrap">
                {campanhaDetalhe?.mensagem_template}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingDetalhe ? (
                <div className="py-8 text-center text-gray-500 text-sm">Carregando...</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {destinatariosDetalhe.map((d) => (
                    <div key={d.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-gray-900 truncate">{d.nome || d.telefone}</p>
                          <p className="text-xs text-gray-500 font-mono">{d.telefone}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {d.status === 'enviado' && (
                            <span className="flex items-center gap-1 text-emerald-600 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Enviado
                            </span>
                          )}
                          {d.status === 'erro' && (
                            <>
                              <span className="flex items-center gap-1 text-red-600 text-xs">
                                <XCircle className="h-3.5 w-3.5" /> Erro
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs border-gray-300"
                                onClick={() => handleTentarNovamente(d)}
                              >
                                Tentar de novo
                              </Button>
                            </>
                          )}
                          {d.status === 'pendente' && (
                            <span className="flex items-center gap-1 text-gray-400 text-xs">
                              <Clock className="h-3.5 w-3.5" /> Na fila
                            </span>
                          )}
                          {d.status === 'enviando' && (
                            <span className="flex items-center gap-1 text-amber-600 text-xs">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando
                            </span>
                          )}
                          {d.status === 'cancelado' && (
                            <span className="flex items-center gap-1 text-gray-400 text-xs">
                              <X className="h-3.5 w-3.5" /> Cancelado
                            </span>
                          )}
                        </div>
                      </div>
                      {d.status === 'erro' && d.erro_detalhe && (
                        <p className="text-xs text-red-500 mt-1 break-words">{d.erro_detalhe}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!campanhaParaCancelar} onOpenChange={(open) => !open && setCampanhaParaCancelar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Cancelar campanha</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                Tem certeza que deseja cancelar "{campanhaParaCancelar?.nome}"? Os contatos que ainda não
                receberam a mensagem não serão mais processados. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700">Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelarCampanha} className="bg-red-600 text-white hover:bg-red-700">
                Sim, cancelar campanha
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!campanhaParaApagar} onOpenChange={(open) => !open && setCampanhaParaApagar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Apagar campanha</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                Tem certeza que deseja apagar "{campanhaParaApagar?.nome}"? A campanha e a lista de destinatários
                (com todos os status de envio) serão removidas permanentemente. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApagarCampanha}
                disabled={isApagandoCampanha}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {isApagandoCampanha ? 'Apagando...' : 'Sim, apagar campanha'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}