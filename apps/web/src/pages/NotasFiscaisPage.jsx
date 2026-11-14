import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileCheck, Search, Download, Copy, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';

// Consulta das notas fiscais emitidas (e das que deram erro), reunindo todas as origens:
// vendas (PDV, balcão, cardápio...), Faturamento de Reabastecimento e Pedido Consignado.
// Notas combinadas (vários mercados numa nota só) aparecem em UMA linha.
const LIMITE_POR_ORIGEM = 1000;

const ORIGENS = {
  PDV: 'PDV',
  CARDAPIO_DIGITAL: 'Cardápio digital',
  PEDIDO_BALCAO: 'Pedido balcão',
  REABASTECIMENTO: 'Reabastecimento',
  CONSIGNADO: 'Consignado',
};
const rotuloOrigem = (o) => ORIGENS[o] || (o ? String(o).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Outros');

const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtrasISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const fmtData = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; }
};
const fmtDoc = (d) => {
  const n = String(d || '').replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return n || '—';
};
const normStatus = (s) => (s === 'emitido' || s === 'success' ? 'emitido' : 'erro');

// Junta as linhas de mercado que compartilham a mesma nota (nota combinada) numa linha só.
const agruparPorChave = (linhas) => {
  const porChave = new Map();
  const resultado = [];
  linhas.forEach((l) => {
    if (!l.chave) { resultado.push(l); return; }
    const existente = porChave.get(l.chave);
    if (!existente) { porChave.set(l.chave, { ...l, nomes: [l.descricao] }); return; }
    existente.nomes.push(l.descricao);
    existente.valor = (Number(existente.valor) || 0) + (Number(l.valor) || 0);
  });
  porChave.forEach((l) => resultado.push({ ...l, descricao: [...new Set(l.nomes)].join(' + ') }));
  return resultado;
};

export default function NotasFiscaisPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [notas, setNotas] = useState([]);
  const [truncado, setTruncado] = useState(false);

  const [de, setDe] = useState(() => diasAtrasISO(30));
  const [ate, setAte] = useState(hojeISO);
  const [origem, setOrigem] = useState('todas');
  const [situacao, setSituacao] = useState('emitido'); // emitido | erro | todas
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const ini = `${de}T00:00:00`;
      const fim = `${ate}T23:59:59`;
      const status = ['emitido', 'erro'];

      const [vendasRes, reabRes, consRes] = await Promise.all([
        supabase.from('vendas')
          .select('id, canal_venda, cliente_referencia, data_venda, created_at, total_final, status_fiscal, nfe_chave, nfe_url_pdf, nfe_erro_mensagem, cpf_cliente')
          .eq('empresa_id', empresaId).in('status_fiscal', status)
          .gte('data_venda', ini).lte('data_venda', fim)
          .order('data_venda', { ascending: false }).limit(LIMITE_POR_ORIGEM),
        supabase.from('pedidos_reabastecimento_mercados')
          .select('id, valor_total, status_fiscal, nfe_chave, nfe_url_pdf, nfe_erro_mensagem, cpf_cnpj_utilizado, locais(nome), pedidos_reabastecimento!inner(empresa_id, gerado_em)')
          .eq('pedidos_reabastecimento.empresa_id', empresaId).in('status_fiscal', status)
          .gte('pedidos_reabastecimento.gerado_em', ini).lte('pedidos_reabastecimento.gerado_em', fim)
          .limit(LIMITE_POR_ORIGEM),
        supabase.from('pedidos_consignado_mercados')
          .select('id, valor_total, status_fiscal, nfe_chave, nfe_url_pdf, nfe_erro_mensagem, cpf_cnpj_utilizado, locais(nome), pedidos_consignado!inner(empresa_id, gerado_em)')
          .eq('pedidos_consignado.empresa_id', empresaId).in('status_fiscal', status)
          .gte('pedidos_consignado.gerado_em', ini).lte('pedidos_consignado.gerado_em', fim)
          .limit(LIMITE_POR_ORIGEM),
      ]);
      if (vendasRes.error) throw vendasRes.error;
      if (reabRes.error) throw reabRes.error;
      if (consRes.error) throw consRes.error;

      const vendas = (vendasRes.data || []).map((v) => ({
        id: `v-${v.id}`, data: v.data_venda || v.created_at, origem: v.canal_venda || 'OUTROS',
        descricao: v.cliente_referencia || 'Consumidor', valor: v.total_final, doc: v.cpf_cliente,
        chave: v.nfe_chave, pdf: v.nfe_url_pdf, status: normStatus(v.status_fiscal), erro: v.nfe_erro_mensagem,
      }));
      const mercado = (rows, origemNome, chavePedido) => agruparPorChave((rows || []).map((m) => ({
        id: `${origemNome}-${m.id}`, data: m[chavePedido]?.gerado_em, origem: origemNome,
        descricao: m.locais?.nome || 'Mercado', valor: m.valor_total, doc: m.cpf_cnpj_utilizado,
        chave: m.nfe_chave, pdf: m.nfe_url_pdf, status: normStatus(m.status_fiscal), erro: m.nfe_erro_mensagem,
      })));

      setNotas([
        ...vendas,
        ...mercado(reabRes.data, 'REABASTECIMENTO', 'pedidos_reabastecimento'),
        ...mercado(consRes.data, 'CONSIGNADO', 'pedidos_consignado'),
      ].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))));
      setTruncado([vendasRes, reabRes, consRes].some((r) => (r.data || []).length >= LIMITE_POR_ORIGEM));
    } catch (e) {
      console.error('Erro ao carregar notas fiscais:', e);
      toast({ title: 'Erro ao carregar as notas', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, de, ate, toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const origensPresentes = useMemo(() => [...new Set(notas.map((n) => n.origem))].sort(), [notas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = termo.replace(/\D/g, '');
    return notas.filter((n) => {
      if (origem !== 'todas' && n.origem !== origem) return false;
      if (situacao !== 'todas' && n.status !== situacao) return false;
      if (!termo) return true;
      return String(n.descricao || '').toLowerCase().includes(termo)
        || String(n.chave || '').includes(termo)
        || (termoNum.length >= 3 && String(n.doc || '').replace(/\D/g, '').includes(termoNum))
        || (termoNum.length >= 6 && String(n.chave || '').includes(termoNum));
    });
  }, [notas, origem, situacao, busca]);

  const resumo = useMemo(() => {
    const emit = filtradas.filter((n) => n.status === 'emitido');
    return {
      emitidas: emit.length,
      valor: emit.reduce((s, n) => s + (Number(n.valor) || 0), 0),
      erros: filtradas.filter((n) => n.status === 'erro').length,
    };
  }, [filtradas]);

  const copiarChave = async (chave) => {
    try {
      await navigator.clipboard.writeText(String(chave));
      toast({ title: 'Chave de acesso copiada' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: String(chave), variant: 'destructive' });
    }
  };

  const exportarCsv = () => {
    const aspas = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Data', 'Origem', 'Cliente / Mercado', 'Valor', 'CPF/CNPJ', 'Situação', 'Chave de acesso', 'Link do PDF'],
      ...filtradas.map((n) => [
        fmtData(n.data), rotuloOrigem(n.origem), n.descricao, (Number(n.valor) || 0).toFixed(2).replace('.', ','),
        fmtDoc(n.doc) === '—' ? '' : fmtDoc(n.doc), n.status === 'emitido' ? 'Emitida' : 'Com erro', n.chave || '', n.pdf || '',
      ]),
    ];
    const csv = `﻿${linhas.map((l) => l.map(aspas).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `notas-fiscais_${de}_a_${ate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <Helmet><title>Notas Fiscais - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-5" data-testid="pagina-notas-fiscais">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileCheck className="h-6 w-6" /> Notas Fiscais</h1>
            <p className="text-sm text-gray-500 mt-1">Todas as notas emitidas pelo sistema: PDV, cardápio, reabastecimento e consignado. Nota combinada aparece em uma linha só.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={filtradas.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" /> Exportar planilha
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end border rounded-xl bg-white p-4">
          <div>
            <Label htmlFor="nf-de" className="text-gray-900 text-xs">De</Label>
            <Input id="nf-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nf-ate" className="text-gray-900 text-xs">Até</Label>
            <Input id="nf-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nf-origem" className="text-gray-900 text-xs">Origem</Label>
            <select id="nf-origem" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="todas">Todas</option>
              {origensPresentes.map((o) => <option key={o} value={o}>{rotuloOrigem(o)}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="nf-situacao" className="text-gray-900 text-xs">Situação</Label>
            <select id="nf-situacao" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="emitido">Emitidas</option>
              <option value="erro">Com erro</option>
              <option value="todas">Todas</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label htmlFor="nf-busca" className="text-gray-900 text-xs">Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" />
              <Input id="nf-busca" className="pl-8" placeholder="Cliente, CPF/CNPJ ou chave" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Notas emitidas</p>
            <p className="text-3xl font-black text-gray-900 mt-1" data-testid="resumo-emitidas">{resumo.emitidas}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Valor das emitidas</p>
            <p className="text-3xl font-black text-gray-900 mt-1" data-testid="resumo-valor">{fmtMoeda(resumo.valor)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${resumo.erros > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            <p className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Com erro</p>
            <p className="text-3xl font-black text-gray-900 mt-1" data-testid="resumo-erros">{resumo.erros}</p>
          </div>
        </div>

        {truncado && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Mostrando só as {LIMITE_POR_ORIGEM} notas mais recentes de pelo menos uma origem. Reduza o período para ver todas.
          </p>
        )}

        <div className="border rounded-xl bg-white overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">Nenhuma nota encontrada neste filtro.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Data</th>
                  <th className="text-left px-3 py-2 font-semibold">Origem</th>
                  <th className="text-left px-3 py-2 font-semibold">Cliente / Mercado</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">CPF/CNPJ</th>
                  <th className="text-center px-3 py-2 font-semibold">Situação</th>
                  <th className="text-right px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map((n) => (
                  <tr key={n.id} data-testid="linha-nota">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmtData(n.data)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{rotuloOrigem(n.origem)}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-[320px]">
                      <span className="font-medium">{n.descricao}</span>
                      {n.chave && <p className="text-[11px] text-gray-400 font-mono truncate" title={n.chave}>{n.chave}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtMoeda(n.valor)}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap hidden lg:table-cell">{fmtDoc(n.doc)}</td>
                    <td className="px-3 py-2 text-center">
                      {n.status === 'emitido'
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Emitida</span>
                        : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 cursor-help" title={n.erro || 'Erro na emissão'}>Com erro</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {n.status === 'emitido' ? (
                        <div className="inline-flex gap-1">
                          {n.pdf && (
                            <Button asChild size="sm" variant="outline" className="h-8 gap-1">
                              <a href={n.pdf} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> PDF</a>
                            </Button>
                          )}
                          {n.chave && (
                            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => copiarChave(n.chave)} aria-label="Copiar chave de acesso">
                              <Copy className="h-3.5 w-3.5" /> Chave
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-600 max-w-[260px] inline-block truncate align-middle" title={n.erro || ''}>{n.erro || 'Erro na emissão'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
