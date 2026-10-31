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
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, Loader2, Image as ImageIcon, FolderOpen, UtensilsCrossed,
  ChevronUp, ChevronDown, Leaf, Copy, Tag, ListChecks,
} from 'lucide-react';

const DIAS_SEMANA_OPCOES = [
  { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' },
];
const RESTRICOES_ALIMENTARES_OPCOES = [
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'organico', label: 'Orgânico' },
  { value: 'sem_gluten', label: 'Sem glúten' },
  { value: 'sem_acucar', label: 'Sem açúcar' },
  { value: 'zero_lactose', label: 'Zero lactose' },
];

// Quinta e última das páginas que nasceram da antiga CardapioPage.jsx —
// essa é a que mais se usa no dia a dia: o CRUD de categorias e itens do
// cardápio (incluindo os combos "caixa com sabores"). Mesma lógica de
// sempre, só que sem os 8 painéis de configuração que estavam juntos antes.
export default function CardapioItensPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [itens, setItens] = useState([]);
  const [locais, setLocais] = useState([]);
  const [produtosDoLocal, setProdutosDoLocal] = useState([]);
  const [loadingProdutosLocal, setLoadingProdutosLocal] = useState(false);
  // Seleção múltipla de sabores (painel dentro do formulário do item)
  const [multiAberto, setMultiAberto] = useState(false);
  const [multiSel, setMultiSel] = useState([]);

  // O cardápio vende só do ESTOQUE CLÁSSICOS: é o único local oferecido pra
  // itens novos. Itens antigos que já usam outro local continuam editáveis.
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const localClassicos = locais.find((l) => semAcento(l.nome).includes('classicos')) || null;

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catNome, setCatNome] = useState('');
  const [catDeleteTarget, setCatDeleteTarget] = useState(null);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    categoria_id: '', produto_id: '', local_id: '', nome: '', descricao: '', preco: '', imagem_url: '',
    isCombo: false, comboModo: 'fechado', comboQuantidadeTotal: '', comboOpcoes: [],
    tipo: 'comida', restricoesAlimentares: [],
    disponibilidadeTodosDias: true, diasDisponiveis: [],
    limitarHorario: false, horarioInicio: '', horarioFim: '',
    comboPermiteAcima: false, quantidadeMaxima: '',
    gruposAdicionaisIds: [],
  });
  const [itemImageFile, setItemImageFile] = useState(null);
  const [itemDeleteTarget, setItemDeleteTarget] = useState(null);
  const [savingItem, setSavingItem] = useState(false);

  // --- Grupos de adicionais (reaproveitáveis entre itens/categorias) ---
  const [grupos, setGrupos] = useState([]);
  const [grupoDialogOpen, setGrupoDialogOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(null);
  const [grupoForm, setGrupoForm] = useState({ nome: '', obrigatorio: false, minimo: '0', maximo: '1', opcoes: [] });
  const [grupoDeleteTarget, setGrupoDeleteTarget] = useState(null);
  const [savingGrupo, setSavingGrupo] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [catRes, itensRes, locaisRes, gruposRes] = await Promise.all([
        supabase.from('cardapio_categorias').select('*').eq('empresa_id', empresaId).order('ordem').order('nome'),
        supabase.from('cardapio_itens').select('*').eq('empresa_id', empresaId).order('ordem').order('nome'),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('cardapio_grupos_adicionais').select('*, cardapio_grupos_adicionais_opcoes(*)').eq('empresa_id', empresaId).order('ordem').order('nome'),
      ]);
      if (catRes.error) throw catRes.error;
      if (itensRes.error) throw itensRes.error;
      if (locaisRes.error) throw locaisRes.error;
      if (gruposRes.error) throw gruposRes.error;

      setCategorias(catRes.data || []);
      setItens(itensRes.data || []);
      setLocais(locaisRes.data || []);
      setGrupos((gruposRes.data || []).map((g) => ({
        ...g,
        opcoes: (g.cardapio_grupos_adicionais_opcoes || []).slice().sort((a, b) => a.ordem - b.ordem),
      })));
    } catch (error) {
      console.error('Erro ao carregar itens do cardápio:', error);
      toast({ title: 'Erro ao carregar cardápio', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Categorias ---
  const openNewCat = () => { setEditingCat(null); setCatNome(''); setCatDialogOpen(true); };
  const openEditCat = (cat) => { setEditingCat(cat); setCatNome(cat.nome); setCatDialogOpen(true); };

  const handleSaveCat = async () => {
    if (!catNome.trim()) {
      toast({ title: 'Informe o nome da categoria', variant: 'destructive' });
      return;
    }
    try {
      if (editingCat) {
        const { error } = await supabase.from('cardapio_categorias')
          .update({ nome: catNome.trim() }).eq('id', editingCat.id);
        if (error) throw error;
      } else {
        // Usa o maior "ordem" existente + 1 em vez de categorias.length — assim não
        // gera um valor duplicado se alguma categoria já foi excluída antes.
        const proximaOrdem = categorias.length > 0 ? Math.max(...categorias.map((c) => c.ordem ?? 0)) + 1 : 0;
        const { error } = await supabase.from('cardapio_categorias')
          .insert({ empresa_id: empresaId, nome: catNome.trim(), ordem: proximaOrdem });
        if (error) throw error;
      }
      toast({ title: 'Categoria salva!' });
      setCatDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao salvar categoria', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteCat = async () => {
    if (!catDeleteTarget) return;
    try {
      const { error } = await supabase.from('cardapio_categorias').delete().eq('id', catDeleteTarget.id);
      if (error) throw error;
      toast({ title: 'Categoria removida.' });
      setCatDeleteTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao remover categoria', description: error.message, variant: 'destructive' });
    }
  };

  const [movingCatId, setMovingCatId] = useState(null);
  const handleMoveCat = async (index, direction) => {
    const alvo = categorias[index + direction];
    const atual = categorias[index];
    if (!alvo || !atual) return;
    setMovingCatId(atual.id);
    try {
      // Monta a nova ordem da lista inteira e regrava o "ordem" de todo mundo
      // sequencialmente (0, 1, 2...) em vez de só trocar os dois valores —
      // isso corrige sozinho qualquer duplicidade de "ordem" que tenha ficado
      // no banco (ex: duas categorias com ordem=0), que travava a reordenação.
      const novaLista = [...categorias];
      [novaLista[index], novaLista[index + direction]] = [novaLista[index + direction], novaLista[index]];

      const { error } = await supabase.from('cardapio_categorias').upsert(
        novaLista.map((cat, i) => ({ id: cat.id, empresa_id: empresaId, nome: cat.nome, ordem: i }))
      );
      if (error) throw error;

      // Atualiza localmente na hora pra não esperar o reload (sensação de resposta imediata)
      setCategorias(novaLista.map((cat, i) => ({ ...cat, ordem: i })));
    } catch (error) {
      toast({ title: 'Erro ao reordenar categoria', description: error.message, variant: 'destructive' });
    } finally {
      setMovingCatId(null);
    }
  };

  // --- Grupos de adicionais (reaproveitáveis entre itens/categorias) ---
  const openNewGrupo = () => {
    setEditingGrupo(null);
    setGrupoForm({ nome: '', obrigatorio: false, minimo: '0', maximo: '1', opcoes: [] });
    setGrupoDialogOpen(true);
  };
  const openEditGrupo = (grupo) => {
    setEditingGrupo(grupo);
    setGrupoForm({
      nome: grupo.nome,
      obrigatorio: grupo.obrigatorio,
      minimo: String(grupo.minimo),
      maximo: String(grupo.maximo),
      opcoes: (grupo.opcoes || []).map((o) => ({ id: o.id, nome: o.nome, preco_adicional: String(o.preco_adicional) })),
    });
    setGrupoDialogOpen(true);
  };
  const addGrupoOpcao = () => {
    setGrupoForm((f) => ({ ...f, opcoes: [...f.opcoes, { nome: '', preco_adicional: '0' }] }));
  };
  const updateGrupoOpcao = (index, patch) => {
    setGrupoForm((f) => ({ ...f, opcoes: f.opcoes.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));
  };
  const removeGrupoOpcao = (index) => {
    setGrupoForm((f) => ({ ...f, opcoes: f.opcoes.filter((_, i) => i !== index) }));
  };

  const handleSaveGrupo = async () => {
    if (!grupoForm.nome.trim()) {
      toast({ title: 'Informe o nome do grupo', variant: 'destructive' });
      return;
    }
    const opcoesValidas = grupoForm.opcoes.filter((o) => o.nome.trim());
    if (opcoesValidas.length === 0) {
      toast({ title: 'Adicione pelo menos uma opção', variant: 'destructive' });
      return;
    }
    const minimoNum = parseInt(grupoForm.minimo, 10) || 0;
    const maximoNum = parseInt(grupoForm.maximo, 10) || 1;
    if (maximoNum < minimoNum || maximoNum < 1) {
      toast({ title: 'O máximo precisa ser maior ou igual ao mínimo (e pelo menos 1)', variant: 'destructive' });
      return;
    }
    setSavingGrupo(true);
    try {
      const payload = {
        empresa_id: empresaId,
        nome: grupoForm.nome.trim(),
        obrigatorio: grupoForm.obrigatorio,
        minimo: minimoNum,
        maximo: maximoNum,
      };
      let grupoId = editingGrupo?.id;
      if (editingGrupo) {
        const { error } = await supabase.from('cardapio_grupos_adicionais').update(payload).eq('id', editingGrupo.id);
        if (error) throw error;
      } else {
        const proximaOrdem = grupos.length > 0 ? Math.max(...grupos.map((g) => g.ordem ?? 0)) + 1 : 0;
        const { data, error } = await supabase.from('cardapio_grupos_adicionais')
          .insert({ ...payload, ordem: proximaOrdem }).select().single();
        if (error) throw error;
        grupoId = data.id;
      }

      // Sincroniza as opções: apaga tudo e regrava do zero (lista sempre pequena)
      await supabase.from('cardapio_grupos_adicionais_opcoes').delete().eq('grupo_id', grupoId);
      const opcoesPayload = opcoesValidas.map((o, idx) => ({
        grupo_id: grupoId,
        nome: o.nome.trim(),
        preco_adicional: parseFloat(String(o.preco_adicional).replace(',', '.')) || 0,
        ordem: idx,
      }));
      const { error: opcoesError } = await supabase.from('cardapio_grupos_adicionais_opcoes').insert(opcoesPayload);
      if (opcoesError) throw opcoesError;

      toast({ title: 'Grupo de adicionais salvo!' });
      setGrupoDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao salvar grupo', description: error.message, variant: 'destructive' });
    } finally {
      setSavingGrupo(false);
    }
  };

  const handleDeleteGrupo = async () => {
    if (!grupoDeleteTarget) return;
    try {
      const { error } = await supabase.from('cardapio_grupos_adicionais').delete().eq('id', grupoDeleteTarget.id);
      if (error) throw error;
      toast({ title: 'Grupo removido.' });
      setGrupoDeleteTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao remover grupo', description: error.message, variant: 'destructive' });
    }
  };

  // --- Itens ---
  const fetchProdutosDoLocal = useCallback(async (localId, produtoJaVinculadoId) => {
    if (!localId || !empresaId) { setProdutosDoLocal([]); return; }
    setLoadingProdutosLocal(true);
    try {
      const { data: estoqueRows, error: estoqueError } = await supabase
        .from('estoque_por_local')
        .select('lote_id, produto_id, quantidade_atual')
        .eq('empresa_id', empresaId)
        .eq('local_id', localId)
        .gt('quantidade_atual', 0);
      if (estoqueError) throw estoqueError;

      const loteIds = (estoqueRows || []).map((r) => r.lote_id).filter(Boolean);
      let lotesData = [];
      if (loteIds.length > 0) {
        const { data, error } = await supabase
          .from('lotes')
          .select('id, produto_id, numero_lote, data_validade, ativo, lote_devolvido')
          .in('id', loteIds)
          .eq('ativo', true)
          .eq('lote_devolvido', false);
        if (error) throw error;
        lotesData = data || [];
      }

      const produtoIds = [...new Set(lotesData.map((l) => l.produto_id))];
      let produtosData = [];
      if (produtoIds.length > 0) {
        const { data, error } = await supabase.from('produtos').select('id, nome, imagem_url').in('id', produtoIds);
        if (error) throw error;
        produtosData = data || [];
      }

      const resumo = produtoIds.map((pid) => {
        const lotesDoProduto = lotesData.filter((l) => l.produto_id === pid);
        const quantidadeTotal = lotesDoProduto.reduce((sum, l) => {
          const estoque = estoqueRows.find((e) => e.lote_id === l.id);
          return sum + Number(estoque?.quantidade_atual || 0);
        }, 0);
        const validades = lotesDoProduto.map((l) => l.data_validade).filter(Boolean).sort();
        return {
          produto_id: pid,
          nome: produtosData.find((p) => p.id === pid)?.nome || 'Produto',
          imagem_url: produtosData.find((p) => p.id === pid)?.imagem_url || null,
          quantidade_total: quantidadeTotal,
          proxima_validade: validades[0] || null,
          lotes_count: lotesDoProduto.length,
          sem_estoque: false,
        };
      });

      // Se o item já estava vinculado a um produto que não tem mais estoque
      // nesse local, mantém ele na lista (marcado) pra não sumir da edição.
      if (produtoJaVinculadoId && !resumo.find((r) => r.produto_id === produtoJaVinculadoId)) {
        const { data: produtoAtual } = await supabase.from('produtos').select('id, nome, imagem_url').eq('id', produtoJaVinculadoId).maybeSingle();
        if (produtoAtual) {
          resumo.push({ produto_id: produtoAtual.id, nome: produtoAtual.nome, imagem_url: produtoAtual.imagem_url || null, quantidade_total: 0, proxima_validade: null, lotes_count: 0, sem_estoque: true });
        }
      }

      resumo.sort((a, b) => a.nome.localeCompare(b.nome));
      setProdutosDoLocal(resumo);
    } catch (error) {
      console.error('Erro ao buscar produtos do local:', error);
      setProdutosDoLocal([]);
    } finally {
      setLoadingProdutosLocal(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (itemDialogOpen && itemForm.local_id) {
      fetchProdutosDoLocal(itemForm.local_id, editingItem?.produto_id);
    } else if (!itemForm.local_id) {
      setProdutosDoLocal([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemForm.local_id, itemDialogOpen]);

  const openNewItem = (categoriaId) => {
    setEditingItem(null);
    setItemForm({
      categoria_id: categoriaId || categorias[0]?.id || '', produto_id: '', local_id: localClassicos?.id || '', nome: '', descricao: '', preco: '', imagem_url: '',
      isCombo: false, comboModo: 'fechado', comboQuantidadeTotal: '', comboOpcoes: [],
      tipo: 'comida', restricoesAlimentares: [],
      disponibilidadeTodosDias: true, diasDisponiveis: [],
      limitarHorario: false, horarioInicio: '', horarioFim: '',
      comboPermiteAcima: false, quantidadeMaxima: '',
      gruposAdicionaisIds: [],
    });
    setItemImageFile(null);
    setMultiAberto(false);
    setMultiSel([]);
    setItemDialogOpen(true);
  };
  const openEditItem = async (item) => {
    setEditingItem(item);
    setItemForm({
      categoria_id: item.categoria_id, produto_id: item.produto_id || '', local_id: item.local_id || '', nome: item.nome, descricao: item.descricao || '',
      preco: String(item.preco), imagem_url: item.imagem_url || '',
      isCombo: item.combo_quantidade_total != null, comboModo: item.combo_modo || 'fechado',
      comboQuantidadeTotal: item.combo_quantidade_total != null ? String(item.combo_quantidade_total) : '',
      comboOpcoes: [],
      tipo: item.tipo || 'comida', restricoesAlimentares: item.restricoes_alimentares || [],
      disponibilidadeTodosDias: !item.dias_disponiveis || item.dias_disponiveis.length === 0,
      diasDisponiveis: item.dias_disponiveis || [],
      limitarHorario: !!(item.horario_disponivel_inicio && item.horario_disponivel_fim),
      horarioInicio: item.horario_disponivel_inicio ? item.horario_disponivel_inicio.slice(0, 5) : '',
      horarioFim: item.horario_disponivel_fim ? item.horario_disponivel_fim.slice(0, 5) : '',
      comboPermiteAcima: !!item.combo_permite_acima,
      quantidadeMaxima: item.quantidade_maxima != null ? String(item.quantidade_maxima) : '',
      gruposAdicionaisIds: [],
    });
    setItemImageFile(null);
    setMultiAberto(false);
    setMultiSel([]);
    setItemDialogOpen(true);

    if (item.combo_quantidade_total != null) {
      const { data, error } = await supabase.from('cardapio_combo_opcoes').select('*').eq('cardapio_item_id', item.id).order('ordem');
      if (!error) {
        setItemForm((f) => ({
          ...f,
          comboOpcoes: (data || []).map((o) => ({ produto_id: o.produto_id, nome: o.nome, preco_adicional: String(o.preco_adicional), imagem_url: o.imagem_url || '', imagemFile: null })),
        }));
      }
    }

    const { data: gruposVinculados, error: gruposVincError } = await supabase
      .from('cardapio_itens_grupos_adicionais').select('grupo_id').eq('cardapio_item_id', item.id);
    if (!gruposVincError) {
      setItemForm((f) => ({ ...f, gruposAdicionaisIds: (gruposVinculados || []).map((g) => g.grupo_id) }));
    }
  };

  const addComboOpcao = () => {
    setItemForm((f) => ({ ...f, comboOpcoes: [...f.comboOpcoes, { produto_id: '', nome: '', preco_adicional: '0', imagem_url: '', imagemFile: null }] }));
  };
  const updateComboOpcao = (index, patch) => {
    setItemForm((f) => ({
      ...f,
      comboOpcoes: f.comboOpcoes.map((o, i) => {
        if (i !== index) return o;
        const updated = { ...o, ...patch };
        if (patch.produto_id) {
          const produto = produtosDoLocal.find((p) => p.produto_id === patch.produto_id);
          if (produto && !o.nome) updated.nome = produto.nome;
          // Reaproveita a foto do cadastro do produto automaticamente, desde
          // que o sabor ainda não tenha uma foto própria definida.
          if (produto?.imagem_url && !o.imagem_url && !o.imagemFile) updated.imagem_url = produto.imagem_url;
        }
        return updated;
      }),
    }));
  };
  const usarFotoCadastroSabor = (index) => {
    const opcao = itemForm.comboOpcoes[index];
    const produto = produtosDoLocal.find((p) => p.produto_id === opcao?.produto_id);
    if (!produto?.imagem_url) return;
    updateComboOpcao(index, { imagem_url: produto.imagem_url, imagemFile: null });
  };
  const toggleMultiSel = (produtoId) => {
    setMultiSel((prev) => (prev.includes(produtoId) ? prev.filter((id) => id !== produtoId) : [...prev, produtoId]));
  };
  const adicionarSelecionados = () => {
    if (multiSel.length === 0) return;
    setItemForm((f) => {
      const jaTem = new Set(f.comboOpcoes.map((o) => o.produto_id).filter(Boolean));
      const novos = produtosDoLocal
        .filter((p) => multiSel.includes(p.produto_id) && !jaTem.has(p.produto_id))
        .map((p) => ({ produto_id: p.produto_id, nome: p.nome, preco_adicional: '0', imagem_url: p.imagem_url || '', imagemFile: null }));
      // descarta linhas totalmente vazias (ex.: o sabor em branco que vem por padrão)
      const base = f.comboOpcoes.filter((o) => o.produto_id || o.nome || o.imagem_url || o.imagemFile);
      return { ...f, comboOpcoes: [...base, ...novos] };
    });
    toast({ title: `${multiSel.length} produto(s) adicionado(s) como sabor` });
    setMultiSel([]);
    setMultiAberto(false);
  };
  const removeComboOpcao = (index) => {
    setItemForm((f) => ({ ...f, comboOpcoes: f.comboOpcoes.filter((_, i) => i !== index) }));
  };

  const handleSaveItem = async () => {
    const precoNum = parseFloat(String(itemForm.preco).replace(',', '.'));
    if (!itemForm.nome.trim() || !itemForm.categoria_id || isNaN(precoNum) || precoNum < 0) {
      toast({ title: 'Preencha nome, categoria e um preço válido', variant: 'destructive' });
      return;
    }
    let comboTotalNum = null;
    if (itemForm.isCombo) {
      comboTotalNum = parseInt(itemForm.comboQuantidadeTotal, 10);
      if (isNaN(comboTotalNum) || comboTotalNum <= 0) {
        toast({ title: 'Informe a quantidade total da caixa (ex: 100)', variant: 'destructive' });
        return;
      }
      if (!itemForm.local_id) {
        toast({ title: 'Selecione o local de onde saem os sabores', variant: 'destructive' });
        return;
      }
      const sabores = itemForm.comboOpcoes.filter((o) => o.produto_id);
      if (sabores.length === 0) {
        toast({ title: 'Adicione pelo menos um sabor', variant: 'destructive' });
        return;
      }
    }
    if (!itemForm.disponibilidadeTodosDias && itemForm.diasDisponiveis.length === 0) {
      toast({ title: 'Selecione pelo menos um dia da semana', variant: 'destructive' });
      return;
    }
    if (itemForm.limitarHorario && (!itemForm.horarioInicio || !itemForm.horarioFim)) {
      toast({ title: 'Informe o horário inicial e final de disponibilidade', variant: 'destructive' });
      return;
    }
    let quantidadeMaximaNum = null;
    if (String(itemForm.quantidadeMaxima).trim() !== '') {
      quantidadeMaximaNum = parseInt(itemForm.quantidadeMaxima, 10);
      if (isNaN(quantidadeMaximaNum) || quantidadeMaximaNum <= 0) {
        toast({ title: 'O máximo por pedido precisa ser um número maior que zero', variant: 'destructive' });
        return;
      }
      if (itemForm.isCombo && quantidadeMaximaNum < comboTotalNum) {
        toast({ title: `O máximo (${quantidadeMaximaNum}) não pode ser menor que a caixa (${comboTotalNum})`, variant: 'destructive' });
        return;
      }
    }
    setSavingItem(true);
    try {
      let imagemUrl = itemForm.imagem_url;

      if (itemImageFile) {
        if (itemImageFile.size > 5 * 1024 * 1024) {
          throw new Error('Imagem muito grande (máx. 5MB).');
        }
        const ext = itemImageFile.name.split('.').pop();
        const path = `${empresaId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('cardapio-imagens').upload(path, itemImageFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('cardapio-imagens').getPublicUrl(path);
        imagemUrl = publicUrl;
      }

      const payload = {
        empresa_id: empresaId,
        categoria_id: itemForm.categoria_id,
        produto_id: itemForm.isCombo ? null : (itemForm.produto_id || null),
        local_id: itemForm.local_id || null,
        nome: itemForm.nome.trim(),
        descricao: itemForm.descricao.trim() || null,
        preco: precoNum,
        imagem_url: imagemUrl || null,
        combo_quantidade_total: itemForm.isCombo ? comboTotalNum : null,
        combo_modo: itemForm.isCombo ? itemForm.comboModo : 'fechado',
        tipo: itemForm.tipo || 'comida',
        restricoes_alimentares: itemForm.restricoesAlimentares || [],
        dias_disponiveis: itemForm.disponibilidadeTodosDias ? null : itemForm.diasDisponiveis,
        horario_disponivel_inicio: itemForm.limitarHorario ? itemForm.horarioInicio : null,
        horario_disponivel_fim: itemForm.limitarHorario ? itemForm.horarioFim : null,
        combo_permite_acima: itemForm.isCombo && itemForm.comboModo === 'fechado' ? !!itemForm.comboPermiteAcima : false,
        quantidade_maxima: quantidadeMaximaNum,
      };

      let cardapioItemId = editingItem?.id;
      if (editingItem) {
        const { error } = await supabase.from('cardapio_itens').update(payload).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('cardapio_itens')
          .insert({ ...payload, ordem: itens.filter(i => i.categoria_id === itemForm.categoria_id).length })
          .select().single();
        if (error) throw error;
        cardapioItemId = data.id;
      }

      // Sincroniza sabores: apaga tudo e regrava do zero (lista sempre pequena)
      await supabase.from('cardapio_combo_opcoes').delete().eq('cardapio_item_id', cardapioItemId);
      if (itemForm.isCombo) {
        const saboresValidos = itemForm.comboOpcoes.filter((o) => o.produto_id);
        const saboresPayload = await Promise.all(saboresValidos.map(async (o, idx) => {
          let saborImagemUrl = o.imagem_url || null;
          if (o.imagemFile) {
            if (o.imagemFile.size > 5 * 1024 * 1024) {
              throw new Error(`Imagem de "${o.nome || 'sabor'}" muito grande (máx. 5MB).`);
            }
            const ext = o.imagemFile.name.split('.').pop();
            const path = `${empresaId}/sabores/${Date.now()}-${idx}.${ext}`;
            const { error: upErr } = await supabase.storage.from('cardapio-imagens').upload(path, o.imagemFile, { upsert: true });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('cardapio-imagens').getPublicUrl(path);
            saborImagemUrl = publicUrl;
          }
          return {
            cardapio_item_id: cardapioItemId,
            produto_id: o.produto_id,
            local_id: itemForm.local_id,
            nome: o.nome.trim() || 'Sabor',
            preco_adicional: parseFloat(String(o.preco_adicional).replace(',', '.')) || 0,
            imagem_url: saborImagemUrl,
            ordem: idx,
          };
        }));
        if (saboresPayload.length > 0) {
          const { error: saboresError } = await supabase.from('cardapio_combo_opcoes').insert(saboresPayload);
          if (saboresError) throw saboresError;
        }
      }

      // Sincroniza os grupos de adicionais vinculados: apaga tudo e regrava do zero
      await supabase.from('cardapio_itens_grupos_adicionais').delete().eq('cardapio_item_id', cardapioItemId);
      if (itemForm.gruposAdicionaisIds.length > 0) {
        const { error: gruposVincError } = await supabase.from('cardapio_itens_grupos_adicionais').insert(
          itemForm.gruposAdicionaisIds.map((grupoId, idx) => ({ cardapio_item_id: cardapioItemId, grupo_id: grupoId, ordem: idx }))
        );
        if (gruposVincError) throw gruposVincError;
      }

      toast({ title: 'Item salvo!' });
      setItemDialogOpen(false);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao salvar item', description: error.message, variant: 'destructive' });
    } finally {
      setSavingItem(false);
    }
  };

  const handleToggleItemAtivo = async (item) => {
    try {
      const { error } = await supabase.from('cardapio_itens').update({ ativo: !item.ativo }).eq('id', item.id);
      if (error) throw error;
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, ativo: !i.ativo } : i)));
    } catch (error) {
      toast({ title: 'Erro ao atualizar item', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteItem = async () => {
    if (!itemDeleteTarget) return;
    try {
      const { error } = await supabase.from('cardapio_itens').delete().eq('id', itemDeleteTarget.id);
      if (error) throw error;
      toast({ title: 'Item removido.' });
      setItemDeleteTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao remover item', description: error.message, variant: 'destructive' });
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
      <Helmet><title>Itens do Cardápio - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6" /> Itens do Cardápio
          </h1>
          <p className="text-gray-500 text-sm">Categorias, itens e combos que aparecem na vitrine pública.</p>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Categorias e itens
          </h2>
          <Button size="sm" onClick={openNewCat}><Plus className="h-4 w-4 mr-1" /> Nova categoria</Button>
        </div>

        {categorias.length === 0 && (
          <div className="text-center text-gray-500 py-10 bg-white rounded-xl border">
            Nenhuma categoria ainda. Crie a primeira (ex: "Salgados", "Bandejas", "Bebidas").
          </div>
        )}

        <div className="space-y-4">
          {categorias.map((cat, catIndex) => {
            const catItens = itens.filter((i) => i.categoria_id === cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col -my-1">
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-900 disabled:opacity-20"
                        disabled={catIndex === 0 || movingCatId}
                        onClick={() => handleMoveCat(catIndex, -1)}
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-900 disabled:opacity-20"
                        disabled={catIndex === categorias.length - 1 || movingCatId}
                        onClick={() => handleMoveCat(catIndex, 1)}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="font-medium text-gray-900">{cat.nome}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openNewItem(cat.id)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCat(cat)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setCatDeleteTarget(cat)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {catItens.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">Sem itens nessa categoria.</div>
                ) : (
                  <div className="divide-y">
                    {catItens.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3">
                        <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                          {item.imagem_url ? (
                            <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">{item.nome}</span>
                            {!item.ativo && <Badge variant="outline" className="text-gray-400">Oculto</Badge>}
                            {item.combo_quantidade_total != null ? (
                              <Badge variant="outline" className="text-violet-600 border-violet-300">
                                Combo · {item.combo_permite_acima ? 'a partir de ' : ''}{item.combo_quantidade_total} un{item.quantidade_maxima ? ` · máx. ${item.quantidade_maxima}` : ''}
                              </Badge>
                            ) : (!item.produto_id || !item.local_id) ? (
                              <Badge variant="outline" className="text-amber-600 border-amber-300">Sem estoque vinculado</Badge>
                            ) : null}
                            {item.tipo === 'bebida' && (
                              <Badge variant="outline" className="text-sky-600 border-sky-300">Bebida</Badge>
                            )}
                            {(item.dias_disponiveis || []).length > 0 && (
                              <Badge variant="outline" className="text-indigo-600 border-indigo-300">
                                {item.dias_disponiveis.map((d) => DIAS_SEMANA_OPCOES[d]?.label).join(', ')}
                              </Badge>
                            )}
                            {item.horario_disponivel_inicio && item.horario_disponivel_fim && (
                              <Badge variant="outline" className="text-indigo-600 border-indigo-300">
                                {item.horario_disponivel_inicio.slice(0, 5)}–{item.horario_disponivel_fim.slice(0, 5)}
                              </Badge>
                            )}
                            {(item.restricoes_alimentares || []).length > 0 && (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-300 gap-1">
                                <Leaf className="h-3 w-3" />
                                {item.restricoes_alimentares.length === 1
                                  ? RESTRICOES_ALIMENTARES_OPCOES.find((r) => r.value === item.restricoes_alimentares[0])?.label
                                  : `${item.restricoes_alimentares.length} restrições`}
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm text-gray-500">
                            {item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        <Switch checked={item.ativo} onCheckedChange={() => handleToggleItemAtivo(item)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setItemDeleteTarget(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grupos de adicionais reaproveitáveis */}
        <div className="flex items-center justify-between pt-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Tag className="h-4 w-4" /> Grupos de Adicionais
          </h2>
          <Button size="sm" onClick={openNewGrupo}><Plus className="h-4 w-4 mr-1" /> Novo grupo</Button>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Crie grupos como "Molhos extras" ou "Adicionais de recheio" e reaproveite nos itens que quiser, em qualquer categoria.
        </p>

        {grupos.length === 0 ? (
          <div className="text-center text-gray-500 py-10 bg-white rounded-xl border">
            Nenhum grupo de adicionais ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {grupos.map((grupo) => (
              <div key={grupo.id} className="bg-white rounded-xl border p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{grupo.nome}</span>
                    <Badge variant="outline" className={grupo.obrigatorio ? 'text-amber-600 border-amber-300' : 'text-gray-500'}>
                      {grupo.obrigatorio ? 'Obrigatório' : 'Opcional'} · min {grupo.minimo} / máx {grupo.maximo}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {(grupo.opcoes || []).map((o) => o.nome).join(', ') || 'Sem opções'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditGrupo(grupo)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setGrupoDeleteTarget(grupo)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog categoria */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>Ex: Salgados, Bandejas, Bebidas, Combos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cat-nome" className="text-gray-900">Nome</Label>
            <Input id="cat-nome" value={catNome} onChange={(e) => setCatNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCat}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog item */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar item' : 'Novo item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="item-categoria" className="text-gray-900">Categoria</Label>
              <select
                id="item-categoria"
                className="w-full mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={itemForm.categoria_id}
                onChange={(e) => setItemForm((f) => ({ ...f, categoria_id: e.target.value }))}
              >
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="item-local" className="text-gray-900">Local do estoque</Label>
              <select
                id="item-local"
                className="w-full mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={itemForm.local_id}
                onChange={(e) => setItemForm((f) => ({ ...f, local_id: e.target.value, produto_id: '' }))}
              >
                <option value="">Selecione de onde sai o estoque</option>
                {(localClassicos
                  ? locais.filter((l) => l.id === localClassicos.id || l.id === itemForm.local_id)
                  : locais
                ).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">O cardápio vende do estoque Clássicos — o produto abaixo mostra só o que tem estoque ali.</p>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label className="text-gray-900">Este item é uma caixa com sabores?</Label>
                <p className="text-xs text-gray-400">Ex: "Salgados Mistos (100 und.)" — cliente escolhe a combinação.</p>
              </div>
              <Switch checked={itemForm.isCombo} onCheckedChange={(v) => setItemForm((f) => ({ ...f, isCombo: v }))} />
            </div>

            {itemForm.isCombo ? (
              <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                <div>
                  <Label className="text-gray-900">Como funciona</Label>
                  <div className="flex gap-2 mt-1">
                    <Button
                      type="button" size="sm" variant={itemForm.comboModo === 'fechado' ? 'default' : 'outline'} className="flex-1"
                      onClick={() => setItemForm((f) => ({ ...f, comboModo: 'fechado' }))}
                    >
                      Caixa fechada
                    </Button>
                    <Button
                      type="button" size="sm" variant={itemForm.comboModo === 'livre' ? 'default' : 'outline'} className="flex-1"
                      onClick={() => setItemForm((f) => ({ ...f, comboModo: 'livre' }))}
                    >
                      Monte seu pedido
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {itemForm.comboModo === 'fechado'
                      ? 'Preço fixo da caixa — cliente tem que escolher exatamente o total abaixo.'
                      : 'Sem preço de caixa — cada sabor tem seu próprio preço unitário, e o cliente pode escolher mais que o mínimo.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="combo-total" className="text-gray-900">
                    {itemForm.comboModo === 'fechado' ? 'Quantidade total da caixa' : 'Quantidade mínima'}
                  </Label>
                  <Input
                    id="combo-total" type="number" min="1" step="1"
                    value={itemForm.comboQuantidadeTotal}
                    onChange={(e) => setItemForm((f) => ({ ...f, comboQuantidadeTotal: e.target.value }))}
                    placeholder="Ex: 100"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {itemForm.comboModo === 'fechado'
                      ? (itemForm.comboPermiteAcima
                        ? 'Cliente precisa escolher no mínimo esse total e pode escolher mais (veja a opção abaixo).'
                        : 'Cliente precisa distribuir exatamente esse total entre os sabores abaixo.')
                      : 'Cliente precisa escolher no mínimo esse total — pode escolher mais (até o máximo por pedido, se definido).'}
                  </p>
                </div>

                {itemForm.comboModo === 'fechado' && (
                  <div className="flex items-start justify-between gap-3 bg-white border rounded-lg p-3">
                    <div>
                      <Label className="text-gray-900">Permitir comprar acima do pacote</Label>
                      <p className="text-xs text-gray-400">
                        Ex.: pacote de 100 — o cliente pode levar 130, 250... O preço acima do pacote é proporcional
                        (preço ÷ quantidade do pacote × total escolhido). Defina um máximo para proteger o estoque.
                      </p>
                    </div>
                    <Switch
                      checked={!!itemForm.comboPermiteAcima}
                      onCheckedChange={(v) => setItemForm((f) => ({ ...f, comboPermiteAcima: v }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-gray-900">Sabores</Label>
                  {itemForm.comboOpcoes.map((opcao, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-white border rounded-lg p-2">
                      <div className="shrink-0">
                        <label className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer block">
                          {opcao.imagemFile ? (
                            <img src={URL.createObjectURL(opcao.imagemFile)} alt="" className="h-full w-full object-cover" />
                          ) : opcao.imagem_url ? (
                            <img src={opcao.imagem_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-300" />
                          )}
                          <input
                            type="file" accept="image/*" className="hidden"
                            onChange={(e) => updateComboOpcao(idx, { imagemFile: e.target.files[0] || null })}
                          />
                        </label>
                        {produtosDoLocal.find((p) => p.produto_id === opcao.produto_id)?.imagem_url && (
                          <button
                            type="button"
                            title="Usar foto do cadastro do produto"
                            className="text-gray-400 hover:text-gray-700 flex items-center justify-center w-full mt-1"
                            onClick={() => usarFotoCadastroSabor(idx)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <select
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-100"
                          value={opcao.produto_id}
                          onChange={(e) => updateComboOpcao(idx, { produto_id: e.target.value })}
                          disabled={!itemForm.local_id}
                        >
                          <option value="">{!itemForm.local_id ? 'Escolha o local primeiro' : 'Escolha o produto'}</option>
                          {produtosDoLocal.map((p) => (
                            <option key={p.produto_id} value={p.produto_id}>
                              {p.nome} {p.sem_estoque ? '— sem estoque' : `— ${p.quantidade_total} un`}
                            </option>
                          ))}
                        </select>
                        <Input
                          className="text-sm h-8"
                          placeholder="Nome exibido (ex: Coxinha de Frango)"
                          value={opcao.nome}
                          onChange={(e) => updateComboOpcao(idx, { nome: e.target.value })}
                        />
                        <Input
                          className="text-sm h-8"
                          inputMode="decimal"
                          placeholder={itemForm.comboModo === 'livre' ? 'Preço unitário (ex: 1,09)' : 'Preço adicional (0,00 = incluso)'}
                          value={opcao.preco_adicional}
                          onChange={(e) => updateComboOpcao(idx, { preco_adicional: e.target.value })}
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => removeComboOpcao(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {multiAberto && (
                    <div className="border rounded-lg bg-white p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">Marque os produtos</p>
                        <button
                          type="button" className="text-xs text-blue-600"
                          onClick={() => {
                            const ids = produtosDoLocal.map((p) => p.produto_id);
                            setMultiSel((prev) => (prev.length === ids.length ? [] : ids));
                          }}
                        >
                          {multiSel.length === produtosDoLocal.length && produtosDoLocal.length > 0 ? 'Limpar' : 'Marcar todos'}
                        </button>
                      </div>
                      {loadingProdutosLocal ? (
                        <p className="text-xs text-gray-400 py-2">Carregando...</p>
                      ) : produtosDoLocal.length === 0 ? (
                        <p className="text-xs text-amber-600 py-2">Nenhum produto com estoque disponível nesse local.</p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-0.5">
                          {produtosDoLocal.map((p) => {
                            const jaAdicionado = itemForm.comboOpcoes.some((o) => o.produto_id === p.produto_id);
                            return (
                              <label key={p.produto_id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${jaAdicionado ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                                <input
                                  type="checkbox" className="h-4 w-4"
                                  checked={jaAdicionado || multiSel.includes(p.produto_id)}
                                  disabled={jaAdicionado}
                                  onChange={() => toggleMultiSel(p.produto_id)}
                                />
                                <span className="flex-1 text-gray-900">{p.nome}</span>
                                <span className="text-xs text-gray-400">{jaAdicionado ? 'já adicionado' : `${p.quantidade_total} un`}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => { setMultiAberto(false); setMultiSel([]); }}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="flex-1" onClick={adicionarSelecionados} disabled={multiSel.length === 0}>
                          Adicionar {multiSel.length > 0 ? `(${multiSel.length})` : ''}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addComboOpcao} className="flex-1">
                      <Plus className="h-4 w-4 mr-1" /> Adicionar sabor
                    </Button>
                    <Button
                      variant="outline" size="sm" className="flex-1"
                      disabled={!itemForm.local_id}
                      onClick={() => { setMultiSel([]); setMultiAberto((v) => !v); }}
                    >
                      <ListChecks className="h-4 w-4 mr-1" /> Selecionar vários
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="item-produto" className="text-gray-900">Produto vinculado (estoque)</Label>
                <select
                  id="item-produto"
                  className="w-full mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                  value={itemForm.produto_id}
                  onChange={(e) => {
                    const novoProdutoId = e.target.value;
                    const produto = produtosDoLocal.find((p) => p.produto_id === novoProdutoId);
                    setItemForm((f) => ({
                      ...f,
                      produto_id: novoProdutoId,
                      // Reaproveita a foto do cadastro automaticamente quando o item ainda não tem foto própria.
                      imagem_url: (!f.imagem_url && produto?.imagem_url) ? produto.imagem_url : f.imagem_url,
                    }));
                  }}
                  disabled={!itemForm.local_id || loadingProdutosLocal}
                >
                  <option value="">
                    {!itemForm.local_id ? 'Selecione um local primeiro' : loadingProdutosLocal ? 'Carregando...' : 'Sem vínculo (item só aparece, não pode ser pedido online)'}
                  </option>
                  {produtosDoLocal.map((p) => (
                    <option key={p.produto_id} value={p.produto_id}>
                      {p.nome}
                      {p.sem_estoque
                        ? ' — sem estoque neste local'
                        : ` — ${p.quantidade_total} un${p.proxima_validade ? `, val. ${new Date(p.proxima_validade).toLocaleDateString('pt-BR')}` : ''}`}
                    </option>
                  ))}
                </select>
                {itemForm.local_id && !loadingProdutosLocal && produtosDoLocal.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum produto com estoque disponível nesse local.</p>
                )}
                <p className="text-xs text-gray-400 mt-1">Sem produto vinculado, o cliente vê o item mas não consegue pedir pelo carrinho.</p>
              </div>
            )}
            <div>
              <Label htmlFor="item-nome" className="text-gray-900">Nome</Label>
              <Input id="item-nome" value={itemForm.nome} onChange={(e) => setItemForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="item-descricao" className="text-gray-900">Descrição (opcional)</Label>
              <Textarea id="item-descricao" value={itemForm.descricao} onChange={(e) => setItemForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label htmlFor="item-preco" className="text-gray-900">Preço (R$)</Label>
              <Input id="item-preco" inputMode="decimal" value={itemForm.preco} onChange={(e) => setItemForm((f) => ({ ...f, preco: e.target.value }))} placeholder="0,00" />
              {itemForm.isCombo && itemForm.comboModo === 'livre' && (
                <p className="text-xs text-gray-400 mt-1">No modo "Monte seu pedido" isso não é usado — coloque 0. O preço vem do valor de cada sabor.</p>
              )}
            </div>

            <div>
              <Label className="text-gray-900">Tipo</Label>
              <div className="flex gap-4 mt-1">
                {[{ value: 'comida', label: 'Comida' }, { value: 'bebida', label: 'Bebida' }].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio" name="item-tipo" value={opt.value}
                      checked={itemForm.tipo === opt.value}
                      onChange={() => setItemForm((f) => ({ ...f, tipo: opt.value }))}
                      className="accent-current"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-900">Restrições alimentares (opcional)</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                {RESTRICOES_ALIMENTARES_OPCOES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itemForm.restricoesAlimentares.includes(opt.value)}
                      onChange={(e) => setItemForm((f) => ({
                        ...f,
                        restricoesAlimentares: e.target.checked
                          ? [...f.restricoesAlimentares, opt.value]
                          : f.restricoesAlimentares.filter((v) => v !== opt.value),
                      }))}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-900">Disponibilidade</Label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio" name="item-disponibilidade" checked={itemForm.disponibilidadeTodosDias}
                    onChange={() => setItemForm((f) => ({ ...f, disponibilidadeTodosDias: true }))}
                    className="accent-current"
                  />
                  Todos os dias
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio" name="item-disponibilidade" checked={!itemForm.disponibilidadeTodosDias}
                    onChange={() => setItemForm((f) => ({ ...f, disponibilidadeTodosDias: false }))}
                    className="accent-current"
                  />
                  Dias específicos
                </label>
              </div>
              {!itemForm.disponibilidadeTodosDias && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {DIAS_SEMANA_OPCOES.map((opt) => {
                    const marcado = itemForm.diasDisponiveis.includes(opt.value);
                    return (
                      <button
                        key={opt.value} type="button"
                        onClick={() => setItemForm((f) => ({
                          ...f,
                          diasDisponiveis: marcado
                            ? f.diasDisponiveis.filter((v) => v !== opt.value)
                            : [...f.diasDisponiveis, opt.value],
                        }))}
                        className={`h-8 w-10 rounded-md text-xs font-medium border transition-colors ${
                          marcado ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {itemForm.disponibilidadeTodosDias
                  ? 'O item aparece na vitrine pública todos os dias.'
                  : 'O item só aparece na vitrine pública nos dias marcados acima.'}
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" checked={!!itemForm.limitarHorario}
                  onChange={(e) => setItemForm((f) => ({ ...f, limitarHorario: e.target.checked }))}
                />
                Mostrar só em um horário do dia
              </label>
              {itemForm.limitarHorario && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="time" className="w-32" value={itemForm.horarioInicio} aria-label="Disponível a partir de"
                    onChange={(e) => setItemForm((f) => ({ ...f, horarioInicio: e.target.value }))}
                  />
                  <span className="text-sm text-gray-500">até</span>
                  <Input
                    type="time" className="w-32" value={itemForm.horarioFim} aria-label="Disponível até"
                    onChange={(e) => setItemForm((f) => ({ ...f, horarioFim: e.target.value }))}
                  />
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {itemForm.limitarHorario
                  ? 'Dentro dos dias escolhidos acima, o item só aparece na vitrine nesse intervalo (aceita virar a noite, ex.: 18:00 até 02:00).'
                  : 'Sem limite de horário: aparece o dia todo.'}
              </p>
            </div>

            <div>
              <Label htmlFor="item-max" className="text-gray-900">
                {itemForm.isCombo ? 'Máximo de itens por pedido (opcional)' : 'Máximo por pedido (opcional)'}
              </Label>
              <Input
                id="item-max" type="number" min="1" step="1" className="w-40"
                value={itemForm.quantidadeMaxima}
                onChange={(e) => setItemForm((f) => ({ ...f, quantidadeMaxima: e.target.value }))}
                placeholder="Sem limite"
              />
              <p className="text-xs text-gray-400 mt-1">
                {itemForm.isCombo
                  ? 'Limite de unidades somando todos os sabores (ex.: 500). Evita que um pedido estoure o estoque.'
                  : 'Quantidade máxima que o cliente pode pedir desse item de uma vez.'}
              </p>
            </div>

            <div>
              <Label htmlFor="item-foto" className="text-gray-900">Foto (opcional)</Label>
              <Input id="item-foto" type="file" accept="image/*" onChange={(e) => { setItemImageFile(e.target.files[0] || null); }} />
              {!itemForm.isCombo && itemForm.produto_id && produtosDoLocal.find((p) => p.produto_id === itemForm.produto_id)?.imagem_url && (
                <Button
                  type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => {
                    const produto = produtosDoLocal.find((p) => p.produto_id === itemForm.produto_id);
                    setItemImageFile(null);
                    setItemForm((f) => ({ ...f, imagem_url: produto.imagem_url }));
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Usar foto do cadastro do produto
                </Button>
              )}
              {itemForm.imagem_url && !itemImageFile && (
                <img src={itemForm.imagem_url} alt="" className="h-16 w-16 rounded-lg object-cover mt-2" />
              )}
            </div>

            <div>
              <Label className="text-gray-900">Adicionais (opcional)</Label>
              {grupos.length === 0 ? (
                <p className="text-xs text-gray-400 mt-1">
                  Nenhum grupo de adicionais criado ainda — crie um em "Grupos de Adicionais", na tela anterior.
                </p>
              ) : (
                <div className="space-y-1 mt-1">
                  {grupos.map((grupo) => {
                    const marcado = itemForm.gruposAdicionaisIds.includes(grupo.id);
                    return (
                      <label key={grupo.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) => setItemForm((f) => ({
                            ...f,
                            gruposAdicionaisIds: e.target.checked
                              ? [...f.gruposAdicionaisIds, grupo.id]
                              : f.gruposAdicionaisIds.filter((id) => id !== grupo.id),
                          }))}
                        />
                        <span className="flex-1">{grupo.nome}</span>
                        <span className="text-xs text-gray-400">{grupo.obrigatorio ? 'Obrigatório' : 'Opcional'} · até {grupo.maximo}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveItem} disabled={savingItem}>
              {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog grupo de adicionais */}
      <Dialog open={grupoDialogOpen} onOpenChange={setGrupoDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGrupo ? 'Editar grupo de adicionais' : 'Novo grupo de adicionais'}</DialogTitle>
            <DialogDescription>Ex: "Molhos extras", "Adicionais de recheio" — pode ser usado em vários itens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="grupo-nome" className="text-gray-900">Nome do grupo</Label>
              <Input id="grupo-nome" value={grupoForm.nome} onChange={(e) => setGrupoForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label className="text-gray-900">Obrigatório</Label>
                <p className="text-xs text-gray-400">O cliente precisa escolher pelo menos uma opção pra avançar.</p>
              </div>
              <Switch checked={grupoForm.obrigatorio} onCheckedChange={(v) => setGrupoForm((f) => ({ ...f, obrigatorio: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="grupo-minimo" className="text-gray-900">Mínimo de opções</Label>
                <Input id="grupo-minimo" type="number" min="0" step="1" value={grupoForm.minimo} onChange={(e) => setGrupoForm((f) => ({ ...f, minimo: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="grupo-maximo" className="text-gray-900">Máximo de opções</Label>
                <Input id="grupo-maximo" type="number" min="1" step="1" value={grupoForm.maximo} onChange={(e) => setGrupoForm((f) => ({ ...f, maximo: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900">Opções</Label>
              {grupoForm.opcoes.map((opcao, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-white border rounded-lg p-2">
                  <Input
                    className="text-sm h-8 flex-1"
                    placeholder="Nome (ex: Molho barbecue)"
                    value={opcao.nome}
                    onChange={(e) => updateGrupoOpcao(idx, { nome: e.target.value })}
                  />
                  <Input
                    className="text-sm h-8 w-28"
                    inputMode="decimal"
                    placeholder="Preço (ex: 2,50)"
                    value={opcao.preco_adicional}
                    onChange={(e) => updateGrupoOpcao(idx, { preco_adicional: e.target.value })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => removeGrupoOpcao(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addGrupoOpcao} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Adicionar opção
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrupoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveGrupo} disabled={savingGrupo}>
              {savingGrupo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!grupoDeleteTarget} onOpenChange={(open) => !open && setGrupoDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover grupo de adicionais?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso também remove o vínculo desse grupo com todos os itens que o usam. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGrupo} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmações de exclusão */}
      <AlertDialog open={!!catDeleteTarget} onOpenChange={(open) => !open && setCatDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso também remove todos os itens dentro de "{catDeleteTarget?.nome}". Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCat} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!itemDeleteTarget} onOpenChange={(open) => !open && setItemDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}