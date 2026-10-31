import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ClipboardCheck, MapPin, Calendar, TrendingDown, ArrowRightLeft,
  DollarSign, RefreshCw, ChevronDown, ChevronUp, Package, BarChart3, FileSpreadsheet, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';

const FORMATO_MOEDA = '"R$" #,##0.00';

// Monta as 3 abas da planilha a partir das auditorias (já com lote/lote de origem).
// Valores numéricos ficam como número (formatados na planilha) pra dar pra somar/filtrar no Excel.
function montarLinhasExcel(audits, formatarDataHora) {
  const num = (v) => Number(v || 0);
  const ordenadas = [...audits].sort((a, b) => {
    const nomeA = a.locais?.nome || '';
    const nomeB = b.locais?.nome || '';
    return nomeA.localeCompare(nomeB) || String(a.data_auditoria).localeCompare(String(b.data_auditoria));
  });

  const visitas = [];
  const detalhe = [];
  const porMercado = {};

  ordenadas.forEach((a) => {
    const itens = a.auditoria_mercado_itens || [];
    const mercado = a.locais?.nome || 'Desconhecido';
    const produtosDistintos = new Set(itens.map((i) => i.produto_id)).size;
    const totalContada = itens.reduce((s, i) => s + num(i.quantidade_contada), 0);
    const totalVendida = itens.reduce((s, i) => s + num(i.quantidade_calculada_vendida), 0);
    const totalReabast = itens.reduce((s, i) => s + num(i.reabastecimento), 0);
    const totalDanif = itens.reduce((s, i) => s + num(i.quantidade_danificada), 0);
    const valorVendido = itens.reduce((s, i) => s + num(i.subtotal), 0);
    const valorReabast = itens.reduce((s, i) => s + num(i.reabastecimento) * num(i.valor_unitario), 0);

    visitas.push({
      'Data da visita': formatarDataHora(a.data_auditoria),
      'Mercado': mercado,
      'Produtos conferidos': produtosDistintos,
      'Qtd contada': totalContada,
      'Qtd vendida': totalVendida,
      'Reabastecimento (un)': totalReabast,
      'Danificadas (un)': totalDanif,
      'Total vendido (R$)': valorVendido,
      'Valor reabastecido (R$)': valorReabast,
      'Observação': a.observacao || '',
    });

    itens
      .slice()
      .sort((x, y) => (x.produtos?.nome || '').localeCompare(y.produtos?.nome || ''))
      .forEach((i) => {
        detalhe.push({
          'Data da visita': formatarDataHora(a.data_auditoria),
          'Mercado': mercado,
          'Produto': i.produtos?.nome || '',
          'Lote': i.numero_lote || '',
          'Lote de origem': i.lote_origem_numero || '',
          'Qtd contada': num(i.quantidade_contada),
          'Qtd vendida': num(i.quantidade_calculada_vendida),
          'Reabastecimento (un)': num(i.reabastecimento),
          'Danificadas (un)': num(i.quantidade_danificada),
          'Valor unitário (R$)': num(i.valor_unitario),
          'Total vendido (R$)': num(i.subtotal),
          'Valor reabastecido (R$)': num(i.reabastecimento) * num(i.valor_unitario),
          'Obs. danificado': i.observacao_danificado || '',
        });
      });

    const m = porMercado[mercado] || (porMercado[mercado] = {
      'Mercado': mercado, 'Visitas': 0, 'Qtd vendida': 0, 'Total vendido (R$)': 0,
      'Reabastecimento (un)': 0, 'Valor reabastecido (R$)': 0, 'Danificadas (un)': 0, 'Última visita': '', _ultima: '',
    });
    m['Visitas'] += 1;
    m['Qtd vendida'] += totalVendida;
    m['Total vendido (R$)'] += valorVendido;
    m['Reabastecimento (un)'] += totalReabast;
    m['Valor reabastecido (R$)'] += valorReabast;
    m['Danificadas (un)'] += totalDanif;
    if (String(a.data_auditoria) > m._ultima) { m._ultima = String(a.data_auditoria); m['Última visita'] = formatarDataHora(a.data_auditoria); }
  });

  const mercados = Object.values(porMercado)
    .map(({ _ultima, ...resto }) => resto)
    .sort((a, b) => b['Total vendido (R$)'] - a['Total vendido (R$)']);
  if (mercados.length > 0) {
    const soma = (k) => mercados.reduce((s, r) => s + r[k], 0);
    mercados.push({
      'Mercado': 'TOTAL', 'Visitas': soma('Visitas'), 'Qtd vendida': soma('Qtd vendida'),
      'Total vendido (R$)': soma('Total vendido (R$)'), 'Reabastecimento (un)': soma('Reabastecimento (un)'),
      'Valor reabastecido (R$)': soma('Valor reabastecido (R$)'), 'Danificadas (un)': soma('Danificadas (un)'), 'Última visita': '',
    });
  }
  return { visitas, detalhe, mercados };
}

// Cria a aba, ajusta a largura das colunas e aplica formato de moeda nas colunas "(R$)".
function criarAba(linhas) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  if (!ws['!ref']) return ws;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cols = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cab = ws[XLSX.utils.encode_cell({ r: 0, c })]?.v || '';
    let largura = String(cab).length;
    for (let r = 1; r <= range.e.r; r += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        if (String(cab).includes('(R$)') && cell.t === 'n') cell.z = FORMATO_MOEDA;
        largura = Math.max(largura, String(cell.v ?? '').length);
      }
    }
    cols.push({ wch: Math.min(Math.max(largura + 2, 10), 45) });
  }
  ws['!cols'] = cols;
  return ws;
}

export default function RelatorioAuditoriaMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('consolidado');
  const [mercados, setMercados] = useState([]);
  const [mercadoSelecionado, setMercadoSelecionado] = useState('');
  const [consolidado, setConsolidado] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [estoqueAtual, setEstoqueAtual] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [detalheReabastecimento, setDetalheReabastecimento] = useState(null);
  const [exportandoExcel, setExportandoExcel] = useState(false);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

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

  /**
   * Resolve recursivamente o lote-base (tipo_lote = 'base') a partir de uma lista
   * de { lote_id, lote_origem_id }, subindo a cadeia de bandejas até achar a origem real.
   * Retorna Map: lote_id -> numero_lote do lote base.
   */
  const resolverLotesOrigem = async (lotesComOrigem) => {
    let idsParaResolver = [...new Set(lotesComOrigem.map(l => l.lote_origem_id).filter(Boolean))];
    let nivelMap = {};
    let tentativas = 0;
    while (idsParaResolver.length > 0 && tentativas < 5) {
      const { data: nivelData } = await supabase.from('lotes')
        .select('id, numero_lote, tipo_lote, lote_origem_id')
        .in('id', idsParaResolver);
      (nivelData || []).forEach(l => { nivelMap[l.id] = l; });
      idsParaResolver = [...new Set(
        (nivelData || [])
          .filter(l => l.tipo_lote !== 'base' && l.lote_origem_id)
          .map(l => l.lote_origem_id)
      )];
      tentativas++;
    }
    const origemMap = {};
    lotesComOrigem.forEach(l => {
      let atual = l.lote_origem_id ? nivelMap[l.lote_origem_id] : null;
      let safety = 0;
      while (atual && atual.tipo_lote !== 'base' && atual.lote_origem_id && safety < 5) {
        atual = nivelMap[atual.lote_origem_id];
        safety++;
      }
      if (atual) origemMap[l.lote_id] = atual.numero_lote;
    });
    return origemMap;
  };

  /** Anexa numero_lote e lote_origem_numero em cada item de uma lista de auditorias */
  const enriquecerItensComLote = async (audits) => {
    const lotesComOrigem = [];
    audits.forEach(a => {
      (a.auditoria_mercado_itens || []).forEach(item => {
        if (item.lotes?.lote_origem_id) {
          lotesComOrigem.push({ lote_id: item.lote_id, lote_origem_id: item.lotes.lote_origem_id });
        }
      });
    });
    const origemMap = lotesComOrigem.length > 0 ? await resolverLotesOrigem(lotesComOrigem) : {};

    return audits.map(a => ({
      ...a,
      auditoria_mercado_itens: (a.auditoria_mercado_itens || []).map(item => ({
        ...item,
        numero_lote: item.lotes?.numero_lote || null,
        lote_origem_numero: origemMap[item.lote_id] || null,
      })),
    }));
  };

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome')
      .then(({ data }) => setMercados(data || []));
  }, [empresaId]);

  const loadConsolidado = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const { data: auditsRaw } = await supabase
        .from('auditorias_mercado')
        .select(`
          id, local_id, data_auditoria, observacao,
          locais(nome),
          auditoria_mercado_itens(
            lote_id, produto_id, quantidade_contada, quantidade_calculada_vendida,
            reabastecimento, valor_unitario, subtotal, quantidade_danificada,
            produtos(nome),
            lotes:lote_id ( numero_lote, tipo_lote, lote_origem_id )
          )
        `)
        .eq('empresa_id', empresaId)
        .gte('data_auditoria', `${dataInicio}T00:00:00`)
        .lte('data_auditoria', `${dataFim}T23:59:59`)
        .order('data_auditoria', { ascending: false });

      const audits = await enriquecerItensComLote(auditsRaw || []);

      const map = {};
      audits.forEach(a => {
        const lid = a.local_id;
        if (!map[lid]) {
          map[lid] = {
            local_id: lid,
            local_nome: a.locais?.nome || 'Desconhecido',
            total_visitas: 0,
            total_vendido: 0,
            total_reabastecimento: 0,
            total_reabastecimento_qtd: 0,
            ultima_visita: null,
            auditorias: []
          };
        }
        const totalVendidoAudit = (a.auditoria_mercado_itens || []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
        const totalReabastAudit = (a.auditoria_mercado_itens || []).reduce((s, i) => s + (Number(i.reabastecimento || 0) * Number(i.valor_unitario || 0)), 0);
        const totalReabastQtdAudit = (a.auditoria_mercado_itens || []).reduce((s, i) => s + Number(i.reabastecimento || 0), 0);
        map[lid].total_visitas++;
        map[lid].total_vendido += totalVendidoAudit;
        map[lid].total_reabastecimento += totalReabastAudit;
        map[lid].total_reabastecimento_qtd += totalReabastQtdAudit;
        if (!map[lid].ultima_visita || a.data_auditoria > map[lid].ultima_visita) {
          map[lid].ultima_visita = a.data_auditoria;
        }
        map[lid].auditorias.push({ ...a, totalVendido: totalVendidoAudit, totalReabast: totalReabastAudit, totalReabastQtd: totalReabastQtdAudit });
      });

      setConsolidado(Object.values(map).sort((a, b) => b.total_vendido - a.total_vendido));
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, dataInicio, dataFim]);

  const loadHistorico = useCallback(async (mId) => {
    if (!empresaId || !mId) return;
    setIsLoading(true);
    try {
      const { data: auditsRaw } = await supabase
        .from('auditorias_mercado')
        .select(`
          id, local_id, data_auditoria, observacao,
          auditoria_mercado_itens(
            lote_id, produto_id, quantidade_contada, quantidade_calculada_vendida,
            reabastecimento, valor_unitario, subtotal, quantidade_danificada,
            produtos(nome),
            lotes:lote_id ( numero_lote, tipo_lote, lote_origem_id )
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('local_id', mId)
        .gte('data_auditoria', `${dataInicio}T00:00:00`)
        .lte('data_auditoria', `${dataFim}T23:59:59`)
        .order('data_auditoria', { ascending: false });

      const audits = await enriquecerItensComLote(auditsRaw || []);
      setHistorico(audits);

      // Estoque atual do mercado por lote — agora também com lote de origem
      const { data: estoqueLocal } = await supabase
        .from('estoque_por_local')
        .select('lote_id, produto_id, quantidade_atual')
        .eq('empresa_id', empresaId)
        .eq('local_id', mId)
        .gt('quantidade_atual', 0);

      const loteIds = (estoqueLocal || []).map(r => r.lote_id).filter(Boolean);
      if (loteIds.length > 0) {
        const { data: lotesData } = await supabase.from('lotes')
          .select('id, numero_lote, produto_id, data_validade, lote_origem_id, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
          .in('id', loteIds).eq('ativo', true).eq('lote_devolvido', false);

        const origemEstoque = (lotesData || [])
          .filter(l => l.lote_origem_id)
          .map(l => ({ lote_id: l.id, lote_origem_id: l.lote_origem_id }));
        const origemMapEstoque = origemEstoque.length > 0 ? await resolverLotesOrigem(origemEstoque) : {};

        const hoje = new Date();
        const estoque = (lotesData || []).map(l => {
          const qtd = estoqueLocal?.find(e => e.lote_id === l.id)?.quantidade_atual || 0;
          const valDate = l.data_validade ? new Date(l.data_validade) : null;
          const dias = valDate ? Math.ceil((valDate - hoje) / (1000 * 60 * 60 * 24)) : null;
          const preco = Number(l.produtos?.preco_bandeja_mercado || l.produtos?.preco_bandeja || 0);
          return {
            lote_id: l.id,
            numero_lote: l.numero_lote,
            lote_origem_numero: origemMapEstoque[l.id] || null,
            produto_nome: l.produtos?.nome || '',
            data_validade: l.data_validade,
            quantidade: Number(qtd),
            preco,
            valor_total: Number(qtd) * preco,
            diasParaVencer: dias,
            vencido: dias !== null && dias < 0,
            vencendoEmBreve: dias !== null && dias >= 0 && dias <= 7,
          };
        }).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
        setEstoqueAtual(estoque);
      } else {
        setEstoqueAtual([]);
      }
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, dataInicio, dataFim]);

  // Exporta o período selecionado em "De / Até" com o detalhe de cada visita.
  // Na aba "Por Mercado" com um mercado escolhido, exporta só aquele mercado;
  // nos demais casos, exporta todos os mercados.
  const exportarExcel = async () => {
    if (!empresaId) return;
    if (!dataInicio || !dataFim || dataInicio > dataFim) {
      toast({ title: 'Período inválido', description: 'Confira as datas "De" e "Até".', variant: 'destructive' });
      return;
    }
    const filtrarMercado = activeTab === 'mercado' && mercadoSelecionado ? mercadoSelecionado : null;
    setExportandoExcel(true);
    try {
      // Busca em blocos pra não esbarrar no limite de linhas por consulta
      const TAMANHO = 500;
      let auditsRaw = [];
      for (let offset = 0; ; offset += TAMANHO) {
        let query = supabase
          .from('auditorias_mercado')
          .select(`
            id, local_id, data_auditoria, observacao,
            locais(nome),
            auditoria_mercado_itens(
              lote_id, produto_id, quantidade_contada, quantidade_calculada_vendida,
              reabastecimento, valor_unitario, subtotal, quantidade_danificada, observacao_danificado,
              produtos(nome),
              lotes:lote_id ( numero_lote, tipo_lote, lote_origem_id )
            )
          `)
          .eq('empresa_id', empresaId)
          .gte('data_auditoria', `${dataInicio}T00:00:00`)
          .lte('data_auditoria', `${dataFim}T23:59:59`)
          .order('data_auditoria', { ascending: false })
          .order('id')
          .range(offset, offset + TAMANHO - 1);
        if (filtrarMercado) query = query.eq('local_id', filtrarMercado);
        const { data, error } = await query;
        if (error) throw error;
        auditsRaw = auditsRaw.concat(data || []);
        if (!data || data.length < TAMANHO) break;
      }

      if (auditsRaw.length === 0) {
        toast({ title: 'Nada para exportar', description: 'Nenhuma visita encontrada nesse período.', variant: 'destructive' });
        return;
      }

      const audits = await enriquecerItensComLote(auditsRaw);
      const { visitas, detalhe, mercados } = montarLinhasExcel(audits, formatDateTime);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, criarAba(visitas), 'Visitas');
      XLSX.utils.book_append_sheet(wb, criarAba(detalhe), 'Detalhe dos itens');
      XLSX.utils.book_append_sheet(wb, criarAba(mercados), 'Resumo por mercado');

      const nomeMercado = filtrarMercado
        ? `_${(mercados[0]?.Mercado || 'mercado').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`
        : '';
      XLSX.writeFile(wb, `auditorias_mercado${nomeMercado}_${dataInicio}_a_${dataFim}.xlsx`);
      toast({ title: 'Planilha gerada', description: `${visitas.length} visita(s) e ${detalhe.length} linha(s) de itens.` });
    } catch (err) {
      console.error('Erro ao exportar auditorias para Excel:', err);
      toast({ title: 'Erro ao exportar', description: err.message, variant: 'destructive' });
    } finally {
      setExportandoExcel(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'consolidado') loadConsolidado();
    else if (activeTab === 'mercado' && mercadoSelecionado) loadHistorico(mercadoSelecionado);
  }, [activeTab, mercadoSelecionado, loadConsolidado, loadHistorico]);

  const totalGeralVendido = consolidado.reduce((s, m) => s + m.total_vendido, 0);
  const totalGeralReabast = consolidado.reduce((s, m) => s + m.total_reabastecimento, 0);
  const totalGeralReabastQtd = consolidado.reduce((s, m) => s + (m.total_reabastecimento_qtd || 0), 0);

  // Consolida os itens de uma visita (que hoje vêm por lote) numa visão
  // única por produto — mesma lógica de cálculo, só agrupando o resultado.
  // Guarda os lotes originais em "lotes" pra quem quiser abrir o detalhe.
  const consolidarPorProduto = (itens) => {
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

  // Card consolidado por produto — usado nas duas abas. Cada card pode ser
  // expandido pra ver o detalhe por lote de produção (a lógica por lote
  // continua existindo por baixo, só a visão padrão que ficou única).
  const ItensConsolidados = ({ itens, escopoId }) => {
    const produtos = consolidarPorProduto(itens);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {produtos.map(p => {
          const chaveExpandida = `${escopoId}-${p.produto_id}`;
          const temMultiplosLotes = p.lotes.length > 1;
          return (
            <div key={p.produto_id} className="bg-gray-50 rounded-xl px-3 py-2">
              <button
                className="w-full flex items-center justify-between text-left"
                onClick={() => temMultiplosLotes && setProdutoExpandido(produtoExpandido === chaveExpandida ? null : chaveExpandida)}
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
                    Freezer: {p.quantidade_contada}
                    {p.quantidade_calculada_vendida > 0 && ` · Vendido: ${p.quantidade_calculada_vendida}`}
                    {p.reabastecimento > 0 && ` · +${p.reabastecimento} reabast.`}
                    {p.quantidade_danificada > 0 && ` · -${p.quantidade_danificada} danificado`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.subtotal > 0 && <span className="text-sm font-bold text-teal-600">{fmt(p.subtotal)}</span>}
                  {temMultiplosLotes && (
                    produtoExpandido === chaveExpandida
                      ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                      : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </div>
              </button>
              {temMultiplosLotes && produtoExpandido === chaveExpandida && (
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
                  {p.lotes.map((item, i) => (
                    <div key={item.lote_id || i} className="flex items-center justify-between text-xs text-gray-500 pl-2">
                      <span className="font-mono">
                        {item.numero_lote || '—'}
                        {item.lote_origem_numero && <span className="text-purple-500"> (origem: {item.lote_origem_numero})</span>}
                        {' · '}Freezer: {item.quantidade_contada}
                        {item.quantidade_calculada_vendida > 0 && ` · Vendido: ${item.quantidade_calculada_vendida}`}
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
    );
  };

  const consolidarEstoquePorProduto = (itens) => {
    const map = {};
    (itens || []).forEach(item => {
      const key = item.produto_nome;
      if (!map[key]) {
        map[key] = { produto_nome: key, quantidade: 0, valor_total: 0, lotes: [], piorStatus: 'ok' };
      }
      map[key].quantidade += Number(item.quantidade || 0);
      map[key].valor_total += Number(item.valor_total || 0);
      map[key].lotes.push(item);
      if (item.vencido) map[key].piorStatus = 'vencido';
      else if (item.vencendoEmBreve && map[key].piorStatus !== 'vencido') map[key].piorStatus = 'vencendo';
    });
    return Object.values(map).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
  };

  return (
    <>
      <Helmet><title>Relatório de Auditoria de Mercados - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Relatório de Auditorias de Mercado</h1>
              <p className="text-gray-500 text-sm mt-0.5">Histórico de visitas, contagens e vendas estimadas.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <Button onClick={() => activeTab === 'consolidado' ? loadConsolidado() : loadHistorico(mercadoSelecionado)}
                className="gap-2 bg-teal-600 hover:bg-teal-700 h-10">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
              <Button onClick={exportarExcel} disabled={exportandoExcel} variant="outline"
                className="gap-2 h-10 border-teal-200 text-teal-700 hover:bg-teal-50"
                title={activeTab === 'mercado' && mercadoSelecionado ? 'Exporta só o mercado selecionado' : 'Exporta todos os mercados do período'}>
                {exportandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Exportar Excel
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { id: 'consolidado', label: 'Consolidado', icon: BarChart3 },
              { id: 'mercado', label: 'Por Mercado', icon: MapPin },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === tab.id ? 'bg-teal-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <tab.icon className="h-4 w-4" />{tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'consolidado' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Total Vendido Estimado</p>
                  <p className="text-2xl font-black text-teal-600 mt-1">{fmt(totalGeralVendido)}</p>
                  <p className="text-xs text-gray-400 mt-1">{consolidado.length} mercado(s) no período</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Total Reabastecido</p>
                  <p className="text-2xl font-black text-blue-600 mt-1">{fmt(totalGeralReabast)}</p>
                  <p className="text-xs text-gray-400 mt-1">{totalGeralReabastQtd} unidade{totalGeralReabastQtd === 1 ? '' : 's'}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-500">Total Visitas</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">
                    {consolidado.reduce((s, m) => s + m.total_visitas, 0)}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
              ) : consolidado.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                  <ClipboardCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhuma auditoria no período selecionado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {consolidado.map(m => (
                    <div key={m.local_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedId(expandedId === m.local_id ? null : m.local_id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-5 w-5 text-teal-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-900">{m.local_nome}</p>
                            <p className="text-xs text-gray-500">{m.total_visitas} visita(s) · Última: {formatDateTime(m.ultima_visita)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Vendido Estimado</p>
                            <p className="font-black text-teal-600">{fmt(m.total_vendido)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Reabastecido</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetalheReabastecimento(m);
                              }}
                              className="font-bold text-blue-600 hover:underline decoration-dotted underline-offset-2"
                              title="Ver detalhe do que foi reabastecido"
                            >
                              {fmt(m.total_reabastecimento)}
                            </button>
                            <p className="text-[10px] text-gray-400">{m.total_reabastecimento_qtd || 0} un</p>
                          </div>
                          {expandedId === m.local_id
                            ? <ChevronUp className="h-5 w-5 text-gray-400" />
                            : <ChevronDown className="h-5 w-5 text-gray-400" />
                          }
                        </div>
                      </button>

                      {expandedId === m.local_id && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {m.auditorias.map(a => (
                            <div key={a.id} className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-gray-400" />
                                  <span className="font-semibold text-gray-800">{formatDateTime(a.data_auditoria)}</span>
                                  {a.observacao && <span className="text-xs text-gray-400 italic">· {a.observacao}</span>}
                                </div>
                                <div className="flex gap-4">
                                  <span className="text-sm font-bold text-teal-600">{fmt(a.totalVendido)}</span>
                                  <span className="text-sm font-bold text-blue-500">{fmt(a.totalReabast)}</span>
                                </div>
                              </div>
                              <ItensConsolidados itens={a.auditoria_mercado_itens} escopoId={a.id} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'mercado' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <label className="text-sm font-semibold text-gray-700 block mb-2">Selecione o Mercado</label>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {mercados.map(m => (
                    <button key={m.id} onClick={() => { setMercadoSelecionado(m.id); loadHistorico(m.id); }}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        mercadoSelecionado === m.id ? 'border-teal-500 bg-teal-50' : 'border-gray-100 hover:border-teal-300 hover:bg-teal-50'
                      }`}>
                      <MapPin className={`h-4 w-4 flex-shrink-0 ${mercadoSelecionado === m.id ? 'text-teal-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-sm ${mercadoSelecionado === m.id ? 'text-teal-800' : 'text-gray-700'}`}>{m.nome}</span>
                    </button>
                  ))}
                </div>
              </div>

              {mercadoSelecionado && (
                isLoading ? (
                  <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
                ) : historico.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                    <ClipboardCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Nenhuma auditoria no período.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Visitas</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{historico.length}</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Vendido Estimado</p>
                        <p className="text-xl font-black text-teal-600 mt-1">
                          {fmt(historico.reduce((s, a) => s + (a.auditoria_mercado_itens || []).reduce((si, i) => si + Number(i.subtotal || 0), 0), 0))}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Reabastecimento</p>
                        <p className="text-xl font-black text-blue-600 mt-1">
                          {fmt(historico.reduce((s, a) => s + (a.auditoria_mercado_itens || []).reduce((si, i) => si + (Number(i.reabastecimento || 0) * Number(i.valor_unitario || 0)), 0), 0))}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {historico.reduce((s, a) => s + (a.auditoria_mercado_itens || []).reduce((si, i) => si + Number(i.reabastecimento || 0), 0), 0)} unidades
                        </p>
                      </div>
                    </div>

                    {estoqueAtual.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                          <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            <Package className="h-4 w-4 text-teal-500" /> Estoque Atual no Mercado
                          </h4>
                          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {fmt(estoqueAtual.reduce((s, i) => s + i.valor_total, 0))} em estoque
                          </span>
                        </div>
                        <div className="p-4 space-y-2">
                          {consolidarEstoquePorProduto(estoqueAtual).map(p => {
                            const chave = `estoque-${p.produto_nome}`;
                            const temMultiplosLotes = p.lotes.length > 1;
                            const corBorda = p.piorStatus === 'vencido' ? 'bg-red-50 border-red-200' : p.piorStatus === 'vencendo' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100';
                            return (
                              <div key={p.produto_nome} className={`rounded-xl border ${corBorda}`}>
                                <button
                                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                                  onClick={() => temMultiplosLotes && setProdutoExpandido(produtoExpandido === chave ? null : chave)}
                                >
                                  <div>
                                    <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                                      {p.produto_nome}
                                      {temMultiplosLotes && (
                                        <span className="text-[10px] bg-purple-100 text-purple-600 font-bold px-1.5 py-0.5 rounded-full">
                                          {p.lotes.length} lotes
                                        </span>
                                      )}
                                    </p>
                                    {p.piorStatus !== 'ok' && (
                                      <p className={`text-xs font-semibold ${p.piorStatus === 'vencido' ? 'text-red-600' : 'text-amber-600'}`}>
                                        {p.piorStatus === 'vencido' ? '⚠ Tem lote vencido' : '⚠ Tem lote vencendo em breve'}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <p className="text-xl font-black text-blue-600">{p.quantidade}</p>
                                      <p className="text-xs text-gray-400">un · {fmt(p.valor_total)}</p>
                                    </div>
                                    {temMultiplosLotes && (
                                      produtoExpandido === chave
                                        ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                        : <ChevronDown className="h-4 w-4 text-gray-400" />
                                    )}
                                  </div>
                                </button>
                                {temMultiplosLotes && produtoExpandido === chave && (
                                  <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200 pt-2">
                                    {p.lotes.map(item => (
                                      <div key={item.lote_id} className="flex items-center justify-between text-xs pl-2">
                                        <span className="font-mono text-gray-500">
                                          {item.numero_lote}
                                          {item.lote_origem_numero && <span className="text-purple-500"> (origem: {item.lote_origem_numero})</span>}
                                          <span className={`ml-1 font-semibold ${item.vencido ? 'text-red-600' : item.vencendoEmBreve ? 'text-amber-600' : 'text-gray-500'}`}>
                                            {' · '}{item.vencido ? `Vencido (${formatDate(item.data_validade)})` :
                                             item.vencendoEmBreve ? `Vence em ${item.diasParaVencer}d (${formatDate(item.data_validade)})` :
                                             `Validade: ${formatDate(item.data_validade)}`}
                                          </span>
                                        </span>
                                        <span className="font-semibold text-gray-700">{item.quantidade} un</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {historico.map((a, idx) => {
                        const totalVend = (a.auditoria_mercado_itens || []).reduce((s, i) => s + Number(i.subtotal || 0), 0);
                        const totalReab = (a.auditoria_mercado_itens || []).reduce((s, i) => s + (Number(i.reabastecimento || 0) * Number(i.valor_unitario || 0)), 0);
                        const totalReabQtd = (a.auditoria_mercado_itens || []).reduce((s, i) => s + Number(i.reabastecimento || 0), 0);
                        return (
                          <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                              onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                  {idx === 0 ? '★' : historico.length - idx}
                                </div>
                                <div className="text-left">
                                  <p className="font-bold text-gray-900">{formatDateTime(a.data_auditoria)}</p>
                                  {a.observacao && <p className="text-xs text-gray-400 italic">{a.observacao}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-xs text-gray-400">Vendido</p>
                                  <p className="font-black text-teal-600">{fmt(totalVend)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-400">Reabastecimento</p>
                                  <p className="font-bold text-blue-500">{fmt(totalReab)}</p>
                                  <p className="text-[10px] text-gray-400">{totalReabQtd} un</p>
                                </div>
                                {expandedId === a.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                              </div>
                            </button>
                            {expandedId === a.id && (
                              <div className="border-t border-gray-100 p-4">
                                <ItensConsolidados itens={a.auditoria_mercado_itens} escopoId={a.id} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <Dialog open={!!detalheReabastecimento} onOpenChange={(open) => !open && setDetalheReabastecimento(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-500" />
                Reabastecimento — {detalheReabastecimento?.local_nome}
              </DialogTitle>
            </DialogHeader>

            {detalheReabastecimento && (() => {
              // Junta todos os itens reabastecidos de todas as visitas do período,
              // agrupando por produto pra dar a visão analítica que foi pedida.
              const porProduto = {};
              (detalheReabastecimento.auditorias || []).forEach(a => {
                (a.auditoria_mercado_itens || []).forEach(item => {
                  if (!item.reabastecimento || item.reabastecimento <= 0) return;
                  const key = item.produto_id;
                  if (!porProduto[key]) {
                    porProduto[key] = { nome: item.produtos?.nome || 'Produto', qtd: 0, valor: 0, eventos: [] };
                  }
                  porProduto[key].qtd += Number(item.reabastecimento || 0);
                  porProduto[key].valor += Number(item.reabastecimento || 0) * Number(item.valor_unitario || 0);
                  porProduto[key].eventos.push({
                    data: a.data_auditoria,
                    numero_lote: item.numero_lote || '—',
                    qtd: Number(item.reabastecimento || 0),
                    valor: Number(item.reabastecimento || 0) * Number(item.valor_unitario || 0),
                  });
                });
              });
              const lista = Object.values(porProduto).sort((a, b) => b.qtd - a.qtd);

              if (lista.length === 0) {
                return <p className="text-sm text-gray-500 py-6 text-center">Nenhum reabastecimento no período selecionado.</p>;
              }

              return (
                <div className="space-y-4">
                  {lista.map((p, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-gray-900 text-sm">{p.nome}</p>
                        <div className="text-right">
                          <p className="font-black text-blue-600 text-sm">{p.qtd} un</p>
                          <p className="text-xs text-gray-500">{fmt(p.valor)}</p>
                        </div>
                      </div>
                      <div className="space-y-1 pl-2 border-l-2 border-gray-200">
                        {p.eventos.map((ev, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                            <span>{formatDate(ev.data)} · lote {ev.numero_lote}</span>
                            <span className="font-semibold text-gray-700">+{ev.qtd} un ({fmt(ev.valor)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}