import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
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
  GitBranch, Search, RefreshCw, AlertCircle, Loader2,
  ChevronRight, ChevronDown, Package, PackageOpen, MapPin, Calendar, Barcode, Ban,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────
 * LÓGICA DE ÁRVORE
 *
 * Modelo de dados (tabela `lotes`):
 * - Um lote "base" (tipo_lote = 'base') é a produção original de um produto,
 *   identificada por (produto_id, numero_lote). Existe sempre 1 única linha
 *   ativa para essa combinação.
 * - Um lote "bandeja" (tipo_lote = 'bandeja') nasce de um lote base (ou de
 *   outra bandeja) via `lote_origem_id`, e pode estar fisicamente presente em
 *   VÁRIAS linhas — uma por local (mercado/estoque) — todas com o mesmo
 *   (produto_id, numero_lote), cada uma com sua própria quantidade/validade.
 *
 * Por isso a "unidade" natural de rastreamento não é a linha da tabela, e
 * sim o par (produto_id, numero_lote): ele agrupa todas as instâncias
 * físicas (locais) daquele lote, e pode ter sub-lotes (gerados a partir
 * dele) como filhos na árvore. Uma bandeja sempre nasce de um lote de
 * origem, então a árvore sempre mantém esse encadeamento (base → bandeja),
 * mesmo que uma instância específica (um local) seja inativada.
 * ──────────────────────────────────────────────────────────────────────── */

const chaveGrupo = (lote) => `${lote.produto_id}::${lote.numero_lote}`;

function construirArvoreLotes(lotes = []) {
  const grupos = new Map();

  // 1. Agrupar TODAS as linhas (ativas e inativas) pelo par (produto_id,
  //    numero_lote). Precisamos das inativas aqui também, senão perdemos o
  //    encadeamento com o lote de origem sempre que a linha de origem já
  //    tiver sido inativada — e o lote de origem sempre deve aparecer.
  for (const lote of lotes) {
    const chave = chaveGrupo(lote);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        produto_id: lote.produto_id,
        produto_nome: lote.produto_nome || '—',
        numero_lote: lote.numero_lote,
        tipo_lote: lote.tipo_lote,
        todasInstancias: [],
        instancias: [],
        subLotes: [],
        quantidadeTotal: 0,
        origemLoteId: null,
        inativo: false,
      });
    }
    const grupo = grupos.get(chave);
    grupo.todasInstancias.push(lote);
    if (lote.ativo !== false) {
      grupo.instancias.push(lote);
      grupo.quantidadeTotal += Number(lote.quantidade) || 0;
    }
  }

  // 2. Mapear id da linha -> chave do grupo a que ela pertence,
  //    para conseguir achar o grupo-pai a partir do lote_origem_id
  const idParaChaveGrupo = new Map();
  for (const lote of lotes) {
    idParaChaveGrupo.set(lote.id, chaveGrupo(lote));
  }

  // 3. Resolver o grupo de origem de cada grupo, olhando TODAS as suas
  //    instâncias (ativas e inativas). Pulamos referências para o próprio
  //    grupo — "saltos" internos que acontecem quando uma bandeja é
  //    redistribuída e a nova linha aponta para outra linha do mesmo
  //    (produto_id, numero_lote) — e ficamos com a primeira referência que
  //    aponta de fato para OUTRO lote (o verdadeiro lote de origem).
  for (const grupo of grupos.values()) {
    for (const lote of grupo.todasInstancias) {
      if (!lote.lote_origem_id) continue;
      const chavePai = idParaChaveGrupo.get(lote.lote_origem_id);
      if (chavePai && chavePai !== grupo.chave) {
        grupo.origemLoteId = lote.lote_origem_id;
        break;
      }
    }
  }

  // 4. Encaixar cada grupo como filho do seu grupo de origem, ou como raiz
  //    caso não haja origem (ou ela não esteja no conjunto carregado).
  const raizes = [];
  for (const grupo of grupos.values()) {
    const chavePai = grupo.origemLoteId ? idParaChaveGrupo.get(grupo.origemLoteId) : null;
    if (chavePai && chavePai !== grupo.chave && grupos.has(chavePai)) {
      grupos.get(chavePai).subLotes.push(grupo);
    } else {
      raizes.push(grupo);
    }
  }

  // 5. Marcar grupos sem nenhuma instância ativa — eles continuam na árvore
  //    (para preservar o lote de origem visível), só ficam sinalizados.
  for (const grupo of grupos.values()) {
    grupo.inativo = grupo.instancias.length === 0;
  }

  // 6. Poda: remove um grupo (e o desanexa do pai) somente se ele E toda a
  //    sua descendência não tiverem NENHUMA instância ativa — ramos
  //    totalmente mortos desaparecem, mas um lote de origem inativo que
  //    ainda tem bandejas ativas descendentes continua aparecendo.
  const temEstoqueAtivo = (grupo) =>
    grupo.instancias.length > 0 || grupo.subLotes.some(temEstoqueAtivo);

  const podar = (grupo) => {
    grupo.subLotes = grupo.subLotes.filter(temEstoqueAtivo);
    grupo.subLotes.forEach(podar);
  };

  const raizesPodadas = raizes.filter(temEstoqueAtivo);
  raizesPodadas.forEach(podar);

  const porNumeroDesc = (a, b) => (a.numero_lote < b.numero_lote ? 1 : -1);
  raizesPodadas.sort(porNumeroDesc);
  for (const grupo of grupos.values()) {
    grupo.subLotes.sort(porNumeroDesc);
  }

  return raizesPodadas;
}

/** Status de validade de uma instância (local) de lote, para colorir a UI. */
function statusValidade(dataValidade) {
  if (!dataValidade) return { status: 'OK', diasParaVencer: null };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [ano, mes, dia] = dataValidade.split('-');
  const validade = new Date(ano, mes - 1, dia);
  const diffDias = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return { status: 'Vencido', diasParaVencer: diffDias };
  if (diffDias <= 7) return { status: 'Vencendo', diasParaVencer: diffDias };
  return { status: 'OK', diasParaVencer: diffDias };
}

/**
 * Busca recursiva: mantém um grupo (e toda a sua árvore de sub-lotes) se ele
 * OU qualquer descendente casar com o termo buscado.
 */
function filtrarArvore(raizes, termo) {
  if (!termo?.trim()) return raizes;
  const alvo = termo.trim().toLowerCase();

  const bate = (grupo) =>
    grupo.numero_lote?.toLowerCase().includes(alvo) ||
    grupo.produto_nome?.toLowerCase().includes(alvo) ||
    grupo.instancias.some((i) => i.local_nome?.toLowerCase().includes(alvo) || i.codigo_barra?.toLowerCase().includes(alvo));

  const filtrarGrupo = (grupo) => {
    const subLotesFiltrados = grupo.subLotes.map(filtrarGrupo).filter(Boolean);
    if (bate(grupo) || subLotesFiltrados.length > 0) {
      return { ...grupo, subLotes: subLotesFiltrados };
    }
    return null;
  };

  return raizes.map(filtrarGrupo).filter(Boolean);
}

/**
 * Mantém só instâncias (locais) com quantidade > 0. Um grupo cuja quantidade
 * zerou (ex: lote base já todo convertido em bandejas) continua aparecendo
 * — sem os locais zerados — desde que algum sub-lote descendente ainda
 * tenha estoque, preservando o encadeamento base → bandeja.
 */
function filtrarComEstoque(raizes) {
  const filtrarGrupo = (grupo) => {
    const instanciasComEstoque = grupo.instancias.filter((i) => (Number(i.quantidade) || 0) > 0);
    const subLotesFiltrados = grupo.subLotes.map(filtrarGrupo).filter(Boolean);

    if (instanciasComEstoque.length === 0 && subLotesFiltrados.length === 0) {
      return null;
    }

    const quantidadeTotal = instanciasComEstoque.reduce((soma, i) => soma + (Number(i.quantidade) || 0), 0);
    return { ...grupo, instancias: instanciasComEstoque, subLotes: subLotesFiltrados, quantidadeTotal };
  };

  return raizes.map(filtrarGrupo).filter(Boolean);
}

/* ────────────────────────────────────────────────────────────────────────
 * COMPONENTES DE APRESENTAÇÃO
 * ──────────────────────────────────────────────────────────────────────── */

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const [y, m, d] = dateString.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return dateString;
  }
};

const corStatus = {
  OK: 'bg-emerald-100 text-emerald-700 border-transparent',
  Vencendo: 'bg-amber-100 text-amber-700 border-transparent',
  Vencido: 'bg-red-100 text-red-700 border-transparent',
};

function InstanciaLocal({ instancia, onInativar }) {
  const temValidade = !!instancia.data_validade;
  const { status } = statusValidade(instancia.data_validade);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 pl-8 pr-2 text-sm border-l-2 border-gray-100 ml-3 group">
      <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      <span className="font-medium text-gray-700">{instancia.local_nome}</span>
      <span className="text-gray-400">•</span>
      <span className="text-gray-600">{instancia.quantidade} un</span>
      <span className="text-gray-400">•</span>
      <span className="flex items-center gap-1 text-gray-500 text-xs">
        <Calendar className="h-3 w-3" /> Criado em: {formatDate(instancia.created_at)}
      </span>
      <span className="text-gray-400">•</span>
      <span className="flex items-center gap-1 text-gray-500 text-xs">
        <Calendar className="h-3 w-3" /> Val: {temValidade ? formatDate(instancia.data_validade) : 'N/A'}
      </span>
      {temValidade && (
        <Badge className={`text-[10px] px-1.5 py-0 ${corStatus[status]}`}>{status}</Badge>
      )}
      {instancia.codigo_barra && (
        <span className="flex items-center gap-1 text-gray-400 text-xs">
          <Barcode className="h-3 w-3" /> {instancia.codigo_barra}
        </span>
      )}
      <button
        type="button"
        onClick={() => onInativar(instancia)}
        title="Inativar este lote neste local"
        className="ml-auto flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded hover:bg-red-50"
      >
        <Ban className="h-3.5 w-3.5" /> Inativar
      </button>
    </div>
  );
}

function LoteTreeNode({ grupo, nivel = 0, onInativar }) {
  const [aberto, setAberto] = useState(nivel === 0 ? false : true);

  const temFilhos = grupo.subLotes.length > 0 || grupo.instancias.length > 0;
  const isBandeja = grupo.tipo_lote === 'bandeja';

  return (
    <div className={nivel > 0 ? 'ml-4 border-l border-gray-100 pl-2' : ''}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 text-left transition-colors ${grupo.inativo ? 'opacity-60' : ''}`}
        disabled={!temFilhos}
      >
        {temFilhos ? (
          aberto ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {aberto ? (
          <PackageOpen className={`h-4 w-4 shrink-0 ${isBandeja ? 'text-blue-500' : 'text-amber-600'}`} />
        ) : (
          <Package className={`h-4 w-4 shrink-0 ${isBandeja ? 'text-blue-500' : 'text-amber-600'}`} />
        )}

        <span className="font-semibold text-gray-800 text-sm">Lote {grupo.numero_lote}</span>
        {nivel === 0 && <span className="text-gray-500 text-sm">— {grupo.produto_nome}</span>}

        <Badge variant="outline" className="text-[10px] ml-1">
          {isBandeja ? 'Bandeja' : 'Base'}
        </Badge>
        {grupo.inativo && (
          <Badge className="text-[10px] ml-1 bg-gray-200 text-gray-600 border-transparent">
            Origem inativa
          </Badge>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          {grupo.instancias.length > 0 && (
            <span>{grupo.instancias.length} local{grupo.instancias.length > 1 ? 'is' : ''}</span>
          )}
          {grupo.subLotes.length > 0 && (
            <span>• {grupo.subLotes.length} sub-lote{grupo.subLotes.length > 1 ? 's' : ''}</span>
          )}
          <span className="font-semibold text-gray-600">{grupo.quantidadeTotal} un</span>
        </span>
      </button>

      {aberto && (
        <div className="pb-1">
          {grupo.instancias.map((instancia) => (
            <InstanciaLocal key={instancia.id} instancia={instancia} onInativar={onInativar} />
          ))}
          {grupo.subLotes.map((subGrupo) => (
            <LoteTreeNode key={subGrupo.chave} grupo={subGrupo} nivel={nivel + 1} onInativar={onInativar} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * PÁGINA
 * ──────────────────────────────────────────────────────────────────────── */

export default function RastreamentoLotesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [lotesFlat, setLotesFlat] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [apenasComEstoque, setApenasComEstoque] = useState(true);

  const [instanciaParaInativar, setInstanciaParaInativar] = useState(null);
  const [inativando, setInativando] = useState(false);

  const fetchData = async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      // Busca TODOS os lotes (ativos e inativos). Precisamos das linhas
      // inativas para conseguir sempre reconstruir e mostrar o lote de
      // origem, mesmo quando a linha de origem em si já foi inativada.
      // As linhas inativas não aparecem como instâncias visíveis (ver
      // construirArvoreLotes), servem só para resolver a genealogia.
      const { data, error } = await supabase
        .from('lotes')
        .select(`
          id, numero_lote, tipo_lote, quantidade, data_validade, created_at, ativo,
          lote_origem_id, codigo_barra, produto_id, local_id,
          produtos ( nome ),
          locais ( nome )
        `)
        .eq('empresa_id', empresaId)
        .order('numero_lote', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const flat = (data || []).map((l) => ({
        ...l,
        produto_nome: l.produtos?.nome || 'Produto removido',
        local_nome: l.locais?.nome || 'Local removido',
      }));

      setLotesFlat(flat);
    } catch (error) {
      toast({
        title: 'Erro ao carregar lotes',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const arvore = useMemo(() => construirArvoreLotes(lotesFlat), [lotesFlat]);
  const arvoreComEstoque = useMemo(
    () => (apenasComEstoque ? filtrarComEstoque(arvore) : arvore),
    [arvore, apenasComEstoque]
  );
  const arvoreFiltrada = useMemo(
    () => filtrarArvore(arvoreComEstoque, searchTerm),
    [arvoreComEstoque, searchTerm]
  );

  const handleInativar = (instancia) => setInstanciaParaInativar(instancia);

  const confirmarInativacao = async () => {
    if (!instanciaParaInativar) return;
    setInativando(true);
    try {
      const { error } = await supabase
        .from('lotes')
        .update({ ativo: false })
        .eq('id', instanciaParaInativar.id);

      if (error) throw error;

      // Atualiza localmente (sem buscar tudo de novo no servidor). Importante:
      // só marcamos ativo=false, sem remover a linha — ela some da lista de
      // instâncias exibidas, mas continua disponível para resolver o
      // encadeamento com o lote de origem/bandejas (ver construirArvoreLotes).
      setLotesFlat((prev) =>
        prev.map((l) => (l.id === instanciaParaInativar.id ? { ...l, ativo: false } : l))
      );

      toast({
        title: 'Lote inativado',
        description: `${instanciaParaInativar.numero_lote} em ${instanciaParaInativar.local_nome} foi inativado.`,
        className: 'bg-green-600 text-white border-none',
      });
    } catch (error) {
      toast({
        title: 'Erro ao inativar lote',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setInativando(false);
      setInstanciaParaInativar(null);
    }
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Nenhuma empresa associada</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet><title>Rastreamento de Lotes - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-5 max-w-5xl mx-auto pb-12">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <GitBranch className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Rastreamento de Lotes</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  Veja em quais locais cada lote está distribuído, em formato de árvore.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por número de lote, produto, local ou código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 whitespace-nowrap">
              <Checkbox
                id="apenas-com-estoque"
                checked={apenasComEstoque}
                onCheckedChange={(checked) => setApenasComEstoque(Boolean(checked))}
              />
              <Label htmlFor="apenas-com-estoque" className="text-sm text-gray-700 cursor-pointer">
                Somente com estoque (qtd &gt; 0)
              </Label>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando lotes...
              </div>
            ) : arvoreFiltrada.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                {searchTerm || apenasComEstoque ? 'Nenhum lote encontrado para esse filtro.' : 'Nenhum lote encontrado.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {arvoreFiltrada.map((grupo) => (
                  <LoteTreeNode key={grupo.chave} grupo={grupo} nivel={0} onInativar={handleInativar} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>

      <AlertDialog open={!!instanciaParaInativar} onOpenChange={(open) => !open && setInstanciaParaInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              {instanciaParaInativar && (
                <>
                  Isso vai inativar o lote <strong>{instanciaParaInativar.numero_lote}</strong> especificamente em{' '}
                  <strong>{instanciaParaInativar.local_nome}</strong> ({instanciaParaInativar.quantidade} un).
                  As demais unidades desse mesmo lote em outros locais não são afetadas, e o vínculo com o
                  lote de origem/bandejas continua preservado para rastreio. Essa ação não pode ser desfeita por aqui.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inativando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarInativacao}
              disabled={inativando}
              className="bg-red-600 hover:bg-red-700"
            >
              {inativando ? 'Inativando...' : 'Inativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}