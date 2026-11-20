import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { agregarEventos, normalizarTexto } from '@/utils/relatorioEventos';
import { BarChart3, Loader2, Download, ChevronDown, ChevronRight, Calendar } from 'lucide-react';

// Relatório de Eventos: quanto salgado saiu em cada evento (e no período), por categoria e
// por sabor, e quanto faturou. Lê só `eventos` e `evento_itens`.
const STATUS = {
  orcamento: 'Orçamento', confirmado: 'Confirmado', realizado: 'Realizado', cancelado: 'Cancelado',
};
const FILTROS_STATUS = [
  { valor: 'feitos', rotulo: 'Realizados e confirmados', lista: ['realizado', 'confirmado'] },
  { valor: 'realizado', rotulo: 'Só realizados', lista: ['realizado'] },
  { valor: 'confirmado', rotulo: 'Só confirmados (a realizar)', lista: ['confirmado'] },
  { valor: 'orcamento', rotulo: 'Orçamentos', lista: ['orcamento'] },
  { valor: 'todos', rotulo: 'Todos (menos cancelados)', lista: ['orcamento', 'confirmado', 'realizado'] },
  { valor: 'cancelado', rotulo: 'Cancelados', lista: ['cancelado'] },
];

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const fmtNum = (v) => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
const fmtData = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicioMes = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fimMes = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

export default function RelatorioEventosPage() {
  const { empresaId } = useAuth();
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(fimMes());
  const [filtro, setFiltro] = useState('feitos');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [eventos, setEventos] = useState([]);
  const [itens, setItens] = useState([]);
  const [abertos, setAbertos] = useState(() => new Set());

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    setErro('');
    try {
      const lista = FILTROS_STATUS.find((f) => f.valor === filtro)?.lista || [];
      const { data: evs, error } = await supabase.from('eventos')
        .select('id, nome_cliente, data_evento, local_evento, num_convidados, status, total_salgados, valor_total, valor_entrada, valor_restante')
        .eq('empresa_id', empresaId).in('status', lista)
        .gte('data_evento', de).lte('data_evento', ate)
        .order('data_evento', { ascending: true });
      if (error) throw error;
      const ids = (evs || []).map((e) => e.id);
      let todos = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data: its, error: e2 } = await supabase.from('evento_itens')
          .select('id, evento_id, categoria, descricao, quantidade, preco_por_cento, subtotal').in('evento_id', ids.slice(i, i + 100));
        if (e2) throw e2;
        todos = todos.concat(its || []);
      }
      setEventos(evs || []);
      setItens(todos);
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os eventos.');
      setEventos([]); setItens([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, filtro, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  const dados = useMemo(() => agregarEventos(eventos, itens), [eventos, itens]);
  const { resumo } = dados;

  const alternar = (id) => setAbertos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const exportarCsv = () => {
    const aspas = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
    const linhas = [['Data', 'Cliente', 'Local', 'Situação', 'Convidados', 'Categoria', 'Sabor', 'Quantidade', 'Subtotal do item', 'Valor do evento', 'Entrada', 'Restante']];
    dados.linhas.forEach((e) => {
      const base = [fmtData(e.data_evento), e.nome_cliente, e.local_evento || '', STATUS[e.status] || e.status, e.num_convidados ?? ''];
      const fim = [num(e.valor_total), num(e.valor_entrada), num(e.valor_restante)];
      if (e.itens.length === 0) linhas.push([...base, '', '', e.salgados, '', ...fim]);
      e.itens.forEach((i) => linhas.push([...base, normalizarTexto(i.categoria), normalizarTexto(i.descricao), i.quantidade, num(i.subtotal), ...fim]));
    });
    const csv = `﻿${linhas.map((l) => l.map(aspas).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-eventos_${de}_a_${ate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const Cartao = ({ id, titulo, valor, destaque }) => (
    <div className={`rounded-xl border p-4 ${destaque ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-bold text-gray-900" data-testid={id}>{valor}</p>
    </div>
  );

  const Ranking = ({ titulo, linhas, testid }) => (
    <div className="rounded-xl border bg-white p-4" data-testid={testid}>
      <h2 className="font-semibold text-gray-900 text-sm mb-2">{titulo}</h2>
      {linhas.length === 0 ? <p className="text-sm text-gray-400">Sem itens no período.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Nome</th><th className="py-1 text-right">Qtd</th><th className="py-1 text-right">Eventos</th><th className="py-1 text-right">Valor</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t" data-testid={`${testid}-linha`}>
                <td className="py-1.5">{l.rotulo}</td>
                <td className="py-1.5 text-right font-medium">{fmtNum(l.qtd)}</td>
                <td className="py-1.5 text-right text-gray-500">{l.eventos}</td>
                <td className="py-1.5 text-right text-gray-500">{fmtMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <Helmet><title>Relatório de Eventos - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-5" data-testid="pagina-relatorio-eventos">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Relatório de Eventos</h1>
            <p className="text-sm text-gray-500 mt-1">Quanto de salgado saiu em cada evento e no período, por categoria e por sabor, e quanto faturou. Os dados vêm dos itens lançados no evento.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard/eventos"><Button variant="outline" size="sm" className="gap-1.5"><Calendar className="h-4 w-4" /> Agenda</Button></Link>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={dados.linhas.length === 0} className="gap-1.5"><Download className="h-4 w-4" /> Exportar planilha</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end border rounded-xl bg-white p-4">
          <div><Label htmlFor="ev-de" className="text-gray-900 text-xs">De</Label><Input id="ev-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label htmlFor="ev-ate" className="text-gray-900 text-xs">Até</Label><Input id="ev-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <div className="col-span-2">
            <Label htmlFor="ev-status" className="text-gray-900 text-xs">Situação</Label>
            <select id="ev-status" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              {FILTROS_STATUS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
            </select>
          </div>
        </div>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3" data-testid="erro-eventos">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Cartao id="resumo-eventos" titulo="Eventos" valor={fmtNum(resumo.eventos)} />
              <Cartao id="resumo-salgados" titulo="Salgados" valor={fmtNum(resumo.salgados)} destaque />
              <Cartao id="resumo-faturamento" titulo="Faturamento" valor={fmtMoeda(resumo.faturamento)} />
              <Cartao id="resumo-entrada" titulo="Entradas" valor={fmtMoeda(resumo.entrada)} />
              <Cartao id="resumo-restante" titulo="Restante a receber" valor={fmtMoeda(resumo.restante)} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Ranking titulo="Salgados por categoria" linhas={dados.categorias} testid="rank-categorias" />
              <Ranking titulo="Salgados por sabor" linhas={dados.sabores} testid="rank-sabores" />
            </div>

            <div className="rounded-xl border bg-white overflow-hidden" data-testid="lista-eventos">
              <div className="px-4 py-3 border-b font-semibold text-sm text-gray-900">Eventos do período</div>
              {dados.linhas.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Nenhum evento neste período e situação.</p>
              ) : dados.linhas.map((e) => (
                <div key={e.id} className="border-b last:border-0" data-testid="linha-evento">
                  <button type="button" onClick={() => alternar(e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    {abertos.has(e.id) ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{e.nome_cliente}</p>
                      <p className="text-xs text-gray-500">{fmtData(e.data_evento)} · {STATUS[e.status] || e.status}{e.num_convidados ? ` · ${e.num_convidados} convidados` : ''}{e.local_evento ? ` · ${e.local_evento}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{fmtNum(e.salgados)} salgados</p>
                      <p className="text-xs text-gray-500">{fmtMoeda(e.valor_total)}</p>
                    </div>
                  </button>
                  {abertos.has(e.id) && (
                    <div className="px-12 pb-3" data-testid="itens-evento">
                      {e.itens.length === 0 ? <p className="text-xs text-gray-400">Sem itens lançados neste evento.</p> : (
                        <table className="w-full text-xs">
                          <tbody>
                            {e.itens.map((i) => (
                              <tr key={i.id} className="border-t">
                                <td className="py-1 text-gray-500">{normalizarTexto(i.categoria)}</td>
                                <td className="py-1">{normalizarTexto(i.descricao)}</td>
                                <td className="py-1 text-right font-medium">{fmtNum(i.quantidade)}</td>
                                <td className="py-1 text-right text-gray-500">{fmtMoeda(i.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
