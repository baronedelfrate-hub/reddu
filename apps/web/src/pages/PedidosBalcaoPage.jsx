import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  Search, Plus, Minus, Trash2, Loader2, ImageOff, MapPin, Wallet, FileText, CalendarClock,
  MessageSquare, CheckCircle2, Store, Bike, ShoppingBag, UserRound,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

// ---------------------------------------------------------------------------
// Pedidos Balcão (estilo PDV)
// Mesmo cardápio e mesma rpc_criar_pedido_cardapio do cardápio digital, mas a
// atendente monta o pedido e preenche os dados do cliente. O pedido já nasce
// ACEITO (origem 'balcao') e aparece em "Pedidos Agendados".
// ---------------------------------------------------------------------------

const formatPreco = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const formatarTelefone = (digitos) => {
  const d = soDigitos(digitos).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const formatarDoc = (digitos) => {
  const d = soDigitos(digitos).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

// Regras de combo (iguais ao cardápio público)
const comboEhMinimo = (item) => item.combo_modo === 'livre' || !!item.combo_permite_acima;
const comboLimiteTotal = (item) => (comboEhMinimo(item) ? (item.quantidade_maxima || Infinity) : item.combo_quantidade_total);
const fatorPrecoCombo = (item, total) => (
  item.combo_permite_acima && Number(item.preco) > 0 && total > item.combo_quantidade_total
    ? total / item.combo_quantidade_total : 1
);
const itemNoHorario = (item, agora) => {
  const ini = item.horario_disponivel_inicio?.slice(0, 5);
  const fim = item.horario_disponivel_fim?.slice(0, 5);
  if (!ini || !fim) return true;
  const hhmm = agora.toTimeString().slice(0, 5);
  return ini <= fim ? (hhmm >= ini && hhmm <= fim) : (hhmm >= ini || hhmm <= fim);
};
const precoLinha = (c) => {
  const extrasSabores = c.sabores.reduce((s, sabor) => s + sabor.precoAdicional * sabor.quantidade, 0);
  const extrasAdicionais = (c.adicionais || []).reduce((s, a) => s + a.precoAdicional, 0);
  return (c.item.preco * (c.fatorPreco || 1) + extrasSabores + extrasAdicionais) * c.quantidade;
};

async function extrairErroFuncao(error, fallback = 'Tente novamente em instantes.') {
  if (!error) return fallback;
  try {
    if (error.context && typeof error.context.json === 'function') {
      const corpo = await error.context.clone().json();
      if (corpo?.error) return corpo.error;
    }
  } catch (e) { /* segue pro fallback */ }
  return error.message || fallback;
}

const FORM_VAZIO = { nome: '', telefone: '', cpf: '', observacao: '' };
const ENTREGA_VAZIA = { tipo: 'retirada', rua: '', numero: '', complemento: '', taxaInfo: null, taxaManual: '' };

export default function PedidosBalcaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [categoriasBrutas, setCategoriasBrutas] = useState([]);
  const [itensBrutos, setItensBrutos] = useState([]);
  const [saboresPorItem, setSaboresPorItem] = useState({});
  const [gruposPorItem, setGruposPorItem] = useState({});
  const [agora, setAgora] = useState(() => new Date());

  const [busca, setBusca] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [entrega, setEntrega] = useState(ENTREGA_VAZIA);
  const [pagamento, setPagamento] = useState({ tipo: 'dinheiro', troco: '' });
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimoPedido, setUltimoPedido] = useState(null);

  // dialogs
  const [dlg, setDlg] = useState(null); // 'entrega' | 'pagamento' | 'cpf' | 'agendar' | 'obs'
  const [comboAberto, setComboAberto] = useState(null);
  const [comboSelecoes, setComboSelecoes] = useState({});
  const [adicionaisSel, setAdicionaisSel] = useState({});

  // cliente
  const [sugestoesCliente, setSugestoesCliente] = useState([]);
  const [mostrarSugestoesCliente, setMostrarSugestoesCliente] = useState(false);
  const [clienteReconhecido, setClienteReconhecido] = useState(null);
  const debounceClienteRef = useRef(null);
  const blurClienteRef = useRef(null);

  // endereço
  const [sugestoesEndereco, setSugestoesEndereco] = useState([]);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const debounceEnderecoRef = useRef(null);

  const buscaRef = useRef(null);
  const telefoneRef = useRef(null);
  const listaRef = useRef(null);
  const navRef = useRef(null);

  // ---------------------------------------------------------------- carga
  useEffect(() => {
    if (!empresaId) return undefined;
    let cancelado = false;
    const carregar = async () => {
      setCarregando(true);
      setErroCarga(null);
      try {
        const [{ data: emp, error: empErr }, { data: cats, error: catsErr }, { data: itens, error: itensErr }] = await Promise.all([
          supabase.from('empresas').select('id, nome, cardapio_config').eq('id', empresaId).maybeSingle(),
          supabase.from('cardapio_categorias').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('ordem').order('nome'),
          supabase.from('cardapio_itens').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('ordem').order('nome'),
        ]);
        if (empErr) throw empErr;
        if (catsErr) throw catsErr;
        if (itensErr) throw itensErr;
        if (cancelado) return;
        setEmpresa(emp || null);
        setCategoriasBrutas(cats || []);
        setItensBrutos(itens || []);

        const comboIds = (itens || []).filter((i) => i.combo_quantidade_total != null).map((i) => i.id);
        const sabAgrup = {};
        if (comboIds.length > 0) {
          const { data: sabores } = await supabase
            .from('cardapio_combo_opcoes').select('*').in('cardapio_item_id', comboIds).eq('ativo', true).order('ordem');
          (sabores || []).forEach((s) => { (sabAgrup[s.cardapio_item_id] = sabAgrup[s.cardapio_item_id] || []).push(s); });
        }
        setSaboresPorItem(sabAgrup);

        const grupAgrup = {};
        const ids = (itens || []).map((i) => i.id);
        if (ids.length > 0) {
          const { data: vinculos } = await supabase
            .from('cardapio_itens_grupos_adicionais')
            .select('cardapio_item_id, obrigatorio_override, minimo_override, maximo_override, ordem, cardapio_grupos_adicionais(id, nome, obrigatorio, minimo, maximo, ativo, cardapio_grupos_adicionais_opcoes(id, nome, preco_adicional, ativo, ordem))')
            .in('cardapio_item_id', ids)
            .order('ordem');
          (vinculos || []).forEach((v) => {
            const g = v.cardapio_grupos_adicionais;
            if (!g || !g.ativo) return;
            const opcoes = (g.cardapio_grupos_adicionais_opcoes || []).filter((o) => o.ativo).sort((a, b) => a.ordem - b.ordem);
            if (opcoes.length === 0) return;
            (grupAgrup[v.cardapio_item_id] = grupAgrup[v.cardapio_item_id] || []).push({
              id: g.id,
              nome: g.nome,
              obrigatorio: v.obrigatorio_override ?? g.obrigatorio,
              minimo: v.minimo_override ?? g.minimo,
              maximo: v.maximo_override ?? g.maximo,
              opcoes,
            });
          });
        }
        setGruposPorItem(grupAgrup);
      } catch (e) {
        console.error('[Balcão] erro ao carregar cardápio:', e);
        if (!cancelado) setErroCarga(e.message || 'Erro ao carregar o cardápio.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    };
    carregar();
    return () => { cancelado = true; };
  }, [empresaId]);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ------------------------------------------------------------- catálogo
  const itensVisiveis = useMemo(() => {
    const dia = agora.getDay();
    const termo = semAcento(busca.trim());
    return itensBrutos.filter((item) => {
      if (item.dias_disponiveis && item.dias_disponiveis.length > 0 && !item.dias_disponiveis.includes(dia)) return false;
      if (!itemNoHorario(item, agora)) return false;
      if (termo && !semAcento(`${item.nome} ${item.descricao || ''}`).includes(termo)) return false;
      return true;
    });
  }, [itensBrutos, agora, busca]);

  const secoes = useMemo(() => categoriasBrutas
    .map((c) => ({ categoria: c, itens: itensVisiveis.filter((i) => i.categoria_id === c.id) }))
    .filter((s) => s.itens.length > 0), [categoriasBrutas, itensVisiveis]);

  const podePedir = (item) => {
    if (item.combo_quantidade_total != null) return (saboresPorItem[item.id]?.length || 0) > 0;
    return !!item.produto_id && !!item.local_id;
  };

  const irParaCategoria = (id) => {
    setCategoriaAtiva(id);
    const el = document.getElementById(`balcao-cat-${id}`);
    if (el && listaRef.current) {
      listaRef.current.scrollTo({ top: el.offsetTop - listaRef.current.offsetTop - 4, behavior: 'smooth' });
    }
  };

  // ------------------------------------------------------------- carrinho
  const avisarMaximo = (item) => toast({ title: `Máximo de ${item.quantidade_maxima} por pedido`, description: item.nome, variant: 'destructive' });

  const addSimples = (item) => {
    const atual = cart.find((c) => c.chave === item.id)?.quantidade || 0;
    if (item.quantidade_maxima && atual + 1 > item.quantidade_maxima) { avisarMaximo(item); return; }
    setCart((prev) => {
      const ex = prev.find((c) => c.chave === item.id);
      if (ex) return prev.map((c) => (c.chave === item.id ? { ...c, quantidade: c.quantidade + 1 } : c));
      return [...prev, { chave: item.id, item, isCombo: false, quantidade: 1, sabores: [], adicionais: [] }];
    });
  };

  const abrirItem = (item) => {
    if (!podePedir(item)) {
      toast({ title: 'Item indisponível', description: 'Esse item não está vinculado ao estoque.', variant: 'destructive' });
      return;
    }
    if (item.combo_quantidade_total != null || (gruposPorItem[item.id] || []).length > 0) {
      setComboAberto(item);
      setComboSelecoes({});
      setAdicionaisSel({});
    } else {
      addSimples(item);
    }
  };

  const definirQtdLinha = (chave, n) => {
    const linha = cart.find((c) => c.chave === chave);
    if (!linha) return;
    let q = Math.max(0, Math.floor(n) || 0);
    if (!linha.isCombo && linha.item.quantidade_maxima && q > linha.item.quantidade_maxima) {
      q = linha.item.quantidade_maxima;
      avisarMaximo(linha.item);
    }
    setCart((prev) => prev.map((c) => (c.chave === chave ? { ...c, quantidade: q } : c)).filter((c) => c.quantidade > 0));
  };

  const subtotal = cart.reduce((s, c) => s + precoLinha(c), 0);

  // combo
  const comboTotal = Object.values(comboSelecoes).reduce((s, v) => s + v, 0);
  const definirSabor = (opcaoId, valor) => {
    if (!comboAberto) return;
    const limite = comboLimiteTotal(comboAberto);
    setComboSelecoes((prev) => {
      const outros = Object.entries(prev).reduce((soma, [k, v]) => (k === opcaoId ? soma : soma + v), 0);
      const permitido = Math.max(0, limite - outros);
      return { ...prev, [opcaoId]: Math.min(Math.max(0, Math.floor(valor) || 0), permitido) };
    });
  };
  const comboAtingiuMinimo = (item, total) => (
    comboEhMinimo(item) ? total >= item.combo_quantidade_total && total <= comboLimiteTotal(item) : total === item.combo_quantidade_total
  );
  const toggleAdicional = (grupo, opcaoId) => {
    setAdicionaisSel((prev) => {
      const atuais = prev[grupo.id] || [];
      if (atuais.includes(opcaoId)) return { ...prev, [grupo.id]: atuais.filter((id) => id !== opcaoId) };
      if (atuais.length >= grupo.maximo) return grupo.maximo === 1 ? { ...prev, [grupo.id]: [opcaoId] } : prev;
      return { ...prev, [grupo.id]: [...atuais, opcaoId] };
    });
  };
  const gruposAtendidos = (item) => (gruposPorItem[item?.id] || []).every((g) => {
    const qtd = (adicionaisSel[g.id] || []).length;
    return qtd >= g.minimo && (!g.obrigatorio || qtd >= Math.max(g.minimo, 1));
  });
  const confirmarCombo = () => {
    if (!comboAberto) return;
    const isCombo = comboAberto.combo_quantidade_total != null;
    if (isCombo && !comboAtingiuMinimo(comboAberto, comboTotal)) return;
    if (!gruposAtendidos(comboAberto)) return;
    const sabores = isCombo
      ? (saboresPorItem[comboAberto.id] || []).filter((s) => (comboSelecoes[s.id] || 0) > 0)
        .map((s) => ({ opcaoId: s.id, nome: s.nome, quantidade: comboSelecoes[s.id], precoAdicional: Number(s.preco_adicional) }))
      : [];
    const adicionais = (gruposPorItem[comboAberto.id] || []).flatMap((g) => (adicionaisSel[g.id] || []).map((opcaoId) => {
      const o = g.opcoes.find((x) => x.id === opcaoId);
      return o ? { opcaoId: o.id, grupoId: g.id, nome: o.nome, precoAdicional: Number(o.preco_adicional) } : null;
    }).filter(Boolean));
    setCart((prev) => [...prev, {
      chave: `${comboAberto.id}-${Date.now()}`,
      item: comboAberto,
      isCombo,
      quantidade: 1,
      sabores,
      adicionais,
      fatorPreco: isCombo ? fatorPrecoCombo(comboAberto, comboTotal) : 1,
    }]);
    setComboAberto(null);
  };

  // --------------------------------------------------------------- entrega
  const enderecoCompleto = entrega.rua.trim()
    ? `${entrega.rua.trim()}${entrega.numero.trim() ? `, ${entrega.numero.trim()}` : ''}${entrega.complemento.trim() ? ` - ${entrega.complemento.trim()}` : ''}`
    : '';
  const tabelaTaxa = empresa?.cardapio_config?.taxa_entrega?.tabela;
  const faixaAtual = (() => {
    if (!entrega.taxaInfo || !Array.isArray(tabelaTaxa) || tabelaTaxa.length === 0) return null;
    const ord = [...tabelaTaxa].sort((a, b) => a.ate_km - b.ate_km);
    return ord.find((f) => entrega.taxaInfo.distanciaKm <= f.ate_km) || ord[ord.length - 1];
  })();
  const taxaRetornoFaixa = faixaAtual && faixaAtual.taxa_retorno != null && faixaAtual.taxa_retorno !== '' ? Number(faixaAtual.taxa_retorno) : null;
  const manualPreenchida = entrega.taxaManual !== '' && !isNaN(Number(String(entrega.taxaManual).replace(',', '.')));
  const taxaManualNum = manualPreenchida ? Number(String(entrega.taxaManual).replace(',', '.')) : null;
  const usaTaxaRetorno = entrega.tipo === 'entrega' && !manualPreenchida && pagamento.tipo === 'cartao' && taxaRetornoFaixa != null && !isNaN(taxaRetornoFaixa);
  const taxaAplicada = entrega.tipo !== 'entrega' ? 0
    : manualPreenchida ? taxaManualNum
      : (entrega.taxaInfo ? (usaTaxaRetorno ? taxaRetornoFaixa : (entrega.taxaInfo.taxa || 0)) : 0);
  const total = subtotal + taxaAplicada;
  const trocoNum = Number(String(pagamento.troco).replace(',', '.')) || 0;

  const digitarEndereco = (texto) => {
    setEntrega((e) => ({ ...e, rua: texto, taxaInfo: null }));
    if (debounceEnderecoRef.current) clearTimeout(debounceEnderecoRef.current);
    if (texto.trim().length < 3) { setSugestoesEndereco([]); return; }
    debounceEnderecoRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke('autocompletar-endereco', { body: { input: texto } });
        setSugestoesEndereco(data?.sugestoes || []);
      } catch (e) { /* sem sugestões */ }
    }, 400);
  };

  const calcularTaxa = async () => {
    if (!entrega.rua.trim()) { toast({ title: 'Informe o endereço primeiro', variant: 'destructive' }); return; }
    setCalculandoTaxa(true);
    try {
      const { data, error } = await supabase.functions.invoke('calcular-taxa-entrega', {
        body: { empresa_id: empresaId, endereco_destino: enderecoCompleto },
      });
      if (error) { toast({ title: 'Não foi possível calcular a taxa', description: await extrairErroFuncao(error), variant: 'destructive' }); return; }
      if (!data?.success) { toast({ title: 'Não foi possível calcular a taxa', description: data?.error, variant: 'destructive' }); return; }
      if (!data.dentro_da_area) { toast({ title: 'Fora da área de entrega', description: `Distância: ${data.distancia_km}km.`, variant: 'destructive' }); return; }
      setEntrega((e) => ({ ...e, taxaInfo: { distanciaKm: data.distancia_km, taxa: data.taxa, bairro: data.bairro || null }, taxaManual: '' }));
    } catch (e) {
      toast({ title: 'Erro ao calcular taxa', description: await extrairErroFuncao(e), variant: 'destructive' });
    } finally {
      setCalculandoTaxa(false);
    }
  };

  // --------------------------------------------------------------- cliente
  const buscarClientes = useCallback((telefone, nome) => {
    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current);
    const dig = soDigitos(telefone);
    const termo = String(nome || '').replace(/[%,()*]/g, ' ').trim();
    if (dig.length < 3 && termo.length < 3) { setSugestoesCliente([]); setClienteReconhecido(null); return; }
    debounceClienteRef.current = setTimeout(async () => {
      try {
        const filtros = [];
        if (dig.length >= 3) filtros.push(`telefone.ilike.*${dig}*`);
        if (termo.length >= 3) filtros.push(`nome.ilike.*${termo}*`);
        const { data } = await supabase
          .from('cardapio_clientes')
          .select('id, nome, telefone, cpf, total_pedidos, ultimo_pedido_em')
          .eq('empresa_id', empresaId)
          .or(filtros.join(','))
          .order('ultimo_pedido_em', { ascending: false, nullsFirst: false })
          .limit(6);
        setSugestoesCliente(data || []);
        // Telefone completo já cadastrado: reconhece o cliente na hora e completa os dados.
        if (dig.length >= 10) {
          const exato = (data || []).find((c) => soDigitos(c.telefone) === dig);
          setClienteReconhecido(exato || null);
          if (exato) preencherCliente(exato, true);
        } else {
          setClienteReconhecido(null);
        }
      } catch (e) { setSugestoesCliente([]); }
    }, 300);
  }, [empresaId]);

  // auto=true: telefone digitado já bate com um cadastro → completa só o que está vazio.
  const preencherCliente = async (c, auto = false) => {
    setForm((f) => (auto
      ? { ...f, nome: f.nome.trim() ? f.nome : (c.nome || ''), cpf: f.cpf || soDigitos(c.cpf) }
      : { ...f, nome: c.nome || '', telefone: soDigitos(c.telefone), cpf: soDigitos(c.cpf) }));
    if (!auto) {
      setSugestoesCliente([]);
      setMostrarSugestoesCliente(false);
    }
    try {
      const { data } = await supabase
        .from('pedidos_cardapio')
        .select('endereco_entrega')
        .eq('empresa_id', empresaId)
        .eq('cliente_telefone', soDigitos(c.telefone))
        .eq('tipo_entrega', 'entrega')
        .not('endereco_entrega', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      const ultimo = data?.[0]?.endereco_entrega;
      if (ultimo) {
        setEntrega((e) => (auto && e.rua ? e : { ...e, rua: ultimo, numero: '', complemento: '', taxaInfo: null, taxaManual: '' }));
        if (!auto) toast({ title: 'Cliente encontrado', description: 'Último endereço de entrega carregado (botão Entrega).' });
      }
    } catch (e) { /* sem endereço anterior */ }
  };
  const selecionarCliente = (c) => { setClienteReconhecido(c); preencherCliente(c, false); };

  // ------------------------------------------------------------------ envio
  const limparTudo = () => {
    setCart([]);
    setForm(FORM_VAZIO);
    setEntrega(ENTREGA_VAZIA);
    setPagamento({ tipo: 'dinheiro', troco: '' });
    setDataAgendamento('');
    setSugestoesCliente([]);
    setClienteReconhecido(null);
    setBusca('');
  };

  const gerarPedido = async () => {
    if (enviando) return;
    if (cart.length === 0) { toast({ title: 'Adicione pelo menos um item', variant: 'destructive' }); return; }
    if (!form.nome.trim()) { toast({ title: 'Informe o nome do cliente', variant: 'destructive' }); return; }
    if (soDigitos(form.telefone).length < 10) { toast({ title: 'Informe o telefone com DDD', variant: 'destructive' }); return; }
    if (entrega.tipo === 'entrega') {
      if (!entrega.rua.trim()) { toast({ title: 'Informe o endereço de entrega', variant: 'destructive' }); setDlg('entrega'); return; }
      if (!manualPreenchida && !entrega.taxaInfo) { toast({ title: 'Calcule ou informe a taxa de entrega', variant: 'destructive' }); setDlg('entrega'); return; }
    }
    if (pagamento.tipo === 'dinheiro' && trocoNum > 0 && trocoNum < total) {
      toast({ title: 'Troco menor que o total', description: `Use um valor a partir de ${formatPreco(total)} ou deixe em branco.`, variant: 'destructive' });
      setDlg('pagamento');
      return;
    }
    const doc = soDigitos(form.cpf);
    if (doc && doc.length !== 11 && doc.length !== 14) { toast({ title: 'CPF/CNPJ incompleto', variant: 'destructive' }); setDlg('cpf'); return; }

    setEnviando(true);
    try {
      const telefone = soDigitos(form.telefone);
      const { data, error } = await supabase.rpc('rpc_criar_pedido_cardapio', {
        p_empresa_id: empresaId,
        p_cliente_nome: form.nome.trim(),
        p_cliente_telefone: telefone,
        p_tipo_entrega: entrega.tipo,
        p_endereco_entrega: entrega.tipo === 'entrega' ? enderecoCompleto : null,
        p_observacao: form.observacao.trim() || null,
        p_itens: cart.map((c) => ({
          cardapio_item_id: c.item.id,
          quantidade: c.quantidade,
          ...(c.isCombo ? { sabores: c.sabores.map((s) => ({ opcao_id: s.opcaoId, quantidade: s.quantidade })) } : {}),
          ...((c.adicionais || []).length > 0 ? { adicionais: c.adicionais.map((a) => ({ opcao_id: a.opcaoId })) } : {}),
        })),
        p_data_agendamento: dataAgendamento ? new Date(dataAgendamento).toISOString() : null,
        p_cupom_codigo: null,
        p_taxa_entrega: taxaAplicada,
      });
      if (error) throw error;

      const { error: aceiteError } = await supabase.rpc('rpc_aceitar_pedido_cardapio', {
        p_pedido_id: data.id, p_pagamento_confirmado: false, p_origem: 'balcao',
      });
      if (aceiteError) {
        console.error('Erro ao aceitar pedido do balcão:', aceiteError);
        toast({ title: `Pedido #${data.numero_pedido} criado, mas não foi aceito automaticamente`, description: 'Abra Pedidos Agendados e aceite manualmente.', variant: 'destructive' });
      }

      const { error: pagErr } = await supabase.rpc('rpc_definir_pagamento_entrega', {
        p_pedido_id: data.id,
        p_tipo: pagamento.tipo,
        p_troco_para: pagamento.tipo === 'dinheiro' && trocoNum > 0 ? trocoNum : null,
        p_taxa_retorno_aplicada: usaTaxaRetorno,
      });
      if (pagErr) console.error('Erro ao salvar forma de pagamento:', pagErr);

      if (entrega.tipo === 'entrega' && entrega.taxaInfo?.bairro) {
        supabase.rpc('rpc_atualizar_bairro_pedido_cardapio', { p_pedido_id: data.id, p_bairro: entrega.taxaInfo.bairro })
          .then(({ error: e }) => { if (e) console.error('Erro ao salvar bairro:', e); });
      }
      if (doc) {
        supabase.from('cardapio_clientes').update({ cpf: doc }).eq('empresa_id', empresaId).eq('telefone', telefone)
          .then(({ error: e }) => { if (e) console.error('Erro ao salvar CPF do cliente:', e); });
      }
      supabase.functions.invoke('enviar-confirmacao-pedido', { body: { pedido_id: data.id } })
        .catch((e) => console.error('Erro ao notificar pedido por WhatsApp:', e));

      setUltimoPedido({ numero: data.numero_pedido, total, agendado: dataAgendamento || null });
      toast({ title: `Pedido #${data.numero_pedido} gerado`, description: 'Já está em Pedidos Agendados (Aceitos).' });
      limparTudo();
      setTimeout(() => setUltimoPedido(null), 6000);
    } catch (e) {
      toast({ title: 'Erro ao gerar o pedido', description: e.message?.replace(/^.*ERROR:\s*/i, ''), variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  // -------------------------------------------------------------- atalhos
  const gerarRef = useRef(gerarPedido);
  gerarRef.current = gerarPedido;
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (dlg || comboAberto) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      const digitando = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Enter' && !digitando && tag !== 'button') { e.preventDefault(); gerarRef.current(); return; }
      if (digitando) return;
      const k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); buscaRef.current?.focus(); }
      else if (k === 'n') { e.preventDefault(); navRef.current?.querySelector('button')?.focus(); }
      else if (k === 'e') { e.preventDefault(); setDlg('entrega'); }
      else if (k === 'r') { e.preventDefault(); setDlg('pagamento'); }
      else if (k === 't') { e.preventDefault(); setDlg('cpf'); }
      else if (k === 'g') { e.preventDefault(); setDlg('agendar'); }
      else if (k === '0') { e.preventDefault(); setDlg('obs'); }
      else if (k === 'c') { e.preventDefault(); telefoneRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dlg, comboAberto]);

  const onNavKey = (e, idx) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const botoes = navRef.current?.querySelectorAll('button');
    const prox = botoes?.[idx + (e.key === 'ArrowDown' ? 1 : -1)];
    if (prox) { prox.focus(); prox.click(); }
  };

  // ----------------------------------------------------------------- UI
  const resumoEntrega = entrega.tipo === 'entrega' ? (enderecoCompleto ? 'Entrega' : 'Entrega (sem endereço)') : 'Retirada';
  const rotuloPag = pagamento.tipo === 'cartao' ? 'Cartão' : (trocoNum > 0 ? `Dinheiro (troco ${formatPreco(trocoNum)})` : 'Dinheiro');

  const conteudo = (() => {
    if (carregando) {
      return <div className="flex-1 flex items-center justify-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando cardápio...</div>;
    }
    if (erroCarga) {
      return <div className="flex-1 flex items-center justify-center text-red-600 px-6 text-center">Não foi possível carregar o cardápio: {erroCarga}</div>;
    }
    if (itensBrutos.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2 px-6 text-center">
          <Store className="h-10 w-10 text-gray-300" />
          <p className="font-semibold">Nenhum item no cardápio digital</p>
          <p className="text-sm">Cadastre os itens em Cardápio Digital para usar o balcão.</p>
        </div>
      );
    }
    return (
      <div className="flex-1 flex min-h-0">
        <aside className="w-28 md:w-36 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-2" ref={navRef}>
          <p className="text-[11px] font-bold text-gray-700 mb-2">[ N ] Navegar</p>
          <div className="space-y-2">
            {secoes.map((s, idx) => (
              <button
                key={s.categoria.id}
                type="button"
                onClick={() => irParaCategoria(s.categoria.id)}
                onKeyDown={(e) => onNavKey(e, idx)}
                className={`w-full min-h-[44px] px-2 py-2 rounded border text-[11px] font-bold uppercase leading-tight text-center transition-colors ${categoriaAtiva === s.categoria.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-800 border-gray-300 hover:bg-red-50'}`}
              >
                {s.categoria.nome}
              </button>
            ))}
          </div>
        </aside>
        <div className="flex-1 min-w-0 overflow-y-auto bg-white px-3 py-2" ref={listaRef}>
          {secoes.length === 0 && <p className="text-center text-gray-500 py-16">Nenhum item encontrado.</p>}
          {secoes.map((s) => (
            <section key={s.categoria.id} id={`balcao-cat-${s.categoria.id}`} className="mb-3">
              <h2 className="text-xs font-semibold text-gray-500 mb-1 mt-2">{s.categoria.nome}</h2>
              <div className="space-y-1.5">
                {s.itens.map((item) => {
                  const qtd = cart.filter((c) => c.item.id === item.id).reduce((t, c) => t + c.quantidade, 0);
                  const ok = podePedir(item);
                  const isCombo = item.combo_quantidade_total != null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => abrirItem(item)}
                      className={`w-full flex items-center gap-3 p-2 rounded border text-left transition-colors ${ok ? 'border-gray-300 hover:bg-red-50 hover:border-red-300' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                    >
                      <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                        {item.imagem_url ? <img src={item.imagem_url} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.nome}</p>
                        <p className="text-xs text-gray-600">
                          {isCombo && item.combo_modo === 'livre' ? 'monte a quantidade' : formatPreco(item.preco)}
                          {isCombo && item.combo_modo !== 'livre' && ` · ${item.combo_permite_acima ? 'a partir de ' : ''}${item.combo_quantidade_total} un`}
                        </p>
                      </div>
                      {qtd > 0 && <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">{qtd}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  })();

  return (
    <>
      <Helmet><title>Pedidos Balcão - Reddu</title></Helmet>
      <DashboardLayout>
        <div className="flex h-[calc(100vh-3.5rem)] -m-4 md:-m-6 lg:-m-8 bg-gray-100 gap-3 p-3">
          {/* Coluna esquerda: busca + catálogo */}
          <div className="flex-1 min-w-0 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-gray-200">
              <div className="flex items-center gap-2 mr-1">
                <ShoppingBag className="h-5 w-5 text-red-600" />
                <h1 className="font-black text-gray-900 hidden md:block">Balcão</h1>
              </div>
              <div className="relative flex-1">
                <input
                  ref={buscaRef}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="[ P ] Pesquisar"
                  className="w-full h-10 pl-3 pr-10 rounded border border-gray-300 text-sm outline-none focus:border-red-500"
                />
                <Search className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <Link to="/dashboard/pedidos-agendados" className="text-xs font-semibold text-red-600 hover:underline whitespace-nowrap">Pedidos Agendados</Link>
            </div>
            {conteudo}
          </div>

          {/* Coluna direita: pedido */}
          <div className="w-[340px] lg:w-[380px] shrink-0 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between bg-gray-200 px-3 py-2 text-xs font-bold text-gray-800">
              <span>Itens do pedido</span>
              <span>Subtotal</span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {ultimoPedido && (
                <div className="mb-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Pedido #{ultimoPedido.numero} gerado ({formatPreco(ultimoPedido.total)}).</span>
                </div>
              )}
              {cart.length === 0 ? (
                <p className="text-center text-xs text-gray-500 mt-6">Escolha os itens ao lado, eles vão aparecer aqui</p>
              ) : (
                <ul className="space-y-2">
                  {cart.map((c) => (
                    <li key={c.chave} className="border border-gray-200 rounded p-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{c.item.nome}</p>
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{formatPreco(precoLinha(c))}</span>
                      </div>
                      {c.isCombo && c.sabores.length > 0 && (
                        <p className="text-[11px] text-gray-600 mt-0.5">{c.sabores.map((s) => `${s.quantidade}x ${s.nome}`).join(', ')}</p>
                      )}
                      {(c.adicionais || []).length > 0 && (
                        <p className="text-[11px] text-gray-600">+ {c.adicionais.map((a) => a.nome).join(', ')}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => definirQtdLinha(c.chave, c.quantidade - 1)} className="h-6 w-6 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50" aria-label="Diminuir"><Minus className="h-3 w-3" /></button>
                          <span className="w-7 text-center text-sm font-bold">{c.quantidade}</span>
                          <button type="button" onClick={() => definirQtdLinha(c.chave, c.quantidade + 1)} className="h-6 w-6 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-50" aria-label="Aumentar"><Plus className="h-3 w-3" /></button>
                        </div>
                        <button type="button" onClick={() => definirQtdLinha(c.chave, 0)} className="text-gray-400 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="button" onClick={() => setDlg('obs')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:underline text-left border-t border-gray-100">
              <MessageSquare className="h-3.5 w-3.5" /> {form.observacao.trim() ? `Obs.: ${form.observacao.trim().slice(0, 40)}${form.observacao.trim().length > 40 ? '…' : ''}` : '[ 0 ] Observação do pedido'}
            </button>

            <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-700 space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPreco(subtotal)}</span></div>
              <div className="flex justify-between"><span>Entrega</span><span className={taxaAplicada > 0 ? '' : 'text-red-600'}>{entrega.tipo === 'entrega' ? formatPreco(taxaAplicada) : 'Retirada'}</span></div>
              {dataAgendamento && (
                <div className="flex justify-between"><span>Agendado</span><span>{new Date(dataAgendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
              )}
            </div>
            <div className="flex justify-between items-center bg-gray-200 px-3 py-2 text-sm font-black text-gray-900">
              <span>Total</span><span>{formatPreco(total)}</span>
            </div>

            <div className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 relative">
                <input
                  ref={telefoneRef}
                  value={formatarTelefone(form.telefone)}
                  onChange={(e) => {
                    const v = soDigitos(e.target.value).slice(0, 11);
                    setForm((f) => ({ ...f, telefone: v }));
                    setMostrarSugestoesCliente(true);
                    buscarClientes(v, '');
                  }}
                  onFocus={() => { clearTimeout(blurClienteRef.current); setMostrarSugestoesCliente(true); buscarClientes(form.telefone, ''); }}
                  onBlur={() => { blurClienteRef.current = setTimeout(() => setMostrarSugestoesCliente(false), 200); }}
                  placeholder="Telefone (C)"
                  inputMode="tel"
                  className="h-10 px-2 rounded border border-red-400 text-sm outline-none focus:ring-1 focus:ring-red-500"
                />
                <input
                  value={form.nome}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, nome: e.target.value }));
                    setMostrarSugestoesCliente(true);
                    buscarClientes('', e.target.value);
                  }}
                  onFocus={() => { clearTimeout(blurClienteRef.current); setMostrarSugestoesCliente(true); }}
                  onBlur={() => { blurClienteRef.current = setTimeout(() => setMostrarSugestoesCliente(false), 200); }}
                  placeholder="Nome do cliente"
                  className="h-10 px-2 rounded border border-red-400 text-sm outline-none focus:ring-1 focus:ring-red-500"
                />
                {mostrarSugestoesCliente && sugestoesCliente.length > 0 && (
                  <ul className="absolute bottom-full left-0 right-0 mb-1 z-30 bg-white border border-gray-300 rounded shadow-lg max-h-56 overflow-y-auto">
                    {sugestoesCliente.map((c) => (
                      <li key={c.id}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selecionarCliente(c)} className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-gray-900 truncate">{c.nome || 'Sem nome'}</span>
                            <span className="block text-xs text-gray-500">{formatarTelefone(c.telefone)}{c.total_pedidos ? ` · ${c.total_pedidos} pedido(s)` : ''}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {clienteReconhecido && (
                <p className="text-xs text-emerald-700 flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> Cliente cadastrado{clienteReconhecido.total_pedidos ? ` · ${clienteReconhecido.total_pedidos} pedido(s)` : ''}</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDlg('entrega')} className={`h-9 rounded border text-xs font-semibold flex items-center justify-center gap-1 ${entrega.tipo === 'entrega' ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <Bike className="h-3.5 w-3.5" /> [ E ] {resumoEntrega}
                </button>
                <button type="button" onClick={() => setDlg('pagamento')} className="h-9 rounded border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1 truncate px-1">
                  <Wallet className="h-3.5 w-3.5 shrink-0" /> [ R ] {rotuloPag}
                </button>
                <button type="button" onClick={() => setDlg('cpf')} className={`h-9 rounded border text-xs font-semibold flex items-center justify-center gap-1 ${form.cpf ? 'border-red-500 text-red-700 bg-red-50' : 'border-red-400 text-red-700 hover:bg-red-50'}`}>
                  <FileText className="h-3.5 w-3.5" /> [ T ] {form.cpf ? formatarDoc(form.cpf) : 'CPF/CNPJ'}
                </button>
                <button type="button" onClick={() => setDlg('agendar')} className={`h-9 rounded border text-xs font-semibold flex items-center justify-center gap-1 ${dataAgendamento ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <CalendarClock className="h-3.5 w-3.5" /> [ G ] {dataAgendamento ? 'Agendado' : 'Agendar'}
                </button>
              </div>

              <button
                type="button"
                onClick={gerarPedido}
                disabled={enviando || cart.length === 0}
                className="w-full h-12 rounded bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                [ ENTER ] Gerar pedido
              </button>
              {cart.length > 0 && (
                <button type="button" onClick={limparTudo} className="w-full text-xs text-gray-500 hover:text-red-600">Limpar pedido</button>
              )}
            </div>
          </div>
        </div>

        {/* Customizador de combo / adicionais */}
        <Dialog open={!!comboAberto} onOpenChange={(o) => !o && setComboAberto(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {comboAberto && (() => {
              const isCombo = comboAberto.combo_quantidade_total != null;
              const grupos = gruposPorItem[comboAberto.id] || [];
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{comboAberto.nome}</DialogTitle>
                    <DialogDescription>
                      {comboAberto.descricao}
                      {isCombo && (comboEhMinimo(comboAberto)
                        ? ` Mínimo de ${comboAberto.combo_quantidade_total} itens${comboAberto.quantidade_maxima ? `, máximo ${comboAberto.quantidade_maxima}` : ''}.`
                        : ` Escolha exatamente ${comboAberto.combo_quantidade_total} itens.`)}
                    </DialogDescription>
                  </DialogHeader>
                  {isCombo && (
                    <div className={`text-sm font-medium rounded px-3 py-2 text-center ${comboAtingiuMinimo(comboAberto, comboTotal) ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {comboTotal} escolhidos
                      {comboEhMinimo(comboAberto) ? ` (mínimo ${comboAberto.combo_quantidade_total})` : ` / ${comboAberto.combo_quantidade_total}`}
                      {comboTotal >= comboAberto.combo_quantidade_total && (
                        <span className="block text-xs font-normal">
                          Total: {formatPreco(
                            Number(comboAberto.preco) * fatorPrecoCombo(comboAberto, comboTotal)
                            + (saboresPorItem[comboAberto.id] || []).reduce((s, sb) => s + (comboSelecoes[sb.id] || 0) * Number(sb.preco_adicional), 0),
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  {isCombo && (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {(saboresPorItem[comboAberto.id] || []).map((sabor) => (
                        <div key={sabor.id} className="flex items-center gap-3 border-b pb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{sabor.nome}</p>
                            {Number(sabor.preco_adicional) > 0 && <p className="text-xs text-gray-500">+{formatPreco(sabor.preco_adicional)} cada</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => definirSabor(sabor.id, (comboSelecoes[sabor.id] || 0) - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                            <input
                              type="number"
                              min="0"
                              value={comboSelecoes[sabor.id] || 0}
                              onChange={(e) => definirSabor(sabor.id, Number(e.target.value))}
                              aria-label={`Quantidade de ${sabor.nome}`}
                              className="w-14 h-7 text-center text-sm font-medium border border-gray-300 rounded"
                            />
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => definirSabor(sabor.id, (comboSelecoes[sabor.id] || 0) + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {grupos.length > 0 && (
                    <div className="space-y-4">
                      {grupos.map((grupo) => {
                        const sel = adicionaisSel[grupo.id] || [];
                        return (
                          <div key={grupo.id} className="space-y-1.5">
                            <p className="text-sm font-medium text-gray-900">
                              {grupo.nome}
                              <span className="ml-1 text-xs font-normal text-gray-500">({grupo.obrigatorio ? 'obrigatório' : 'opcional'}{grupo.maximo ? `, máx. ${grupo.maximo}` : ''})</span>
                            </p>
                            {grupo.opcoes.map((o) => (
                              <label key={o.id} className="flex items-center gap-2 border rounded px-3 py-2 cursor-pointer">
                                <input type="checkbox" className="h-4 w-4" checked={sel.includes(o.id)} onChange={() => toggleAdicional(grupo, o.id)} />
                                <span className="flex-1 text-sm text-gray-800">{o.nome}</span>
                                {Number(o.preco_adicional) > 0 && <span className="text-xs text-gray-500">+{formatPreco(o.preco_adicional)}</span>}
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setComboAberto(null)}>Cancelar</Button>
                    <Button onClick={confirmarCombo} disabled={(isCombo && !comboAtingiuMinimo(comboAberto, comboTotal)) || !gruposAtendidos(comboAberto)}>Adicionar ao pedido</Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Entrega */}
        <Dialog open={dlg === 'entrega'} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Retirada ou entrega</DialogTitle>
              <DialogDescription>Para entrega, informe o endereço e calcule o frete (ou digite a taxa).</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {['retirada', 'entrega'].map((t) => (
                <button key={t} type="button" onClick={() => setEntrega((e) => ({ ...e, tipo: t }))} className={`h-10 rounded border text-sm font-semibold ${entrega.tipo === t ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700'}`}>
                  {t === 'retirada' ? 'Retirada' : 'Entrega'}
                </button>
              ))}
            </div>
            {entrega.tipo === 'entrega' && (
              <div className="space-y-2">
                <div className="relative">
                  <input value={entrega.rua} onChange={(e) => digitarEndereco(e.target.value)} placeholder="Rua, avenida..." className="w-full h-10 px-3 rounded border border-gray-300 text-sm" />
                  {sugestoesEndereco.length > 0 && (
                    <ul className="absolute z-30 left-0 right-0 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                      {sugestoesEndereco.map((s, i) => (
                        <li key={s.place_id || i}>
                          <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2" onClick={() => { setEntrega((e) => ({ ...e, rua: s.descricao, taxaInfo: null })); setSugestoesEndereco([]); }}>
                            <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" /> {s.descricao}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={entrega.numero} onChange={(e) => setEntrega((x) => ({ ...x, numero: e.target.value, taxaInfo: null }))} placeholder="Número" className="h-10 px-3 rounded border border-gray-300 text-sm" />
                  <input value={entrega.complemento} onChange={(e) => setEntrega((x) => ({ ...x, complemento: e.target.value }))} placeholder="Complemento" className="h-10 px-3 rounded border border-gray-300 text-sm" />
                </div>
                <Button type="button" variant="outline" onClick={calcularTaxa} disabled={calculandoTaxa} className="w-full">
                  {calculandoTaxa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MapPin className="h-4 w-4 mr-2" />} Calcular frete
                </Button>
                {entrega.taxaInfo && (
                  <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                    {entrega.taxaInfo.distanciaKm} km{entrega.taxaInfo.bairro ? ` · ${entrega.taxaInfo.bairro}` : ''} · taxa {formatPreco(usaTaxaRetorno ? taxaRetornoFaixa : entrega.taxaInfo.taxa)}
                    {usaTaxaRetorno ? ' (taxa de retorno do cartão)' : ''}
                  </p>
                )}
                <div>
                  <label className="text-xs text-gray-600">Ou informe a taxa manualmente (R$)</label>
                  <input value={entrega.taxaManual} onChange={(e) => setEntrega((x) => ({ ...x, taxaManual: e.target.value }))} placeholder="0,00" inputMode="decimal" className="w-full h-10 px-3 rounded border border-gray-300 text-sm" />
                </div>
              </div>
            )}
            <DialogFooter><Button onClick={() => setDlg(null)}>Pronto</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pagamento */}
        <Dialog open={dlg === 'pagamento'} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Forma de pagamento</DialogTitle>
              <DialogDescription>Como o cliente vai pagar na retirada/entrega.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {[['dinheiro', 'Dinheiro'], ['cartao', 'Cartão (maquininha)']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setPagamento((p) => ({ ...p, tipo: v }))} className={`h-10 rounded border text-sm font-semibold ${pagamento.tipo === v ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700'}`}>{l}</button>
              ))}
            </div>
            {pagamento.tipo === 'dinheiro' && (
              <div>
                <label className="text-xs text-gray-600">Troco para (opcional)</label>
                <input value={pagamento.troco} onChange={(e) => setPagamento((p) => ({ ...p, troco: e.target.value }))} placeholder="Ex.: 100" inputMode="decimal" className="w-full h-10 px-3 rounded border border-gray-300 text-sm" />
              </div>
            )}
            <DialogFooter><Button onClick={() => setDlg(null)}>Pronto</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CPF/CNPJ */}
        <Dialog open={dlg === 'cpf'} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>CPF/CNPJ do cliente</DialogTitle>
              <DialogDescription>Opcional. Fica salvo no cadastro do cliente.</DialogDescription>
            </DialogHeader>
            <input autoFocus value={formatarDoc(form.cpf)} onChange={(e) => setForm((f) => ({ ...f, cpf: soDigitos(e.target.value).slice(0, 14) }))} onKeyDown={(e) => { if (e.key === 'Enter') setDlg(null); }} placeholder="000.000.000-00" inputMode="numeric" className="w-full h-10 px-3 rounded border border-gray-300 text-sm" />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setForm((f) => ({ ...f, cpf: '' })); setDlg(null); }}>Limpar</Button>
              <Button onClick={() => setDlg(null)}>Pronto</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agendar */}
        <Dialog open={dlg === 'agendar'} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agendar pedido</DialogTitle>
              <DialogDescription>Deixe em branco para um pedido sem hora marcada.</DialogDescription>
            </DialogHeader>
            <input type="datetime-local" value={dataAgendamento} onChange={(e) => setDataAgendamento(e.target.value)} className="w-full h-10 px-3 rounded border border-gray-300 text-sm" />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDataAgendamento(''); setDlg(null); }}>Sem agendamento</Button>
              <Button onClick={() => setDlg(null)}>Pronto</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Observação */}
        <Dialog open={dlg === 'obs'} onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Observação do pedido</DialogTitle>
              <DialogDescription>Aparece no cupom e na produção.</DialogDescription>
            </DialogHeader>
            <textarea autoFocus value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} rows={4} className="w-full px-3 py-2 rounded border border-gray-300 text-sm" />
            <DialogFooter><Button onClick={() => setDlg(null)}>Pronto</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}