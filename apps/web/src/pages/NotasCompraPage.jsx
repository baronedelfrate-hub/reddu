import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShoppingCart, Search, Download, Copy, RefreshCw, FileCode, FileText, Archive, AlertTriangle } from 'lucide-react';

// Notas de compra: NFes emitidas por fornecedores contra o CNPJ da empresa (recebidas pela Focus NFe).
// Só leitura: não registra nenhuma manifestação ao Fisco. O XML completo só existe quando a Focus já
// recebeu a nota completa (campo "completa").
const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtrasISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtDoc = (d) => {
  const n = String(d || '').replace(/\D/g, '');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return n || '—';
};
const SITUACAO = {
  autorizada: { rotulo: 'Autorizada', cls: 'bg-green-100 text-green-700' },
  cancelada: { rotulo: 'Cancelada', cls: 'bg-red-100 text-red-600' },
  denegada: { rotulo: 'Denegada', cls: 'bg-amber-100 text-amber-700' },
};

const baixarArquivo = (nome, partes, tipo) => {
  const url = URL.createObjectURL(new Blob(partes, { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};
const base64ParaBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Chama a função do servidor (que usa o token da Focus). Devolve os dados ou lança com a mensagem certa.
const chamar = async (body) => {
  const { data, error } = await supabase.functions.invoke('notas-fiscais-arquivos', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* mantém a mensagem */ }
    throw new Error(msg);
  }
  if (data?.ok === false) throw new Error(data.error || 'Erro ao buscar as notas.');
  return data;
};

export default function NotasCompraPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [de, setDe] = useState(diasAtrasISO(90));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(null); // `${tipo}-${chave}`
  const [baixandoZip, setBaixandoZip] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    setErro('');
    try {
      const r = await chamar({ action: 'compras_listar' });
      setNotas(r.notas || []);
    } catch (e) {
      setErro(e.message);
      setNotas([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = termo.replace(/\D/g, '');
    return notas.filter((n) => {
      if (n.data_emissao < de || n.data_emissao > ate) return false;
      if (situacao !== 'todas' && n.situacao !== situacao) return false;
      if (!termo) return true;
      return n.emitente.toLowerCase().includes(termo)
        || (termoNum.length >= 3 && (n.documento_emitente.includes(termoNum) || n.chave.includes(termoNum)));
    });
  }, [notas, de, ate, situacao, busca]);

  const resumo = useMemo(() => ({
    quantidade: filtradas.length,
    valor: filtradas.filter((n) => n.situacao !== 'cancelada').reduce((s, n) => s + (Number(n.valor) || 0), 0),
    completas: filtradas.filter((n) => n.completa).length,
    semXml: filtradas.filter((n) => !n.completa).length,
  }), [filtradas]);

  const copiarChave = async (chave) => {
    try { await navigator.clipboard.writeText(chave); toast({ title: 'Chave de acesso copiada' }); }
    catch { toast({ title: 'Não foi possível copiar', description: chave, variant: 'destructive' }); }
  };

  const baixarNota = async (n, tipo) => {
    setBaixando(`${tipo}-${n.chave}`);
    try {
      if (tipo === 'xml') {
        const r = await chamar({ action: 'compras_xml', chave: n.chave });
        baixarArquivo(r.nome, [r.xml], 'application/xml');
      } else {
        const r = await chamar({ action: 'compras_pdf', chave: n.chave });
        baixarArquivo(r.nome, [base64ParaBytes(r.base64)], 'application/pdf');
      }
    } catch (e) {
      toast({ title: tipo === 'xml' ? 'Não foi possível baixar o XML' : 'Não foi possível baixar o PDF', description: e.message, variant: 'destructive' });
    } finally {
      setBaixando(null);
    }
  };

  const baixarZip = async () => {
    setBaixandoZip(true);
    try {
      const r = await chamar({ action: 'compras_zip', de, ate });
      baixarArquivo(r.nome, [base64ParaBytes(r.base64)], 'application/zip');
      const falhas = r.falhas?.length || 0;
      toast({
        title: `${r.incluidas} XML(s) baixado(s)`,
        description: falhas > 0 ? `${falhas} nota(s) ainda sem XML completo na Focus.` : undefined,
        variant: falhas > 0 ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Não foi possível gerar o ZIP', description: e.message, variant: 'destructive' });
    } finally {
      setBaixandoZip(false);
    }
  };

  const exportarCsv = () => {
    const aspas = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Data de emissão', 'Emitente', 'CNPJ/CPF do emitente', 'Valor', 'Situação', 'XML completo', 'Chave de acesso'],
      ...filtradas.map((n) => [fmtData(n.data_emissao), n.emitente, fmtDoc(n.documento_emitente), (Number(n.valor) || 0).toFixed(2).replace('.', ','),
        SITUACAO[n.situacao]?.rotulo || n.situacao, n.completa ? 'Sim' : 'Não', n.chave]),
    ];
    const csv = `﻿${linhas.map((l) => l.map(aspas).join(';')).join('\r\n')}`;
    baixarArquivo(`notas-de-compra_${de}_a_${ate}.csv`, [csv], 'text/csv;charset=utf-8');
  };

  const Cartao = ({ id, titulo, valor, destaque }) => (
    <div className={`rounded-xl border p-4 ${destaque ? 'bg-sky-50 border-sky-200' : 'bg-white'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-bold text-gray-900" data-testid={id}>{valor}</p>
    </div>
  );

  return (
    <DashboardLayout>
      <Helmet><title>Notas de Compra - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-5" data-testid="pagina-notas-compra">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="h-6 w-6" /> Notas de Compra</h1>
            <p className="text-sm text-gray-500 mt-1">Notas fiscais que os fornecedores emitiram contra o CNPJ da empresa, recebidas pela Focus NFe. Baixe o XML e o PDF de cada nota ou de todas do período. Esta tela só consulta: não registra nada no Fisco.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={filtradas.length === 0} className="gap-1.5"><Download className="h-4 w-4" /> Exportar planilha</Button>
            <Button size="sm" onClick={baixarZip} disabled={baixandoZip || loading || resumo.completas === 0} className="gap-1.5" title="Baixa os XMLs completos das notas do período escolhido">
              {baixandoZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Baixar XMLs (ZIP)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end border rounded-xl bg-white p-4">
          <div><Label htmlFor="nc-de" className="text-gray-900 text-xs">De</Label><Input id="nc-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label htmlFor="nc-ate" className="text-gray-900 text-xs">Até</Label><Input id="nc-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <div>
            <Label htmlFor="nc-situacao" className="text-gray-900 text-xs">Situação</Label>
            <select id="nc-situacao" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="todas">Todas</option><option value="autorizada">Autorizadas</option><option value="cancelada">Canceladas</option>
            </select>
          </div>
          <div>
            <Label htmlFor="nc-busca" className="text-gray-900 text-xs">Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" />
              <Input id="nc-busca" className="pl-8" placeholder="Fornecedor, CNPJ ou chave" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3 flex gap-2" data-testid="erro-compras">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Cartao id="resumo-notas" titulo="Notas no período" valor={resumo.quantidade} />
          <Cartao id="resumo-valor" titulo="Valor (sem canceladas)" valor={fmtMoeda(resumo.valor)} destaque />
          <Cartao id="resumo-completas" titulo="Com XML completo" valor={resumo.completas} />
          <Cartao id="resumo-sem-xml" titulo="Só resumo (sem XML)" valor={resumo.semXml} />
        </div>

        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-sm" data-testid="tabela-compras">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2">Emissão</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Situação</th><th className="px-3 py-2">Chave de acesso</th><th className="px-3 py-2 text-right">Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400 inline" /></td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400" data-testid="sem-compras">Nenhuma nota de compra neste período.</td></tr>
              ) : filtradas.map((n) => (
                <tr key={n.chave} className="border-b last:border-0" data-testid="linha-compra">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtData(n.data_emissao)}</td>
                  <td className="px-3 py-2"><p className="font-medium text-gray-900">{n.emitente}</p><p className="text-xs text-gray-500">{fmtDoc(n.documento_emitente)}</p></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoeda(n.valor)}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SITUACAO[n.situacao]?.cls || 'bg-gray-100 text-gray-600'}`}>{SITUACAO[n.situacao]?.rotulo || n.situacao || '—'}</span></td>
                  <td className="px-3 py-2">
                    <button type="button" className="font-mono text-[11px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1" onClick={() => copiarChave(n.chave)} aria-label="Copiar chave de acesso" title="Copiar chave de acesso">
                      {n.chave} <Copy className="h-3 w-3" />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={!n.completa || baixando === `xml-${n.chave}`}
                        onClick={() => baixarNota(n, 'xml')} title={n.completa ? 'Baixar o XML da nota' : 'A Focus só tem o resumo desta nota, sem o XML completo'}>
                        {baixando === `xml-${n.chave}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />} XML
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={!n.completa || baixando === `pdf-${n.chave}`}
                        onClick={() => baixarNota(n, 'pdf')} title={n.completa ? 'Baixar o PDF (DANFE) da nota' : 'A Focus só tem o resumo desta nota, sem o PDF'}>
                        {baixando === `pdf-${n.chave}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PDF
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
