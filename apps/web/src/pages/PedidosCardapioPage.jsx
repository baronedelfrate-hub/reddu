import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, ShoppingBag, Phone, MapPin, Store, Clock, XCircle, ChevronRight, Eye, RotateCcw, CalendarClock, BellRing, Printer, Wallet, Archive, ArchiveRestore, Receipt, Timer,
} from 'lucide-react';
import RegistrarPagamentoModal from '@/components/pedidos-cardapio/RegistrarPagamentoModal';
import { useNFCeEmission } from '@/hooks/useNFCeEmission';

const COLUNAS = [
  { status: 'PENDENTE', label: 'Pendente', color: 'border-amber-300 bg-amber-50', dot: 'bg-amber-400' },
  { status: 'CONFIRMADO', label: 'Confirmado', color: 'border-blue-300 bg-blue-50', dot: 'bg-blue-400' },
  { status: 'EM_PREPARO', label: 'Em preparo', color: 'border-violet-300 bg-violet-50', dot: 'bg-violet-400' },
  { status: 'PRONTO', label: 'Pronto', color: 'border-emerald-300 bg-emerald-50', dot: 'bg-emerald-400' },
  { status: 'ENTREGUE', label: 'Entregue', color: 'border-gray-300 bg-gray-50', dot: 'bg-gray-400' },
];
const STATUS_ORDER = COLUNAS.map((c) => c.status);
const STATUS_LABEL = Object.fromEntries(COLUNAS.map((c) => [c.status, c.label]));
STATUS_LABEL.CANCELADO = 'Cancelado';

export default function PedidosCardapioPage() {
  const { empresaId, empresaNome } = useAuth();
  const { toast } = useToast();
  const { emitirNFCeHook } = useNFCeEmission();
  const [emitindoNfId, setEmitindoNfId] = useState(null);

  // Relógio compartilhado pelo contador de preparo de todos os cards — um só
  // setInterval pra tela inteira, em vez de um por card.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [pedidosNovosIds, setPedidosNovosIds] = useState(new Set());
  const idsConhecidosRef = useRef(null); // null = ainda não carregou nenhuma vez
  const [pagamentoTarget, setPagamentoTarget] = useState(null);
  const [arquivando, setArquivando] = useState(null); // id do pedido sendo (des)arquivado

  // Arquivados: entregues/cancelados há mais de 24h somem da fila automaticamente
  // (varredura horária no banco) pra não deixar a coluna "Entregue" gigante.
  // A lista só é buscada quando o usuário abre "Ver arquivados".
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [arquivados, setArquivados] = useState([]);
  const [carregandoArquivados, setCarregandoArquivados] = useState(false);

  // Impressão automática: quando o PIX de um pedido cai, ele avança sozinho
  // pra "Confirmado" (ver loadData) e, se essa opção estiver ligada, já
  // imprime na hora — sem precisar clicar em nada. Fica salvo por aparelho
  // (cada terminal/impressora pode querer um comportamento diferente).
  const [impressaoAutomatica, setImpressaoAutomatica] = useState(() => {
    try { return localStorage.getItem('cardapio_impressao_automatica') !== 'false'; } catch { return true; }
  });
  const toggleImpressaoAutomatica = () => {
    setImpressaoAutomatica((prev) => {
      const novo = !prev;
      try { localStorage.setItem('cardapio_impressao_automatica', String(novo)); } catch (e) { /* ignore */ }
      return novo;
    });
  };

  // statusPagamentoAnteriorRef: guarda o status_pagamento visto no último
  // loadData pra detectar a transição pendente → pago e avançar o pedido
  // sozinho pra "Confirmado". moverStatusRef sempre aponta pra versão mais
  // recente de moverStatus (definida mais abaixo), pra não usar closure
  // velha (loadData é memoizado e não é recriado a cada render).
  const statusPagamentoAnteriorRef = useRef({});
  const moverStatusRef = useRef(null);

  const tocarSom = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = (inicio, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + inicio);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + inicio);
        osc.stop(ctx.currentTime + inicio + 0.35);
      };
      beep(0, 880);
      beep(0.18, 1180);
    } catch (e) {
      console.warn('Não foi possível tocar o som de notificação:', e);
    }
  };

  const loadData = useCallback(async (silencioso = false) => {
    if (!empresaId) {
      if (!silencioso) setLoading(false);
      return;
    }
    if (!silencioso) setLoading(true);
    try {
      // vendas(...) traz o pagamento registrado na venda que a
      // rpc_criar_pedido_cardapio já cria por trás do pedido (ligada por
      // venda_id) — usado só pra decidir se mostra "Registrar pagamento" no
      // card (pedidos "pra pagar na entrega/retirada" criados pelo PDV
      // Pedidos Balcão). Nenhum total/status do pedido em si depende disso.
      const { data, error } = await supabase
        .from('pedidos_cardapio')
        .select('*, pedidos_cardapio_itens(*), vendas(financeiro_baixado, forma_pagamento, cpf_cliente, status_fiscal, nfe_url_pdf, nfe_erro_mensagem)')
        .eq('empresa_id', empresaId)
        .eq('arquivado', false)
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Pedidos agendados e do Balcão ficam na tela "Pedidos Agendados" enquanto
      // pendentes — só entram neste quadro quando alguém inicia a produção
      // (status deixa de ser PENDENTE). Assim o Pix de um agendado também não
      // empurra o pedido pra produção antes da hora.
      const novaLista = (data || []).filter((p) => !(p.status === 'PENDENTE' && (p.data_agendamento || p.origem === 'balcao')));
      const idsAtuais = new Set(novaLista.map((p) => p.id));

      if (idsConhecidosRef.current !== null) {
        const novos = novaLista.filter((p) => !idsConhecidosRef.current.has(p.id));
        if (novos.length > 0) {
          tocarSom();
          novos.forEach((p) => {
            toast({ title: `🔔 Novo pedido #${p.numero_pedido}`, description: p.cliente_nome });
          });
          setPedidosNovosIds((prev) => new Set([...prev, ...novos.map((p) => p.id)]));
          novos.forEach((p) => {
            setTimeout(() => {
              setPedidosNovosIds((prev) => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
            }, 15000);
          });
        }
      }
      idsConhecidosRef.current = idsAtuais;

      // PIX que acabou de cair: pedido ainda "Pendente" na fila mas o
      // pagamento virou "pago" desde o último loadData → avança sozinho pra
      // "Confirmado" (e imprime, se a impressão automática estiver ligada).
      const statusAnterior = statusPagamentoAnteriorRef.current;
      const pedidosRecemPagos = novaLista.filter((p) => (
        p.status === 'PENDENTE' && p.status_pagamento === 'pago' && statusAnterior[p.id] && statusAnterior[p.id] !== 'pago'
      ));
      statusPagamentoAnteriorRef.current = Object.fromEntries(novaLista.map((p) => [p.id, p.status_pagamento]));
      pedidosRecemPagos.forEach((p) => moverStatusRef.current?.(p, 'CONFIRMADO'));

      setPedidos(novaLista);
    } catch (error) {
      console.error('Erro ao carregar pedidos do cardápio:', error);
      if (!silencioso) toast({ title: 'Erro ao carregar pedidos', description: error.message, variant: 'destructive' });
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const rotuloFormaPagamento = (f) => {
    const mapa = {
      dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito',
      cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
    };
    const chave = String(f || '').toLowerCase();
    return mapa[chave] || (f ? String(f) : '');
  };

  // Bloco "Pagamento" do cupom: online (pago/aguardando) ou a cobrar na entrega/retirada.
  const montarPagamentoHtml = (pedido) => {
    const online = pedido.forma_pagamento_online;
    if (online) {
      const pago = pedido.status_pagamento === 'pago';
      return `<div class="info">Forma de pagamento: ${rotuloFormaPagamento(online)} (online)</div>`
        + `<div class="info bold">${pago ? '* PAGO - nao cobrar *' : '* PAGAMENTO ONLINE PENDENTE *'}</div>`;
    }
    const tipoEntrega = pedido.pagamento_entrega_tipo; // 'dinheiro' | 'cartao' | null (pedidos antigos)
    const forma = tipoEntrega === 'cartao' ? 'Cartão (maquininha)'
      : tipoEntrega === 'dinheiro' ? 'Dinheiro'
        : rotuloFormaPagamento(pedido.vendas?.forma_pagamento);
    const quando = pedido.tipo_entrega === 'entrega' ? 'na entrega' : 'na retirada';
    let html = `<div class="info">Forma de pagamento: ${forma && forma !== 'A combinar' ? `${forma} (${quando})` : `Pagar ${quando}`}</div>`;
    if (tipoEntrega === 'dinheiro') {
      const trocoPara = Number(pedido.troco_para || 0);
      html += trocoPara > 0
        ? `<div class="info">Troco para: ${formatPreco(trocoPara)} (troco ${formatPreco(Math.max(0, trocoPara - Number(pedido.total || 0)))})</div>`
        : `<div class="info">Troco: Nao precisa</div>`;
    }
    if (tipoEntrega === 'cartao' && pedido.taxa_retorno_aplicada) {
      html += `<div class="info">Taxa de entrega inclui retorno da maquininha</div>`;
    }
    return html + `<div class="info bold">* Cobrar do cliente *</div>`;
  };

  const imprimirPedido = (pedido) => {
    try {
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) {
        toast({ title: 'Popup bloqueado', description: 'Permita popups para este site pra imprimir automaticamente.', variant: 'destructive' });
        return;
      }

      const linhas = agruparItens(pedido);
      const taxaCupom = Number(pedido.taxa_entrega || 0);
      const descontoCupom = Number(pedido.desconto_aplicado || 0);
      const subtotalCupom = Math.max(0, Number(pedido.total || 0) - taxaCupom + descontoCupom);
      const itensHtml = linhas.map((linha) => {
        if (linha.tipo === 'simples') {
          return `<div class="linha"><span>${linha.item.quantidade}x ${linha.item.nome_item}</span><span>${formatPreco(linha.item.subtotal)}</span></div>`;
        }
        const saboresHtml = linha.sabores.map((s) => `<div class="sabor">${s.quantidade}x ${s.nome_item} — ${formatPreco(s.subtotal)}</div>`).join('');
        const totalGrupo = linha.header.subtotal + linha.sabores.reduce((s, x) => s + x.subtotal, 0);
        return `<div class="linha bold"><span>${linha.header.quantidade}x ${linha.header.nome_item}</span><span>${formatPreco(totalGrupo)}</span></div>${saboresHtml}`;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Pedido #${pedido.numero_pedido}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; width: 80mm; padding: 3mm; }
              @page { size: 80mm auto; margin: 0mm; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .titulo { font-size: 16px; font-weight: bold; }
              .divisor { border-top: 1px dashed #000; margin: 2mm 0; }
              .linha { display: flex; justify-content: space-between; margin-top: 1mm; }
              .sabor { padding-left: 3mm; font-size: 11px; }
              .info { margin-top: 1mm; }
              .total { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 2mm; }
            </style>
          </head>
          <body>
            <div class="center titulo">${empresaNome || 'Cardápio Digital'}</div>
            <div class="center bold" style="font-size:14px;margin-top:1mm;">PEDIDO #${pedido.numero_pedido}</div>
            <div class="divisor"></div>
            <div class="info bold">${pedido.cliente_nome}</div>
            <div class="info">Tel: ${pedido.cliente_telefone}</div>
            <div class="info">${pedido.tipo_entrega === 'entrega' ? `Entrega: ${pedido.endereco_entrega || ''}` : 'Retirada no local'}</div>
            ${pedido.data_agendamento ? `<div class="info bold">Agendado para: ${formatHora(pedido.data_agendamento)}</div>` : ''}
            <div class="divisor"></div>
            ${itensHtml}
            <div class="divisor"></div>
            ${pedido.observacao ? `<div class="info">Obs: ${pedido.observacao}</div><div class="divisor"></div>` : ''}
            <div class="linha"><span>Subtotal</span><span>${formatPreco(subtotalCupom)}</span></div>
            ${taxaCupom > 0 ? `<div class="linha"><span>Taxa de entrega</span><span>${formatPreco(taxaCupom)}</span></div>` : (pedido.tipo_entrega === 'entrega' ? `<div class="linha"><span>Taxa de entrega</span><span>Gratis</span></div>` : '')}
            ${descontoCupom > 0 ? `<div class="linha"><span>Desconto${pedido.cupom_codigo ? ` (${pedido.cupom_codigo})` : ''}</span><span>-${formatPreco(descontoCupom)}</span></div>` : ''}
            <div class="total"><span>TOTAL</span><span>${formatPreco(pedido.total)}</span></div>
            <div class="divisor"></div>
            <div class="bold">Pagamento</div>
            ${montarPagamentoHtml(pedido)}
            <div class="center info" style="margin-top:2mm;">${formatHora(pedido.created_at)}</div>
          </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();

      const executarPrint = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      };
      printWindow.onload = () => setTimeout(executarPrint, 400);
      setTimeout(() => { if (!printWindow.closed) executarPrint(); }, 1200);
    } catch (error) {
      console.error('Erro ao imprimir pedido:', error);
      toast({ title: 'Erro ao imprimir', description: error.message, variant: 'destructive' });
    }
  };

  const [whatsappConfig, setWhatsappConfig] = useState(null);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(false);
  const [mensagensConfig, setMensagensConfig] = useState({});

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      try {
        const [{ data: wConfig }, { data: empresaData }] = await Promise.all([
          supabase.from('whatsapp_configuracoes').select('base_url, instance_name').eq('empresa_id', empresaId).maybeSingle(),
          supabase.from('empresas').select('cardapio_config').eq('id', empresaId).maybeSingle(),
        ]);
        setWhatsappConfig(wConfig || null);
        setNotificacoesAtivas(!!empresaData?.cardapio_config?.whatsapp_notificacoes_pedido_ativo);
        setMensagensConfig(empresaData?.cardapio_config || {});
      } catch (error) {
        console.error('Erro ao carregar config de WhatsApp:', error);
      }
    })();
  }, [empresaId]);

  const aplicarTokens = (template, pedido) => template
    .replaceAll('{numero}', pedido.numero_pedido)
    .replaceAll('{total}', Number(pedido.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

  const STATUS_MENSAGEM_CLIENTE = {
    CONFIRMADO: (p) => aplicarTokens(mensagensConfig.whatsapp_msg_confirmado?.trim() || 'Seu pedido #{numero} foi confirmado! ✅', p),
    EM_PREPARO: (p) => aplicarTokens(mensagensConfig.whatsapp_msg_em_preparo?.trim() || 'Seu pedido #{numero} está sendo preparado agora! 👨‍🍳', p),
    PRONTO: (p) => {
      const padrao = `Seu pedido #{numero} está pronto${p.tipo_entrega === 'entrega' ? ' e vai sair para entrega' : ' para retirada'}! 🎉`;
      return aplicarTokens(mensagensConfig.whatsapp_msg_pronto?.trim() || padrao, p);
    },
    ENTREGUE: (p) => aplicarTokens(mensagensConfig.whatsapp_msg_entregue?.trim() || 'Pedido #{numero} entregue! Obrigado pela preferência 🙏', p),
    CANCELADO: (p) => aplicarTokens(mensagensConfig.whatsapp_msg_cancelado?.trim() || 'Seu pedido #{numero} foi cancelado.', p),
  };

  const STATUS_TOGGLE_CONFIG_KEY = {
    CONFIRMADO: 'whatsapp_notif_confirmado_ativo',
    EM_PREPARO: 'whatsapp_notif_em_preparo_ativo',
    PRONTO: 'whatsapp_notif_pronto_ativo',
    ENTREGUE: 'whatsapp_notif_entregue_ativo',
    CANCELADO: 'whatsapp_notif_cancelado_ativo',
  };

  const notificarClienteWhatsApp = async (pedido, novoStatus) => {
    if (!notificacoesAtivas || !whatsappConfig?.base_url || !whatsappConfig?.instance_name) return;
    const chaveToggle = STATUS_TOGGLE_CONFIG_KEY[novoStatus];
    if (chaveToggle && mensagensConfig[chaveToggle] === false) return;
    const gerarTexto = STATUS_MENSAGEM_CLIENTE[novoStatus];
    if (!gerarTexto) return;
    try {
      await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'sendText',
          base_url: whatsappConfig.base_url,
          instance_name: whatsappConfig.instance_name,
          numero: pedido.cliente_telefone,
          texto: gerarTexto(pedido),
        },
      });
    } catch (error) {
      console.error('Erro ao notificar cliente por WhatsApp:', error);
    }
  };

  const moverStatus = async (pedido, novoStatus) => {
    if (pedido.forma_pagamento_online && pedido.status_pagamento !== 'pago' && novoStatus !== 'CANCELADO') {
      toast({
        title: 'Pagamento ainda não confirmado',
        description: pedido.status_pagamento === 'falhou'
          ? 'O PIX desse pedido falhou. Cancele ou aguarde o cliente tentar de novo.'
          : 'Aguarde o PIX cair antes de avançar esse pedido (ou cancele).',
        variant: 'destructive',
      });
      return;
    }
    try {
      if (novoStatus === 'EM_PREPARO') {
        const { error } = await supabase.rpc('rpc_confirmar_preparo_pedido_cardapio', { p_pedido_id: pedido.id });
        if (error) throw error;
        toast({ title: `Pedido #${pedido.numero_pedido} em preparo`, description: pedido.estoque_baixado ? undefined : 'Estoque baixado agora.' });
        notificarClienteWhatsApp(pedido, novoStatus);
        loadData();
        return;
      }
      const { error } = await supabase.rpc('rpc_atualizar_status_pedido_cardapio', { p_pedido_id: pedido.id, p_novo_status: novoStatus });
      if (error) throw error;
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status: novoStatus } : p)));
      notificarClienteWhatsApp(pedido, novoStatus);
      if (novoStatus === 'CONFIRMADO' && impressaoAutomatica) {
        imprimirPedido(pedido);
      }
    } catch (error) {
      toast({ title: 'Erro ao atualizar status', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    }
  };

  // Mantém moverStatusRef sempre na versão mais recente de moverStatus, pra
  // o auto-avanço disparado de dentro do loadData (que é memoizado e não
  // "vê" closures novas) nunca usar uma versão velha.
  useEffect(() => { moverStatusRef.current = moverStatus; });

  const handleCancelar = async () => {
    if (!cancelTarget) return;
    setCanceling(true);
    try {
      const { error } = await supabase.rpc('rpc_cancelar_pedido_cardapio', { p_pedido_id: cancelTarget.id });
      if (error) throw error;
      toast({ title: 'Pedido cancelado', description: 'O estoque foi devolvido automaticamente.' });
      notificarClienteWhatsApp(cancelTarget, 'CANCELADO');
      setCancelTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao cancelar pedido', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setCanceling(false);
    }
  };

  const arquivarPedido = async (pedido) => {
    setArquivando(pedido.id);
    try {
      const { error } = await supabase.rpc('rpc_arquivar_pedido_cardapio', { p_pedido_id: pedido.id, p_arquivar: true });
      if (error) throw error;
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
    } catch (error) {
      toast({ title: 'Erro ao arquivar pedido', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setArquivando(null);
    }
  };

  const carregarArquivados = useCallback(async () => {
    if (!empresaId) return;
    setCarregandoArquivados(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_cardapio')
        .select('*, pedidos_cardapio_itens(*), vendas(financeiro_baixado, forma_pagamento, cpf_cliente, status_fiscal, nfe_url_pdf, nfe_erro_mensagem)')
        .eq('empresa_id', empresaId)
        .eq('arquivado', true)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setArquivados(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar arquivados', description: error.message, variant: 'destructive' });
    } finally {
      setCarregandoArquivados(false);
    }
  }, [empresaId, toast]);

  const toggleMostrarArquivados = () => {
    const novoValor = !mostrarArquivados;
    setMostrarArquivados(novoValor);
    if (novoValor && arquivados.length === 0) carregarArquivados();
  };

  const desarquivarPedido = async (pedido) => {
    setArquivando(pedido.id);
    try {
      const { error } = await supabase.rpc('rpc_arquivar_pedido_cardapio', { p_pedido_id: pedido.id, p_arquivar: false });
      if (error) throw error;
      setArquivados((prev) => prev.filter((p) => p.id !== pedido.id));
      toast({ title: `Pedido #${pedido.numero_pedido} restaurado pro Kanban` });
      loadData(true);
    } catch (error) {
      toast({ title: 'Erro ao desarquivar pedido', description: error.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setArquivando(null);
    }
  };

  const formatPreco = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatHora = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // Tempo de preparo configurado em Cardápio Digital > Configurações (padrão
  // 30min se a loja nunca configurou). Mesmo cardapio_config já carregado
  // acima pras mensagens de WhatsApp.
  const tempoPreparoMinutos = Number(mensagensConfig.tempo_preparo_minutos) > 0 ? Number(mensagensConfig.tempo_preparo_minutos) : 30;

  // Contador regressivo de preparo: só faz sentido enquanto o pedido ainda
  // está sendo preparado (some depois de Pronto/Entregue/Cancelado).
  const STATUS_COM_CONTADOR = ['PENDENTE', 'CONFIRMADO', 'EM_PREPARO'];
  const contadorPreparo = (pedido) => {
    if (!STATUS_COM_CONTADOR.includes(pedido.status)) return null;
    const prazo = new Date(pedido.created_at).getTime() + tempoPreparoMinutos * 60000;
    const restanteMs = prazo - agora;
    const atrasado = restanteMs <= 0;
    const totalSeg = Math.floor(Math.abs(restanteMs) / 1000);
    const mm = String(Math.floor(totalSeg / 60)).padStart(2, '0');
    const ss = String(totalSeg % 60).padStart(2, '0');
    return { atrasado, texto: atrasado ? `Atrasado ${mm}:${ss}` : `Prepare em até ${mm}:${ss}` };
  };

  // Emissão de NFC-e pro pedido do cardápio: busca os itens já vinculados a
  // produto (NCM/CFOP/etc. vêm do cadastro de produto) e monta o payload no
  // mesmo formato usado pelo PDV. Itens "cabeçalho" de combo sem preço
  // próprio (preço fica todo nos sabores) são ignorados pra não entrar uma
  // linha de R$ 0,00 na nota.
  const handleEmitirNFCe = async (pedido) => {
    if (pedido.vendas?.status_fiscal === 'emitido') {
      if (pedido.vendas?.nfe_url_pdf) window.open(pedido.vendas.nfe_url_pdf, '_blank');
      return;
    }
    if (!pedido.venda_id) {
      toast({ title: 'Pedido sem venda vinculada', variant: 'destructive' });
      return;
    }
    setEmitindoNfId(pedido.id);
    try {
      const { data: itensVenda, error: itensError } = await supabase
        .from('pedidos_cardapio_itens')
        .select('*, produtos(nome, ncm, cfop_padrao, barcode, origem_produto)')
        .eq('pedido_id', pedido.id);
      if (itensError) throw itensError;

      const items = (itensVenda || [])
        .filter((item) => !(item.produto_id === null && Number(item.preco_unitario || 0) === 0))
        .map((item) => ({
          produto_id: item.produto_id,
          produto_nome: item.produtos?.nome || item.nome_item,
          nome: item.nome_item,
          ncm: item.produtos?.ncm,
          cfop_padrao: item.produtos?.cfop_padrao,
          barcode: item.produtos?.barcode,
          origem_produto: item.produtos?.origem_produto,
          quantidade: item.quantidade,
          preco: item.preco_unitario,
          tipo_item: 'NORMAL',
        }));

      if (items.length === 0) {
        toast({ title: 'Pedido sem itens pra emitir nota', variant: 'destructive' });
        return;
      }

      const vendaPayload = {
        id: pedido.venda_id,
        cliente_referencia: pedido.cliente_nome,
        items,
        total_final: pedido.total,
        taxa_motoboy: Number(pedido.taxa_entrega || 0),
        desconto: Number(pedido.desconto_aplicado || 0),
        forma_pagamento: pedido.vendas?.forma_pagamento || pedido.forma_pagamento_online || 'dinheiro',
        cpf_cliente: pedido.vendas?.cpf_cliente || null,
      };

      await emitirNFCeHook(vendaPayload, empresaId);
      loadData(true);
    } catch (error) {
      toast({ title: 'Erro ao emitir NFC-e', description: error.message, variant: 'destructive' });
    } finally {
      setEmitindoNfId(null);
    }
  };

  // Agrupa linhas de combo (cabeçalho + sabores) numa única "linha lógica",
  // e mantém itens simples como estavam.
  const agruparItens = (pedido) => {
    const grupos = {};
    const linhas = [];
    pedido.pedidos_cardapio_itens.forEach((item) => {
      if (item.combo_grupo_id) {
        grupos[item.combo_grupo_id] = grupos[item.combo_grupo_id] || { header: null, sabores: [] };
        if (item.produto_id === null) {
          grupos[item.combo_grupo_id].header = item;
        } else {
          grupos[item.combo_grupo_id].sabores.push(item);
        }
      } else {
        linhas.push({ tipo: 'simples', item });
      }
    });
    Object.values(grupos).forEach((g) => {
      if (g.header) linhas.push({ tipo: 'combo', header: g.header, sabores: g.sabores });
    });
    return linhas;
  };

  const pedidosPorStatus = (status) => pedidos.filter((p) => p.status === status);
  const cancelados = pedidos.filter((p) => p.status === 'CANCELADO');

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
      <Helmet><title>Pedidos do Cardápio - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="h-6 w-6" /> Pedidos do Cardápio Digital
            </h1>
            <p className="text-gray-500 text-sm">Arraste o pedido de fase clicando em "Avançar". Entregues/cancelados somem daqui 24h depois, automaticamente.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={toggleImpressaoAutomatica}
              title="Quando ligado, o pedido já sai imprimindo sozinho assim que é confirmado (inclusive quando o PIX cai automaticamente)."
            >
              <Printer className="h-3.5 w-3.5" /> Impressão {impressaoAutomatica ? 'automática' : 'manual'}
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setMostrarCancelados((v) => !v)}
            >
              {mostrarCancelados ? 'Ocultar cancelados' : `Ver cancelados (${cancelados.length})`}
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={toggleMostrarArquivados}
            >
              <Archive className="h-3.5 w-3.5" /> {mostrarArquivados ? 'Ocultar arquivados' : 'Ver arquivados'}
            </Button>
          </div>
        </div>

        {/* Kanban: colunas por fase, scroll horizontal no celular */}
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
          {COLUNAS.map((col) => {
            const lista = pedidosPorStatus(col.status);
            return (
              <div key={col.status} className="shrink-0 w-[85vw] max-w-[320px] md:w-72 snap-center">
                <div className={`rounded-t-xl border px-3 py-2 flex items-center justify-between ${col.color}`}>
                  <span className="font-semibold text-gray-800 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} /> {col.label}
                  </span>
                  <span className="text-sm font-bold text-gray-600">{lista.length}</span>
                </div>
                <div className="border border-t-0 rounded-b-xl bg-white min-h-[120px] p-2 space-y-2">
                  {lista.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">Vazio</p>
                  )}
                  {lista.map((pedido) => {
                    const idx = STATUS_ORDER.indexOf(pedido.status);
                    const proximo = STATUS_ORDER[idx + 1];
                    const aberto = expandido === pedido.id;
                    return (
                      <div
                        key={pedido.id}
                        className={`border rounded-lg p-2.5 bg-gray-50 ${pedidosNovosIds.has(pedido.id) ? 'border-red-400 border-2 animate-pulse' : ''
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              <span className="text-gray-400 font-normal">#{pedido.numero_pedido}</span> {pedido.cliente_nome}
                              {pedidosNovosIds.has(pedido.id) && (
                                <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 align-middle">
                                  <BellRing className="h-2.5 w-2.5" /> NOVO
                                </span>
                              )}
                              {pedido.forma_pagamento_online && pedido.status_pagamento === 'pendente' && (
                                <span className="ml-1 inline-flex items-center text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 align-middle">
                                  ⏳ Aguardando PIX
                                </span>
                              )}
                              {pedido.forma_pagamento_online && pedido.status_pagamento === 'pago' && (
                                <span className="ml-1 inline-flex items-center text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 align-middle">
                                  ✓ Pago
                                </span>
                              )}
                              {pedido.forma_pagamento_online && pedido.status_pagamento === 'falhou' && (
                                <span className="ml-1 inline-flex items-center text-[10px] bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 align-middle">
                                  ✕ Pagamento falhou
                                </span>
                              )}
                              {pedido.vendas?.financeiro_baixado === false && !pedido.forma_pagamento_online && (
                                <span className="ml-1 inline-flex items-center text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 align-middle">
                                  💳 Pagamento pendente
                                </span>
                              )}
                              {pedido.pagamento_entrega_tipo && !pedido.forma_pagamento_online && (
                                <span className="ml-1 inline-flex items-center text-[10px] bg-sky-100 text-sky-700 rounded-full px-1.5 py-0.5 align-middle">
                                  {pedido.pagamento_entrega_tipo === 'cartao' ? '💳 Cartão na entrega' : `💵 Dinheiro${Number(pedido.troco_para) > 0 ? ` (troco p/ ${Number(pedido.troco_para).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}`}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {formatHora(pedido.created_at)}
                            </p>
                            {contadorPreparo(pedido) && (
                              <p className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${contadorPreparo(pedido).atrasado ? 'text-red-600' : 'text-gray-600'}`}>
                                <Timer className="h-3 w-3" /> {contadorPreparo(pedido).texto}
                              </p>
                            )}
                            {pedido.data_agendamento && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-flex items-center gap-1 font-medium">
                                <CalendarClock className="h-3 w-3" /> {formatHora(pedido.data_agendamento)}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-bold text-gray-900 shrink-0">{formatPreco(pedido.total)}</span>
                        </div>

                        <button
                          className="text-xs text-blue-600 flex items-center gap-1 mt-1.5"
                          onClick={() => setExpandido(aberto ? null : pedido.id)}
                        >
                          <Eye className="h-3 w-3" /> {aberto ? 'Ocultar detalhes' : `${agruparItens(pedido).length} ${agruparItens(pedido).length === 1 ? 'item' : 'itens'}`}
                        </button>

                        {aberto && (
                          <div className="mt-2 space-y-1.5 border-t pt-2">
                            {agruparItens(pedido).map((linha) => (
                              linha.tipo === 'simples' ? (
                                <div key={linha.item.id} className="flex justify-between text-xs text-gray-600">
                                  <span>{linha.item.quantidade}x {linha.item.nome_item}</span>
                                  <span>{formatPreco(linha.item.subtotal)}</span>
                                </div>
                              ) : (
                                <div key={linha.header.id} className="text-xs text-gray-600">
                                  <div className="flex justify-between font-medium">
                                    <span>{linha.header.quantidade}x {linha.header.nome_item}</span>
                                    <span>{formatPreco(linha.header.subtotal + linha.sabores.reduce((s, x) => s + x.subtotal, 0))}</span>
                                  </div>
                                  <div className="pl-2 text-gray-400 space-y-0.5 mt-0.5">
                                    {linha.sabores.map((s) => (
                                      <p key={s.id}>{s.quantidade}x {s.nome_item}{s.subtotal > 0 ? ` — ${formatPreco(s.subtotal)}` : ''}</p>
                                    ))}
                                  </div>
                                </div>
                              )
                            ))}
                            <p className="text-xs text-gray-500 flex items-center gap-1 pt-1">
                              <Phone className="h-3 w-3" /> {pedido.cliente_telefone}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              {pedido.tipo_entrega === 'entrega' ? <MapPin className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                              {pedido.tipo_entrega === 'entrega' ? pedido.endereco_entrega : 'Retirada no local'}
                            </p>
                            {pedido.observacao && (
                              <p className="text-xs text-gray-500 italic">"{pedido.observacao}"</p>
                            )}
                          </div>
                        )}

                        {pedido.vendas?.financeiro_baixado === false && !pedido.forma_pagamento_online && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs w-full mt-2 gap-1 text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
                            onClick={() => setPagamentoTarget(pedido)}
                          >
                            <Wallet className="h-3 w-3" /> Registrar pagamento
                          </Button>
                        )}

                        <div className="flex gap-1.5 mt-2">
                          {proximo && (
                            <Button size="sm" className="h-7 text-xs flex-1 px-2" onClick={() => moverStatus(pedido, proximo)}>
                              Avançar <ChevronRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          )}
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs px-2"
                            onClick={() => imprimirPedido(pedido)}
                          >
                            <Printer className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className={`h-7 text-xs px-2 gap-1 ${pedido.vendas?.status_fiscal === 'emitido' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' :
                                pedido.vendas?.status_fiscal === 'erro' ? 'text-red-600 border-red-200' : ''
                              }`}
                            onClick={() => handleEmitirNFCe(pedido)}
                            disabled={emitindoNfId === pedido.id}
                            title={pedido.vendas?.status_fiscal === 'erro' ? (pedido.vendas?.nfe_erro_mensagem || 'Erro ao emitir — clique pra tentar de novo') : pedido.vendas?.status_fiscal === 'emitido' ? 'Ver NFC-e' : 'Emitir NFC-e'}
                          >
                            {emitindoNfId === pedido.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
                            {pedido.vendas?.status_fiscal === 'emitido' ? 'NF ✓' : pedido.vendas?.status_fiscal === 'erro' ? 'NF ⚠' : 'NF'}
                          </Button>
                          {col.status === 'ENTREGUE' && (
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs px-2 text-gray-500"
                              onClick={() => arquivarPedido(pedido)}
                              disabled={arquivando === pedido.id}
                              title="Arquivar agora"
                            >
                              {arquivando === pedido.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                            </Button>
                          )}
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs px-2 text-red-600 border-red-200"
                            onClick={() => setCancelTarget(pedido)}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {mostrarCancelados && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Cancelados
            </h2>
            {cancelados.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum pedido cancelado.</p>
            ) : (
              <div className="space-y-2">
                {cancelados.map((pedido) => (
                  <div key={pedido.id} className="border rounded-lg p-2.5 bg-gray-50 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-700 text-sm">#{pedido.numero_pedido} {pedido.cliente_nome}</p>
                      <p className="text-xs text-gray-400">{formatHora(pedido.created_at)}</p>
                    </div>
                    <span className="text-sm text-gray-500">{formatPreco(pedido.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mostrarArquivados && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <Archive className="h-3.5 w-3.5" /> Arquivados (entregues/cancelados há mais de 24h)
            </h2>
            {carregandoArquivados ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : arquivados.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum pedido arquivado ainda.</p>
            ) : (
              <div className="space-y-2">
                {arquivados.map((pedido) => (
                  <div key={pedido.id} className="border rounded-lg p-2.5 bg-gray-50 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 text-sm truncate">
                        #{pedido.numero_pedido} {pedido.cliente_nome}
                        <span className="ml-1.5 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 align-middle">
                          {STATUS_LABEL[pedido.status] || pedido.status}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">{formatHora(pedido.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-gray-500">{formatPreco(pedido.total)}</span>
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs px-2 gap-1"
                        onClick={() => desarquivarPedido(pedido)}
                        disabled={arquivando === pedido.id}
                        title="Desarquivar"
                      >
                        {arquivando === pedido.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido #{cancelTarget?.numero_pedido} de {cancelTarget?.cliente_nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O estoque de cada item desse pedido será devolvido automaticamente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelar} disabled={canceling} className="bg-red-600 hover:bg-red-700">
              {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancelar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RegistrarPagamentoModal
        isOpen={!!pagamentoTarget}
        onClose={() => setPagamentoTarget(null)}
        pedido={pagamentoTarget}
        onSuccess={() => loadData(true)}
      />
    </DashboardLayout>
  );
}