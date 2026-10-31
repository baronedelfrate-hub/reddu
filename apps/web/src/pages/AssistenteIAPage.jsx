import React, { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Sparkles, Bot, User, Loader2, RefreshCw, Lightbulb, History, X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const SUGGESTIONS = [
  "Quais produtos estão vencendo essa semana?",
  "Qual mercado vendeu mais nos últimos 30 dias?",
  "Qual o total de vendas pendentes a receber?",
  "Como está o estoque em cada mercado?",
  "Qual foi o produto mais vendido esse mês?",
  "Tem algum lote vencido com saldo em estoque?",
  "Quanto foi vendido em cada mercado esse mês?",
  "Quais mercados têm mais estoque parado?",
  "Como estão os pedidos do Cardápio Digital esse mês?",
  "Quais os itens mais pedidos no Cardápio Digital?",
  "Tem algum pedido do cardápio com erro na nota fiscal?",
  "Quais bairros mais pedem no Cardápio Digital?",
];

// Renderizador de markdown bem simples (sem dependência externa — esse
// projeto roda no Horizons, que nem sempre instala pacotes novos
// automaticamente). Cobre o que o Claude normalmente usa: **negrito**,
// listas com "-"/"*"/números, e parágrafos.
function renderMarkdown(texto) {
  if (!texto) return null;
  const linhas = texto.split('\n');
  const blocos = [];
  let listaAtual = null;

  const flushLista = () => {
    if (listaAtual) { blocos.push(listaAtual); listaAtual = null; }
  };

  const formatarInline = (s) => {
    const partes = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return partes.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-black/5 px-1 py-0.5 rounded text-[0.9em]">{p.slice(1, -1)}</code>;
      return p;
    });
  };

  linhas.forEach((linha, idx) => {
    const itemLista = linha.match(/^\s*[-*•]\s+(.*)/) || linha.match(/^\s*\d+[.)]\s+(.*)/);
    if (itemLista) {
      if (!listaAtual) listaAtual = { tipo: 'lista', itens: [], key: `l${idx}` };
      listaAtual.itens.push(itemLista[1]);
      return;
    }
    flushLista();
    if (linha.trim() === '') { blocos.push({ tipo: 'espaco', key: `e${idx}` }); return; }
    blocos.push({ tipo: 'paragrafo', texto: linha, key: `p${idx}` });
  });
  flushLista();

  return blocos.map((b) => {
    if (b.tipo === 'lista') {
      return (
        <ul key={b.key} className="list-disc pl-5 space-y-0.5 my-1">
          {b.itens.map((it, i) => <li key={i}>{formatarInline(it)}</li>)}
        </ul>
      );
    }
    if (b.tipo === 'espaco') return <div key={b.key} className="h-2" />;
    return <p key={b.key} className="whitespace-pre-wrap">{formatarInline(b.texto)}</p>;
  });
}

export default function AssistenteIAPage() {
  const { empresaId, empresaNome, currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [contexto, setContexto] = useState(null);
  const [contextoTs, setContextoTs] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { toast } = useToast();

  // Histórico de conversas — persistido em assistente_ia_conversas, pra não
  // perder tudo se sair da tela. conversaIdRef guarda o id sem re-render
  // (evita disparar o efeito de salvar de novo só por causa dele mudar).
  const [conversaId, setConversaId] = useState(null);
  const conversaIdRef = useRef(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [listaConversas, setListaConversas] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Carrega dados reais do Supabase — cache de 5 minutos
  const carregarContexto = async () => {
    const agora = Date.now();
    if (contexto && contextoTs && agora - contextoTs < 5 * 60 * 1000) return contexto;
    if (!empresaId) return null;

    try {
      const seteDiasAtras = new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString();
      const hoje = new Date().toISOString().slice(0, 10);
      const em7dias = new Date(agora + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const trintaDiasAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { data: alertas },
        { data: estoque },
        { data: vendas },
        { data: lotesVencendo },
        { data: producao },
        { data: mercados },
        { data: vendasMercado },
        { data: estoquesMercado },
        { data: vendasPendentes },
        { data: pedidosCardapio },
        { data: itensCardapio },
        { data: clientesCardapio },
      ] = await Promise.all([
        supabase.from('alertas_estoque')
          .select('tipo_alerta, produto_nome, local_nome, quantidade_atual, dias_para_vencer')
          .eq('empresa_id', empresaId).limit(30),
        supabase.from('estoque_por_local')
          .select('produto_nome, local_nome, quantidade_atual')
          .eq('empresa_id', empresaId).gt('quantidade_atual', 0)
          .order('quantidade_atual', { ascending: false }).limit(30),
        // Vendas gerais (loja + mercados) — 30 dias, pra bater com perguntas
        // do tipo "esse mês" (antes só pegava 7 dias e respondia errado).
        supabase.from('movimentacoes')
          .select('quantidade, tipo, valor_unitario, subtotal, produtos(nome)')
          .eq('empresa_id', empresaId).in('tipo', ['venda', 'venda_mercado'])
          .gte('data_movimentacao', trintaDiasAtras).limit(500),
        supabase.from('lotes')
          .select('numero_lote, data_validade, quantidade, produtos(nome)')
          .eq('empresa_id', empresaId).eq('ativo', true).eq('lote_devolvido', false)
          .lte('data_validade', em7dias).gte('data_validade', hoje)
          .order('data_validade').limit(20),
        supabase.from('movimentacoes')
          .select('quantidade, produtos(nome)')
          .eq('empresa_id', empresaId).eq('tipo', 'producao_bandeja')
          .gte('data_movimentacao', seteDiasAtras).limit(100),
        supabase.from('locais')
          .select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado'),
        // Vendas por mercado nos últimos 30 dias com valores
        supabase.from('movimentacoes')
          .select('quantidade, subtotal, total_final, valor_unitario, cliente_referencia, data_movimentacao, status, financeiro_baixado, produtos(nome), locais:local_origem_id(nome)')
          .eq('empresa_id', empresaId).eq('tipo', 'venda_mercado')
          .gte('data_movimentacao', trintaDiasAtras).limit(500),
        // Estoque atual por mercado
        supabase.from('estoque_por_local')
          .select('produto_nome, local_nome, local_id, quantidade_atual')
          .eq('empresa_id', empresaId).gt('quantidade_atual', 0),
        // Vendas pendentes (não conciliadas)
        supabase.from('movimentacoes')
          .select('quantidade, subtotal, cliente_referencia, data_movimentacao, produtos(nome), locais:local_origem_id(nome)')
          .eq('empresa_id', empresaId).eq('tipo', 'venda_mercado')
          .eq('status', 'PENDENTE').eq('financeiro_baixado', false).limit(100),
        // Pedidos do Cardápio Digital — últimos 30 dias
        supabase.from('pedidos_cardapio')
          .select('status, total, tipo_entrega, bairro, created_at, numero_pedido, cliente_nome, vendas(status_fiscal, nfe_erro_mensagem, forma_pagamento)')
          .eq('empresa_id', empresaId).gte('created_at', trintaDiasAtras).limit(500),
        // Itens mais pedidos no Cardápio Digital — últimos 30 dias
        supabase.from('pedidos_cardapio_itens')
          .select('nome_item, quantidade, pedidos_cardapio!inner(empresa_id, created_at, status)')
          .eq('pedidos_cardapio.empresa_id', empresaId)
          .gte('pedidos_cardapio.created_at', trintaDiasAtras).limit(1000),
        // Clientes do Cardápio Digital
        supabase.from('cardapio_clientes')
          .select('nome, telefone, total_pedidos, total_gasto, ultimo_pedido_em')
          .eq('empresa_id', empresaId).order('total_gasto', { ascending: false }).limit(200),
      ]);

      // Agrupa vendas por produto
      const vendasMap = {};
      (vendas || []).forEach(v => {
        const nome = v.produtos?.nome || '?';
        vendasMap[nome] = (vendasMap[nome] || 0) + Number(v.quantidade);
      });
      const topVendas = Object.entries(vendasMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([nome, qtd]) => `${nome}: ${qtd} un`);

      // Agrupa produção por produto
      const prodMap = {};
      (producao || []).forEach(p => {
        const nome = p.produtos?.nome || '?';
        prodMap[nome] = (prodMap[nome] || 0) + Number(p.quantidade);
      });
      const topProducao = Object.entries(prodMap)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, qtd]) => `${nome}: ${qtd} bandejas`);

      const fmt = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

      // Vendas por mercado com valores — 30 dias
      const mercadoVendasMap = {};
      (vendasMercado || []).forEach(v => {
        const mercado = v.locais?.nome || v.cliente_referencia || 'Mercado desconhecido';
        if (!mercadoVendasMap[mercado]) mercadoVendasMap[mercado] = { qtd: 0, valor: 0, pendente: 0 };
        mercadoVendasMap[mercado].qtd += Number(v.quantidade || 0);
        mercadoVendasMap[mercado].valor += Number(v.subtotal || v.total_final || 0);
        if (v.status === 'PENDENTE') mercadoVendasMap[mercado].pendente += Number(v.subtotal || 0);
      });
      const vendasPorMercado = Object.entries(mercadoVendasMap)
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([nome, d]) => `${nome}: ${d.qtd} un vendidas — ${fmt(d.valor)} total${d.pendente > 0 ? ` — ${fmt(d.pendente)} PENDENTE` : ''}`);

      // Estoque atual por mercado
      const mercadoIds = new Set((mercados || []).map(m => m.id));
      const estoqueMercadoMap = {};
      (estoquesMercado || []).forEach(e => {
        if (!mercadoIds.has(e.local_id)) return;
        if (!estoqueMercadoMap[e.local_nome]) estoqueMercadoMap[e.local_nome] = [];
        estoqueMercadoMap[e.local_nome].push(`${e.produto_nome}: ${e.quantidade_atual} un`);
      });
      const estoquePorMercado = Object.entries(estoqueMercadoMap)
        .map(([mercado, itens]) => `${mercado}: ${itens.join(', ')}`);

      // Resumo financeiro
      const totalVendido30d = (vendasMercado || []).reduce((s, v) => s + Number(v.subtotal || 0), 0);
      const totalPendente = (vendasPendentes || []).reduce((s, v) => s + Number(v.subtotal || 0), 0);

      // Cardápio Digital — pedidos válidos (exclui cancelados) dos últimos 30 dias
      const pedidosCardapioValidos = (pedidosCardapio || []).filter(p => p.status !== 'CANCELADO');
      const pedidosCardapioCancelados = (pedidosCardapio || []).filter(p => p.status === 'CANCELADO');
      const totalVendidoCardapio = pedidosCardapioValidos.reduce((s, p) => s + Number(p.total || 0), 0);
      const ticketMedioCardapio = pedidosCardapioValidos.length > 0 ? totalVendidoCardapio / pedidosCardapioValidos.length : 0;

      const bairroMap = {};
      pedidosCardapioValidos.forEach(p => {
        if (p.tipo_entrega !== 'entrega' || !p.bairro) return;
        bairroMap[p.bairro] = (bairroMap[p.bairro] || 0) + 1;
      });
      const topBairros = Object.entries(bairroMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([bairro, qtd]) => `${bairro}: ${qtd} pedido${qtd > 1 ? 's' : ''}`);

      const pedidosComErroFiscal = pedidosCardapioValidos
        .filter(p => p.vendas?.status_fiscal === 'erro')
        .map(p => `Pedido #${p.numero_pedido} — ${p.cliente_nome} — ${p.vendas?.nfe_erro_mensagem || 'erro não especificado'}`);

      const itensCardapioMap = {};
      (itensCardapio || []).forEach(it => {
        if (it.pedidos_cardapio?.status === 'CANCELADO') return;
        if (it.nome_item?.startsWith('+ ')) return; // adicional, não o item principal
        itensCardapioMap[it.nome_item] = (itensCardapioMap[it.nome_item] || 0) + Number(it.quantidade || 0);
      });
      const topItensCardapio = Object.entries(itensCardapioMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([nome, qtd]) => `${nome}: ${qtd} un`);

      const clientesCardapioAtivos = (clientesCardapio || []).filter(c => {
        if (!c.ultimo_pedido_em) return false;
        return (agora - new Date(c.ultimo_pedido_em).getTime()) <= 30 * 24 * 60 * 60 * 1000;
      });
      const topClientesCardapio = (clientesCardapio || []).slice(0, 10)
        .map(c => `${c.nome || c.telefone}: ${c.total_pedidos} pedido${c.total_pedidos > 1 ? 's' : ''} — ${fmt(c.total_gasto)}`);

      const ctx = {
        empresa: empresaNome,
        data_consulta: new Date().toLocaleString('pt-BR'),
        resumo_alertas: {
          total: (alertas || []).length,
          vencidos: (alertas || []).filter(a => a.tipo_alerta === 'vencido').length,
          vencendo: (alertas || []).filter(a => a.tipo_alerta === 'vencendo').length,
          estoque_critico: (alertas || []).filter(a => a.tipo_alerta === 'estoque_minimo').length,
        },
        alertas_detalhados: (alertas || []).slice(0, 15).map(a =>
          `[${a.tipo_alerta}] ${a.produto_nome} — ${a.local_nome} — ${a.quantidade_atual} un${a.dias_para_vencer !== null ? ` — ${a.dias_para_vencer}d para vencer` : ''}`
        ),
        top_estoque_atual: (estoque || []).slice(0, 15).map(e =>
          `${e.produto_nome} em ${e.local_nome}: ${e.quantidade_atual} un`
        ),
        top_vendas_30dias: topVendas,
        producao_7dias: topProducao,
        lotes_vencendo_semana: (lotesVencendo || []).map(l =>
          `${l.produtos?.nome} — Lote ${l.numero_lote} — Val: ${l.data_validade} — ${l.quantidade} un`
        ),
        mercados: (mercados || []).map(m => m.nome),
        // NOVOS — mercados e financeiro
        vendas_por_mercado_30dias: vendasPorMercado,
        estoque_atual_por_mercado: estoquePorMercado,
        resumo_financeiro: {
          total_vendido_mercados_30dias: fmt(totalVendido30d),
          total_pendente_receber: fmt(totalPendente),
          qtd_vendas_pendentes: (vendasPendentes || []).length,
        },
        vendas_pendentes_detalhe: (vendasPendentes || []).slice(0, 10).map(v =>
          `${v.locais?.nome || v.cliente_referencia || '?'} — ${v.produtos?.nome} — ${fmt(v.subtotal)} — ${v.data_movimentacao?.slice(0,10)}`
        ),
        // NOVOS — Cardápio Digital (últimos 30 dias)
        resumo_cardapio_digital: {
          total_pedidos: pedidosCardapioValidos.length,
          cancelados: pedidosCardapioCancelados.length,
          total_vendido: fmt(totalVendidoCardapio),
          ticket_medio: fmt(ticketMedioCardapio),
        },
        top_itens_cardapio: topItensCardapio,
        top_bairros_cardapio: topBairros,
        pedidos_cardapio_erro_fiscal: pedidosComErroFiscal,
        clientes_cardapio: {
          total: (clientesCardapio || []).length,
          ativos_30dias: clientesCardapioAtivos.length,
          top: topClientesCardapio,
        },
      };

      setContexto(ctx);
      setContextoTs(agora);
      return ctx;
    } catch (err) {
      console.error('Erro ao carregar contexto:', err);
      return null;
    }
  };

  // Salva (insert ou update) a conversa atual em assistente_ia_conversas.
  // Usa a ref pra decidir insert x update sem depender de re-render.
  const salvarConversa = async (mensagensParaSalvar) => {
    if (!empresaId || mensagensParaSalvar.length === 0) return;
    try {
      if (conversaIdRef.current) {
        await supabase.from('assistente_ia_conversas')
          .update({ mensagens: mensagensParaSalvar, updated_at: new Date().toISOString() })
          .eq('id', conversaIdRef.current);
      } else {
        const primeiraPergunta = mensagensParaSalvar.find(m => m.role === 'user')?.content || 'Conversa';
        const titulo = primeiraPergunta.length > 60 ? `${primeiraPergunta.slice(0, 60)}…` : primeiraPergunta;
        const { data, error } = await supabase.from('assistente_ia_conversas')
          .insert({
            empresa_id: empresaId,
            usuario_id: currentUser?.id || null,
            titulo,
            mensagens: mensagensParaSalvar,
          })
          .select('id').single();
        if (!error && data) {
          conversaIdRef.current = data.id;
          setConversaId(data.id);
        }
      }
    } catch (err) {
      console.error('Erro ao salvar conversa:', err);
    }
  };

  const carregarListaConversas = async () => {
    if (!empresaId) return;
    setCarregandoHistorico(true);
    try {
      const { data, error } = await supabase.from('assistente_ia_conversas')
        .select('id, titulo, updated_at')
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setListaConversas(data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      toast({ title: 'Erro ao carregar histórico', description: err.message, variant: 'destructive' });
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const abrirConversa = async (conv) => {
    try {
      const { data, error } = await supabase.from('assistente_ia_conversas')
        .select('id, mensagens').eq('id', conv.id).single();
      if (error) throw error;
      setMessages(data.mensagens || []);
      setHasStarted(true);
      conversaIdRef.current = data.id;
      setConversaId(data.id);
      setMostrarHistorico(false);
    } catch (err) {
      console.error('Erro ao abrir conversa:', err);
      toast({ title: 'Erro ao abrir conversa', description: err.message, variant: 'destructive' });
    }
  };

  const novaConversa = () => {
    setMessages([]);
    setHasStarted(false);
    conversaIdRef.current = null;
    setConversaId(null);
    setMostrarHistorico(false);
  };

  const handleSend = async (text) => {
    const pergunta = (text || inputValue).trim();
    if (!pergunta || isLoading) return;

    setInputValue('');
    setHasStarted(true);
    setIsLoading(true);

    const novasMensagens = [...messages, { role: 'user', content: pergunta }];
    setMessages(novasMensagens);

    try {
      const ctx = await carregarContexto();

      const systemPrompt = `Você é o assistente inteligente do sistema Estoque 360 da empresa ${empresaNome || 'Tô Coxinha'}.
Responda perguntas sobre estoque, lotes, validades, vendas e produção usando os dados reais abaixo.
Seja direto e objetivo. Use listas quando necessário. Responda SEMPRE em português brasileiro.
Não invente dados — use apenas as informações do contexto fornecido.
Se não souber responder com os dados disponíveis, diga isso claramente.

=== DADOS EM TEMPO REAL (${ctx?.data_consulta}) ===

RESUMO DE ALERTAS:
${JSON.stringify(ctx?.resumo_alertas)}

ALERTAS ATIVOS:
${(ctx?.alertas_detalhados || []).join('\n') || 'Nenhum alerta'}

ESTOQUE ATUAL (top produtos por local):
${(ctx?.top_estoque_atual || []).join('\n') || 'Sem dados'}

VENDAS DOS ÚLTIMOS 30 DIAS:
${(ctx?.top_vendas_30dias || []).join('\n') || 'Sem vendas registradas'}

PRODUÇÃO DOS ÚLTIMOS 7 DIAS:
${(ctx?.producao_7dias || []).join('\n') || 'Sem produção registrada'}

LOTES VENCENDO ESSA SEMANA:
${(ctx?.lotes_vencendo_semana || []).join('\n') || 'Nenhum lote vencendo esta semana'}

MERCADOS CADASTRADOS:
${(ctx?.mercados || []).join(', ') || 'Nenhum'}

VENDAS POR MERCADO — ÚLTIMOS 30 DIAS (com valores):
${(ctx?.vendas_por_mercado_30dias || []).join('\n') || 'Sem dados'}

ESTOQUE ATUAL POR MERCADO:
${(ctx?.estoque_atual_por_mercado || []).join('\n') || 'Nenhum estoque nos mercados'}

RESUMO FINANCEIRO:
Total vendido nos mercados (30 dias): ${ctx?.resumo_financeiro?.total_vendido_mercados_30dias}
Total pendente a receber: ${ctx?.resumo_financeiro?.total_pendente_receber}
Vendas pendentes: ${ctx?.resumo_financeiro?.qtd_vendas_pendentes}

VENDAS PENDENTES DE RECEBIMENTO:
${(ctx?.vendas_pendentes_detalhe || []).join('\n') || 'Nenhuma venda pendente'}

=== CARDÁPIO DIGITAL (últimos 30 dias) ===

RESUMO:
${JSON.stringify(ctx?.resumo_cardapio_digital)}

ITENS MAIS PEDIDOS NO CARDÁPIO:
${(ctx?.top_itens_cardapio || []).join('\n') || 'Sem pedidos registrados'}

BAIRROS QUE MAIS PEDEM (entregas):
${(ctx?.top_bairros_cardapio || []).join('\n') || 'Sem dados de bairro'}

PEDIDOS DO CARDÁPIO COM ERRO NA NOTA FISCAL:
${(ctx?.pedidos_cardapio_erro_fiscal || []).join('\n') || 'Nenhum pedido com erro fiscal'}

CLIENTES DO CARDÁPIO:
Total de clientes cadastrados: ${ctx?.clientes_cardapio?.total ?? 0}
Clientes ativos (pediram nos últimos 30 dias): ${ctx?.clientes_cardapio?.ativos_30dias ?? 0}
Top clientes por valor gasto:
${(ctx?.clientes_cardapio?.top || []).join('\n') || 'Sem dados de clientes'}`;

      const { data, error } = await supabase.functions.invoke('claude-proxy', {
        body: {
          system: systemPrompt,
          messages: novasMensagens.slice(-8).map(m => ({
            role: m.role,
            content: m.content
          })),
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'Erro desconhecido');

      const resposta = data?.content?.[0]?.text || 'Não consegui gerar uma resposta.';
      const mensagensFinais = [...novasMensagens, { role: 'assistant', content: resposta }];
      setMessages(mensagensFinais);
      salvarConversa(mensagensFinais);
    } catch (err) {
      console.error('AI error:', err);
      toast({ title: 'Erro ao consultar assistente', description: err.message, variant: 'destructive' });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Erro: ${err.message}\n\nVerifique se a variável ANTHROPIC_API_KEY está configurada na Edge Function do Supabase.`
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const reiniciar = () => {
    novaConversa();
    setContexto(null);
    setContextoTs(null);
  };

  const toggleHistorico = () => {
    const vaiAbrir = !mostrarHistorico;
    setMostrarHistorico(vaiAbrir);
    if (vaiAbrir) carregarListaConversas();
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Assistente IA | Estoque 360</title>
      </Helmet>

      <div className="flex flex-col max-w-4xl mx-auto" style={{ height: 'calc(100vh - 100px)' }}>

        <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 text-violet-600 rounded-xl">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">Assistente IA — Estoque 360</h1>
                <p className="text-xs text-gray-500">Dados atualizados em tempo real do seu estoque</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={toggleHistorico} className="gap-1.5 text-xs h-8">
                <History className="h-3.5 w-3.5" /> Histórico
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setContexto(null); setContextoTs(null); }} className="gap-1.5 text-xs h-8">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar dados
              </Button>
              {hasStarted && (
                <Button variant="outline" size="sm" onClick={reiniciar} className="gap-1.5 text-xs h-8">
                  <Plus className="h-3.5 w-3.5" /> Nova conversa
                </Button>
              )}
            </div>
          </div>

          {/* Painel de histórico */}
          {mostrarHistorico && (
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 shrink-0 max-h-56 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversas anteriores</p>
                <button onClick={() => setMostrarHistorico(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {carregandoHistorico ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : listaConversas.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Nenhuma conversa salva ainda.</p>
              ) : (
                <div className="space-y-1">
                  {listaConversas.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => abrirConversa(conv)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-violet-50 transition-colors ${conv.id === conversaId ? 'bg-violet-100 text-violet-700 font-medium' : 'text-gray-700'}`}
                    >
                      <span className="block truncate">{conv.titulo || 'Conversa'}</span>
                      <span className="block text-xs text-gray-400">{new Date(conv.updated_at).toLocaleString('pt-BR')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!hasStarted ? (
              <div className="h-full flex flex-col items-center justify-center space-y-6">
                <div className="text-center space-y-2">
                  <div className="mx-auto w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-violet-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Como posso ajudar hoje?</h2>
                  <p className="text-gray-500 text-sm max-w-md">
                    Faço consultas em tempo real no seu estoque. Experimente uma das perguntas abaixo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => handleSend(s)}
                      className="flex items-center gap-2 text-left px-4 py-3 bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 rounded-xl text-sm text-gray-700 font-medium transition-all">
                      <Lightbulb className="h-4 w-4 text-violet-400 flex-shrink-0" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-violet-600' : 'bg-gray-100'}`}>
                      {msg.role === 'user'
                        ? <User className="w-4 h-4 text-white" />
                        : <Bot className="w-4 h-4 text-gray-600" />
                      }
                    </div>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-violet-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.role === 'assistant' ? renderMarkdown(msg.content) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0,150,300].map(d => (
                          <div key={d} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre seu estoque..."
                disabled={isLoading}
                rows={1}
                className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:outline-none disabled:opacity-50 bg-gray-50"
                style={{ fontSize: '16px', maxHeight: 100 }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading}
                className="h-11 w-11 p-0 bg-violet-600 hover:bg-violet-700 rounded-xl flex-shrink-0">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nova linha</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}