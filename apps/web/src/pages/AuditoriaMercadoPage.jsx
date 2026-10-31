import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { recordMarketplaceSale } from '@/services/salesService';
import {
  ClipboardCheck, ArrowLeft, MapPin, Package, ChevronRight,
  CheckCircle2, Loader2, RotateCcw, ArrowRightLeft, Calendar,
  AlertTriangle, Plus, Minus, Layers, Truck, Search,
  ChevronDown, ChevronUp, PackageX, ListTree, Save, Info, Clock
} from 'lucide-react';

export default function AuditoriaMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [mercados, setMercados] = useState([]);
  const [todosLocais, setTodosLocais] = useState([]);
  const [estoqueMovelId, setEstoqueMovelId] = useState(null);
  const [estoqueCentralId, setEstoqueCentralId] = useState(null);
  const [ultimasAuditorias, setUltimasAuditorias] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDados, setIsLoadingDados] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedVisita, setExpandedVisita] = useState(null);
  const [produtoExpandidoVisita, setProdutoExpandidoVisita] = useState(null);
  const [searchMercado, setSearchMercado] = useState('');

  const [mercadoId, setMercadoId] = useState('');
  const [dataAuditoria, setDataAuditoria] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState('');

  const [itensContagem, setItensContagem] = useState([]);
  const [danoExpandido, setDanoExpandido] = useState({});
  const [vencidoExpandido, setVencidoExpandido] = useState({});
  const [movimentoExpandido, setMovimentoExpandido] = useState({});
  const [produtoExpandidoConfirmar, setProdutoExpandidoConfirmar] = useState(null);
  // Controle de expandir/recolher cada grupo de produto na etapa de Contagem
  // (visual apenas — não mexe em nenhuma regra de cálculo). Chave = produto_id,
  // valor true/false explícito quando o usuário já clicou; sem entrada, o grupo
  // usa o padrão (expandido se ainda tem lote pendente, recolhido se já terminou).
  const [produtoExpandidoContagem, setProdutoExpandidoContagem] = useState({});
  const [reabItens, setReabItens] = useState([]);
  const [lotesAtivos, setLotesAtivos] = useState([]);
  const [devolucoes, setDevolucoes] = useState({});
  const [movimentosEstoque, setMovimentosEstoque] = useState({});
  // Opção nova e separada das outras (não reaproveita danificado nem
  // "mover para outro estoque"): substituição de produto por outro produto
  // DIFERENTE (ex. coxinha por enroladinho), exclusiva de mercado Venda
  // Direta. Guarda por lote de ORIGEM (o que sai do mercado).
  const [substituicoesProduto, setSubstituicoesProduto] = useState({});
  const [substituicaoExpandido, setSubstituicaoExpandido] = useState({});
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState(null);
  const [padraoProdutos, setPadraoProdutos] = useState({});
  const [padraoProdutosOriginal, setPadraoProdutosOriginal] = useState({});
  const [produtosBandeja, setProdutosBandeja] = useState([]);
  const [isSavingPadrao, setIsSavingPadrao] = useState(false);
  const [draftVerificado, setDraftVerificado] = useState(false);
  // Item 1 (pente fino de 20/09): botão "Atualizar estoque" no Reabastecimento,
  // pra reconferir o disponível no Estoque Móvel sem mexer no resto da visita.
  const [isAtualizandoEstoque, setIsAtualizandoEstoque] = useState(false);
  const [ultimaAtualizacaoEstoque, setUltimaAtualizacaoEstoque] = useState(null);
  // Item 3 (pente fino de 20/09): "Substituir produto inteiro" — versão em
  // grupo do que setSubstituicaoProduto já faz por lote (ver comentário lá).
  const [substituicaoGrupoExpandido, setSubstituicaoGrupoExpandido] = useState({});
  const [trocaGrupoDraft, setTrocaGrupoDraft] = useState({});

  const [successData, setSuccessData] = useState(null);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('T')[0].split('-').reverse().join('/'); };
  const formatDateTime = (d) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      const dia = date.toLocaleDateString('pt-BR');
      const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dia} ${hora}`;
    } catch { return d; }
  };

  useEffect(() => {
    if (!empresaId) return;
    Promise.all([
      supabase.from('locais').select('id, nome, tipo, modelo_negocio').eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome'),
      supabase.from('locais').select('id, nome, tipo').eq('empresa_id', empresaId).order('nome'),
      supabase.from('locais').select('id').eq('empresa_id', empresaId).eq('nome', 'ESTOQUE MÓVEL').maybeSingle(),
      supabase.from('locais').select('id').eq('empresa_id', empresaId).ilike('nome', '%CENTRAL%').maybeSingle(),
      supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).eq('tem_bandeja', true).order('nome'),
    ]).then(([mRes, lRes, movelRes, centralRes, produtosRes]) => {
      setMercados(mRes.data || []);
      setTodosLocais(lRes.data || []);
      setEstoqueMovelId(movelRes.data?.id || null);
      setEstoqueCentralId(centralRes.data?.id || null);
      setProdutosBandeja(produtosRes.data || []);
      setIsLoading(false);
    });
  }, [empresaId]);

  const selectedMercado = mercados.find(m => m.id === mercadoId);
  // Usado tanto na tela (mostrar/esconder a opção "Substituição de produto",
  // exclusiva de Venda Direta) quanto no salvamento — mesma regra usada lá.
  const ehVendaDireta = selectedMercado?.modelo_negocio === 'venda_direta';

  // Salva o progresso automaticamente (rascunho local), pra não perder nada
  // se o operador sair da tela sem querer. Só entra em ação depois que os
  // dados do mercado já carregaram E a checagem de rascunho já terminou —
  // sem isso, o autosave rodava cedo demais e sobrescrevia um rascunho real
  // com os dados recém-carregados (zerados), antes do usuário nem ver o aviso.
  useEffect(() => {
    if (!mercadoId || !draftVerificado || itensContagem.length === 0 || rascunhoDisponivel) return;
    try {
      localStorage.setItem(`auditoria_rascunho_${mercadoId}`, JSON.stringify({
        step, itensContagem, reabItens, devolucoes, movimentosEstoque, substituicoesProduto, observacao, dataAuditoria,
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.error('Erro ao salvar rascunho:', err);
    }
  }, [mercadoId, draftVerificado, step, itensContagem, reabItens, devolucoes, movimentosEstoque, substituicoesProduto, observacao, dataAuditoria, rascunhoDisponivel]);

  const loadDadosMercado = useCallback(async (mId) => {
    if (!mId || !empresaId) return;
    setIsLoadingDados(true);
    setDraftVerificado(false); // trava o autosave até a checagem de rascunho (lá embaixo) terminar
    try {
      // Últimas 3 auditorias — agora incluindo lote_id de cada item, e o
      // numero_lote (via join) pra poder casar reabastecimento/transferência
      // corretamente mesmo quando o lote_id é o de origem, não o de destino.
      const { data: audits } = await supabase
        .from('auditorias_mercado')
        .select(`id, data_auditoria, observacao,
          auditoria_mercado_itens(lote_id, produto_id, quantidade_contada, quantidade_calculada_vendida, reabastecimento, valor_unitario, subtotal, quantidade_danificada, produtos(nome), lotes:lote_id(numero_lote))
        `)
        .eq('empresa_id', empresaId).eq('local_id', mId)
        .order('data_auditoria', { ascending: false }).limit(3);
      setUltimasAuditorias(audits || []);

      // Mapa da última auditoria por LOTE (corrigido — antes usava produto_id,
      // o que causava conflito quando havia múltiplos lotes do mesmo produto no mercado)
      const ultAudit = audits?.[0] || null;
      const ultLoteMap = {};
      (ultAudit?.auditoria_mercado_itens || []).forEach(i => {
        if (i.lote_id) ultLoteMap[i.lote_id] = i;
      });

      // Reabastecimento da PRÓPRIA última visita, casado por numero_lote+produto
      // (não por lote_id — o item de reabastecimento é salvo com o lote_id de
      // ORIGEM, então bater direto com o lote local nunca funcionava).
      const ultReabastecimentoMap = {};
      (ultAudit?.auditoria_mercado_itens || []).forEach(i => {
        const numeroLote = i.lotes?.numero_lote;
        if (numeroLote && i.reabastecimento > 0) {
          const chave = numeroLote + '|' + i.produto_id;
          ultReabastecimentoMap[chave] = (ultReabastecimentoMap[chave] || 0) + Number(i.reabastecimento);
        }
      });

      // Transferências desde última auditoria — agora por LOTE específico, não por produto.
      // Bug anterior: ao agrupar por produto_id, quando havia 2+ lotes do mesmo produto no mercado,
      // o valor transferido era contado em DOBRO (uma vez para cada lote), inflando o "vendido".
      let transferidoMap = {};
      let devolvidoMap = {};
      if (ultAudit) {
        // IMPORTANTE: a movimentação de uma transferência grava lote_id como o
        // lote de ORIGEM (de onde saiu), nunca o de destino — é assim que a
        // transferir_estoque_rpc funciona. Então pra saber quanto CHEGOU em
        // cada lote específico DESTE mercado, não dá pra casar pelo lote_id
        // da movimentação (ele nunca vai bater com o lote local); precisa
        // casar pelo número do lote + produto, que é exatamente o critério
        // que a própria RPC usa pra decidir em qual lote mesclar o
        // reabastecimento. Sem essa correção, todo reabastecimento que se
        // mesclava a um lote já existente (o caso mais comum) desaparecia
        // do cálculo — "anterior" ficava sempre mais baixo do que devia, e
        // a venda da visita seguinte saía subcontada (venda real que nunca
        // chegava a ser cobrada).
        const { data: transfs } = await supabase.from('movimentacoes')
          .select('produto_id, quantidade, lotes:lote_id(numero_lote)').eq('empresa_id', empresaId)
          .eq('local_destino_id', mId).eq('tipo', 'transferencia')
          .gte('data_movimentacao', ultAudit.data_auditoria);
        (transfs || []).forEach(t => {
          const numeroLote = t.lotes?.numero_lote;
          if (numeroLote) {
            const chave = numeroLote + '|' + t.produto_id;
            transferidoMap[chave] = (transferidoMap[chave] || 0) + Number(t.quantidade);
          } else {
            // Fallback: sem número de lote pra casar (caso raro), mantém por produto
            transferidoMap['produto_' + t.produto_id] = (transferidoMap['produto_' + t.produto_id] || 0) + Number(t.quantidade);
          }
        });

        // Devoluções/descarte desde a última auditoria (saídas do mercado) — sem
        // descontar isso, a próxima visita espera mais do que realmente sobrou e
        // credita a diferença como "vendido" por engano.
        const { data: devols } = await supabase.from('movimentacoes')
          .select('produto_id, lote_id, quantidade').eq('empresa_id', empresaId)
          .eq('local_origem_id', mId).eq('tipo', 'transferencia')
          .gte('data_movimentacao', ultAudit.data_auditoria);
        (devols || []).forEach(d => {
          if (d.lote_id) {
            devolvidoMap[d.lote_id] = (devolvidoMap[d.lote_id] || 0) + Number(d.quantidade);
          } else {
            devolvidoMap['produto_' + d.produto_id] = (devolvidoMap['produto_' + d.produto_id] || 0) + Number(d.quantidade);
          }
        });
      }

      // Estoque no mercado por lote
      const { data: estoqueLocal } = await supabase.from('estoque_por_local')
        .select('lote_id, produto_id, quantidade_atual')
        .eq('empresa_id', empresaId).eq('local_id', mId).gt('quantidade_atual', 0);

      const loteIds = (estoqueLocal || []).map(r => r.lote_id).filter(Boolean);

      let lotesMap = {};
      let origemMap = {};
      if (loteIds.length > 0) {
        const { data: lotesData } = await supabase.from('lotes')
          .select('id, numero_lote, produto_id, data_validade, tipo_lote, lote_origem_id, produtos(id, nome, preco_bandeja_mercado, preco_bandeja)')
          .in('id', loteIds).eq('ativo', true).eq('lote_devolvido', false);
        (lotesData || []).forEach(l => { lotesMap[l.id] = l; });

        // Busca o lote RAIZ (tipo 'base') subindo a cadeia de origens, pois bandejas podem
        // ter como origem outra bandeja (cadeia de transferências), não só o lote base direto.
        let idsParaResolver = [...new Set((lotesData || []).map(l => l.lote_origem_id).filter(Boolean))];
        let nivelMap = {}; // id -> {numero_lote, tipo_lote, lote_origem_id}
        let tentativas = 0;
        while (idsParaResolver.length > 0 && tentativas < 5) {
          const { data: nivelData } = await supabase.from('lotes')
            .select('id, numero_lote, tipo_lote, lote_origem_id')
            .in('id', idsParaResolver);
          (nivelData || []).forEach(l => { nivelMap[l.id] = l; });
          // Próximo nível: origens dos que ainda não são 'base' e têm origem própria
          idsParaResolver = [...new Set(
            (nivelData || [])
              .filter(l => l.tipo_lote !== 'base' && l.lote_origem_id)
              .map(l => l.lote_origem_id)
          )];
          tentativas++;
        }
        // Para cada lote original, resolve a cadeia até achar o lote tipo 'base'
        (lotesData || []).forEach(l => {
          let atual = l.lote_origem_id ? nivelMap[l.lote_origem_id] : null;
          let safety = 0;
          while (atual && atual.tipo_lote !== 'base' && atual.lote_origem_id && safety < 5) {
            atual = nivelMap[atual.lote_origem_id];
            safety++;
          }
          if (atual) origemMap[l.id] = atual.numero_lote;
        });
      }

      // Monta itens de contagem — comparação agora feita por LOTE, não por produto
      const contagem = (estoqueLocal || [])
        .filter(e => lotesMap[e.lote_id])
        .map(e => {
          const lote = lotesMap[e.lote_id];
          const prod = lote.produtos;
          const ultProd = ultLoteMap[lote.id];
          return {
            lote_id: lote.id,
            produto_id: lote.produto_id,
            produto_nome: prod?.nome || '',
            numero_lote: lote.numero_lote,
            lote_origem_numero: origemMap[lote.id] || null,
            data_validade: lote.data_validade,
            tipo_lote: lote.tipo_lote,
            qtd_atual: Number(e.quantidade_atual),
            qtd_contada: Number(e.quantidade_atual),
            tocado: false, // só fica true quando o usuário ajusta manualmente — evita mostrar "vendido" antes da contagem real
            preco: Number(prod?.preco_bandeja_mercado || prod?.preco_bandeja || 0),
            ultima_qtd_contada: ultProd?.quantidade_contada ?? null,
            // Líquido: o que entrou (reabastecimento) menos o que saiu (devolução/descarte)
            // desde a última visita — os dois contam pra saber o que era esperado agora.
            //
            // AJUSTE (14/10): NÃO subtrair mais o reabastecimento da própria
            // visita de referência. A contagem salva (quantidade_contada do lote
            // local) é anterior ao reabastecimento — o que chegou nessa visita
            // é gravado em outra linha (lote de origem) e NÃO está na contagem.
            // Subtrair aqui fazia a base da próxima visita ignorar a reposição
            // (ex.: contou 1 + repôs 6 → esperava 1 em vez de 7) e subcontar a
            // venda. O reabastecimento da própria visita entra uma vez, via
            // transferidoMap (a movimentação tem data >= data da auditoria).
            //
            // (comentário antigo) reabastecimento/devolução da PRÓPRIA visita de referência
            // (a última auditoria) é salvo alguns segundos DEPOIS do horário da
            // auditoria em si (é uma sequência de gravações). Como a busca de
            // "transferido desde a última visita" usa esse horário como corte,
            // ela acabava pegando de novo o reabastecimento/devolução que já
            // pertencia àquela mesma visita — contando errado, como se fosse algo
            // novo acontecido DEPOIS dela. Descontamos aqui o que já está
            // registrado no próprio item da última auditoria, pra não contar 2x
            // (casado por numero_lote+produto — não por lote_id, que nesse tipo
            // de registro é sempre o lote de ORIGEM, não o deste mercado).
            transferido_desde:
              (transferidoMap[lote.numero_lote + '|' + lote.produto_id] ?? transferidoMap['produto_' + lote.produto_id] ?? 0) -
              (devolvidoMap[lote.id] ?? devolvidoMap['produto_' + lote.produto_id] ?? 0) +
              (ultProd?.quantidade_danificada || 0),
            quantidade_danificada: 0,
            observacao_danificado: '',
            substituir_lote_id: null,
            substituir_quantidade: 0,
          };
        })
        .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome) || a.numero_lote.localeCompare(b.numero_lote));

      setItensContagem(contagem);

      const hoje = new Date();
      setLotesAtivos((estoqueLocal || []).filter(e => lotesMap[e.lote_id]).map(e => {
        const lote = lotesMap[e.lote_id];
        const valDate = lote.data_validade ? new Date(lote.data_validade) : null;
        const dias = valDate ? Math.ceil((valDate - hoje) / (1000 * 60 * 60 * 24)) : null;
        return {
          ...lote, produto_nome: lote.produtos?.nome || '',
          lote_origem_numero: origemMap[lote.id] || null,
          quantidade_atual: Number(e.quantidade_atual),
          diasParaVencer: dias,
          vencido: dias !== null && dias < 0,
          vencendoEmBreve: dias !== null && dias >= 0 && dias <= 7,
        };
      }).sort((a, b) => (a.diasParaVencer || 999) - (b.diasParaVencer || 999)));

      if (estoqueMovelId) {
        const { data: movelEst } = await supabase.from('estoque_por_local')
          .select('lote_id, produto_id, quantidade_atual')
          .eq('empresa_id', empresaId).eq('local_id', estoqueMovelId).gt('quantidade_atual', 0);
        const movelLoteIds = (movelEst || []).map(r => r.lote_id).filter(Boolean);
        if (movelLoteIds.length > 0) {
          const { data: lotesMovel } = await supabase.from('lotes')
            .select('id, numero_lote, produto_id, data_validade, tipo_lote, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
            .in('id', movelLoteIds).eq('ativo', true).eq('lote_devolvido', false);
          setReabItens((lotesMovel || []).map(l => ({
            lote_id: l.id, produto_id: l.produto_id,
            produto_nome: l.produtos?.nome || '',
            numero_lote: l.numero_lote, data_validade: l.data_validade,
            preco: Number(l.produtos?.preco_bandeja_mercado || l.produtos?.preco_bandeja || 0),
            disponivel: movelEst?.find(e => e.lote_id === l.id)?.quantidade_atual || 0,
            quantidade: 0,
          })).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)));
        } else {
          setReabItens([]);
        }
      }

      // Quantidade padrão de cada produto nesse mercado — agora editável na
      // etapa "Referência" logo no início da visita, e usada pra sugerir
      // quanto reabastecer mais adiante.
      const { data: padroesData } = await supabase
        .from('mercado_produto_padrao')
        .select('produto_id, quantidade_padrao')
        .eq('local_id', mId);
      const padraoMap = {};
      (padroesData || []).forEach(p => { padraoMap[p.produto_id] = p.quantidade_padrao; });
      setPadraoProdutos(padraoMap);
      setPadraoProdutosOriginal(padraoMap);

      // Confere se tem um rascunho salvo dessa visita (guardado automaticamente
      // enquanto o operador preenche, pra não perder nada se sair sem querer).
      try {
        const bruto = localStorage.getItem(`auditoria_rascunho_${mId}`);
        if (bruto) {
          const rascunho = JSON.parse(bruto);
          const horasDesde = (Date.now() - rascunho.timestamp) / (1000 * 60 * 60);
          if (horasDesde < 12) {
            setRascunhoDisponivel(rascunho);
          } else {
            localStorage.removeItem(`auditoria_rascunho_${mId}`);
          }
        }
      } catch (err) {
        console.error('Erro ao ler rascunho salvo:', err);
      } finally {
        // Só agora libera o autosave — antes disso, se ele rodasse, sobrescrevia
        // o rascunho salvo com os dados recém-carregados (zerados) por engano.
        setDraftVerificado(true);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do mercado:', err);
      toast({ title: 'Erro ao carregar dados do mercado', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingDados(false);
    }
  }, [empresaId, estoqueMovelId]);

  // Item 1 (pente fino de 20/09): reconfere só o disponível no Estoque Móvel,
  // no momento do Reabastecimento — sem tocar em contagem, dano, devolução ou
  // substituição já preenchidos. Existe porque a visita pode demorar, e nesse
  // meio-tempo outra transferência/reabastecimento em outro mercado pode ter
  // mudado o que sobrou no Estoque Móvel.
  const atualizarEstoqueDisponivel = async () => {
    if (!estoqueMovelId) return;
    setIsAtualizandoEstoque(true);
    try {
      const { data: movelEst } = await supabase.from('estoque_por_local')
        .select('lote_id, produto_id, quantidade_atual')
        .eq('empresa_id', empresaId).eq('local_id', estoqueMovelId).gt('quantidade_atual', 0);
      const movelLoteIds = (movelEst || []).map(r => r.lote_id).filter(Boolean);
      let lotesMovel = [];
      if (movelLoteIds.length > 0) {
        const { data } = await supabase.from('lotes')
          .select('id, numero_lote, produto_id, data_validade, tipo_lote, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
          .in('id', movelLoteIds).eq('ativo', true).eq('lote_devolvido', false);
        lotesMovel = data || [];
      }
      const novosMap = {};
      lotesMovel.forEach(l => {
        novosMap[l.id] = {
          lote_id: l.id, produto_id: l.produto_id,
          produto_nome: l.produtos?.nome || '',
          numero_lote: l.numero_lote, data_validade: l.data_validade,
          preco: Number(l.produtos?.preco_bandeja_mercado || l.produtos?.preco_bandeja || 0),
          disponivel: movelEst?.find(e => e.lote_id === l.id)?.quantidade_atual || 0,
        };
      });

      const avisos = [];
      setReabItens(prev => {
        // Mantém tudo que o operador já tinha preenchido (quantidade escolhida),
        // só atualiza o "disponível" de cada lote — exceto se o disponível caiu
        // abaixo do que já foi pedido, aí ajusta pra não deixar passar do real.
        const atualizados = prev.map(item => {
          const atualizado = novosMap[item.lote_id];
          if (atualizado) delete novosMap[item.lote_id]; // marca como já tratado
          if (!atualizado) {
            if (Number(item.quantidade) > 0) {
              avisos.push(`${item.produto_nome} (lote ${item.numero_lote}) não está mais disponível no Estoque Móvel — a quantidade já selecionada (${item.quantidade}) foi mantida, confira antes de salvar.`);
              return { ...item, disponivel: 0 };
            }
            return null; // sem seleção nenhuma e sem estoque — some da lista
          }
          const qtdAjustada = Math.min(Number(item.quantidade || 0), atualizado.disponivel);
          if (qtdAjustada < Number(item.quantidade || 0)) {
            avisos.push(`${item.produto_nome} (lote ${item.numero_lote}): disponível agora é ${atualizado.disponivel}, ajustei a quantidade selecionada de ${item.quantidade} para ${qtdAjustada}.`);
          }
          return { ...item, disponivel: atualizado.disponivel, quantidade: qtdAjustada };
        }).filter(Boolean);
        // Lotes novos que apareceram no Estoque Móvel depois que a visita começou
        const novos = Object.values(novosMap).map(n => ({ ...n, quantidade: 0 }));
        return [...atualizados, ...novos].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
      });

      setUltimaAtualizacaoEstoque(Date.now());
      if (avisos.length > 0) {
        toast({ title: 'Estoque atualizado — com ajustes', description: avisos.join(' '), variant: 'destructive' });
      } else {
        toast({ title: 'Estoque atualizado!', description: 'Disponibilidade do Estoque Móvel conferida agora.' });
      }
    } catch (err) {
      toast({ title: 'Erro ao atualizar estoque', description: err.message, variant: 'destructive' });
    } finally {
      setIsAtualizandoEstoque(false);
    }
  };

  const updateContagem = (lote_id, value) => {
    setItensContagem(prev => prev.map(i => {
      if (i.lote_id !== lote_id) return i;
      // Sem limite máximo aqui: a contagem física é quem manda, mesmo que
      // seja diferente do que o sistema esperava (é justamente pra corrigir
      // esse tipo de diferença que a auditoria existe). Só não deixa negativo.
      return { ...i, qtd_contada: Math.max(0, parseInt(value) || 0), tocado: true };
    }));
  };

  // Marca o item como conferido sem alterar a quantidade — pra quando o
  // operador confere e não teve nenhuma venda/mudança naquele produto,
  // sem precisar mexer no contador só pra "destravar" a confirmação.
  const confirmarSemAlteracao = (lote_id) => {
    setItensContagem(prev => prev.map(i => i.lote_id !== lote_id ? i : { ...i, tocado: true }));
  };

  // Mexe no "carrinho" do Reabastecimento por diferença (tira a parte antiga
  // dessa origem e coloca a nova), em vez de sobrescrever — assim dano,
  // vencido e retirada que substituem o MESMO lote do Estoque Móvel somam em
  // vez de um apagar o outro. Chamado sempre direto do handler (nunca dentro
  // de um updater de setState), pra não aplicar a diferença duas vezes.
  const ajustarReab = (antigoId, antigaQtd, novoId, novaQtd) => {
    setReabItens(prev => prev.map(r => {
      let q = Number(r.quantidade || 0);
      if (antigoId && r.lote_id === antigoId) q = Math.max(0, q - Number(antigaQtd || 0));
      if (novoId && r.lote_id === novoId) q = Math.min(r.disponivel, q + Number(novaQtd || 0));
      return q === Number(r.quantidade || 0) ? r : { ...r, quantidade: q };
    }));
  };

  // Resolve o atalho "Substituir por lote do Estoque Móvel?" de qualquer
  // origem (dano, vencido, retirada). `atual` é o registro da origem;
  // `qtdOrigem` é a quantidade lançada nela. Devolve os campos novos.
  const resolverSubstituicao = (atual, field, value, qtdOrigem) => {
    const antigoId = atual.substituir_lote_id || null;
    const antigaQtd = Number(atual.substituir_quantidade || 0);
    let novoId = antigoId;
    let desejada = antigaQtd;
    if (field === 'zerar') { novoId = null; desejada = 0; }
    else if (field === 'substituir_lote_id') { novoId = value || null; desejada = novoId ? Number(qtdOrigem || 0) : 0; }
    else if (field === 'substituir_quantidade') { desejada = Math.max(0, parseInt(value) || 0); }
    let novaQtd = 0;
    if (novoId) {
      const cand = reabItens.find(r => r.lote_id === novoId);
      const disponivel = cand?.disponivel || 0;
      // Já ocupado no Reabastecimento por OUTRAS origens/extras (tira a parte desta origem)
      const jaNoLote = Math.max(0, Number(cand?.quantidade || 0) - (novoId === antigoId ? antigaQtd : 0));
      const livre = Math.max(0, disponivel - jaNoLote);
      novaQtd = Math.min(desejada, livre);
      if (desejada > novaQtd) {
        toast({
          title: 'Estoque insuficiente nesse lote',
          description: `Esse lote só tem ${livre} livre(s) no Estoque Móvel (${disponivel} disponíveis). Preenchi ${novaQtd} — escolha outro lote na etapa de Reabastecimento pra completar as ${desejada - novaQtd} unidade(s) que faltam.`,
          variant: 'destructive',
        });
      }
    }
    ajustarReab(antigoId, antigaQtd, novoId, novaQtd);
    return { substituir_lote_id: novoId, substituir_quantidade: novaQtd };
  };

  const updateDanificado = (lote_id, field, value) => {
    const atual = itensContagem.find(i => i.lote_id === lote_id);
    if (!atual) return;
    let patch;
    if (field === 'quantidade_danificada') {
      // Não mexe na "Qtd no freezer" aqui: calcVendido já desconta o dano por
      // conta própria (reduzir o freezer também cancelava o desconto do dano
      // e o produto danificado era contado como vendido).
      const novoDano = Math.max(0, parseInt(value) || 0);
      patch = { quantidade_danificada: novoDano, tocado: true };
      if (novoDano === 0 && atual.substituir_lote_id) {
        // Zerar o dano desliga a substituição — tira do reabastecimento também
        patch = { ...patch, ...resolverSubstituicao(atual, 'zerar', null, 0) };
      }
    } else if (field === 'observacao_danificado') {
      patch = { observacao_danificado: value };
    } else if (field === 'substituir_lote_id' || field === 'substituir_quantidade') {
      patch = resolverSubstituicao(atual, field, value, atual.quantidade_danificada);
    } else {
      return;
    }
    setItensContagem(prev => prev.map(i => i.lote_id === lote_id ? { ...i, ...patch } : i));
  };


  const calcVendido = (item) => {
    const anterior = item.ultima_qtd_contada !== null
      ? item.ultima_qtd_contada + item.transferido_desde
      : item.qtd_atual;
    // Desconta o que foi registrado como danificado, vencido, E o que foi
    // simplesmente movido para outro estoque (não é uma venda, mesmo que
    // agora desconte do faturamento como retirada) — senão produto retirado
    // por qualquer um desses motivos entraria como "vendido" por engano.
    const qtdVencida = devolucoes[item.lote_id]?.quantidade || 0;
    const qtdMovida = movimentosEstoque[item.lote_id]?.quantidade || 0;
    // Idem para "Substituição de produto" (opção nova, separada) — o produto
    // trocado por outro também sai da contagem de vendido, mesma lógica.
    const qtdSubstituida = substituicoesProduto[item.lote_id]?.quantidade_origem || 0;
    const bruto = Math.max(0, anterior - item.qtd_contada - (item.quantidade_danificada || 0) - qtdVencida - qtdMovida - qtdSubstituida);
    // TRAVA DE SEGURANÇA: nunca "vender" mais do que existe de fato no lote
    // agora (item.qtd_atual). Sem isso, quando "anterior" fica inflado (ex:
    // dano de uma visita é somado de volta na base da visita seguinte, e
    // nesse meio tempo o lote já tinha menos unidades de verdade), o cálculo
    // pedia pra debitar mais do que o lote tinha — a rpc_venda_mercado
    // rejeitava a chamada (RAISE EXCEPTION), mas o item da auditoria já
    // tinha sido salvo com a venda "fantasma", travando o estoque exibido
    // num valor que nunca mais se atualizava sozinho. Limitar aqui garante
    // que o número salvo é sempre o que realmente dá pra debitar.
    return Math.min(bruto, item.qtd_atual);
  };

  const totalVendidoEstimado = itensContagem.reduce((s, i) => s + calcVendido(i) * i.preco, 0);
  const totalDanificado = itensContagem.reduce((s, i) => s + (i.quantidade_danificada || 0), 0);
  // O freezer final precisa somar o que foi reabastecido NESTA visita — senão
  // mostra o número de antes de reabastecer, que não é o que vai ficar no
  // mercado de verdade depois que o operador for embora.
  const totalReabastecidoNestaVisita = reabItens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  // Substituições de produto (Venda Direta) desta visita, já com os valores
  // calculados uma única vez aqui — usado tanto pro total oficial da visita
  // (valorReabastecimento, salvo no banco) quanto pelas duas telas que
  // exibem esse mesmo cálculo (Reabastecimento e Substituição de produto),
  // pra nunca mais divergir entre "o que é salvo" e "o que é mostrado".
  // Importante: usa sub.quantidade_destino (não reabItens[destino].quantidade,
  // que fica em 0 quando a troca não passa pelo "Deixar" do Reabastecimento)
  // e o valor TOTAL de cada lado (quantidades de quem sai/entra podem ser
  // diferentes — ex.: 3 Empada de Palmito saem, 8 Pão de Batata entram).
  const substituicoesValidas = Object.entries(substituicoesProduto)
    .filter(([, s]) => s.quantidade_origem > 0 && s.produto_destino_lote_id)
    .map(([loteId, sub]) => {
      const itemOrigem = itensContagem.find(i => i.lote_id === loteId);
      const itemDestino = reabItens.find(r => r.lote_id === sub.produto_destino_lote_id);
      if (!itemOrigem || !itemDestino) return null;
      const valorOrigem = Number(sub.quantidade_origem) * Number(itemOrigem.preco || 0);
      const valorDestino = Number(sub.quantidade_destino || 0) * Number(itemDestino.preco || 0);
      const diferenca = Math.round((valorDestino - valorOrigem) * 100) / 100;
      return { loteId, sub, itemOrigem, itemDestino, valorOrigem, valorDestino, diferenca, cobrar: Math.max(0, diferenca) };
    })
    .filter(Boolean);

  // Regra (Fernando, 02/10): não existe mais um "par" troca/substituição pra
  // retirada do mesmo produto — toda retirada do mercado (qualquer motivo:
  // vencido, dano, baixa venda, troca por validade) credita sozinha o valor
  // cheio (ver totalValorMovidoCredito mais abaixo), e todo reabastecimento
  // cobra normal, sem precisar vincular um ao outro. Por isso
  // "Mover para outro estoque" não precisa mais reservar/excluir o lote de
  // destino do "Substituir por lote do Estoque Móvel?" — ele aparece como
  // reabastecimento normal. `lotesDestinoTroca` continua existindo só pra
  // "Substituição de produto" (produto DIFERENTE), que ainda funciona por
  // diferença de valor entre o que sai e o que entra.
  const lotesDestinoTroca = new Set(substituicoesValidas.map(s => s.itemDestino.lote_id));

  // Visão agrupada só pra EXIBIÇÃO: quando "Substituir produto inteiro" gera
  // várias linhas (uma por lote de origem, ex.: 1+4+3+1 un de Coxinha em 4
  // lotes diferentes), aqui juntamos numa única linha por par produto-origem
  // → produto-destino, somando quantidades e valores (ex.: "10 Coxinha → 10
  // Enroladinho"). Isso NÃO muda nada do que é salvo/movimentado — o cálculo
  // e o registro continuam por lote, exatamente como precisa pra mexer no
  // estoque certo — é só pra não espalhar a mesma troca em N linhas na tela.
  const substituicoesAgrupadasView = (() => {
    const grupos = {};
    substituicoesValidas.forEach(l => {
      const chave = `${l.itemOrigem.produto_id}|${l.itemDestino.produto_id}`;
      if (!grupos[chave]) {
        grupos[chave] = {
          chave,
          produtoOrigemNome: l.itemOrigem.produto_nome,
          produtoDestinoNome: l.itemDestino.produto_nome,
          quantidadeOrigem: 0,
          quantidadeDestino: 0,
          valorOrigem: 0,
          valorDestino: 0,
          observacoes: [],
        };
      }
      grupos[chave].quantidadeOrigem += Number(l.sub.quantidade_origem || 0);
      grupos[chave].quantidadeDestino += Number(l.sub.quantidade_destino || 0);
      grupos[chave].valorOrigem += l.valorOrigem;
      grupos[chave].valorDestino += l.valorDestino;
      if (l.sub.observacao) grupos[chave].observacoes.push(l.sub.observacao);
    });
    return Object.values(grupos).map(g => {
      const diferenca = Math.round((g.valorDestino - g.valorOrigem) * 100) / 100;
      return { ...g, diferenca, cobrar: Math.max(0, diferenca) };
    });
  })();

  // Valor líquido do reabastecimento = tudo que foi entregue nesta visita
  // (reabastecimento normal + os produtos que entraram nas trocas de
  // produto DIFERENTE, pelo valor calculado acima) menos dano/retirada e o
  // valor CHEIO do que já tinha sido pago no produto que saiu numa troca.
  const totalValorReabastecimentoBruto = reabItens
    .filter(i => !lotesDestinoTroca.has(i.lote_id))
    .reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.preco || 0), 0)
    + substituicoesValidas.reduce((s, sub) => s + sub.valorDestino, 0);
  const totalValorDanificado = itensContagem.reduce((s, i) => s + Number(i.quantidade_danificada || 0) * Number(i.preco || 0), 0);
  // Devolução (produto vencido que volta sem ser por dano) também é perda
  // pro mercado e desconta igual o dano.
  const totalValorDevolvido = Object.entries(devolucoes).reduce((s, [loteId, dev]) => {
    if (!dev.quantidade) return s;
    const lote = lotesAtivos.find(l => l.id === loteId);
    const preco = Number(lote?.produtos?.preco_bandeja_mercado || lote?.produtos?.preco_bandeja || 0);
    return s + Number(dev.quantidade) * preco;
  }, 0);
  // Regra (Fernando, 02/10): em mercado de Venda Direta o estoque já tá
  // pago — então TODA retirada feita em "Mover para outro estoque" desconta
  // sozinha o valor cheio, qualquer que seja o motivo (baixa venda, troca
  // por validade, etc.), sem precisar estar vinculada a nenhuma reposição
  // específica. O que entra (se entrar) é cobrado à parte, normal, como
  // reabastecimento — por isso NÃO soma em totalValorReabastecimentoBruto
  // acima (já está dentro do reabItens normal).
  const totalValorMovidoCredito = Object.entries(movimentosEstoque).reduce((s, [loteId, m]) => {
    const qtd = Number(m.quantidade || 0);
    if (qtd <= 0) return s;
    const item = itensContagem.find(i => i.lote_id === loteId);
    return s + qtd * Number(item?.preco || 0);
  }, 0);
  const totalValorSubstituicaoCredito = substituicoesValidas.reduce((s, sub) => s + sub.valorOrigem, 0);
  const totalValorReabastecimento = Math.max(0, totalValorReabastecimentoBruto - totalValorDanificado - totalValorDevolvido - totalValorMovidoCredito - totalValorSubstituicaoCredito);
  // Usado só pra mostrar a etiqueta "substituição por dano" na lista — não
  // afeta mais o valor cobrado (isso já é resolvido descontando o dano do total).
  const isSubstituicao = (item) => itensContagem.some(i => i.substituir_lote_id === item.lote_id && i.substituir_quantidade > 0);
  const totalFreezerGeral = itensContagem.reduce((s, i) => s + Number(i.qtd_contada || 0), 0) + totalReabastecidoNestaVisita;
  const totalVendidoGeralQtd = itensContagem.reduce((s, i) => s + calcVendido(i), 0);

  // Consolida a contagem (que vem por lote) numa visão única por produto pra
  // tela de confirmação — soma freezer/vendido/danificado, mantendo os dois
  // primeiros sempre separados (não junta freezer com vendido).
  // Mesma ideia da consolidação da Contagem/Confirmar, mas pro histórico de
  // visitas anteriores (que vem direto do banco, já com os produtos juntos).
  const consolidarVisitaPorProduto = (itens) => {
    const map = {};
    (itens || []).forEach(item => {
      const key = item.produto_id;
      if (!map[key]) {
        map[key] = {
          produto_id: key,
          produto_nome: item.produtos?.nome || '',
          quantidade_contada: 0,
          quantidade_calculada_vendida: 0,
          reabastecimento: 0,
          quantidade_danificada: 0,
          subtotal: 0,
          lotes: [],
        };
      }
      map[key].quantidade_contada += Number(item.quantidade_contada || 0);
      map[key].quantidade_calculada_vendida += Number(item.quantidade_calculada_vendida || 0);
      map[key].reabastecimento += Number(item.reabastecimento || 0);
      map[key].quantidade_danificada += Number(item.quantidade_danificada || 0);
      map[key].subtotal += Number(item.subtotal || 0);
      map[key].lotes.push(item);
    });
    return Object.values(map).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
  };

  const consolidarContagemPorProduto = () => {
    const map = {};
    itensContagem.forEach(item => {
      const key = item.produto_id;
      if (!map[key]) {
        map[key] = {
          produto_id: key,
          produto_nome: item.produto_nome,
          qtd_contada: 0,
          vendido: 0,
          quantidade_danificada: 0,
          subtotal: 0,
          lotes: [],
        };
      }
      const v = calcVendido(item);
      map[key].qtd_contada += Number(item.qtd_contada || 0);
      map[key].vendido += v;
      map[key].quantidade_danificada += Number(item.quantidade_danificada || 0);
      map[key].subtotal += v * item.preco;
      map[key].lotes.push({ ...item, vendidoCalculado: v });
    });
    // Soma o reabastecimento feito NESTA visita — ele acontece depois da
    // contagem na ordem das etapas, então sem isso o freezer mostrado aqui
    // fica "atrasado" (não reflete o que o mercado vai ter depois da visita).
    reabItens.forEach(item => {
      if (!item.quantidade) return;
      const key = item.produto_id;
      if (!map[key]) {
        map[key] = {
          produto_id: key,
          produto_nome: item.produto_nome,
          qtd_contada: 0,
          vendido: 0,
          quantidade_danificada: 0,
          subtotal: 0,
          lotes: [],
        };
      }
      map[key].qtd_contada += Number(item.quantidade || 0);
    });
    return Object.values(map).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
  };

  // Produto vencido. Também aceita o atalho "Substituir por lote do Estoque
  // Móvel?" (igual ao dano e ao "Mover para outro estoque") — assim quem
  // troca um vencido por um novo NÃO precisa lançar a mesma unidade também
  // em "Mover", o que gerava desconto em dobro. O atalho só pré-preenche o
  // Reabastecimento; o desconto do vencido continua sendo um só.
  const setDevolucao = (loteId, field, value) => {
    const atual = devolucoes[loteId] || { destino_id: locaisDevolucao[0]?.id || '', quantidade: 0, substituir_lote_id: null, substituir_quantidade: 0 };
    let novo;
    if (field === 'quantidade') {
      const novaQtd = Math.max(0, parseInt(value) || 0);
      novo = { ...atual, quantidade: novaQtd };
      if (novaQtd === 0 && atual.substituir_lote_id) novo = { ...novo, ...resolverSubstituicao(atual, 'zerar', null, 0) };
    } else if (field === 'substituir_lote_id' || field === 'substituir_quantidade') {
      novo = { ...atual, ...resolverSubstituicao(atual, field, value, atual.quantidade) };
    } else {
      novo = { ...atual, [field]: value };
    }
    setDevolucoes(prev => ({ ...prev, [loteId]: novo }));
  };


  // Quantas unidades de um lote do Estoque Móvel entraram no Reabastecimento
  // como "substituição" (dano, vencido ou retirada). Só pra exibição — não
  // entra em nenhuma conta de valor.
  const qtdSubstituicaoNoLote = (loteId) => {
    const doDano = itensContagem.reduce((s, i) => s + (i.substituir_lote_id === loteId ? Number(i.substituir_quantidade || 0) : 0), 0);
    const doVencido = Object.values(devolucoes).reduce((s, d) => s + (d?.substituir_lote_id === loteId ? Number(d.substituir_quantidade || 0) : 0), 0);
    const doMovido = Object.values(movimentosEstoque).reduce((s, m) => s + (m?.substituir_lote_id === loteId ? Number(m.substituir_quantidade || 0) : 0), 0);
    return doDano + doVencido + doMovido;
  };

  // Locais válidos como destino pra "mover para outro estoque" — qualquer
  // local da empresa, menos o próprio mercado da visita.
  const locaisMovimento = todosLocais.filter(l => l.id !== mercadoId);

  // Move produto do mercado pra outro estoque, sem gerar perda financeira:
  // não passa por rpc_devolucao (Descarte) nem soma em totalValorDanificado/
  // totalValorDevolvido — só sai da contagem de "vendido" (calcVendido) e
  // fisicamente muda de local. Pode opcionalmente vir vinculado a um produto
  // de substituição no Reabastecimento, igual ao dano.
  const setMovimento = (loteId, field, value) => {
    const atual = movimentosEstoque[loteId] || { destino_id: estoqueMovelId || locaisMovimento[0]?.id || '', quantidade: 0, observacao: '', substituir_lote_id: null, substituir_quantidade: 0 };
    let novo;
    if (field === 'quantidade') {
      const novaQtd = Math.max(0, parseInt(value) || 0);
      novo = { ...atual, quantidade: novaQtd };
      if (novaQtd === 0 && atual.substituir_lote_id) novo = { ...novo, ...resolverSubstituicao(atual, 'zerar', null, 0) };
    } else if (field === 'substituir_lote_id' || field === 'substituir_quantidade') {
      novo = { ...atual, ...resolverSubstituicao(atual, field, value, atual.quantidade) };
    } else {
      novo = { ...atual, [field]: value };
    }
    setMovimentosEstoque(prev => ({ ...prev, [loteId]: novo }));
  };


  // "Substituição de produto" — opção nova e isolada (não mexe em danificado
  // nem em "mover para outro estoque"): produto A sai do mercado e um produto
  // B DIFERENTE entra no lugar (ex. coxinha por enroladinho), vindo de
  // qualquer lote do Estoque Móvel — sem a trava de "mesmo produto" que as
  // outras opções têm. Só faz sentido (e só aparece na tela) pra mercado
  // Venda Direta: é o único modelo em que isso precisa gerar uma cobrança da
  // diferença de valor lá no Faturamento de Reabastecimento.
  const setSubstituicaoProduto = (loteId, field, value) => {
    setSubstituicoesProduto(prev => {
      const atual = prev[loteId] || { produto_destino_lote_id: null, quantidade_origem: 0, quantidade_destino: 0, observacao: '' };
      let novo = atual;
      const destinosParaRecalcular = [];

      if (field === 'quantidade_origem') {
        const novaQtd = Math.max(0, parseInt(value) || 0);
        // Zerar quem sai desfaz a troca inteira (senão fica um vínculo
        // "fantasma" sem produto de origem).
        if (novaQtd === 0 && atual.produto_destino_lote_id) destinosParaRecalcular.push(atual.produto_destino_lote_id);
        novo = novaQtd === 0
          ? { produto_destino_lote_id: null, quantidade_origem: 0, quantidade_destino: 0, observacao: atual.observacao }
          : { ...atual, quantidade_origem: novaQtd };
      } else if (field === 'quantidade_destino') {
        novo = { ...atual, quantidade_destino: Math.max(0, parseInt(value) || 0) };
        if (atual.produto_destino_lote_id) destinosParaRecalcular.push(atual.produto_destino_lote_id);
      } else if (field === 'produto_destino_lote_id') {
        const novoLoteId = value || null;
        if (atual.produto_destino_lote_id) destinosParaRecalcular.push(atual.produto_destino_lote_id);
        if (novoLoteId) destinosParaRecalcular.push(novoLoteId);
        // Sugere a mesma quantidade de quem saiu como ponto de partida — o
        // operador pode ajustar livremente depois (as quantidades NÃO
        // precisam ser iguais, ex.: 3 Empada saem, 8 Pão de Batata entram).
        novo = { ...atual, produto_destino_lote_id: novoLoteId, quantidade_destino: novoLoteId ? (atual.quantidade_destino || atual.quantidade_origem) : 0 };
      } else {
        novo = { ...atual, [field]: value };
      }

      const proximoEstado = { ...prev, [loteId]: novo };

      // Recalcula a quantidade do(s) lote(s) de destino afetados como a SOMA
      // de "quantidade_destino" de todas as substituições que apontam pra
      // ele — antes, quando duas origens diferentes usavam o MESMO lote de
      // reposição (ex.: dois lotes de Esfiha de Frango virando o mesmo lote
      // de Pão de Batata), a segunda sobrescrevia a quantidade da primeira
      // em vez de somar, e o reabastecimento/freezer ficavam com o total
      // errado.
      [...new Set(destinosParaRecalcular)].forEach(destLoteId => {
        const total = Object.values(proximoEstado)
          .filter(s => s.produto_destino_lote_id === destLoteId && s.quantidade_destino > 0)
          .reduce((sum, s) => sum + Number(s.quantidade_destino), 0);
        setReabItens(prevReab => prevReab.map(r => r.lote_id === destLoteId ? { ...r, quantidade: total } : r));
      });

      return proximoEstado;
    });
  };

  // Item 3 (pente fino de 20/09): "Substituir produto inteiro" — atalho pra
  // aplicar a MESMA "Substituição de produto" acima em todos os lotes de um
  // produto de uma vez, em vez de repetir lote por lote. Continua usando
  // exatamente o mesmo mecanismo (setSubstituicaoProduto/substituicoesProduto)
  // — só automatiza o preenchimento. Quem quiser trocar só um lote específico
  // continua usando a opção por lote, sem nenhuma mudança nela.
  const substituirProdutoInteiro = (grupo, destinoLoteId, quantidadeDestinoTotal) => {
    const lotesComQtd = grupo.lotes.filter(l => Number(l.qtd_contada || 0) > 0);
    if (lotesComQtd.length === 0) return;

    // Distribui a quantidade destino PROPORCIONALMENTE ao que cada lote
    // contribuiu na contagem, em vez de jogar tudo em um único lote
    // "carreador" e zerar os demais. A versão anterior fazia os outros lotes
    // aparecerem como se tivessem sido 100% devolvidos (0 de volta) enquanto
    // o carreador sozinho levava um "a cobrar" inflado — o total líquido
    // batia, mas cada linha isolada não representava uma troca real, o que
    // ficava estranho pra conferir. Agora cada lote gera uma linha
    // proporcional e coerente, e a soma continua batendo exatamente com o
    // total escolhido (método dos maiores restos, sem arredondar errado).
    const totalOrigem = lotesComQtd.reduce((soma, l) => soma + Number(l.qtd_contada), 0);
    let destinoPorLote;
    if (totalOrigem <= 0) {
      destinoPorLote = lotesComQtd.map(() => 0);
    } else {
      const shares = lotesComQtd.map(l => (quantidadeDestinoTotal * Number(l.qtd_contada)) / totalOrigem);
      const bases = shares.map(s => Math.floor(s));
      const leftover = quantidadeDestinoTotal - bases.reduce((a, b) => a + b, 0);
      const ordemPorResto = shares
        .map((s, idx) => ({ idx, resto: s - bases[idx] }))
        .sort((a, b) => b.resto - a.resto);
      destinoPorLote = [...bases];
      for (let i = 0; i < leftover && i < ordemPorResto.length; i++) {
        destinoPorLote[ordemPorResto[i].idx] += 1;
      }
    }

    lotesComQtd.forEach((lote, idx) => {
      setSubstituicaoProduto(lote.lote_id, 'quantidade_origem', lote.qtd_contada);
      setSubstituicaoProduto(lote.lote_id, 'produto_destino_lote_id', destinoLoteId);
      setSubstituicaoProduto(lote.lote_id, 'quantidade_destino', destinoPorLote[idx]);
    });

    // Zera a contagem desses lotes — fisicamente esse produto não fica mais no
    // freezer, foi substituído por outro. Guarda o valor anterior pra dar pra
    // desfazer depois.
    const loteIds = new Set(lotesComQtd.map(l => l.lote_id));
    setItensContagem(prev => prev.map(i => (
      loteIds.has(i.lote_id) ? { ...i, _qtdContadaAntesTroca: i.qtd_contada, qtd_contada: 0, tocado: true } : i
    )));
  };

  const desfazerTrocaGrupo = (grupo) => {
    grupo.lotes.forEach(lote => setSubstituicaoProduto(lote.lote_id, 'quantidade_origem', 0));
    const loteIds = new Set(grupo.lotes.map(l => l.lote_id));
    setItensContagem(prev => prev.map(i => (
      loteIds.has(i.lote_id)
        ? { ...i, qtd_contada: i._qtdContadaAntesTroca ?? i.qtd_contada, _qtdContadaAntesTroca: undefined }
        : i
    )));
  };

  // Dado um item do reabastecimento (produto que está chegando), soma TODAS
  // as substituições que apontam pra esse lote (pode ter mais de uma origem
  // diferente indo pro mesmo lote de reposição) e devolve o crédito total a
  // descontar — usado só pra gravar/exibir a diferença de valor a cobrar no
  // Faturamento de Reabastecimento (Venda Direta). Cada par origem→destino é
  // limitado ao seu próprio valor de chegada antes de somar, exatamente como
  // no cálculo do total exibido na tela (totalValorSubstituicaoCredito).
  const getCreditoSubstituicaoDestino = (reabItem) => {
    // IMPORTANTE: reaproveita o `substituicoesValidas` já calculado lá em
    // cima (a mesma lista que a tela usa pra mostrar "Reabastecimento" e
    // "Substituição de produto" e pro Total líquido). Antes, esta função
    // recalculava tudo de novo por conta própria a partir de
    // `substituicoesProduto` — dois cálculos paralelos e independentes que
    // deveriam sempre dar o mesmo resultado, mas podiam divergir (foi o que
    // causou o card mostrar um valor de troca e o banco salvar outro, num
    // caso real). Usando a mesma fonte, o valor salvo NUNCA mais diverge do
    // valor mostrado na tela antes de salvar.
    const origens = substituicoesValidas.filter(s => s.itemDestino.lote_id === reabItem.lote_id);
    if (origens.length === 0) return null;

    let creditoTotal = 0;
    let quantidadeOrigemTotal = 0;
    let produtoOrigemId = null;
    let produtoOrigemNome = null;

    origens.forEach(s => {
      // Grava o valor CHEIO do que o mercadinho já pagou no produto que saiu
      // (não mais limitado ao valor do produto que entrou). Antes, numa troca
      // por um produto de menor valor, isso ficava capado em valorDestino e o
      // excedente que o mercadinho já tinha pago sumia sem virar crédito em
      // lugar nenhum. Quem decide quanto disso cabe em cada linha (e o que
      // sobra vira crédito geral do mercado) é o Faturamento de
      // Reabastecimento (PedidoReabastecimentoPage), não aqui.
      creditoTotal += s.valorOrigem;
      quantidadeOrigemTotal += Number(s.sub.quantidade_origem);
      if (!produtoOrigemId) { produtoOrigemId = s.itemOrigem.produto_id; produtoOrigemNome = s.itemOrigem.produto_nome; }
    });

    if (creditoTotal <= 0) return null;
    return {
      produto_origem_id: produtoOrigemId,
      produto_origem_nome: produtoOrigemNome,
      quantidade: quantidadeOrigemTotal,
      valorCredito: Math.round(creditoTotal * 100) / 100,
    };
  };

  const handleSalvar = async () => {
    setIsSubmitting(true);
    try {
      // Usa a data selecionada pelo usuário, mas com o horário REAL do momento em que a
      // visita está sendo salva — antes estava fixo em 12:00 UTC (sempre exibia 09:00).
      const agora = new Date();
      const [ano, mes, dia] = dataAuditoria.split('-').map(Number);
      const dataComHoraReal = new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds());
      const isoDate = dataComHoraReal.toISOString();
      // Marca o momento real de início do salvamento — usado no final pra
      // identificar exatamente quais movimentações foram criadas nesta
      // visita, e corrigir a data delas pra bater com a data escolhida.
      const inicioSalvamento = agora.toISOString();

      const { data: audit, error: auditErr } = await supabase
        .from('auditorias_mercado')
        .insert({ empresa_id: empresaId, local_id: mercadoId, data_auditoria: isoDate, observacao })
        .select().single();
      if (auditErr) throw auditErr;

      // Salva itens da auditoria — agora incluindo lote_id para comparação correta na próxima visita
      const itensPara = itensContagem.map(i => ({
        auditoria_id: audit.id,
        lote_id: i.lote_id,
        produto_id: i.produto_id,
        quantidade_contada: i.qtd_contada,
        quantidade_calculada_vendida: calcVendido(i),
        reabastecimento: 0,
        valor_unitario: i.preco,
        subtotal: calcVendido(i) * i.preco,
        quantidade_danificada: i.quantidade_danificada || 0,
        observacao_danificado: i.observacao_danificado || null,
      }));

      // CORREÇÃO: registra o reabastecimento real como itens próprios na auditoria.
      // Antes, o reabastecimento era transferido no estoque mas nunca aparecia no relatório
      // (ficava sempre salvo como 0), pois os lotes que chegam do Estoque Móvel são novos
      // no mercado e não fazem parte da contagem (itensContagem) — precisam de registro à parte.
      const itensReabastecimento = reabItens.filter(i => i.quantidade > 0).map(i => ({
        auditoria_id: audit.id,
        lote_id: i.lote_id,
        produto_id: i.produto_id,
        quantidade_contada: i.quantidade,
        quantidade_calculada_vendida: 0,
        reabastecimento: i.quantidade,
        valor_unitario: i.preco,
        subtotal: 0, // reabastecimento não é venda — não soma no total vendido
        quantidade_danificada: 0,
      }));

      const { error: itensErr } = await supabase.from('auditoria_mercado_itens').insert([...itensPara, ...itensReabastecimento]);
      if (itensErr) throw itensErr;

      const itensComVenda = itensContagem.filter(i => calcVendido(i) > 0);
      if (itensComVenda.length > 0) {
        const totalVendas = itensComVenda.reduce((s, i) => s + calcVendido(i) * i.preco, 0);

        // Venda Direta é cobrada só pelo Reabastecimento (Faturamento de
        // Reabastecimento) — o "vendido por contagem" aqui NÃO deve virar
        // faturamento (senão duplica: uma vez pela contagem, outra pelo
        // reabastecimento). Mas o desconto de estoque continua valendo —
        // o produto realmente saiu do mercado, isso tem que refletir no
        // saldo e nas métricas informativas (Giro de Estoque, etc.).
        // Por isso: NÃO cria uma linha em "vendas" pra Venda Direta (pula
        // o recordMarketplaceSale), mas ainda roda a RPC de venda pra cada
        // item, sem venda_id — assim desconta do lote e gera a
        // movimentação (que outras telas já leem direto, sem depender de
        // ter uma venda vinculada), só não entra no Relatório de Vendas
        // (que exige venda_id via inner join).
        const ehVendaDireta = selectedMercado?.modelo_negocio === 'venda_direta';

        let venda_id = null;
        let cliente_referencia = selectedMercado?.nome;

        if (!ehVendaDireta) {
          const statusVenda = { status: 'PENDENTE', financeiro_baixado: false, data_venda: dataAuditoria };
          const resultado = await recordMarketplaceSale(
            empresaId, mercadoId, selectedMercado?.nome,
            { total_final: totalVendas },
            { forma_pagamento: 'nao_informado' },
            statusVenda
          );
          venda_id = resultado.venda_id;
          cliente_referencia = resultado.cliente_referencia;
        }

        // Cada item roda isoladamente: se UM falhar (rede, RPC, etc.), os
        // outros ainda são processados — antes, um erro no meio da lista
        // travava o restante do loop sem processar, sem avisar quais itens
        // ficaram de fora.
        const falhasVenda = [];
        for (const item of itensComVenda) {
          const vendido = calcVendido(item);
          try {
            await supabase.rpc('rpc_venda_mercado', {
              p_empresa_id: empresaId,
              p_lote_id: item.lote_id,
              p_quantidade: vendido,
              p_observacao: ehVendaDireta
                ? `Venda Direta (informativo, não fatura) - Auditoria ${formatDate(dataAuditoria)}`
                : `Auditoria de Mercado - ${formatDate(dataAuditoria)}`,
              p_desconto_tipo: null,
              p_desconto_valor: null,
              p_subtotal: vendido * item.preco,
              p_total_final: vendido * item.preco,
              p_caixa_id: null,
              p_forma_pagamento: 'nao_informado',
              p_valor_recebido: null,
              p_troco: null,
              p_venda_id: venda_id,
              p_canal_venda: 'MERCADO',
              p_cliente_referencia: cliente_referencia,
              p_tipo_item: 'NORMAL',
              p_valor_unitario: item.preco,
              p_taxa_motoboy: 0,
            });
          } catch (vendaErr) {
            falhasVenda.push(`${item.produto_nome} (${item.numero_lote}): ${vendaErr.message || vendaErr}`);
          }
        }
        // Se algum item falhou mesmo com a trava de segurança do calcVendido
        // (ex: outro processo mexeu no lote ao mesmo tempo), avisa
        // explicitamente em vez de deixar a visita "parcialmente" salva sem
        // ninguém perceber.
        if (falhasVenda.length > 0) {
          throw new Error(`A visita foi salva, mas ${falhasVenda.length} venda(s) não puderam ser debitadas do estoque: ${falhasVenda.join('; ')}. Verifique esses itens manualmente.`);
        }
      }

      // Produtos danificados: manda de verdade pro Descarte (tira do lote do
      // mercado, some da tela dessa e das próximas visitas), usando a mesma
      // função já usada na tela de Devolução. A substituição por outro lote
      // (quando marcada) já entra automaticamente no loop de reabastecimento
      // abaixo, porque updateDanificado mantém os dois sincronizados.
      for (const item of itensContagem.filter(i => i.quantidade_danificada > 0)) {
        await supabase.rpc('rpc_devolucao', {
          p_empresa_id: empresaId,
          p_local_origem_id: mercadoId,
          p_produto_id: item.produto_id,
          p_lote_id: item.lote_id,
          p_quantidade: item.quantidade_danificada,
          p_motivo_devolucao: 'danificado',
          p_observacao: item.observacao_danificado || `Danificado - Auditoria ${formatDate(dataAuditoria)}`,
        });
      }

      for (const item of reabItens.filter(i => i.quantidade > 0)) {
        if (!estoqueMovelId) continue;
        const { data: loteData } = await supabase.from('lotes')
          .select('tipo_lote, unidades_por_bandeja').eq('id', item.lote_id).single();
        await supabase.rpc('transferir_estoque_rpc', {
          p_empresa_id: empresaId,
          p_lote_id: item.lote_id,
          p_local_origem_id: estoqueMovelId,
          p_local_destino_id: mercadoId,
          p_quantidade: item.quantidade,
          p_produto_id: item.produto_id,
          p_tipo_lote: loteData?.tipo_lote || 'bandeja',
          p_unidades_por_bandeja: loteData?.unidades_por_bandeja || null,
        });

        // Se veio de substituição por dano, marca a movimentação só como
        // informação (rastreabilidade) — o valor do dano já é descontado à
        // parte do total do reabastecimento, essa movimentação em si conta
        // normal, não é gratuita.
        if (isSubstituicao(item)) {
          const { data: movRecente } = await supabase.from('movimentacoes')
            .select('id')
            .eq('empresa_id', empresaId).eq('lote_id', item.lote_id)
            .eq('local_destino_id', mercadoId).eq('tipo', 'transferencia')
            .order('data_movimentacao', { ascending: false }).limit(1).maybeSingle();
          if (movRecente?.id) {
            await supabase.from('movimentacoes').update({
              observacao: 'Reposição de produto danificado (substituição) - Auditoria de Mercado',
            }).eq('id', movRecente.id);
          }
        }

        // "Substituição de produto" (opção nova, só em Venda Direta): esse
        // item que chegou é o produto B de uma troca — grava quanto valia o
        // produto A que saiu, pra cobrar só a diferença no Faturamento de
        // Reabastecimento (nunca cobra o valor cheio de B nesse caso).
        const creditoSubstituicao = ehVendaDireta ? getCreditoSubstituicaoDestino(item) : null;
        if (creditoSubstituicao) {
          const { data: movRecenteSub } = await supabase.from('movimentacoes')
            .select('id')
            .eq('empresa_id', empresaId).eq('lote_id', item.lote_id)
            .eq('local_destino_id', mercadoId).eq('tipo', 'transferencia')
            .order('data_movimentacao', { ascending: false }).limit(1).maybeSingle();
          if (movRecenteSub?.id) {
            await supabase.from('movimentacoes').update({
              valor_desconto_substituicao: creditoSubstituicao.valorCredito,
              quantidade_desconto_substituicao: creditoSubstituicao.quantidade,
              produto_substituido_id: creditoSubstituicao.produto_origem_id,
              observacao: creditoSubstituicao.produto_origem_id === item.produto_id
                ? `Troca de lote (validade) - ${item.produto_nome} - Auditoria de Mercado ${formatDate(dataAuditoria)}`
                : `Substituição de produto (${creditoSubstituicao.produto_origem_nome} → ${item.produto_nome}) - Auditoria de Mercado ${formatDate(dataAuditoria)}`,
            }).eq('id', movRecenteSub.id);
          }
        }
      }

      for (const [loteId, dev] of Object.entries(devolucoes)) {
        if (!dev.quantidade || !dev.destino_id) continue;
        const lote = lotesAtivos.find(l => l.id === loteId);
        if (!lote) continue;
        const { data: loteData } = await supabase.from('lotes')
          .select('tipo_lote, unidades_por_bandeja').eq('id', loteId).single();
        await supabase.rpc('transferir_estoque_rpc', {
          p_empresa_id: empresaId,
          p_lote_id: loteId,
          p_local_origem_id: mercadoId,
          p_local_destino_id: dev.destino_id,
          p_quantidade: Number(dev.quantidade),
          p_produto_id: lote.produto_id,
          p_tipo_lote: loteData?.tipo_lote || 'bandeja',
          p_unidades_por_bandeja: loteData?.unidades_por_bandeja || null,
        });
      }

      // Produtos movidos pra outro estoque (não é dano, não é vencido — ex.
      // baixa venda, troca por validade, cliente pediu pra tirar e substituir
      // por outro produto): transferência pura, sem rodar rpc_devolucao. Não
      // tem `motivo_devolucao` marcado aqui de propósito — é isso que faz o
      // Faturamento de Reabastecimento (PedidoReabastecimentoPage) reconhecer
      // essa transferência como retirada normal e descontar o valor cheio
      // (regra Fernando, 02/10). A reposição vinculada (quando marcada em
      // "Substituir por lote do Estoque Móvel?") já entra no loop de
      // reabastecimento acima, porque setMovimento mantém os dois
      // sincronizados, do mesmo jeito que a substituição por dano.
      for (const [loteId, mov] of Object.entries(movimentosEstoque)) {
        if (!mov.quantidade || !mov.destino_id) continue;
        const item = itensContagem.find(i => i.lote_id === loteId);
        if (!item) continue;
        const { data: loteData } = await supabase.from('lotes')
          .select('tipo_lote, unidades_por_bandeja').eq('id', loteId).single();
        await supabase.rpc('transferir_estoque_rpc', {
          p_empresa_id: empresaId,
          p_lote_id: loteId,
          p_local_origem_id: mercadoId,
          p_local_destino_id: mov.destino_id,
          p_quantidade: Number(mov.quantidade),
          p_produto_id: item.produto_id,
          p_tipo_lote: loteData?.tipo_lote || 'bandeja',
          p_unidades_por_bandeja: loteData?.unidades_por_bandeja || null,
        });

        const { data: movRecente } = await supabase.from('movimentacoes')
          .select('id')
          .eq('empresa_id', empresaId).eq('lote_id', loteId)
          .eq('local_destino_id', mov.destino_id).eq('tipo', 'transferencia')
          .order('data_movimentacao', { ascending: false }).limit(1).maybeSingle();
        if (movRecente?.id) {
          await supabase.from('movimentacoes').update({
            observacao: mov.observacao
              ? `Movido para outro estoque (${mov.observacao}) - Auditoria de Mercado ${formatDate(dataAuditoria)}`
              : `Movido para outro estoque - Auditoria de Mercado ${formatDate(dataAuditoria)}`,
          }).eq('id', movRecente.id);
        }
      }

      // "Substituição de produto" (opção nova, só em Venda Direta): tira
      // fisicamente o produto A do mercado — transferência pura de estoque,
      // igual "mover para outro estoque" (não passa por rpc_devolucao, não
      // mexe em nenhum total de dano/devolução). A cobrança da diferença já
      // foi gravada acima, na chegada do produto B.
      //
      // BUG ENCONTRADO (18/09): esse loop dependia do estado `estoqueMovelId`
      // (carregado 1x quando a página abre). Se a visita fosse salva antes
      // dessa busca inicial terminar — ex.: usuário navega rápido de um
      // mercado pro outro — `estoqueMovelId` ainda estava null, o `continue`
      // abaixo pulava a transferência de saída em SILÊNCIO, e o produto A
      // ficava contabilizado como saído do mercado sem nunca voltar pro
      // Estoque Móvel. O crédito financeiro (lançado no loop de cima) não é
      // afetado por isso — só a movimentação física ficava faltando. Pra não
      // depender de timing, agora resolve o Estoque Móvel de novo aqui, na
      // hora de salvar, se por algum motivo o estado ainda não tinha carregado.
      const temSubstituicaoPendente = Object.values(substituicoesProduto).some(s => s.quantidade_origem > 0 && s.produto_destino_lote_id);
      let estoqueMovelIdParaSubstituicao = estoqueMovelId;
      if (!estoqueMovelIdParaSubstituicao && temSubstituicaoPendente) {
        const { data: movelData } = await supabase.from('locais')
          .select('id').eq('empresa_id', empresaId).eq('nome', 'ESTOQUE MÓVEL').maybeSingle();
        estoqueMovelIdParaSubstituicao = movelData?.id || null;
      }
      for (const [loteId, sub] of Object.entries(substituicoesProduto)) {
        if (!sub.quantidade_origem || !sub.produto_destino_lote_id) continue;
        const item = itensContagem.find(i => i.lote_id === loteId);
        if (!item || !estoqueMovelIdParaSubstituicao) {
          // Não deixa mais passar batido: se ainda assim não achou o Estoque
          // Móvel, avisa — antes isso só sumia sem ninguém perceber.
          toast({
            title: 'Atenção: substituição não movida ao Estoque Móvel',
            description: `${item?.produto_nome || 'Produto'} (${sub.quantidade_origem} un) foi contabilizado como saído do mercado, mas não foi possível transferir pro Estoque Móvel automaticamente. Verifique manualmente.`,
            variant: 'destructive',
          });
          continue;
        }
        const { data: loteData } = await supabase.from('lotes')
          .select('tipo_lote, unidades_por_bandeja').eq('id', loteId).single();
        await supabase.rpc('transferir_estoque_rpc', {
          p_empresa_id: empresaId,
          p_lote_id: loteId,
          p_local_origem_id: mercadoId,
          p_local_destino_id: estoqueMovelIdParaSubstituicao,
          p_quantidade: Number(sub.quantidade_origem),
          p_produto_id: item.produto_id,
          p_tipo_lote: loteData?.tipo_lote || 'bandeja',
          p_unidades_por_bandeja: loteData?.unidades_por_bandeja || null,
        });

        const { data: movRecente } = await supabase.from('movimentacoes')
          .select('id')
          .eq('empresa_id', empresaId).eq('lote_id', loteId)
          .eq('local_destino_id', estoqueMovelIdParaSubstituicao).eq('tipo', 'transferencia')
          .order('data_movimentacao', { ascending: false }).limit(1).maybeSingle();
        if (movRecente?.id) {
          await supabase.from('movimentacoes').update({
            observacao: sub.observacao
              ? `Substituição de produto (${sub.observacao}) - Auditoria de Mercado ${formatDate(dataAuditoria)}`
              : `Substituição de produto - Auditoria de Mercado ${formatDate(dataAuditoria)}`,
            // Marca essa transferência (produto que SAIU na troca) como já
            // contabilizada pela Substituição de produto — essa retirada já
            // vira crédito pelo valor_desconto_substituicao gravado no lado
            // do produto que ENTROU (destino). Sem essa marca, a regra nova
            // de "toda retirada desconta sozinha" (Faturamento de
            // Reabastecimento) ia contar esse mesmo crédito DUAS vezes: uma
            // aqui, outra na substituição.
            motivo_devolucao: 'substituicao_produto',
          }).eq('id', movRecente.id);
        }
      }

      // As RPCs de venda/reabastecimento/dano/devolução gravam a movimentação
      // com o horário real de quando foram processadas — mas os relatórios
      // devem todos concordar sobre "quando isso aconteceu" usando a mesma
      // data escolhida pelo operador (importante quando a visita é lançada
      // no sistema depois do dia real, tipo "fiz a visita dia 28, só lancei
      // hoje"). Corrige em lote todas as movimentações criadas agora, sem
      // precisar rastrear id por id de cada RPC chamada acima.
      await supabase
        .from('movimentacoes')
        .update({ data_movimentacao: isoDate })
        .eq('empresa_id', empresaId)
        .or(`local_origem_id.eq.${mercadoId},local_destino_id.eq.${mercadoId}`)
        .gte('data_movimentacao', inicioSalvamento);

      if (window.navigator.vibrate) window.navigator.vibrate(100);
      setSuccessData({
        mercado: selectedMercado?.nome, data: dataAuditoria,
        totalVendido: totalVendidoEstimado,
        valorReabastecimento: totalValorReabastecimento,
        modeloNegocio: selectedMercado?.modelo_negocio,
        vendas: itensComVenda.length,
        reabastecidos: reabItens.filter(i => i.quantidade > 0).length,
        devolvidos: Object.values(devolucoes).filter(d => d.quantidade > 0).length,
        itens: itensContagem,
      });
      // Item 2 (pente fino de 20/09): a visita já foi salva no banco — limpa o
      // rascunho local agora, não só quando o operador descarta manualmente ou
      // começa uma auditoria nova. Sem isso, um rascunho de uma visita já
      // concluída ficava valendo por até 12h e podia ser "recuperado" por
      // engano numa visita seguinte (ou reaberta sem querer), reenviando dados
      // de uma visita que já tinha sido salva.
      if (mercadoId) localStorage.removeItem(`auditoria_rascunho_${mercadoId}`);
      toast({ title: 'Visita registrada!', className: 'bg-green-600 text-white border-none' });
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const alterarPadrao = (produtoId, valor) => {
    const qtd = Math.max(0, parseInt(valor) || 0);
    setPadraoProdutos(prev => ({ ...prev, [produtoId]: qtd }));
  };

  const houveMudancaPadrao = produtosBandeja.some(
    p => (padraoProdutos[p.id] || 0) !== (padraoProdutosOriginal[p.id] || 0)
  );

  const salvarPadroes = async () => {
    if (!mercadoId) return;
    setIsSavingPadrao(true);
    try {
      const linhas = produtosBandeja
        .filter(p => (padraoProdutos[p.id] || 0) !== (padraoProdutosOriginal[p.id] || 0))
        .map(p => ({
          empresa_id: empresaId,
          local_id: mercadoId,
          produto_id: p.id,
          quantidade_padrao: padraoProdutos[p.id] || 0,
          updated_at: new Date().toISOString(),
        }));
      if (linhas.length > 0) {
        const { error } = await supabase.from('mercado_produto_padrao').upsert(linhas, { onConflict: 'local_id,produto_id' });
        if (error) throw error;
        setPadraoProdutosOriginal({ ...padraoProdutosOriginal, ...padraoProdutos });
        toast({ title: 'Referência salva!', description: `${linhas.length} produto(s) atualizado(s).` });
      }
    } catch (err) {
      toast({ title: 'Erro ao salvar referência', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingPadrao(false);
    }
  };

  const aplicarRascunho = () => {
    if (!rascunhoDisponivel) return;
    setItensContagem(rascunhoDisponivel.itensContagem || []);
    setReabItens(rascunhoDisponivel.reabItens || []);
    setDevolucoes(rascunhoDisponivel.devolucoes || {});
    setMovimentosEstoque(rascunhoDisponivel.movimentosEstoque || {});
    setSubstituicoesProduto(rascunhoDisponivel.substituicoesProduto || {});
    setObservacao(rascunhoDisponivel.observacao || '');
    if (rascunhoDisponivel.dataAuditoria) setDataAuditoria(rascunhoDisponivel.dataAuditoria);
    setStep(rascunhoDisponivel.step || 2);
    setRascunhoDisponivel(null);
    toast({ title: 'Rascunho recuperado!', description: 'Você está de volta onde parou.' });
  };

  const descartarRascunho = () => {
    if (mercadoId) localStorage.removeItem(`auditoria_rascunho_${mercadoId}`);
    setRascunhoDisponivel(null);
  };

  const resetAll = () => {
    if (mercadoId) localStorage.removeItem(`auditoria_rascunho_${mercadoId}`);
    setStep(1); setMercadoId(''); setItensContagem([]); setReabItens([]);
    setLotesAtivos([]); setDevolucoes({}); setMovimentosEstoque({}); setObservacao(''); setSuccessData(null);
    setUltimasAuditorias([]); setSearchMercado('');
    setDataAuditoria(new Date().toISOString().slice(0, 10));
    setDraftVerificado(false); setRascunhoDisponivel(null);
  };

  const stepLabels = ['Mercado', 'Referência', 'Contagem', 'Reabastecimento', 'Confirmar'];
  const stepIcons = [MapPin, ListTree, ClipboardCheck, Layers, Truck, CheckCircle2];

  // Destino de devolução: só o local "ESTOQUE DEVOLUÇÃO" (ignora maiúsculas/
  // acentos na comparação, pra não quebrar por uma pequena diferença de digitação).
  const normalizarNome = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const locaisDevolucao = todosLocais.filter(l => normalizarNome(l.nome).includes('estoque devolucao'));

  return (
    <>
      <Helmet><title>Visita ao Mercado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Visita ao Mercado</h1>
                <p className="text-gray-500 text-sm mt-0.5">Contagem, reabastecimento e gestão de lotes.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2" title="Sai da tela de auditoria e volta pro menu principal">
              <ArrowLeft className="h-4 w-4" /> Voltar ao Menu
            </Button>
          </div>

          {mercadoId && step > 1 && (
            <div className="max-w-4xl mx-auto px-1 mb-3">
              <p className="text-xs text-gray-400">
                Pra voltar pra uma etapa anterior <strong>dessa mesma visita</strong> (Mercado, Contagem, Lotes...),
                use o botão "← Voltar" no final de cada etapa, não o "Voltar ao Menu" do topo.
              </p>
            </div>
          )}

          {successData ? (
            <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
              <div className="bg-green-50 p-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-green-800">Visita Registrada!</h2>
                <p className="text-sm text-gray-500 mt-1">{successData.mercado} · {formatDate(successData.data)}</p>
              </div>
              <div className="p-6 space-y-3">
                {successData.modeloNegocio && (
                  <div className={`rounded-xl px-4 py-2.5 flex items-start gap-2 border ${
                    successData.modeloNegocio === 'venda_direta' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'
                  }`}>
                    <Info className={`h-4 w-4 flex-shrink-0 mt-0.5 ${successData.modeloNegocio === 'venda_direta' ? 'text-blue-600' : 'text-purple-600'}`} />
                    <p className={`text-xs ${successData.modeloNegocio === 'venda_direta' ? 'text-blue-700' : 'text-purple-700'}`}>
                      {successData.modeloNegocio === 'venda_direta'
                        ? <>Mercado <strong>Venda Direta</strong> — o valor de <strong>Reabastecimento</strong> é o que conta pra cobrança.</>
                        : <>Mercado <strong>Consignado</strong> — o <strong>Vendido</strong> é o que conta pra cobrança (após baixa).</>
                      }
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-teal-50 rounded-xl p-4 text-center border border-teal-100">
                    <p className="text-xs font-bold text-teal-600 uppercase">Vendido Estimado</p>
                    <p className="text-2xl font-black text-teal-700 mt-1">{fmt(successData.totalVendido)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 text-center border border-orange-100">
                    <p className="text-xs font-bold text-orange-600 uppercase">Valor Reabastecimento</p>
                    <p className="text-2xl font-black text-orange-700 mt-1">{fmt(successData.valorReabastecimento)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {successData.reabastecidos > 0 && (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full">✓ {successData.reabastecidos} lote(s) reabastecido(s)</span>
                  )}
                  {successData.devolvidos > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">↩ {successData.devolvidos} lote(s) devolvido(s)</span>
                  )}
                </div>
                <div className="space-y-1">
                  {successData.itens.filter(i => calcVendido(i) > 0).map(item => (
                    <div key={item.lote_id} className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-2.5">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.produto_nome}</p>
                        <p className="text-xs text-gray-500 font-mono">{item.numero_lote} · Vendido: {calcVendido(item)}</p>
                      </div>
                      <span className="font-black text-teal-600 text-sm">{fmt(calcVendido(item) * item.preco)}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={resetAll} className="w-full gap-2 bg-teal-600 hover:bg-teal-700">
                  <RotateCcw className="h-4 w-4" /> Nova Visita
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              <div className="border-b border-gray-100 px-6 py-4">
                <div className="flex items-center justify-between">
                  {stepLabels.map((label, idx) => {
                    const Icon = stepIcons[idx];
                    const n = idx + 1;
                    const done = step > n;
                    const active = step === n;
                    return (
                      <React.Fragment key={n}>
                        <button onClick={() => done && setStep(n)} className={`flex flex-col items-center gap-1 ${done ? 'cursor-pointer' : 'cursor-default'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${active ? 'bg-teal-600 text-white shadow-md' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                          </div>
                          <span className={`text-xs font-semibold ${active ? 'text-teal-600' : done ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
                        </button>
                        {idx < stepLabels.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded ${step > n ? 'bg-green-400' : 'bg-gray-100'}`} />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div className="p-6">

                {mercadoId && (
                  <div className="flex flex-wrap gap-2 mb-5">
                    <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-teal-200">
                      <MapPin className="h-3 w-3" />{selectedMercado?.nome}
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-200">
                      <Calendar className="h-3 w-3" />Data da visita: {formatDate(dataAuditoria)}
                    </span>
                    {ultimasAuditorias.length > 0 ? (() => {
                      const diasDesdeVisita = Math.floor((new Date() - new Date(ultimasAuditorias[0]?.data_auditoria)) / (1000 * 60 * 60 * 24));
                      const atrasado = diasDesdeVisita > 15;
                      const alerta = diasDesdeVisita > 10 && diasDesdeVisita <= 15;
                      const cor = atrasado ? 'bg-red-50 text-red-700 border-red-200' : alerta ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200';
                      return (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cor}`}>
                          {atrasado ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                          Última visita: {formatDate(ultimasAuditorias[0]?.data_auditoria)} · há {diasDesdeVisita} dia{diasDesdeVisita === 1 ? '' : 's'}
                          {atrasado && ' — atrasado'}
                        </span>
                      );
                    })() : (
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-200">
                        <Calendar className="h-3 w-3" />Primeira visita a este mercado
                      </span>
                    )}
                  </div>
                )}

                {rascunhoDisponivel && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-5 flex items-start gap-3">
                    <RotateCcw className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-800 text-sm">Você tem uma visita não terminada aqui</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Parece que essa visita foi interrompida
                        {rascunhoDisponivel.timestamp && ` há ${Math.max(1, Math.round((Date.now() - rascunhoDisponivel.timestamp) / 60000))} min`}.
                        Quer continuar de onde parou ou começar do zero?
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={aplicarRascunho} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                          <RotateCcw className="h-3.5 w-3.5" /> Continuar de onde parei
                        </Button>
                        <Button size="sm" variant="outline" onClick={descartarRascunho} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                          Começar do zero
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-teal-500" /> Selecione o mercado
                    </h3>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-gray-700">Data da visita</label>
                      <input type="date" value={dataAuditoria} onChange={e => setDataAuditoria(e.target.value)}
                        className="w-full h-10 px-3 border border-gray-200 rounded-xl focus:border-teal-400 focus:outline-none text-sm"
                        style={{ fontSize: '16px' }} />
                    </div>
                    {isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input type="text" placeholder="Buscar mercado..." value={searchMercado}
                            onChange={e => setSearchMercado(e.target.value)}
                            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none"
                            style={{ fontSize: '16px' }} />
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                          {mercados.filter(m => !searchMercado || m.nome.toLowerCase().includes(searchMercado.toLowerCase())).map(m => (
                            <button key={m.id} onClick={() => { setMercadoId(m.id); loadDadosMercado(m.id); setSearchMercado(''); setStep(2); }}
                              className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-teal-300 hover:bg-teal-50 transition-all text-left">
                              <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <MapPin className="h-4 w-4 text-teal-600" />
                              </div>
                              <span className="font-semibold text-gray-800 flex-1">{m.nome}</span>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <ListTree className="h-5 w-5 text-teal-500" /> Referência de estoque
                      </h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                        <Button onClick={async () => { if (houveMudancaPadrao) await salvarPadroes(); setStep(3); }} disabled={isSavingPadrao} className="gap-2 bg-teal-600 hover:bg-teal-700 h-9 text-sm">
                          Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700">
                        Quantas bandejas de cada produto normalmente ficam nesse mercado? Isso é só uma referência —
                        aparecem todos os produtos com bandeja, mesmo os que esse mercado não tem hoje. Serve pra
                        sugerir automaticamente quanto reabastecer mais adiante. Pode pular sem preencher nada.
                      </p>
                    </div>

                    {produtosBandeja.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <ListTree className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 text-sm">
                          Nenhum produto com bandeja cadastrado (confira em Produtos {'>'} "Tem bandeja?").
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
                        {produtosBandeja.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm font-medium text-gray-800">{p.nome}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <input
                                type="number"
                                min={0}
                                value={padraoProdutos[p.id] ?? 0}
                                onChange={e => alterarPadrao(p.id, e.target.value)}
                                className="w-16 h-8 text-center font-bold border-2 border-gray-200 rounded-lg focus:border-teal-400 focus:outline-none text-sm"
                                style={{ fontSize: '14px' }}
                              />
                              <span className="text-xs text-gray-400 w-10">band.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar (etapa anterior)</button>
                      <Button
                        onClick={salvarPadroes}
                        disabled={isSavingPadrao || !houveMudancaPadrao}
                        variant="outline"
                        className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50"
                      >
                        {isSavingPadrao ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4" /> Salvar Referência</>}
                      </Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-teal-500" /> Conte o freezer
                      </h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                        <Button onClick={() => setStep(4)} className="gap-2 bg-teal-600 hover:bg-teal-700 h-9 text-sm">
                          Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {ultimasAuditorias.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Últimas {ultimasAuditorias.length} visita(s)</p>
                        {ultimasAuditorias.map((a, idx) => {
                          const tv = (a.auditoria_mercado_itens || []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
                          return (
                            <div key={a.id}>
                              <button className="w-full flex items-center justify-between bg-white rounded-lg p-3 border border-gray-100"
                                onClick={() => setExpandedVisita(expandedVisita === a.id ? null : a.id)}>
                                <div className="flex items-center gap-2">
                                  {idx === 0 && <span className="text-xs bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full">Última</span>}
                                  <div className="text-left">
                                    <p className="text-sm font-bold text-gray-900">{formatDateTime(a.data_auditoria)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-base font-bold text-teal-600">{fmt(tv)}</span>
                                  {expandedVisita === a.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                              </button>
                              {expandedVisita === a.id && (
                                <div className="mt-1 pl-2 space-y-1">
                                  {consolidarVisitaPorProduto(a.auditoria_mercado_itens).map((p) => {
                                    const chave = `${a.id}-${p.produto_id}`;
                                    const temMultiplosLotes = p.lotes.length > 1;
                                    return (
                                      <div key={p.produto_id} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <button
                                          className="w-full flex justify-between items-center text-left"
                                          onClick={() => temMultiplosLotes && setProdutoExpandidoVisita(produtoExpandidoVisita === chave ? null : chave)}
                                        >
                                          <div>
                                            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                              {p.produto_nome}
                                              {temMultiplosLotes && (
                                                <span className="text-[10px] bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                                                  {p.lotes.length} lotes
                                                </span>
                                              )}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              Contado: {p.quantidade_contada}
                                              {p.quantidade_calculada_vendida > 0 && ` · Vendido: ${p.quantidade_calculada_vendida}`}
                                              {p.reabastecimento > 0 && ` · +${p.reabastecimento} reabast.`}
                                              {p.quantidade_danificada > 0 && ` · -${p.quantidade_danificada} danificado`}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            {p.subtotal > 0 && <span className="text-sm font-bold text-teal-600">{fmt(p.subtotal)}</span>}
                                            {temMultiplosLotes && (
                                              produtoExpandidoVisita === chave
                                                ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                                                : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                            )}
                                          </div>
                                        </button>
                                        {temMultiplosLotes && produtoExpandidoVisita === chave && (
                                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                                            {p.lotes.map((item, i) => (
                                              <div key={item.lote_id || i} className="flex items-center justify-between text-xs pl-2">
                                                <span className="text-gray-500">
                                                  Contado: {item.quantidade_contada}
                                                  {item.quantidade_calculada_vendida > 0 && ` · Vendido: ${item.quantidade_calculada_vendida}`}
                                                  {item.reabastecimento > 0 && ` · +${item.reabastecimento} reabast.`}
                                                </span>
                                                {item.subtotal > 0 && <span className="font-semibold text-teal-600">{fmt(item.subtotal)}</span>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isLoadingDados ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
                    ) : itensContagem.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 font-medium">Nenhum produto com estoque neste mercado.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          // Agrupa os lotes por produto pra exibição — só visual, nenhuma
                          // regra de cálculo muda aqui. Mesmo padrão visual já usado na
                          // etapa de Confirmação (cabeçalho do produto + badge "N lotes").
                          const gruposMap = {};
                          const ordemGrupos = [];
                          itensContagem.forEach(item => {
                            if (!gruposMap[item.produto_id]) {
                              gruposMap[item.produto_id] = { produto_id: item.produto_id, produto_nome: item.produto_nome, lotes: [] };
                              ordemGrupos.push(item.produto_id);
                            }
                            gruposMap[item.produto_id].lotes.push(item);
                          });
                          const grupos = ordemGrupos.map(id => gruposMap[id]).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));

                          return grupos.map(grupo => {
                            const multiLote = grupo.lotes.length > 1;
                            const totalLotes = grupo.lotes.length;
                            const conferidos = grupo.lotes.filter(l => l.tocado).length;
                            // Total de bandejas do produto somando os lotes do grupo — usa
                            // qtd_contada (o que está no freezer agora), então atualiza ao
                            // vivo conforme o operador vai contando cada lote.
                            const totalBandejas = grupo.lotes.reduce((s, l) => s + Number(l.qtd_contada || 0), 0);
                            // Sempre começa minimizado — o cliente escolhe qual produto abrir
                            // pra contar, em vez de a tela já vir cheia de cartões abertos
                            // (mesmo produto com 1 lote só ganha essa lista agora).
                            const expandido = produtoExpandidoContagem[grupo.produto_id] ?? false;

                            return (
                              <div key={grupo.produto_id} className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setProdutoExpandidoContagem(prev => ({ ...prev, [grupo.produto_id]: !expandido }))}
                                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-bold text-gray-900 truncate">{grupo.produto_nome}</p>
                                    {multiLote && (
                                      <span className="text-[10px] flex-shrink-0 bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                                        {totalLotes} lotes
                                      </span>
                                    )}
                                    <span className="text-[10px] flex-shrink-0 bg-teal-100 text-teal-700 font-bold px-1.5 py-0.5 rounded-full">
                                      {totalBandejas} bandeja{totalBandejas === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {multiLote ? (
                                      <span className={`text-xs font-bold ${conferidos === totalLotes ? 'text-green-600' : 'text-amber-600'}`}>
                                        {conferidos}/{totalLotes} conferidos
                                      </span>
                                    ) : (
                                      <span className={`text-xs font-bold ${conferidos === totalLotes ? 'text-green-600' : 'text-gray-400'}`}>
                                        {conferidos === totalLotes ? 'Conferido' : 'Aguardando contagem'}
                                      </span>
                                    )}
                                    {expandido ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                  </div>
                                </button>
                                {expandido && (
                                  <div className="p-2 space-y-2 bg-gray-50/60">
                                    {/* Item 3 (pente fino de 20/09): "Substituir produto inteiro" —
                                        mesma engrenagem da "Substituição de produto" por lote (mais
                                        abaixo), só que aplicada de uma vez a todos os lotes deste
                                        produto. Continua exclusiva de Venda Direta, igual à opção por
                                        lote. Quem quiser trocar só um lote específico continua usando
                                        a opção de baixo normalmente. */}
                                    {ehVendaDireta && (() => {
                                      const jaSubstituidoGrupo = grupo.lotes.some(l => (substituicoesProduto[l.lote_id]?.quantidade_origem || 0) > 0);
                                      if (jaSubstituidoGrupo) {
                                        const totalOrigemGrupo = grupo.lotes.reduce((s, l) => s + Number(substituicoesProduto[l.lote_id]?.quantidade_origem || 0), 0);
                                        const destinoGrupoLoteId = grupo.lotes.map(l => substituicoesProduto[l.lote_id]?.produto_destino_lote_id).find(Boolean);
                                        const destinoGrupo = reabItens.find(r => r.lote_id === destinoGrupoLoteId);
                                        return (
                                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between gap-2">
                                            <p className="text-xs text-purple-700 flex items-center gap-1.5">
                                              <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                                              <span><strong>{totalOrigemGrupo}</strong> un. de {grupo.produto_nome} substituído(s) por{' '}
                                                {destinoGrupo ? <strong>{destinoGrupo.produto_nome}</strong> : 'outro produto'} (todos os lotes)</span>
                                            </p>
                                            <button onClick={() => desfazerTrocaGrupo(grupo)} className="text-xs font-semibold text-red-500 hover:text-red-700 flex-shrink-0">
                                              Desfazer
                                            </button>
                                          </div>
                                        );
                                      }
                                      const podeSubstituirGrupo = conferidos === totalLotes && totalBandejas > 0;
                                      if (!podeSubstituirGrupo) return null;
                                      if (!substituicaoGrupoExpandido[grupo.produto_id]) {
                                        return (
                                          <button
                                            onClick={() => setSubstituicaoGrupoExpandido(prev => ({ ...prev, [grupo.produto_id]: true }))}
                                            className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 font-semibold px-1 py-1"
                                          >
                                            <Layers className="h-3.5 w-3.5" /> Substituir produto inteiro
                                            {multiLote ? ` (todos os ${totalLotes} lotes)` : ''}
                                          </button>
                                        );
                                      }
                                      const draft = trocaGrupoDraft[grupo.produto_id] || {};
                                      const candidatos = reabItens
                                        .filter(r => r.disponivel > 0)
                                        .map(r => {
                                          const reservadoPorOutros = Object.entries(substituicoesProduto)
                                            .filter(([, s]) => s.produto_destino_lote_id === r.lote_id)
                                            .reduce((sum, [, s]) => sum + Number(s.quantidade_destino || 0), 0);
                                          return { ...r, disponivelEfetivo: Math.max(0, r.disponivel - reservadoPorOutros) };
                                        })
                                        .filter(c => c.disponivelEfetivo > 0);
                                      const destino = candidatos.find(c => c.lote_id === draft.destino_lote_id);
                                      // Nunca deixa o padrão (nem o que já estava no rascunho) passar do
                                      // que esse lote de destino realmente tem disponível — antes o campo
                                      // podia abrir já acima do limite (ex.: sugerindo 10 quando só havia
                                      // 3 disponíveis) e nada impedia confirmar assim.
                                      const quantidadeDestino = destino
                                        ? Math.min(Number(draft.quantidade_destino ?? totalBandejas), destino.disponivelEfetivo)
                                        : (draft.quantidade_destino ?? totalBandejas);
                                      const valorOrigemTotal = totalBandejas * Number(grupo.lotes[0]?.preco || 0);
                                      const valorDestinoTotal = destino ? Number(quantidadeDestino) * Number(destino.preco) : 0;
                                      const diferenca = destino ? Math.round((valorDestinoTotal - valorOrigemTotal) * 100) / 100 : 0;
                                      return (
                                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                                              <Layers className="h-3.5 w-3.5" /> Substituir produto inteiro
                                            </span>
                                            <button
                                              onClick={() => setSubstituicaoGrupoExpandido(prev => ({ ...prev, [grupo.produto_id]: false }))}
                                              className="text-xs text-gray-400 hover:text-gray-600"
                                            >
                                              cancelar
                                            </button>
                                          </div>
                                          <p className="text-[11px] text-gray-500 -mt-0.5">
                                            Substitui de uma vez os {totalBandejas} un. contados de {grupo.produto_nome}
                                            {multiLote ? ` (somando os ${totalLotes} lotes)` : ''} por outro produto — zera a
                                            contagem deste produto neste mercado e lança a entrada no Reabastecimento.
                                          </p>
                                          <select
                                            value={draft.destino_lote_id || ''}
                                            onChange={e => {
                                              const novoDestinoId = e.target.value || null;
                                              const novoDestino = candidatos.find(c => c.lote_id === novoDestinoId);
                                              // Ao trocar o produto de destino, reajusta a quantidade pro que
                                              // esse novo lote realmente tem disponível, em vez de manter o
                                              // valor do produto anterior (que podia não fazer sentido aqui).
                                              const quantidadeAjustada = novoDestino ? Math.min(totalBandejas, novoDestino.disponivelEfetivo) : 0;
                                              setTrocaGrupoDraft(prev => ({ ...prev, [grupo.produto_id]: { destino_lote_id: novoDestinoId, quantidade_destino: quantidadeAjustada } }));
                                            }}
                                            className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                            style={{ fontSize: '13px' }}
                                          >
                                            <option value="">Substituir por qual produto?</option>
                                            {candidatos.map(c => (
                                              <option key={c.lote_id} value={c.lote_id}>
                                                {c.produto_nome} · {c.numero_lote} · venc. {formatDate(c.data_validade)} · {c.disponivelEfetivo} disponíveis · {fmt(c.preco)}
                                              </option>
                                            ))}
                                          </select>
                                          {destino && (
                                            <>
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-600 flex-1">Quantidade que entra ({destino.produto_nome}):</span>
                                                <button
                                                  onClick={() => setTrocaGrupoDraft(prev => ({ ...prev, [grupo.produto_id]: { ...draft, quantidade_destino: Math.max(0, quantidadeDestino - 1) } }))}
                                                  className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95"
                                                >
                                                  <Minus className="h-3.5 w-3.5" />
                                                </button>
                                                <input
                                                  type="number"
                                                  value={quantidadeDestino}
                                                  onChange={e => setTrocaGrupoDraft(prev => ({ ...prev, [grupo.produto_id]: { ...draft, quantidade_destino: Math.min(destino.disponivelEfetivo, Math.max(0, parseInt(e.target.value) || 0)) } }))}
                                                  className="w-14 h-8 text-center font-bold border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none text-sm"
                                                  style={{ fontSize: '14px' }} min={0} max={destino.disponivelEfetivo}
                                                />
                                                <button
                                                  onClick={() => setTrocaGrupoDraft(prev => ({ ...prev, [grupo.produto_id]: { ...draft, quantidade_destino: Math.min(destino.disponivelEfetivo, quantidadeDestino + 1) } }))}
                                                  className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95"
                                                >
                                                  <Plus className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                              <p className="text-[11px] text-gray-600 bg-white rounded-lg px-2 py-1.5 border border-purple-100">
                                                {totalBandejas} un de <strong>{grupo.produto_nome}</strong> ({fmt(valorOrigemTotal)}) trocado(s) por {quantidadeDestino} un de{' '}
                                                <strong>{destino.produto_nome}</strong> ({fmt(valorDestinoTotal)})
                                                {diferenca > 0 && <> — diferença a cobrar: <strong className="text-purple-700">{fmt(diferenca)}</strong></>}
                                                {diferenca < 0 && <> — <strong className="text-red-600">a devolver ao mercadinho: {fmt(Math.abs(diferenca))}</strong></>}
                                                {diferenca === 0 && <> — sem diferença a cobrar</>}
                                              </p>
                                              <button
                                                onClick={() => {
                                                  substituirProdutoInteiro(grupo, destino.lote_id, quantidadeDestino);
                                                  setSubstituicaoGrupoExpandido(prev => ({ ...prev, [grupo.produto_id]: false }));
                                                  setTrocaGrupoDraft(prev => { const n = { ...prev }; delete n[grupo.produto_id]; return n; });
                                                }}
                                                disabled={quantidadeDestino <= 0 || quantidadeDestino > destino.disponivelEfetivo}
                                                className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                Confirmar troca de todo o produto
                                              </button>
                                              {quantidadeDestino <= 0 && (
                                                <p className="text-[11px] text-red-500 -mt-1">
                                                  Quantidade de entrada precisa ser maior que zero — pra devolver sem trazer nada de volta, use "Mover para outro estoque" em vez desta opção.
                                                </p>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {grupo.lotes.map(item => {
                          const vendido = calcVendido(item);
                          const jaVencido = (() => {
                            if (!item.data_validade) return false;
                            const [ano, mes, dia] = item.data_validade.split('-').map(Number);
                            const validade = new Date(ano, mes - 1, dia);
                            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                            return validade < hoje;
                          })();
                          return (
                            <div key={item.lote_id} className={`rounded-xl p-4 space-y-2 ${jaVencido ? 'bg-amber-50 border-2 border-amber-200' : 'bg-gray-50'}`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    {jaVencido && (
                                      <span className="text-[10px] bg-amber-200 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
                                        ⚠ Vencido
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">Lote de produção:</p>
                                  <p className="text-xs font-mono font-semibold text-gray-600">{item.numero_lote} · Validade: {formatDate(item.data_validade)}</p>
                                  {item.lote_origem_numero && (
                                    <p className="text-xs font-mono text-purple-500 mt-0.5">↳ Origem: {item.lote_origem_numero}</p>
                                  )}
                                </div>
                                {item.tocado && vendido > 0 ? (
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500">Vendido Estimado</p>
                                    <p className="text-lg font-black text-teal-600">{vendido}</p>
                                    {item.quantidade_danificada > 0 && (
                                      <p className="text-[10px] text-red-500 font-semibold">-{item.quantidade_danificada} danificado(s)</p>
                                    )}
                                  </div>
                                ) : !item.tocado ? (
                                  <div className="text-right">
                                    <p className="text-xs text-gray-400">Aguardando contagem</p>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <div className="flex items-center gap-1 text-green-600 justify-end">
                                      <CheckCircle2 className="h-4 w-4" />
                                      <p className="text-xs font-semibold">Conferido</p>
                                    </div>
                                    {item.quantidade_danificada > 0 && (
                                      <p className="text-[10px] text-red-500 font-semibold">-{item.quantidade_danificada} danificado(s)</p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {item.tocado && (item.qtd_contada + item.quantidade_danificada) > item.qtd_atual && (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-blue-700">
                                    O sistema esperava {item.qtd_atual} un., mas a contagem informada é maior. Tudo bem
                                    se é isso mesmo que tem no freezer — o sistema vai usar o valor que você contou.
                                  </p>
                                </div>
                              )}

                              {item.ultima_qtd_contada !== null && (item.ultima_qtd_contada + item.transferido_desde) !== item.qtd_atual && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-slate-700">
                                    Na última visita foram contados <strong>{item.ultima_qtd_contada} un</strong>
                                    {item.transferido_desde !== 0 && <> (esperado hoje, com entradas/saídas desde então: <strong>{item.ultima_qtd_contada + item.transferido_desde}</strong>)</>},
                                    mas o sistema tem <strong>{item.qtd_atual} un</strong> neste lote. A venda é calculada a partir da última contagem;
                                    conte o que realmente tem no freezer.
                                  </p>
                                </div>
                              )}

                              {(devolucoes[item.lote_id]?.quantidade || 0) > 0 && (movimentosEstoque[item.lote_id]?.quantidade || 0) > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-red-700">
                                    Esse lote tem <strong>{devolucoes[item.lote_id].quantidade} vencido(s)</strong> e também{' '}
                                    <strong>{movimentosEstoque[item.lote_id].quantidade} movido(s)</strong> pra outro estoque.
                                    Cada um desconta o valor cheio — se for a <strong>mesma unidade</strong>, ela está sendo
                                    descontada em dobro. Use só um dos dois. Pra trocar um vencido por um novo, marque
                                    "Substituir" dentro de "Produto vencido".
                                  </p>
                                </div>
                              )}

                              {(item.qtd_contada + (item.quantidade_danificada || 0) + (devolucoes[item.lote_id]?.quantidade || 0) + (movimentosEstoque[item.lote_id]?.quantidade || 0)) > item.qtd_atual && (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-red-700">
                                    A soma do que você lançou (freezer + danificado + vencido + movido ={' '}
                                    {item.qtd_contada + (item.quantidade_danificada || 0) + (devolucoes[item.lote_id]?.quantidade || 0) + (movimentosEstoque[item.lote_id]?.quantidade || 0)} un)
                                    passa do que o sistema esperava neste lote ({item.qtd_atual} un). Confira se alguma unidade não foi lançada duas vezes.
                                  </p>
                                </div>
                              )}

                              {jaVencido && vendido > 0 && (
                                <div className="bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-amber-800">
                                    Esse lote já estava vencido antes dessa visita. O "Vendido Estimado" pode
                                    incluir produto vencido que foi vendido sem perceber — vale confirmar com
                                    o mercado se foi isso mesmo que aconteceu.
                                  </p>
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 w-28 flex-shrink-0">Qtd no freezer:</span>
                                <button onClick={() => updateContagem(item.lote_id, item.qtd_contada - 1)}
                                  className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center font-bold hover:bg-gray-100 active:scale-95">
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input type="number" value={item.qtd_contada}
                                  onChange={e => updateContagem(item.lote_id, e.target.value)}
                                  className="w-16 h-9 text-center font-bold border-2 border-gray-200 rounded-xl focus:border-teal-400 focus:outline-none"
                                  style={{ fontSize: '16px' }} min={0} />
                                <button onClick={() => updateContagem(item.lote_id, item.qtd_contada + 1)}
                                  className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center font-bold hover:bg-gray-100 active:scale-95">
                                  <Plus className="h-4 w-4" />
                                </button>
                                {!item.tocado && (
                                  <button onClick={() => confirmarSemAlteracao(item.lote_id)}
                                    title="Confirmar que não teve venda nem alteração nesse produto"
                                    className="ml-auto flex items-center gap-1.5 px-3 h-9 rounded-xl border-2 border-green-200 bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 active:scale-95">
                                    <CheckCircle2 className="h-4 w-4" /> OK, sem venda
                                  </button>
                                )}
                              </div>

                              {(item.quantidade_danificada > 0 || (devolucoes[item.lote_id]?.quantidade || 0) > 0) && (
                                <p className="text-[11px] text-gray-500 pl-[7.5rem] -mt-1">
                                  Total físico encontrado: <strong>{item.qtd_contada} bom(ns)</strong>
                                  {item.quantidade_danificada > 0 && <> + <strong className="text-red-600">{item.quantidade_danificada} danificado(s)</strong></>}
                                  {(devolucoes[item.lote_id]?.quantidade || 0) > 0 && <> + <strong className="text-amber-600">{devolucoes[item.lote_id].quantidade} vencido(s)</strong></>}
                                  {' '}= {item.qtd_contada + (item.quantidade_danificada || 0) + (devolucoes[item.lote_id]?.quantidade || 0)} un no total.
                                  {!item.tocado && (
                                    <span className="text-amber-600 font-semibold"> Confira se "Qtd no freezer" já está contando só o que está bom pra vender.</span>
                                  )}
                                </p>
                              )}

                              {danoExpandido[item.lote_id] || item.quantidade_danificada > 0 ? (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                                      <PackageX className="h-3.5 w-3.5" /> Produto danificado
                                    </span>
                                    {item.quantidade_danificada === 0 && (
                                      <button
                                        onClick={() => setDanoExpandido(prev => ({ ...prev, [item.lote_id]: false }))}
                                        className="text-xs text-gray-400 hover:text-gray-600">
                                        cancelar
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 -mt-0.5">
                                    Importante: a "Qtd no freezer" ali em cima deve contar só o que está
                                    bom pra vender — não inclua esse produto danificado nela. O sistema já
                                    desconta o dano automaticamente na conta final, separado da contagem.
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 w-20 flex-shrink-0">Quantidade:</span>
                                    <button onClick={() => updateDanificado(item.lote_id, 'quantidade_danificada', item.quantidade_danificada - 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-red-200 flex items-center justify-center font-bold hover:bg-red-100 active:scale-95">
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <input type="number" value={item.quantidade_danificada}
                                      onChange={e => updateDanificado(item.lote_id, 'quantidade_danificada', e.target.value)}
                                      className="w-14 h-8 text-center font-bold border-2 border-red-200 rounded-lg focus:border-red-400 focus:outline-none text-sm"
                                      style={{ fontSize: '14px' }} min={0} />
                                    <button onClick={() => updateDanificado(item.lote_id, 'quantidade_danificada', item.quantidade_danificada + 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-red-200 flex items-center justify-center font-bold hover:bg-red-100 active:scale-95">
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={item.observacao_danificado}
                                    onChange={e => updateDanificado(item.lote_id, 'observacao_danificado', e.target.value)}
                                    placeholder="Motivo (opcional): ex. embalagem estufada, validade vencida..."
                                    className="w-full h-8 px-2 border border-red-200 rounded-lg text-xs focus:border-red-400 focus:outline-none"
                                    style={{ fontSize: '13px' }}
                                  />

                                  {item.quantidade_danificada > 0 && (() => {
                                    const candidatos = reabItens.filter(r => r.produto_id === item.produto_id && r.disponivel > 0);
                                    if (candidatos.length === 0) return null;
                                    return (
                                      <div className="pt-2 border-t border-red-100 space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={!!item.substituir_lote_id}
                                            onChange={e => updateDanificado(item.lote_id, 'substituir_lote_id', e.target.checked ? candidatos[0].lote_id : null)}
                                            className="rounded border-gray-300"
                                          />
                                          Substituir por lote do Estoque Móvel?
                                        </label>
                                        {item.substituir_lote_id && (
                                          <div className="flex items-center gap-2 pl-5">
                                            <select
                                              value={item.substituir_lote_id}
                                              onChange={e => updateDanificado(item.lote_id, 'substituir_lote_id', e.target.value)}
                                              className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                            >
                                              {candidatos.map(c => (
                                                <option key={c.lote_id} value={c.lote_id}>
                                                  Val. {formatDate(c.data_validade)} · {c.numero_lote} · {c.disponivel} disponíveis
                                                </option>
                                              ))}
                                            </select>
                                            <input
                                              type="number"
                                              value={item.substituir_quantidade}
                                              onChange={e => updateDanificado(item.lote_id, 'substituir_quantidade', e.target.value)}
                                              className="w-14 h-8 text-center font-bold border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                              min={0}
                                              max={candidatos.find(c => c.lote_id === item.substituir_lote_id)?.disponivel || 0}
                                            />
                                            <span className="text-xs text-gray-400">un</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDanoExpandido(prev => ({ ...prev, [item.lote_id]: true }))}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                                  <PackageX className="h-3.5 w-3.5" /> Registrar produto danificado
                                </button>
                              )}

                              {vencidoExpandido[item.lote_id] || (devolucoes[item.lote_id]?.quantidade > 0) ? (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5" /> Produto vencido
                                    </span>
                                    {!(devolucoes[item.lote_id]?.quantidade > 0) && (
                                      <button
                                        onClick={() => setVencidoExpandido(prev => ({ ...prev, [item.lote_id]: false }))}
                                        className="text-xs text-gray-400 hover:text-gray-600">
                                        cancelar
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 -mt-0.5">
                                    Pra produto que você encontrou vencido dentro do freezer — não conte
                                    ele na "Qtd no freezer" ali em cima. O sistema desconta esse valor
                                    automaticamente, do mesmo jeito que o dano.
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 w-20 flex-shrink-0">Quantidade:</span>
                                    <button onClick={() => setDevolucao(item.lote_id, 'quantidade', Math.max(0, (devolucoes[item.lote_id]?.quantidade || 0) - 1))}
                                      className="w-8 h-8 rounded-lg border-2 border-amber-200 flex items-center justify-center font-bold hover:bg-amber-100 active:scale-95">
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <input type="number" value={devolucoes[item.lote_id]?.quantidade || 0}
                                      onChange={e => setDevolucao(item.lote_id, 'quantidade', Math.max(0, parseInt(e.target.value) || 0))}
                                      className="w-14 h-8 text-center font-bold border-2 border-amber-200 rounded-lg focus:border-amber-400 focus:outline-none text-sm"
                                      style={{ fontSize: '14px' }} min={0} max={item.qtd_atual} />
                                    <button onClick={() => setDevolucao(item.lote_id, 'quantidade', (devolucoes[item.lote_id]?.quantidade || 0) + 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-amber-200 flex items-center justify-center font-bold hover:bg-amber-100 active:scale-95">
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {(devolucoes[item.lote_id]?.quantidade || 0) > 0 && (() => {
                                    const candidatos = reabItens.filter(r => r.produto_id === item.produto_id && r.disponivel > 0);
                                    if (candidatos.length === 0) return null;
                                    const dev = devolucoes[item.lote_id];
                                    return (
                                      <div className="pt-2 border-t border-amber-100 space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={!!dev.substituir_lote_id}
                                            onChange={e => setDevolucao(item.lote_id, 'substituir_lote_id', e.target.checked ? candidatos[0].lote_id : null)}
                                            className="rounded border-gray-300"
                                          />
                                          Substituir por lote do Estoque Móvel?
                                        </label>
                                        {dev.substituir_lote_id && (
                                          <div className="flex items-center gap-2 pl-5">
                                            <select
                                              value={dev.substituir_lote_id}
                                              onChange={e => setDevolucao(item.lote_id, 'substituir_lote_id', e.target.value)}
                                              className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                            >
                                              {candidatos.map(c => (
                                                <option key={c.lote_id} value={c.lote_id}>
                                                  Val. {formatDate(c.data_validade)} · {c.numero_lote} · {c.disponivel} disponíveis
                                                </option>
                                              ))}
                                            </select>
                                            <input
                                              type="number"
                                              value={dev.substituir_quantidade || 0}
                                              onChange={e => setDevolucao(item.lote_id, 'substituir_quantidade', e.target.value)}
                                              className="w-14 h-8 text-center font-bold border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                              min={0}
                                              max={candidatos.find(c => c.lote_id === dev.substituir_lote_id)?.disponivel || 0}
                                            />
                                            <span className="text-xs text-gray-400">un</span>
                                          </div>
                                        )}
                                        {dev.substituir_lote_id && (
                                          <p className="text-[11px] text-gray-500 pl-5">
                                            Atalho pra já lançar a reposição no Reabastecimento. O vencido já
                                            desconta sozinho — não precisa lançar de novo em "Mover para outro
                                            estoque". A reposição é cobrada normal; se as quantidades baterem,
                                            o líquido fica R$ 0,00.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setVencidoExpandido(prev => ({ ...prev, [item.lote_id]: true }));
                                    if (locaisDevolucao.length > 0 && !devolucoes[item.lote_id]?.destino_id) {
                                      setDevolucao(item.lote_id, 'destino_id', locaisDevolucao[0].id);
                                    }
                                  }}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600">
                                  <Clock className="h-3.5 w-3.5" /> Registrar produto vencido
                                </button>
                              )}

                              {movimentoExpandido[item.lote_id] || (movimentosEstoque[item.lote_id]?.quantidade > 0) ? (
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                                      <ArrowRightLeft className="h-3.5 w-3.5" /> Mover para outro estoque
                                    </span>
                                    {!(movimentosEstoque[item.lote_id]?.quantidade > 0) && (
                                      <button
                                        onClick={() => setMovimentoExpandido(prev => ({ ...prev, [item.lote_id]: false }))}
                                        className="text-xs text-gray-400 hover:text-gray-600">
                                        cancelar
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 -mt-0.5">
                                    Pra produto retirado do mercado sem ser dano nem validade vencida — ex.
                                    baixa venda, troca por validade, cliente pediu pra tirar e trocar por
                                    outro. Em mercado de Venda Direta, desconta sozinho o valor cheio do
                                    faturamento (o estoque já tava pago) — some da contagem de vendido e
                                    muda fisicamente de estoque.
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 w-20 flex-shrink-0">Vai para:</span>
                                    <select
                                      value={movimentosEstoque[item.lote_id]?.destino_id || estoqueMovelId || ''}
                                      onChange={e => setMovimento(item.lote_id, 'destino_id', e.target.value)}
                                      className="flex-1 h-8 px-2 border-2 border-blue-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none"
                                      style={{ fontSize: '13px' }}
                                    >
                                      {locaisMovimento.map(l => (
                                        <option key={l.id} value={l.id}>{l.nome}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 w-20 flex-shrink-0">Quantidade:</span>
                                    <button onClick={() => setMovimento(item.lote_id, 'quantidade', (movimentosEstoque[item.lote_id]?.quantidade || 0) - 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-blue-200 flex items-center justify-center font-bold hover:bg-blue-100 active:scale-95">
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <input type="number" value={movimentosEstoque[item.lote_id]?.quantidade || 0}
                                      onChange={e => setMovimento(item.lote_id, 'quantidade', e.target.value)}
                                      className="w-14 h-8 text-center font-bold border-2 border-blue-200 rounded-lg focus:border-blue-400 focus:outline-none text-sm"
                                      style={{ fontSize: '14px' }} min={0} max={item.qtd_atual} />
                                    <button onClick={() => setMovimento(item.lote_id, 'quantidade', (movimentosEstoque[item.lote_id]?.quantidade || 0) + 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-blue-200 flex items-center justify-center font-bold hover:bg-blue-100 active:scale-95">
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={movimentosEstoque[item.lote_id]?.observacao || ''}
                                    onChange={e => setMovimento(item.lote_id, 'observacao', e.target.value)}
                                    placeholder="Motivo (opcional): ex. cliente pediu pra trocar por outro produto..."
                                    className="w-full h-8 px-2 border border-blue-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none"
                                    style={{ fontSize: '13px' }}
                                  />

                                  {(movimentosEstoque[item.lote_id]?.quantidade || 0) > 0 && (() => {
                                    const candidatos = reabItens.filter(r => r.produto_id === item.produto_id && r.disponivel > 0);
                                    if (candidatos.length === 0) return null;
                                    const mov = movimentosEstoque[item.lote_id];
                                    return (
                                      <div className="pt-2 border-t border-blue-100 space-y-1.5">
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={!!mov.substituir_lote_id}
                                            onChange={e => setMovimento(item.lote_id, 'substituir_lote_id', e.target.checked ? candidatos[0].lote_id : null)}
                                            className="rounded border-gray-300"
                                          />
                                          Substituir por lote do Estoque Móvel?
                                        </label>
                                        {mov.substituir_lote_id && (
                                          <div className="flex items-center gap-2 pl-5">
                                            <select
                                              value={mov.substituir_lote_id}
                                              onChange={e => setMovimento(item.lote_id, 'substituir_lote_id', e.target.value)}
                                              className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                            >
                                              {candidatos.map(c => (
                                                <option key={c.lote_id} value={c.lote_id}>
                                                  Val. {formatDate(c.data_validade)} · {c.numero_lote} · {c.disponivel} disponíveis
                                                </option>
                                              ))}
                                            </select>
                                            <input
                                              type="number"
                                              value={mov.substituir_quantidade}
                                              onChange={e => setMovimento(item.lote_id, 'substituir_quantidade', e.target.value)}
                                              className="w-14 h-8 text-center font-bold border border-gray-200 rounded-lg text-xs focus:outline-none"
                                              style={{ fontSize: '13px' }}
                                              min={0}
                                              max={candidatos.find(c => c.lote_id === mov.substituir_lote_id)?.disponivel || 0}
                                            />
                                            <span className="text-xs text-gray-400">un</span>
                                          </div>
                                        )}
                                        {mov.substituir_lote_id && (
                                          <p className="text-[11px] text-gray-500 pl-5">
                                            Atalho pra já lançar a reposição no Reabastecimento com esse
                                            mesmo produto. A retirada acima já desconta sozinha, e essa
                                            reposição é cobrada normal — se as quantidades baterem, o
                                            líquido fica R$ 0,00.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setMovimentoExpandido(prev => ({ ...prev, [item.lote_id]: true }));
                                    if (!movimentosEstoque[item.lote_id]?.destino_id) {
                                      setMovimento(item.lote_id, 'destino_id', estoqueMovelId || locaisMovimento[0]?.id || '');
                                    }
                                  }}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600">
                                  <ArrowRightLeft className="h-3.5 w-3.5" /> Mover para outro estoque / retirar produto
                                </button>
                              )}

                              {ehVendaDireta && (substituicaoExpandido[item.lote_id] || (substituicoesProduto[item.lote_id]?.quantidade_origem > 0) ? (
                                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                                      <Layers className="h-3.5 w-3.5" /> Substituição de produto
                                    </span>
                                    {!(substituicoesProduto[item.lote_id]?.quantidade_origem > 0) && (
                                      <button
                                        onClick={() => setSubstituicaoExpandido(prev => ({ ...prev, [item.lote_id]: false }))}
                                        className="text-xs text-gray-400 hover:text-gray-600">
                                        cancelar
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 -mt-0.5">
                                    Pra quando esse produto é trocado por OUTRO produto diferente (não
                                    precisa ser o mesmo item, nem a mesma quantidade — ex.: 3 unidades saem,
                                    8 do produto novo entram). Volta pro Estoque Móvel e, se o VALOR TOTAL
                                    do que entra for maior que o valor do que saiu, a diferença é cobrada no
                                    Faturamento de Reabastecimento — nunca o valor cheio dos dois.
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 flex-1">Quantidade que sai ({item.produto_nome}):</span>
                                    <button onClick={() => setSubstituicaoProduto(item.lote_id, 'quantidade_origem', (substituicoesProduto[item.lote_id]?.quantidade_origem || 0) - 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95">
                                      <Minus className="h-3.5 w-3.5" />
                                    </button>
                                    <input type="number" value={substituicoesProduto[item.lote_id]?.quantidade_origem || 0}
                                      onChange={e => setSubstituicaoProduto(item.lote_id, 'quantidade_origem', e.target.value)}
                                      className="w-14 h-8 text-center font-bold border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none text-sm"
                                      style={{ fontSize: '14px' }} min={0} max={item.qtd_atual} />
                                    <button onClick={() => setSubstituicaoProduto(item.lote_id, 'quantidade_origem', (substituicoesProduto[item.lote_id]?.quantidade_origem || 0) + 1)}
                                      className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95">
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={substituicoesProduto[item.lote_id]?.observacao || ''}
                                    onChange={e => setSubstituicaoProduto(item.lote_id, 'observacao', e.target.value)}
                                    placeholder="Motivo (opcional): ex. cliente pediu pra trocar o mix..."
                                    className="w-full h-8 px-2 border border-purple-200 rounded-lg text-xs focus:border-purple-400 focus:outline-none"
                                    style={{ fontSize: '13px' }}
                                  />

                                  {(substituicoesProduto[item.lote_id]?.quantidade_origem || 0) > 0 && (() => {
                                    const sub = substituicoesProduto[item.lote_id];
                                    // Sem a trava de "mesmo produto" das outras opções — pode ser
                                    // qualquer produto disponível no Estoque Móvel. O "disponível"
                                    // mostrado já desconta o que OUTRAS linhas de substituição
                                    // reservaram desse mesmo lote (senão dava pra "usar" a mesma
                                    // unidade em duas trocas diferentes ao mesmo tempo).
                                    const candidatos = reabItens
                                      .filter(r => r.disponivel > 0)
                                      .map(r => {
                                        const reservadoPorOutros = Object.entries(substituicoesProduto)
                                          .filter(([lId, s]) => lId !== item.lote_id && s.produto_destino_lote_id === r.lote_id)
                                          .reduce((sum, [, s]) => sum + Number(s.quantidade_destino || 0), 0);
                                        return { ...r, disponivelEfetivo: Math.max(0, r.disponivel - reservadoPorOutros) };
                                      })
                                      .filter(c => c.disponivelEfetivo > 0 || c.lote_id === sub.produto_destino_lote_id);
                                    if (candidatos.length === 0) return null;
                                    const destino = candidatos.find(c => c.lote_id === sub.produto_destino_lote_id);
                                    const valorOrigemTotal = Number(sub.quantidade_origem) * Number(item.preco);
                                    const valorDestinoTotal = destino ? Number(sub.quantidade_destino || 0) * Number(destino.preco) : 0;
                                    const diferencaBruta = destino ? (valorDestinoTotal - valorOrigemTotal) : 0;
                                    return (
                                      <div className="pt-2 border-t border-purple-100 space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-700">Substituir por qual produto?</label>
                                        <select
                                          value={sub.produto_destino_lote_id || ''}
                                          onChange={e => setSubstituicaoProduto(item.lote_id, 'produto_destino_lote_id', e.target.value)}
                                          className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none"
                                          style={{ fontSize: '13px' }}
                                        >
                                          <option value="">Selecione...</option>
                                          {candidatos.map(c => (
                                            <option key={c.lote_id} value={c.lote_id}>
                                              {c.produto_nome} · {c.numero_lote} · venc. {formatDate(c.data_validade)} · {c.disponivelEfetivo} disponíveis · {fmt(c.preco)}
                                            </option>
                                          ))}
                                        </select>
                                        {destino && (
                                          <>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-600 flex-1">Quantidade que entra ({destino.produto_nome}):</span>
                                              <button onClick={() => setSubstituicaoProduto(item.lote_id, 'quantidade_destino', (sub.quantidade_destino || 0) - 1)}
                                                className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95">
                                                <Minus className="h-3.5 w-3.5" />
                                              </button>
                                              <input type="number" value={sub.quantidade_destino || 0}
                                                onChange={e => setSubstituicaoProduto(item.lote_id, 'quantidade_destino', e.target.value)}
                                                className="w-14 h-8 text-center font-bold border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:outline-none text-sm"
                                                style={{ fontSize: '14px' }} min={0} max={destino.disponivelEfetivo} />
                                              <button onClick={() => setSubstituicaoProduto(item.lote_id, 'quantidade_destino', (sub.quantidade_destino || 0) + 1)}
                                                className="w-8 h-8 rounded-lg border-2 border-purple-200 flex items-center justify-center font-bold hover:bg-purple-100 active:scale-95">
                                                <Plus className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                            <p className="text-[11px] text-gray-600 bg-white rounded-lg px-2 py-1.5 border border-purple-100">
                                              {sub.quantidade_origem} un de <strong>{item.produto_nome}</strong> ({fmt(valorOrigemTotal)}) trocado(s) por {sub.quantidade_destino || 0} un de <strong>{destino.produto_nome}</strong> ({fmt(valorDestinoTotal)}) · venc. {formatDate(destino.data_validade)}
                                              {diferencaBruta > 0 && <> — diferença a cobrar: <strong className="text-purple-700">{fmt(diferencaBruta)}</strong></>}
                                              {diferencaBruta < 0 && <> — <strong className="text-red-600">a devolver ao mercadinho: {fmt(Math.abs(diferencaBruta))}</strong></>}
                                              {diferencaBruta === 0 && <> — sem diferença a cobrar</>}
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setSubstituicaoExpandido(prev => ({ ...prev, [item.lote_id]: true }))}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600">
                                  <Layers className="h-3.5 w-3.5" /> Substituir por outro produto
                                </button>
                              ))}
                            </div>
                          );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                    <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar (etapa anterior)</button>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <Truck className="h-5 w-5 text-teal-500" /> Reabastecimento
                      </h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                        <Button onClick={() => setStep(5)} className="gap-2 bg-teal-600 hover:bg-teal-700 h-9 text-sm">
                          Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-gray-500">Lotes disponíveis no Estoque Móvel. Informe quantos está deixando neste mercado.</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ultimaAtualizacaoEstoque && (
                          <span className="text-[11px] text-gray-400">
                            Atualizado há {Math.max(0, Math.round((Date.now() - ultimaAtualizacaoEstoque) / 60000))} min
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={atualizarEstoqueDisponivel}
                          disabled={isAtualizandoEstoque}
                          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border-2 border-teal-200 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                          title="Reconfere o disponível no Estoque Móvel agora, sem mexer no que já foi contado/decidido nesta visita"
                        >
                          {isAtualizandoEstoque ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Atualizar estoque
                        </button>
                      </div>
                    </div>

                    {reabItens.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 font-medium">Nenhum produto no Estoque Móvel.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reabItens.map((item, idx) => {
                          const restante = item.disponivel - item.quantidade;
                          const qtdSubst = qtdSubstituicaoNoLote(item.lote_id);
                          const veioDeSubstituicao = qtdSubst > 0;
                          const qtdExtra = Math.max(0, Number(item.quantidade || 0) - qtdSubst);

                          // Sugestão baseada no padrão cadastrado pro mercado (Locais > ícone de
                          // caixa). Considera o que já está no freezer (contagem) e o que já foi
                          // preenchido em outros lotes do mesmo produto nesse reabastecimento.
                          const padrao = padraoProdutos[item.produto_id];
                          let sugestaoChip = null;
                          if (padrao != null) {
                            const totalContadoProduto = itensContagem
                              .filter(i => i.produto_id === item.produto_id)
                              .reduce((s, i) => s + Number(i.qtd_contada || 0), 0);
                            const jaPreenchidoOutrosLotes = reabItens
                              .filter(r => r.produto_id === item.produto_id && r.lote_id !== item.lote_id)
                              .reduce((s, r) => s + Number(r.quantidade || 0), 0);
                            const faltaTotal = Math.max(0, padrao - totalContadoProduto);
                            const faltaRestante = Math.max(0, faltaTotal - jaPreenchidoOutrosLotes);
                            if (faltaTotal > 0) {
                              sugestaoChip = (
                                <button
                                  onClick={() => setReabItens(prev => prev.map((r, i) => i !== idx ? r : { ...r, quantidade: Math.min(r.disponivel, faltaRestante) }))}
                                  className="text-[11px] bg-teal-50 text-teal-700 font-semibold px-2 py-1 rounded-full border border-teal-200 hover:bg-teal-100"
                                  title={`Padrão desse mercado: ${padrao} un. Já tem ${totalContadoProduto} contado(s).`}
                                >
                                  Sugestão: +{faltaRestante} (completa {padrao} padrão)
                                </button>
                              );
                            } else {
                              sugestaoChip = (
                                <span className="text-[11px] bg-gray-100 text-gray-500 font-semibold px-2 py-1 rounded-full">
                                  Já está no padrão ({padrao})
                                </span>
                              );
                            }
                          }

                          return (
                          <div key={item.lote_id} className="bg-gray-50 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                                  {item.produto_nome}
                                  {veioDeSubstituicao && (
                                    <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                      <PackageX className="h-2.5 w-2.5" /> substituição
                                    </span>
                                  )}
                                </p>
                                {veioDeSubstituicao && (
                                  <p className="text-[11px] text-gray-500">
                                    {Math.min(qtdSubst, Number(item.quantidade || 0))} de substituição + {qtdExtra} extra = {item.quantidade} un
                                  </p>
                                )}
                                <p className="text-xs font-mono text-gray-500">{item.numero_lote} · Validade: {formatDate(item.data_validade)}</p>
                              </div>
                              <div className="text-right">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${restante > 0 ? 'bg-green-100 text-green-700' : restante === 0 ? 'bg-gray-200 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                                  {restante} restante{restante === 1 ? '' : 's'} no Estoque Móvel
                                </span>
                                {item.quantidade > 0 && (
                                  <p className="text-[10px] text-gray-400 mt-1">de {item.disponivel} disponíveis</p>
                                )}
                              </div>
                            </div>
                            {sugestaoChip && <div>{sugestaoChip}</div>}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 w-24 flex-shrink-0">Deixar:</span>
                              <button onClick={() => setReabItens(prev => prev.map((r, i) => i !== idx ? r : { ...r, quantidade: Math.max(0, r.quantidade - 1) }))}
                                className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center font-bold hover:bg-gray-100 active:scale-95">
                                <Minus className="h-4 w-4" />
                              </button>
                              <input type="number" value={item.quantidade}
                                onChange={e => setReabItens(prev => prev.map((r, i) => i !== idx ? r : { ...r, quantidade: Math.max(0, Math.min(r.disponivel, parseInt(e.target.value) || 0)) }))}
                                className={`w-16 h-9 text-center font-bold border-2 rounded-xl focus:outline-none ${item.quantidade > item.disponivel ? 'border-red-400' : 'border-gray-200 focus:border-teal-400'}`}
                                style={{ fontSize: '16px' }} min={0} max={item.disponivel} />
                              <button onClick={() => setReabItens(prev => prev.map((r, i) => i !== idx ? r : { ...r, quantidade: Math.min(r.disponivel, r.quantidade + 1) }))}
                                className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center font-bold hover:bg-gray-100 active:scale-95">
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => setStep(3)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar (etapa anterior)</button>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-teal-500" /> Confirme a visita
                      </h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                        <Button onClick={handleSalvar} disabled={isSubmitting} size="sm"
                          className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl gap-2">
                          {isSubmitting
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                            : <><ClipboardCheck className="h-4 w-4" /> Salvar Visita</>
                          }
                        </Button>
                      </div>
                    </div>

                    {itensContagem.some(i => !i.tocado) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          <strong>{itensContagem.filter(i => !i.tocado).length} item(ns)</strong> ainda não foram ajustados manualmente na contagem.
                          Volte ao passo "Contagem" e confirme o valor real do freezer para todos os produtos antes de salvar.
                        </p>
                      </div>
                    )}

                    {selectedMercado?.modelo_negocio && (
                      <div className={`rounded-xl px-4 py-3 flex items-start gap-2 border ${
                        selectedMercado.modelo_negocio === 'venda_direta' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'
                      }`}>
                        <Info className={`h-4 w-4 flex-shrink-0 mt-0.5 ${selectedMercado.modelo_negocio === 'venda_direta' ? 'text-blue-600' : 'text-purple-600'}`} />
                        <p className={`text-xs ${selectedMercado.modelo_negocio === 'venda_direta' ? 'text-blue-700' : 'text-purple-700'}`}>
                          {selectedMercado.modelo_negocio === 'venda_direta' ? (
                            <>Esse mercado é <strong>Venda Direta</strong> — o valor que conta pra cobrança é o de <strong>Reabastecimento</strong> (o que foi entregue), não o Vendido. O Vendido aqui é só um indicador de desempenho.</>
                          ) : (
                            <>Esse mercado é <strong>Consignado</strong> — o valor que conta pra cobrança é o <strong>Vendido</strong> (depois de confirmado o Pedido Consignado). O reabastecimento aqui não gera cobrança.</>
                          )}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-teal-50 rounded-2xl p-4 text-center border border-teal-100">
                        <p className="text-xs font-bold text-teal-600 uppercase">Vendido Estimado</p>
                        <p className="text-2xl font-black text-teal-700 mt-1">{fmt(totalVendidoEstimado)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-2xl p-4 text-center border border-orange-100">
                        <p className="text-xs font-bold text-orange-600 uppercase">Valor Reabastecimento</p>
                        <p className="text-2xl font-black text-orange-700 mt-1">{fmt(totalValorReabastecimento)}</p>
                      </div>
                      <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100">
                        <p className="text-xs font-bold text-blue-600 uppercase">Lotes contados</p>
                        <p className="text-2xl font-black text-blue-700 mt-1">{itensContagem.length}</p>
                      </div>
                      <div className="bg-gray-50 rounded-2xl p-4 text-center border border-gray-200">
                        <p className="text-xs font-bold text-gray-500 uppercase">Total Freezer</p>
                        <p className="text-2xl font-black text-gray-700 mt-1">{totalFreezerGeral}</p>
                        <p className="text-[10px] text-gray-400">unidades ficam no mercado</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-teal-50 rounded-2xl p-4 text-center border border-teal-100">
                        <p className="text-xs font-bold text-teal-600 uppercase">Total Vendido</p>
                        <p className="text-2xl font-black text-teal-700 mt-1">{totalVendidoGeralQtd}</p>
                        <p className="text-[10px] text-gray-400">unidades</p>
                      </div>
                      <div className="bg-orange-50 rounded-2xl p-4 text-center border border-orange-100">
                        <p className="text-xs font-bold text-orange-600 uppercase">Total Reabastecido</p>
                        <p className="text-2xl font-black text-orange-700 mt-1">{totalReabastecidoNestaVisita}</p>
                        <p className="text-[10px] text-gray-400">unidades</p>
                      </div>
                    </div>

                    {totalDanificado > 0 && (
                      <div className="bg-red-50 rounded-2xl p-4 text-center border border-red-100 flex items-center justify-center gap-2">
                        <PackageX className="h-5 w-5 text-red-500" />
                        <p className="text-sm font-bold text-red-700">{totalDanificado} unidade(s) danificada(s) nesta visita</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      {consolidarContagemPorProduto().map(p => {
                        const temMultiplosLotes = p.lotes.length > 1;
                        return (
                          <div key={p.produto_id} className="bg-gray-50 rounded-xl px-4 py-3">
                            <button
                              className="w-full flex items-center justify-between text-left gap-3"
                              onClick={() => temMultiplosLotes && setProdutoExpandidoConfirmar(produtoExpandidoConfirmar === p.produto_id ? null : p.produto_id)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5 mb-1.5">
                                  {p.produto_nome}
                                  {temMultiplosLotes && (
                                    <span className="text-[10px] bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                                      {p.lotes.length} lotes
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(() => {
                                    // p.qtd_contada já inclui o reabastecimento da visita (é o
                                    // freezer FINAL). Aqui separamos: contado + reabastecido = final.
                                    const reab = reabItens
                                      .filter(r => r.produto_id === p.produto_id && r.quantidade > 0)
                                      .reduce((s, r) => s + Number(r.quantidade || 0), 0);
                                    const contado = p.qtd_contada - reab;
                                    return (
                                      <>
                                        <span className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1">
                                          <span className="text-[10px] font-semibold text-gray-500 uppercase">Freezer</span>
                                          <span className="text-base font-black text-gray-800">{contado}</span>
                                        </span>
                                        {reab > 0 && (
                                          <>
                                            <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
                                              <span className="text-[10px] font-semibold text-blue-500 uppercase">Reabastecido</span>
                                              <span className="text-base font-black text-blue-700">+{reab}</span>
                                            </span>
                                            <span className="flex items-center gap-1.5 bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-1">
                                              <span className="text-[10px] font-semibold text-gray-600 uppercase">Fica com</span>
                                              <span className="text-base font-black text-gray-900">{p.qtd_contada}</span>
                                            </span>
                                          </>
                                        )}
                                      </>
                                    );
                                  })()}
                                  {p.vendido > 0 && (
                                    <span className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1">
                                      <span className="text-[10px] font-semibold text-teal-600 uppercase">Vendido</span>
                                      <span className="text-base font-black text-teal-700">{p.vendido}</span>
                                    </span>
                                  )}
                                  {p.quantidade_danificada > 0 && (
                                    <span className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                                      <span className="text-[10px] font-semibold text-red-500 uppercase">Danificado</span>
                                      <span className="text-base font-black text-red-600">{p.quantidade_danificada}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {p.subtotal > 0 && <span className="font-black text-teal-600 text-base">{fmt(p.subtotal)}</span>}
                                {temMultiplosLotes && (
                                  produtoExpandidoConfirmar === p.produto_id
                                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                            </button>
                            {temMultiplosLotes && produtoExpandidoConfirmar === p.produto_id && (
                              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
                                {p.lotes.map(item => (
                                  <div key={item.lote_id} className="flex items-center justify-between text-xs pl-2">
                                    <span className="text-gray-500 font-mono">
                                      {item.numero_lote} · Freezer: {item.qtd_contada}
                                      {item.vendidoCalculado > 0 && ` · Vendido: ${item.vendidoCalculado}`}
                                      {item.quantidade_danificada > 0 && ` · Danificado: ${item.quantidade_danificada}`}
                                    </span>
                                    {item.vendidoCalculado > 0 && (
                                      <span className="font-semibold text-teal-600">{fmt(item.vendidoCalculado * item.preco)}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {(() => {
                      // Usa o mesmo cálculo já feito lá em cima (substituicoesValidas /
                      // totalValorReabastecimento) — é ESSE número, e não mais um
                      // recalculado só pra exibição, que vira o Total líquido a faturar
                      // do mercado: "esse valor de 61,00 seja inserido no valor do
                      // reabastecimento, esse vai ser o valor a faturar do mercado".
                      const itensNormais = reabItens.filter(i => i.quantidade > 0 && !lotesDestinoTroca.has(i.lote_id));

                      if (itensNormais.length === 0 && substituicoesValidas.length === 0) return null;

                      return (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <p className="text-xs font-bold text-blue-700 uppercase mb-2">Reabastecimento</p>
                          {itensNormais.map(item => {
                            const substituicao = isSubstituicao(item);
                            return (
                              <div key={item.lote_id} className="flex items-center justify-between text-xs text-blue-800 py-0.5">
                                <span>
                                  {item.produto_nome} · {item.numero_lote} · {item.quantidade} un · {fmt(item.preco)}/un
                                  {substituicao && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                                      reposição de dano
                                    </span>
                                  )}
                                </span>
                                <span className="font-bold flex-shrink-0 ml-2">
                                  {fmt(item.quantidade * item.preco)}
                                </span>
                              </div>
                            );
                          })}
                          {itensContagem.filter(i => i.quantidade_danificada > 0).length > 0 && (
                            <div className="mt-1 pt-1 border-t border-blue-200">
                              {itensContagem.filter(i => i.quantidade_danificada > 0).map(item => (
                                <div key={`dano-${item.lote_id}`} className="flex items-center justify-between text-xs text-red-600 py-0.5">
                                  <span>(−) Danificado: {item.produto_nome} · {item.numero_lote} · {item.quantidade_danificada} un</span>
                                  <span className="font-bold flex-shrink-0 ml-2">-{fmt(item.quantidade_danificada * item.preco)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {Object.entries(devolucoes).filter(([, d]) => d.quantidade > 0).length > 0 && (
                            <div className="mt-1 pt-1 border-t border-blue-200">
                              {Object.entries(devolucoes).filter(([, d]) => d.quantidade > 0).map(([loteId, dev]) => {
                                const lote = lotesAtivos.find(l => l.id === loteId);
                                const preco = Number(lote?.produtos?.preco_bandeja_mercado || lote?.produtos?.preco_bandeja || 0);
                                return (
                                  <div key={`dev-${loteId}`} className="flex items-center justify-between text-xs text-amber-600 py-0.5">
                                    <span>(−) Vencido: {lote?.produto_nome} · {lote?.numero_lote} · {dev.quantidade} un</span>
                                    <span className="font-bold flex-shrink-0 ml-2">-{fmt(dev.quantidade * preco)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Mostra aqui mesmo o que foi trocado por quê — antes só dizia
                              "Substituição (cobrar)/(a devolver)" de forma genérica, e o
                              usuário só via o produto/quantidade rolando pra descrição
                              completa mais abaixo (card roxo "Substituição de produto").
                              Agora a própria linha já identifica a troca, consolidada por
                              par produto-origem/produto-destino (uma "troca de produto
                              inteiro" em vários lotes vira uma linha só, ex.: "10 Coxinha
                              → 10 Enroladinho", em vez de uma linha por lote). */}
                          {substituicoesAgrupadasView.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-blue-200 space-y-0.5">
                              {substituicoesAgrupadasView.map(g => (
                                <div key={`sub-${g.chave}`} className={`flex items-start justify-between gap-2 text-xs py-0.5 ${g.diferenca >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                  <span className="leading-snug">
                                    Substituição: {g.quantidadeOrigem} un {g.produtoOrigemNome} → {g.quantidadeDestino} un {g.produtoDestinoNome}
                                    <span className="opacity-70"> ({g.diferenca >= 0 ? 'cobrar' : 'a devolver'})</span>
                                  </span>
                                  <span className="font-bold flex-shrink-0 ml-2">{g.diferenca >= 0 ? '+' : ''}{fmt(g.diferenca)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Regra (Fernando, 02/10): toda retirada feita em "Mover para
                              outro estoque" desconta sozinha o valor cheio, qualquer que
                              seja o motivo — não precisa mais estar vinculada a uma
                              reposição do mesmo produto pra gerar esse desconto. */}
                          {Object.entries(movimentosEstoque).filter(([, m]) => m.quantidade > 0).length > 0 && (
                            <div className="mt-1 pt-1 border-t border-blue-200 space-y-0.5">
                              {Object.entries(movimentosEstoque).filter(([, m]) => m.quantidade > 0).map(([loteId, mov]) => {
                                const item = itensContagem.find(i => i.lote_id === loteId);
                                const valor = Number(mov.quantidade) * Number(item?.preco || 0);
                                return (
                                  <div key={`mov-${loteId}`} className="flex items-start justify-between gap-2 text-xs text-red-600 py-0.5">
                                    <span className="leading-snug">
                                      (−) Retirado: {item?.produto_nome} · {item?.numero_lote} · {mov.quantidade} un
                                      {mov.observacao && <span className="opacity-70"> ("{mov.observacao}")</span>}
                                    </span>
                                    <span className="font-bold flex-shrink-0 ml-2">-{fmt(valor)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-blue-900 py-0.5 mt-1 pt-1 border-t border-blue-200 font-bold">
                            <span>Total líquido</span>
                            <span>{fmt(totalValorReabastecimento)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {itensContagem.filter(i => i.quantidade_danificada > 0).length > 0 && (
                      <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                        <p className="text-xs font-bold text-red-700 uppercase mb-2">Produtos Danificados</p>
                        {itensContagem.filter(i => i.quantidade_danificada > 0).map(item => (
                          <div key={item.lote_id} className="text-xs text-red-800 py-0.5">
                            <div className="flex items-center justify-between">
                              <span>
                                {item.produto_nome} · {item.numero_lote} · {item.quantidade_danificada} un
                              </span>
                              <span className="font-bold flex-shrink-0 ml-2">
                                -{fmt(item.quantidade_danificada * item.preco)}
                              </span>
                            </div>
                            {item.observacao_danificado && (
                              <p className="text-red-500 text-[11px] italic">"{item.observacao_danificado}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {Object.entries(devolucoes).filter(([, d]) => d.quantidade > 0).length > 0 && (
                      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                        <p className="text-xs font-bold text-amber-700 uppercase mb-2">Produtos Vencidos</p>
                        {Object.entries(devolucoes).filter(([, d]) => d.quantidade > 0).map(([loteId, dev]) => {
                          const lote = lotesAtivos.find(l => l.id === loteId);
                          const dest = todosLocais.find(l => l.id === dev.destino_id);
                          return (
                            <p key={loteId} className="text-xs text-amber-800">
                              <strong>{lote?.produto_nome}</strong> · {lote?.numero_lote}
                              {lote?.lote_origem_numero && <span className="text-amber-500"> (origem: {lote.lote_origem_numero})</span>}
                              {' '}· {dev.quantidade} un → {dest?.nome || '?'}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {/* Regra (Fernando, 02/10): "Mover para outro estoque" deixou de ser
                        "sem impacto financeiro" — em mercado Venda Direta, toda retirada
                        desconta o valor cheio (ver "(−) Retirado" no card "Reabastecimento"
                        acima). Mantido aqui só pra mostrar o destino físico de cada
                        movimentação (pra onde foi), sem repetir o valor. */}
                    {Object.entries(movimentosEstoque).filter(([, m]) => m.quantidade > 0).length > 0 && (
                      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                        <p className="text-xs font-bold text-blue-700 uppercase mb-2">Movidos para outro estoque</p>
                        {Object.entries(movimentosEstoque).filter(([, m]) => m.quantidade > 0).map(([loteId, mov]) => {
                          const item = itensContagem.find(i => i.lote_id === loteId);
                          const dest = todosLocais.find(l => l.id === mov.destino_id);
                          return (
                            <p key={loteId} className="text-xs text-blue-800">
                              <strong>{item?.produto_nome}</strong> · {item?.numero_lote}
                              {' '}· {mov.quantidade} un → {dest?.nome || '?'}
                              {mov.observacao && <span className="italic text-blue-500"> ("{mov.observacao}")</span>}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {Object.entries(substituicoesProduto).filter(([, s]) => s.quantidade_origem > 0 && s.produto_destino_lote_id).length > 0 && (() => {
                      // Em vez de tentar "carimbar" o crédito de cada troca num
                      // outro produto específico (o que gerava contas confusas
                      // e nem sempre batia), trata a visita como uma conta só:
                      // soma tudo que está sendo entregue (reabastecimento
                      // normal + os produtos que entraram nas trocas) e
                      // desconta o valor CHEIO do que já foi pago nos produtos
                      // que saíram — exatamente como o Faturamento de
                      // Reabastecimento vai calcular depois.
                      // Reaproveita o mesmo cálculo já feito lá em cima
                      // (substituicoesValidas / totalValorReabastecimento) — nunca mais
                      // recalculado separado aqui, então este total sempre bate com o
                      // "Total líquido" mostrado no card de Reabastecimento acima e com
                      // o que é salvo no banco.
                      if (substituicoesValidas.length === 0) return null;

                      const totalOrigensTroca = substituicoesValidas.reduce((s, l) => s + l.valorOrigem, 0);
                      const totalDestinosTroca = substituicoesValidas.reduce((s, l) => s + l.valorDestino, 0);
                      const totalReabastecimentoNormal = reabItens
                        .filter(r => r.quantidade > 0 && !lotesDestinoTroca.has(r.lote_id))
                        .reduce((s, r) => s + Number(r.quantidade) * Number(r.preco), 0);
                      const totalBrutoVisita = Math.round((totalReabastecimentoNormal + totalDestinosTroca) * 100) / 100;
                      const creditoNaoAbsorvidoVisita = Math.max(0, Math.round((totalOrigensTroca - totalBrutoVisita) * 100) / 100);

                      return (
                        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                          <p className="text-xs font-bold text-purple-700 uppercase mb-2">Substituição de produto (Venda Direta)</p>
                          {/* Mesma consolidação por par produto-origem/produto-destino do
                              card de Reabastecimento acima — uma "troca de produto
                              inteiro" em N lotes vira uma linha só aqui também. */}
                          {substituicoesAgrupadasView.map((g) => (
                            <p key={g.chave} className="text-xs text-purple-800">
                              {g.quantidadeOrigem} un <strong>{g.produtoOrigemNome}</strong> ({fmt(g.valorOrigem)}) → {g.quantidadeDestino} un <strong>{g.produtoDestinoNome}</strong> ({fmt(g.valorDestino)})
                              {g.cobrar > 0 && <> · Diferença a cobrar: <strong>{fmt(g.cobrar)}</strong></>}
                              {g.cobrar === 0 && g.diferenca >= 0 && <> · Sem diferença a cobrar</>}
                              {g.cobrar === 0 && g.diferenca < 0 && (
                                <> · mercadinho já tinha pago {fmt(-g.diferenca)} a mais (abatido no total da visita abaixo)</>
                              )}
                              {g.observacoes.length > 0 && <span className="italic text-purple-500"> ("{g.observacoes.join('; ')}")</span>}
                            </p>
                          ))}
                          <div className="flex items-center justify-between text-xs text-purple-900 py-1 mt-2 pt-2 border-t border-purple-200 font-bold">
                            <span>Total desta visita (reabastecimento + trocas)</span>
                            <span>{fmt(totalValorReabastecimento)}</span>
                          </div>
                          {creditoNaoAbsorvidoVisita > 0 && (
                            <p className="text-[11px] text-red-600 mt-1">
                              {fmt(creditoNaoAbsorvidoVisita)} não coube em nenhum produto desta visita — vai virar crédito geral no Faturamento de Reabastecimento.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    <div>
                      <label className="text-sm font-semibold text-gray-700">Observação (opcional)</label>
                      <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                        placeholder="Ex: freezer com problema, produto faltando..."
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none resize-none"
                        rows={2} style={{ fontSize: '16px' }} />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setStep(4)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300"><ArrowLeft className="h-4 w-4" /> Voltar (etapa anterior)</button>
                      <Button onClick={handleSalvar} disabled={isSubmitting}
                        className="flex-1 h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl gap-2">
                        {isSubmitting
                          ? <><Loader2 className="h-5 w-5 animate-spin" /> Salvando...</>
                          : <><ClipboardCheck className="h-5 w-5" /> Salvar Visita</>
                        }
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}