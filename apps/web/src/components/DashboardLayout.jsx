import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import AlertsBell from '@/components/AlertsBell';
import StatusRapidoBar from '@/components/StatusRapidoBar';
import AgendadosAlertas from '@/components/AgendadosAlertas';
import AtendenteAlerta from '@/components/AtendenteAlerta';
import MensalidadeAlerta from '@/components/MensalidadeAlerta';
import {
  LayoutDashboard, Users, MapPin, Package, Boxes, ArrowRightLeft, LogOut, Menu, X, Loader2,
  ListTree, Bell, ShoppingCart, Settings, PackagePlus, FileText, History, Factory, RotateCcw,
  BarChart3, Truck, Lock, ChevronDown, ChevronRight, ClipboardList, Printer, Settings2, Store,
  Zap, ChevronLeft, ShieldAlert, Smartphone, Activity, Building2, Clock, ScanBarcode, CheckSquare,
  Receipt, Calendar, ClipboardCheck, TrendingUp, Sparkles, MessageCircle, Send, AlertCircle, Search,
  UtensilsCrossed, ShoppingBag, Tag, UserCog, Landmark, Scale, Bike, CreditCard, Wallet, CalendarClock, Coins
} from 'lucide-react';

// ─── Símbolo Reddu (três pontos conectados) ─────────────────────────────────
const ReddulIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none">
    <line x1="10" y1="24" x2="36" y2="10" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="10" y1="24" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="36" y1="10" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="10" cy="24" r="7" fill="currentColor" />
    <circle cx="36" cy="10" r="5.2" fill="currentColor" />
    <circle cx="36" cy="38" r="5.2" fill="currentColor" />
  </svg>
);

export default function DashboardLayout({ children }) {
  const { currentUser, empresaNome, empresaId, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [empresaLogoUrl, setEmpresaLogoUrl] = useState(null);
  const sidebarNavRef = useRef(null);
  const sidebarMontadoEmRef = useRef(Date.now());

  // ─── NOVO: controle de acesso por perfil (super-admin + telas liberadas) ───
  // Não depende do AuthContext — consulta direta pra não precisar tocar nele.
  // telasGovernadas = todo href que existe no catálogo de telas (o resto
  // fica liberado por padrão, "fail-open", pra nunca travar algo que eu
  // não tenha catalogado ainda). telasLiberadas = subconjunto que o perfil
  // do usuário logado realmente tem marcado.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [telasLiberadas, setTelasLiberadas] = useState(() => new Set());
  const [telasGovernadas, setTelasGovernadas] = useState(() => new Set());
  const [carregandoAcesso, setCarregandoAcesso] = useState(true);

  useEffect(() => {
    let ativo = true;
    const carregarAcesso = async () => {
      if (!currentUser?.id) {
        if (ativo) {
          setIsSuperAdmin(false);
          setTelasLiberadas(new Set());
          setCarregandoAcesso(false);
        }
        return;
      }

      const [{ data: usuarioData }, { data: todasTelas }] = await Promise.all([
        supabase.from('usuarios').select('is_super_admin, perfil_id').eq('id', currentUser.id).single(),
        supabase.from('telas').select('chave').eq('ativo', true),
      ]);

      if (!ativo) return;

      setIsSuperAdmin(!!usuarioData?.is_super_admin);
      setTelasGovernadas(new Set((todasTelas || []).map((t) => t.chave)));

      if (usuarioData?.perfil_id) {
        const { data: vinculos } = await supabase
          .from('perfil_telas')
          .select('telas(chave)')
          .eq('perfil_id', usuarioData.perfil_id);
        if (ativo) {
          setTelasLiberadas(new Set((vinculos || []).map((v) => v.telas?.chave).filter(Boolean)));
        }
      } else if (ativo) {
        setTelasLiberadas(new Set());
      }

      if (ativo) setCarregandoAcesso(false);
    };
    carregarAcesso();
    return () => { ativo = false; };
  }, [currentUser?.id]);

  // true = pode acessar. Super-admin sempre pode; rota fora do catálogo
  // de telas (fail-open) sempre pode; senão, depende do perfil.
  const itemLiberado = (href) => isSuperAdmin || !telasGovernadas.has(href) || telasLiberadas.has(href);

  // Acha a tela mais específica que "governa" o caminho atual (considerando
  // subrotas, ex: /dashboard/eventos/novo cai sob /dashboard/eventos).
  const encontrarTelaGovernante = (pathname) => {
    let melhor = null;
    telasGovernadas.forEach((chave) => {
      const bateExato = pathname === chave;
      const bataPrefixo = chave !== '/dashboard' && pathname.startsWith(chave + '/');
      if ((bateExato || bataPrefixo) && (!melhor || chave.length > melhor.length)) {
        melhor = chave;
      }
    });
    return melhor;
  };

  const telaGovernanteAtual = isSuperAdmin ? null : encontrarTelaGovernante(location.pathname);
  const acessoPaginaAtualLiberado = isSuperAdmin || !telaGovernanteAtual || telasLiberadas.has(telaGovernanteAtual);
  // ─────────────────────────────────────────────────────────────────────────

  const handleSidebarScroll = (e) => {
    sessionStorage.setItem('sidebarScrollTop', String(e.currentTarget.scrollTop));
  };

  useEffect(() => {
    const salvo = sessionStorage.getItem('sidebarScrollTop');
    if (!salvo || !sidebarNavRef.current) return;
    if (Date.now() - sidebarMontadoEmRef.current > 600) return;
    sidebarNavRef.current.scrollTop = Number(salvo);
  });

  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem('sidebarMinimized');
    if (saved !== null) return JSON.parse(saved);
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
    if (location.pathname.includes('/pdv')) return true;
    return false;
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [openSections, setOpenSections] = useState({});

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const initDescarteAndFetchLogo = async () => {
      if (!empresaId) return;
      try {
        const { data, error } = await supabase
          .from('empresas')
          .select('logo_url')
          .eq('id', empresaId)
          .single();
        if (!error && data) setEmpresaLogoUrl(data.logo_url);
      } catch (err) {
        console.error("Erro ao buscar logo da empresa:", err);
      }
      if (!sessionStorage.getItem('descarte_initialized')) {
        try {
          await supabase.functions.invoke('initialize-descarte-local', { body: { empresa_id: empresaId } });
          sessionStorage.setItem('descarte_initialized', 'true');
        } catch (error) {
          console.error('Error initializing descarte location:', error);
        }
      }
    };
    initDescarteAndFetchLogo();
  }, [empresaId]);

  useEffect(() => {
    if (location.pathname.includes('/pdv')) setIsMinimized(true);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('sidebarMinimized', JSON.stringify(isMinimized));
  }, [isMinimized]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && mobileSidebarOpen) setMobileSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileSidebarOpen]);

  // ─── Badge de pedidos novos do Cardápio Digital ─────────────────────────────
  // Conta pedidos parados na coluna "Pendente" do Kanban (ainda não atendidos)
  // e mostra um badge no menu — igual ao contador de não lidas do WhatsApp —
  // pra não passar batido se a tela do cardápio for fechada sem querer.
  const [pedidosCardapioNovos, setPedidosCardapioNovos] = useState(0);
  // Pedidos agendados / do balcão aguardando aceite (tela Pedidos Agendados)
  const [pedidosAgendadosPendentes, setPedidosAgendadosPendentes] = useState(0);

  // Toca um beep audível pra novo pedido, não importa em qual tela do
  // dashboard o usuário está (antes só tocava som dentro da própria tela de
  // Pedidos do Cardápio Digital).
  const tocarSomNovoPedido = () => {
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

  useEffect(() => {
    if (!empresaId) return;
    let ativo = true;

    // Pedidos agendados e do balcão NÃO ficam no quadro do cardápio enquanto
    // pendentes — têm tela e contador próprios (Pedidos Agendados).
    const fetchPedidosPendentes = async () => {
      const [{ count }, { count: countAgendados }] = await Promise.all([
        supabase
          .from('pedidos_cardapio')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'PENDENTE')
          .eq('arquivado', false)
          .is('data_agendamento', null)
          .neq('origem', 'balcao'),
        supabase
          .from('pedidos_cardapio')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'PENDENTE')
          .eq('arquivado', false)
          .is('aceito_em', null)
          .or('data_agendamento.not.is.null,origem.eq.balcao'),
      ]);
      if (ativo) {
        setPedidosCardapioNovos(count || 0);
        setPedidosAgendadosPendentes(countAgendados || 0);
      }
    };

    fetchPedidosPendentes();

    const channel = supabase
      .channel(`pedidos_cardapio_badge_${empresaId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_cardapio', filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          fetchPedidosPendentes();

          const ehPedidoNovo = payload.eventType === 'INSERT' && payload.new?.status === 'PENDENTE';
          if (!ehPedidoNovo) return;

          const abaEmFoco = document.visibilityState === 'visible' && document.hasFocus();
          const ehAgendado = !!payload.new?.data_agendamento || payload.new?.origem === 'balcao';
          const rotaPedidos = ehAgendado ? '/dashboard/pedidos-agendados' : '/dashboard/cardapio/pedidos';
          const naTelaDePedidos = location.pathname.startsWith(rotaPedidos);

          // A tela de Pedidos do Cardápio Digital já toca o próprio som e
          // mostra o próprio toast (via polling dela) — aqui é só pro
          // usuário não perder o pedido quando está em QUALQUER outra tela
          // do dashboard (inclusive com a aba em foco, que é quando o
          // Notification() do navegador abaixo fica suprimido).
          if (!naTelaDePedidos) {
            tocarSomNovoPedido();
            toast({
              title: `🔔 Novo pedido${ehAgendado ? ' agendado' : ''} #${payload.new?.numero_pedido ?? ''}`,
              description: payload.new?.cliente_nome ? `Pedido de ${payload.new.cliente_nome}` : 'Um novo pedido acabou de chegar no Cardápio Digital.',
              action: (
                <Button size="sm" onClick={() => navigate(rotaPedidos)}>
                  Ver pedido
                </Button>
              ),
            });
          }

          if (!abaEmFoco && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notificacao = new Notification('Novo pedido no Cardápio Digital', {
              body: payload.new?.cliente_nome ? `Pedido de ${payload.new.cliente_nome}` : 'Um novo pedido acabou de chegar.',
              icon: '/favicon.ico',
              tag: `pedido-cardapio-${payload.new.id}`,
            });
            notificacao.onclick = () => {
              window.focus();
              navigate(rotaPedidos);
              notificacao.close();
            };
          }
        }
      ).subscribe();

    return () => { ativo = false; supabase.removeChannel(channel); };
  }, [empresaId, navigate]);

  useEffect(() => {
    if (!empresaId) return;
    if (localStorage.getItem('whatsapp_notificacoes_ativas') !== 'true') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const channel = supabase
      .channel(`whatsapp_notificacoes_${empresaId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens', filter: `empresa_id=eq.${empresaId}` },
        async (payload) => {
          const msg = payload.new;
          if (msg.from_me) return;
          if (document.visibilityState === 'visible' && document.hasFocus()) return;
          let titulo = 'Nova mensagem no WhatsApp';
          try {
            const { data: conversa } = await supabase
              .from('whatsapp_conversas')
              .select('nome_exibicao, telefone_jid, whatsapp_clientes(nome)')
              .eq('id', msg.conversa_id).maybeSingle();
            const nome = conversa?.whatsapp_clientes?.nome || conversa?.nome_exibicao || conversa?.telefone_jid?.split('@')[0];
            if (nome) titulo = nome;
          } catch (err) {
            console.error('Erro ao montar notificação do WhatsApp:', err);
          }
          const notificacao = new Notification(titulo, {
            body: msg.conteudo || 'Nova mensagem',
            icon: '/favicon.ico',
            tag: `whatsapp-${msg.conversa_id}`,
          });
          notificacao.onclick = () => {
            window.focus();
            navigate('/dashboard/whatsapp/conversas');
            notificacao.close();
          };
        }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [empresaId, navigate]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const { error } = await logout();
      if (error) throw error;
      toast({ title: 'Sessão encerrada', description: 'Você saiu da sua conta com sucesso.' });
      navigate('/login', { replace: true });
    } catch (error) {
      toast({ title: 'Erro ao sair', description: error.message || 'Ocorreu um erro ao tentar sair.', variant: 'destructive' });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navigationSectionsRaw = [
    {
      title: 'Visão Geral', icon: BarChart3, color: 'bg-blue-500',
      items: [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Assistente IA', href: '/dashboard/assistente-ia', icon: Sparkles },
        { name: 'Alertas', href: '/dashboard/alertas', icon: Bell },
      ]
    },
    {
      title: 'PDV', icon: Zap, color: 'bg-emerald-500',
      items: [
        { name: 'PDV Rápido', href: '/dashboard/pdv-rapido', icon: Zap },
      ]
    },
    {
      title: 'Cardápio Digital', icon: UtensilsCrossed, color: 'bg-rose-500',
      badge: (pedidosCardapioNovos + pedidosAgendadosPendentes) > 0 ? (pedidosCardapioNovos + pedidosAgendadosPendentes) : null,
      items: [
        { name: 'Pedidos do Cardápio', href: '/dashboard/cardapio/pedidos', icon: ShoppingBag, badge: pedidosCardapioNovos > 0 ? pedidosCardapioNovos : null },
        { name: 'Pedidos Agendados', href: '/dashboard/pedidos-agendados', icon: CalendarClock, badge: pedidosAgendadosPendentes > 0 ? pedidosAgendadosPendentes : null },
        {
          isSubgroup: true, title: 'Relatórios',
          items: [
            { name: 'Visão Geral', href: '/dashboard/cardapio/relatorios', icon: BarChart3 },
            { name: 'Pedidos', href: '/dashboard/cardapio/relatorios/pedidos', icon: Receipt },
            { name: 'Itens mais vendidos', href: '/dashboard/cardapio/relatorios/itens', icon: UtensilsCrossed },
            { name: 'Entradas', href: '/dashboard/cardapio/relatorios/entradas', icon: Wallet },
            { name: 'Clientes', href: '/dashboard/cardapio/relatorios/clientes', icon: Users },
            { name: 'Áreas de entrega', href: '/dashboard/cardapio/relatorios/areas', icon: MapPin },
          ]
        },
        {
          isSubgroup: true, title: 'Configurações',
          items: [
            { name: 'Itens do Cardápio', href: '/dashboard/cardapio/itens', icon: UtensilsCrossed },
            { name: 'Cupons de Desconto', href: '/dashboard/cardapio/cupons', icon: Tag },
            { name: 'Cashback', href: '/dashboard/cardapio/cashback', icon: Coins },
            { name: 'Clientes', href: '/dashboard/cardapio/clientes', icon: Users },
            { name: 'Loja & Publicação', href: '/dashboard/cardapio', icon: Store },
            { name: 'Entrega & Horários', href: '/dashboard/cardapio/entrega', icon: Bike },
            { name: 'Pagamento Online', href: '/dashboard/cardapio/pagamento', icon: CreditCard },
            { name: 'WhatsApp', href: '/dashboard/cardapio/whatsapp', icon: MessageCircle },
          ]
        },
      ]
    },
    {
      title: 'Pedidos Balcão', icon: ShoppingBag, color: 'bg-emerald-500',
      items: [
        { name: 'Pedidos Balcão', href: '/dashboard/pdv-pedidos-balcao', icon: ShoppingBag },
      ]
    },
    {
      title: 'Mercado e Vendas', icon: ShoppingCart, color: 'bg-red-500',
      items: [
        { name: 'Venda no Mercado', href: '/venda-mercado', icon: ShoppingCart },
        { name: 'Venda Aplicativo', href: '/dashboard/venda-aplicativo', icon: Smartphone },
        //     { name: 'Relatório de Devoluções', href: '/relatorio-mercado', icon: BarChart3 },
        { name: 'Relatório de Vendas', href: '/dashboard/relatorio-vendas', icon: FileText },
        { name: 'Vendas Pendentes', href: '/dashboard/relatorio-vendas-pendentes', icon: AlertCircle },
      ]
    },
    {
      title: 'Produção', icon: Factory, color: 'bg-orange-500',
      items: [
        { name: 'Registrar Produção', href: '/dashboard/registrar-producao', icon: Factory },
        { name: 'Produzir Bandejas', href: '/dashboard/produzir-bandejas', icon: PackagePlus },
        { name: 'Lotes', href: '/dashboard/lotes', icon: Boxes },
        { name: 'Rastreamento de Lotes', href: '/dashboard/rastreamento-lotes', icon: Activity },
        { name: 'Etiquetas de Lote', href: '/dashboard/etiquetas-lote', icon: Printer },
        { name: 'Etiqueta Nutricional', href: '/dashboard/etiqueta-nutricional', icon: FileText },
        { name: 'Controle de Bandejas', href: '/controle-bandejas', icon: Package },
        { name: 'Controle de Produção e Saídas', href: '/dashboard/relatorio-producao-saidas', icon: Activity },
        { name: 'Relatório de Produção', href: '/dashboard/relatorio-producao', icon: FileText },
      ]
    },
    {
      title: 'Auditoria', icon: ClipboardCheck, color: 'bg-indigo-500',
      items: [
        {
          isSubgroup: true, title: 'Auditoria',
          items: [
            { name: 'Auditoria de Mercado', href: '/auditoria-mercado', icon: ClipboardCheck },
            { name: 'Relatório de Auditorias', href: '/relatorio-auditoria-mercado', icon: BarChart3 },
          ]
        },
        {
          isSubgroup: true, title: 'Vendas',
          items: [
            { name: 'Comparativo de Mercados', href: '/comparativo-mercados', icon: TrendingUp },
            { name: 'Vendas Reais por Mercado', href: '/relatorio-vendas-mercado', icon: ShoppingCart },
            { name: 'Consolidado por Produto', href: '/relatorio-consolidado-produto', icon: Package },
            { name: 'Mercados por Produto Danificado', href: '/relatorio-produto-danificado', icon: AlertCircle },
          ]
        },
        {
          isSubgroup: true, title: 'Cobrança',
          items: [
            { name: 'Pedido Consignado', href: '/dashboard/fechamento-mercado-consignado', icon: Receipt },
            { name: 'Reconciliação Consignado', href: '/dashboard/reconciliacao-consignado', icon: Scale },
            { name: 'Faturamento de Reabastecimento', href: '/dashboard/pedido-reabastecimento', icon: Truck },
          ]
        }
      ]
    },
    {
      title: 'Distribuição', icon: Truck, color: 'bg-violet-500',
      items: [
        { name: 'Transferência de Estoque', href: '/transferencia-estoque', icon: ArrowRightLeft },
        { name: 'Conferência de Carga', href: '/dashboard/conferencia-carregamento', icon: Truck },
        { name: 'Estoque por Local', href: '/dashboard/estoque-local', icon: ListTree },
        { name: 'Saúde do Estoque', href: '/dashboard/saude-estoque', icon: Activity },
      ]
    },
    {
      title: 'Cadastros', icon: Settings, color: 'bg-teal-500',
      items: [
        { name: 'Produtos', href: '/dashboard/produtos', icon: Package },
        { name: 'Locais', href: '/dashboard/locais', icon: MapPin },
        { name: 'Usuários', href: '/dashboard/usuarios', icon: Users },
        { name: 'Config. Fiscais', href: '/configuracoes-fiscais', icon: Receipt },
      ]
    },
    {
      title: 'Controle', icon: Lock, color: 'bg-slate-600',
      items: [
        { name: 'Movimentações', href: '/dashboard/movimentacoes', icon: ArrowRightLeft },
        ...(isAdmin() ? [{ name: 'Auditoria', href: '/dashboard/logs-auditoria', icon: History }] : [])
      ]
    },
    {
      title: 'Eventos', icon: Calendar, color: 'bg-amber-500',
      items: [
        { name: 'Agenda de Eventos', href: '/dashboard/eventos', icon: Calendar },
      ]
    },
    {
      title: 'WhatsApp', icon: MessageCircle, color: 'bg-green-500',
      items: [
        { name: 'Conversas', href: '/dashboard/whatsapp/conversas', icon: MessageCircle },
        { name: 'Disparo em Massa', href: '/dashboard/whatsapp/disparos', icon: Send },
        { name: 'Relatório', href: '/dashboard/whatsapp/relatorio', icon: BarChart3 },
        { name: 'Clientes', href: '/dashboard/whatsapp/clientes', icon: Users },
        { name: 'Configuração', href: '/dashboard/whatsapp/configuracao', icon: MessageCircle },
      ]
    },
    // ─── ALTERADO: adicionado "Perfis de Acesso" dentro de Administração ─────
    ...(isAdmin() ? [{
      title: 'Administração', icon: ShieldAlert, color: 'bg-gray-500',
      items: [
        { name: 'Empresas', href: '/dashboard/empresas', icon: Building2 },
        { name: 'Perfis de Acesso', href: '/dashboard/perfis', icon: UserCog },
      ]
    }] : []),
    // ─── NOVO: seção só visível pra super-admin da plataforma ────────────────
    ...(isSuperAdmin ? [{
      title: 'Gestor da Plataforma', icon: Landmark, color: 'bg-red-700',
      items: [
        { name: 'Empresas (Gestor)', href: '/dashboard/gestor-empresas', icon: Landmark },
      ]
    }] : [])
  ]
    // ─── NOVO: remove do menu qualquer item que o perfil do usuário não
    // tenha liberado (telas fora do catálogo continuam aparecendo — fail-open).
    // Subgrupos e seções que ficam sem nenhum item visível são descartados.
    .map((section) => {
      const itemsFiltrados = section.items
        .map((item) => {
          if (item.isSubgroup) {
            const subItensFiltrados = item.items.filter((sub) => itemLiberado(sub.href));
            return subItensFiltrados.length > 0 ? { ...item, items: subItensFiltrados } : null;
          }
          return itemLiberado(item.href) ? item : null;
        })
        .filter(Boolean);
      return itemsFiltrados.length > 0 ? { ...section, items: itemsFiltrados } : null;
    })
    .filter(Boolean);

  // Só o item MAIS ESPECÍFICO que bate com a rota fica ativo. Antes, qualquer
  // href que fosse prefixo da rota (ex.: /dashboard/cardapio) marcava vários
  // itens ao mesmo tempo e abria subgrupos que o usuário nem tinha tocado.
  const activeHref = (() => {
    const p = location.pathname;
    let best = null;
    const consider = (href) => {
      if (!href) return;
      const bate = href === '/dashboard' ? p === href : (p === href || p.startsWith(href + '/'));
      if (bate && (!best || href.length > best.length)) best = href;
    };
    navigationSectionsRaw.forEach((sec) =>
      sec.items.forEach((it) => (it.isSubgroup ? it.items.forEach((x) => consider(x.href)) : consider(it.href)))
    );
    return best;
  })();

  const isActive = (href) => href === activeHref;

  const handleItemClick = () => {
    setMobileSidebarOpen(false);
  };

  // Ao trocar de tela, fica aberto só o grupo (e subgrupo) da rota atual.
  useEffect(() => {
    const next = {};
    navigationSectionsRaw.forEach((section) => {
      section.items.forEach((item) => {
        if (item.isSubgroup) {
          if (item.items.some((sub) => isActive(sub.href))) {
            next[section.title] = true;
            next[`${section.title}-${item.title}`] = true;
          }
        } else if (isActive(item.href)) {
          next[section.title] = true;
        }
      });
    });
    setOpenSections(next);
  }, [location.pathname]);

  // Seção principal: abrir uma fecha as outras (acordeão). Subgrupo: independente.
  const toggleSection = (key, isSub = false) => {
    if (isMinimized) {
      setIsMinimized(false);
      setOpenSections((prev) => (isSub ? { ...prev, [key]: true } : { [key]: true }));
      return;
    }
    setOpenSections((prev) => {
      if (isSub) return { ...prev, [key]: !prev[key] };
      const next = {};
      Object.keys(prev).forEach((k) => { if (k.startsWith(key + '-')) next[k] = prev[k]; });
      next[key] = !prev[key];
      return next;
    });
  };

  // Mapa de variantes por cor de seção — Tailwind precisa das classes
  // escritas por extenso (não dá pra montar "bg-" + nomeCor dinamicamente),
  // por isso a lista explícita aqui.
  const colorVariants = {
    'bg-blue-500': { light: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-500' },
    'bg-emerald-500': { light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-500' },
    'bg-red-500': { light: 'bg-red-50', text: 'text-red-600', border: 'border-red-500' },
    'bg-orange-500': { light: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-500' },
    'bg-indigo-500': { light: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-500' },
    'bg-violet-500': { light: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-500' },
    'bg-teal-500': { light: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-500' },
    'bg-slate-600': { light: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-600' },
    'bg-amber-500': { light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-500' },
    'bg-green-500': { light: 'bg-green-50', text: 'text-green-600', border: 'border-green-500' },
    'bg-gray-500': { light: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-500' },
    'bg-red-700': { light: 'bg-red-50', text: 'text-red-700', border: 'border-red-700' },
  };
  const defaultVariant = { light: 'bg-red-50', text: 'text-[var(--color-primary)]', border: 'border-[var(--color-primary)]' };

  const renderLink = (item, sectionColor = null) => {
    const ItemIcon = item.icon;
    const active = isActive(item.href);
    const v = (sectionColor && colorVariants[sectionColor]) || defaultVariant;
    return (
      <Link key={item.name} to={item.href} onClick={handleItemClick}
        title={item.name}
        className={`flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors min-h-[44px]
          ${active
            ? `${v.light} ${v.text} border-l-4 ${v.border}`
            : 'text-gray-600 hover:bg-gray-50 hover:text-[var(--color-primary)] border-l-4 border-transparent'
          }`}
      >
        <ItemIcon className={`h-4 w-4 shrink-0 ${active ? v.text : 'text-gray-400'}`} />
        <span className="whitespace-normal leading-tight flex-1">{item.name}</span>
        {!!item.badge && (
          <span className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </Link>
    );
  };

  const renderMenuContent = () => {
    const term = searchQuery.toLowerCase();

    return navigationSectionsRaw.map((section) => {
      // Filter logic
      const filteredItems = section.items.map(item => {
        if (item.isSubgroup) {
          const filteredSub = item.items.filter(sub => sub.name.toLowerCase().includes(term));
          return filteredSub.length > 0 || item.title.toLowerCase().includes(term) ? { ...item, items: filteredSub } : null;
        }
        return item.name.toLowerCase().includes(term) ? item : null;
      }).filter(Boolean);

      if (filteredItems.length === 0 && !section.title.toLowerCase().includes(term) && term) return null;

      const itemsToRender = term ? filteredItems : section.items;
      const SectionIcon = section.icon;
      const isOpen = (term ? true : openSections[section.title]) && (!isMinimized || mobileSidebarOpen);
      const hasActiveChild = section.items.some(item =>
        item.isSubgroup ? item.items.some(sub => isActive(sub.href)) : isActive(item.href)
      );

      const SectionHeader = () => (
        <button
          onClick={() => toggleSection(section.title)}
          className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px]
            ${isMinimized && !mobileSidebarOpen ? 'justify-center' : 'justify-between'}
            ${hasActiveChild && !isOpen ? `${(colorVariants[section.color] || defaultVariant).light} ${(colorVariants[section.color] || defaultVariant).text}` : 'text-gray-700 hover:bg-gray-100'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className={`${section.color || 'bg-gray-400'} h-8 w-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm relative`}>
              <SectionIcon className="h-4 w-4 text-white" />
              {!!section.badge && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {section.badge > 99 ? '99+' : section.badge}
                </span>
              )}
            </div>
            {(!isMinimized || mobileSidebarOpen) && <span className="whitespace-normal text-left leading-tight font-semibold" title={section.title}>{section.title}</span>}
          </div>
          {(!isMinimized || mobileSidebarOpen) && (
            isOpen ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
          )}
        </button>
      );

      return (
        <div key={section.title} className="space-y-1 relative group">
          {isMinimized && !mobileSidebarOpen ? (
            <Tooltip>
              <TooltipTrigger asChild><div><SectionHeader /></div></TooltipTrigger>
              <TooltipContent side="right" className="font-semibold">{section.title}</TooltipContent>
            </Tooltip>
          ) : <SectionHeader />}

          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="pt-1 pb-2 pl-6 pr-2 space-y-1">
                  {itemsToRender.map((item, idx) => {
                    if (item.isSubgroup) {
                      const subKey = `${section.title}-${item.title}`;
                      const isSubOpen = (term ? true : openSections[subKey]) && (!isMinimized || mobileSidebarOpen);
                      const hasActiveSub = item.items.some(sub => isActive(sub.href));

                      return (
                        <div key={item.title} className="space-y-1 mt-2">
                          <button onClick={() => toggleSection(subKey, true)} className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors rounded">
                            <span>{item.title}</span>
                            {isSubOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <AnimatePresence initial={false}>
                            {isSubOpen && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden space-y-1 pl-2 border-l border-gray-100 ml-3">
                                {item.items.map(subItem => renderLink(subItem, section.color))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }
                    return renderLink(item, section.color);
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-full bg-slate-50 flex overflow-hidden p-0 m-0">
        {/* Aviso global de pedidos agendados (campainha, pop-up e impressão) */}
        <AgendadosAlertas />

        {/* Alarme de cliente pedindo atendente no WhatsApp (só PC) */}
        <AtendenteAlerta />

        {mobileSidebarOpen && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
        )}

        <aside className={`h-full flex flex-col bg-white border-r border-gray-200 z-50 transition-all duration-300 ease-in-out shrink-0 p-0 m-0
          ${mobileSidebarOpen ? 'fixed inset-y-0 left-0 translate-x-0 w-[320px]' : 'fixed lg:static inset-y-0 left-0 -translate-x-full lg:translate-x-0'}
          ${!mobileSidebarOpen && isMinimized ? 'lg:w-[80px]' : 'lg:w-[320px]'}
        `}>
          <div className={`flex items-center px-4 py-4 border-b border-gray-200 shrink-0 min-h-[65px] ${isMinimized && !mobileSidebarOpen ? 'justify-center' : 'justify-between'} sidebar-logo-container relative`}>
            <AnimatePresence mode="wait">
              {(!isMinimized || mobileSidebarOpen) && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="flex flex-col items-start overflow-hidden py-1">
                  {empresaLogoUrl ? (
                    <>
                      <div className="sidebar-logo-wrapper mb-1 bg-white w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                        <img src={empresaLogoUrl} alt={`Logo ${empresaNome}`} className="sidebar-logo-image max-w-full max-h-full object-contain" />
                      </div>
                      <span className="text-xs font-semibold text-gray-500 w-full sidebar-logo-text whitespace-normal leading-tight" title={empresaNome}>
                        {empresaNome || 'reddu'}
                      </span>
                      <div className="flex items-center gap-1 mt-1">
                        <ReddulIcon className="h-2.5 w-2.5 text-red-500" />
                        <span className="text-[10px] text-gray-400">powered by reddu</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ReddulIcon className="h-5 w-5 text-white" />
                      </div>
                      <h1 className="text-xl font-bold text-gray-900 whitespace-normal overflow-hidden lowercase">reddu</h1>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {isMinimized && !mobileSidebarOpen && empresaLogoUrl && (
              <div className="w-8 h-8 rounded-sm overflow-hidden flex items-center justify-center bg-white border border-gray-100 shadow-sm absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <img src={empresaLogoUrl} alt="Logo Mini" className="max-w-full max-h-full object-contain p-0.5" />
              </div>
            )}
            <button onClick={() => setMobileSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-gray-700 touch-target ml-auto">
              <X className="h-6 w-6" />
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className={`hidden lg:flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-[var(--color-primary)] hover:bg-red-50 transition-colors ${empresaLogoUrl && !isMinimized ? 'absolute right-2 top-1/2 -translate-y-1/2' : ''}`}
              title={isMinimized ? "Expandir menu" : "Minimizar menu"}
            >
              {isMinimized ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </div>

          <div className={`px-4 py-4 border-b border-gray-200 shrink-0 ${isMinimized && !mobileSidebarOpen ? 'flex justify-center' : ''}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-3 ${isMinimized && !mobileSidebarOpen ? 'justify-center' : 'justify-start'}`}>
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-[var(--color-primary)] text-white font-semibold">
                      {currentUser?.nome?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {(!isMinimized || mobileSidebarOpen) && (
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-medium text-gray-900 whitespace-normal leading-tight">{currentUser?.nome || 'Usuário'}</p>
                      <p className="text-xs text-gray-500 whitespace-normal leading-tight">{empresaNome || 'Sem empresa'}</p>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              {isMinimized && !mobileSidebarOpen && (
                <TooltipContent side="right" align="center" className="flex flex-col gap-1">
                  <p className="font-medium">{currentUser?.nome || 'Usuário'}</p>
                  <p className="text-xs text-muted-foreground">{empresaNome}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {(!isMinimized || mobileSidebarOpen) && (
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar menu..."
                  className="pl-9 bg-gray-50 border-gray-200 h-9 text-sm focus-visible:ring-red-200"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <nav ref={sidebarNavRef} onScroll={handleSidebarScroll} className="flex-1 px-3 py-4 space-y-2 overflow-y-auto tablet-scroll overflow-x-hidden">
            {renderMenuContent()}
          </nav>

          <div className="p-4 border-t border-gray-200 shrink-0 bg-white">
            {isMinimized && !mobileSidebarOpen ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px] px-0" onClick={handleLogout} disabled={isLoggingOut}>
                    {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-red-600 font-medium">Sair do sistema</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" className="w-full justify-start gap-3 text-[var(--color-primary)] border-red-200 hover:text-red-700 hover:bg-red-50 min-h-[44px]" onClick={handleLogout} disabled={isLoggingOut}>
                {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                {isLoggingOut ? 'Saindo...' : 'Sair'}
              </Button>
            )}
            {(!isMinimized || mobileSidebarOpen) && (
              <div className="flex items-center justify-center gap-1.5 mt-3 opacity-50">
                <ReddulIcon className="h-3 w-3 text-gray-500" />
                <span className="text-[10px] text-gray-500">powered by reddu</span>
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 p-0 m-0">
          <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-2 md:py-3 flex items-center justify-between shrink-0 min-h-[56px] w-full">
            <div className="flex items-center">
              <button onClick={() => setMobileSidebarOpen(true)} className="text-gray-500 hover:text-gray-700 mr-4 touch-target">
                <Menu className="h-6 w-6" />
              </button>
              <span className="font-semibold text-[var(--color-primary)]">{empresaNome || 'reddu'}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusRapidoBar />
              <AlertsBell empresaId={empresaId} />
            </div>
          </header>

          {/* Cabeçalho fino só pro desktop — o sininho de alertas fica
              visível em qualquer tela, sem precisar de um cabeçalho grande
              (o menu lateral já cobre a navegação principal). */}
          <header className="hidden lg:flex items-center justify-end gap-3 bg-white border-b border-gray-200 px-6 py-2 shrink-0 min-h-[52px] w-full">
            <StatusRapidoBar />
            <AlertsBell empresaId={empresaId} />
          </header>

          {/* Aviso de mensalidade (banner + popup, com Pix) */}
          <MensalidadeAlerta />

          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 tablet-scroll w-full m-0">
            {carregandoAcesso ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Verificando acesso…
              </div>
            ) : acessoPaginaAtualLiberado ? (
              children
            ) : (
              <div className="min-h-[50vh] flex items-center justify-center text-center px-6">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert className="h-6 w-6 text-gray-400" />
                  </div>
                  <h1 className="text-lg font-semibold text-gray-900 mb-1">Acesso negado</h1>
                  <p className="text-sm text-gray-500">
                    Seu perfil não tem permissão para acessar esta tela. Fale com o administrador da sua empresa se precisar de acesso.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}