import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { consultarCnpj } from '@/utils/cnpj';
import { buscarCep, formatarCep, soDigitosCep } from '@/utils/cep';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wallet, Plus, Loader2, Search, Download, Copy, ExternalLink, CheckCircle2, XCircle, Pencil, Users, Trash2 } from 'lucide-react';
import { cnpjValido, documentoValido, formatarDocumento, soDigitos } from '@/utils/documentos';

// Cobranças a clientes empresa (boletos). Primeira versão MANUAL: o boleto é emitido no internet banking e
// aqui se registra e acompanha (vencimento, pagamento). As colunas provedor/provedor_id ficam prontas para
// a integração com a Sicredi.
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const diasEntre = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
const numero = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const numeroSimples = (v) => { const s = String(v ?? '').trim(); const n = s.includes(',') ? numero(s) : Number(s); return Number.isFinite(n) ? n : NaN; };

const FORMAS = [['boleto', 'Boleto'], ['pix', 'Pix'], ['transferencia', 'Transferência'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']];
const CLIENTE_VAZIO = { razao_social: '', nome_fantasia: '', documento: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', observacao: '' };
const COBRANCA_VAZIA = () => ({ cliente_id: '', descricao: '', valor: '', vencimento: somaDias(hojeISO(), 7), numero_documento: '', linha_digitavel: '', url_boleto: '', pix_copia_cola: '', pedido_ref: '', nota_fiscal_ref: '', observacao: '' });

// situação de exibição: aberto/vencida/paga/cancelada
const situacaoDe = (c, hoje) => {
  if (c.status === 'pago') return { chave: 'paga', rotulo: `Paga em ${fmtData(c.pago_em)}`, cls: 'bg-green-100 text-green-700' };
  if (c.status === 'cancelado') return { chave: 'cancelada', rotulo: 'Cancelada', cls: 'bg-gray-100 text-gray-500' };
  const d = diasEntre(hoje, c.vencimento);
  if (d > 0) return { chave: 'vencida', rotulo: `Vencida há ${d} dia${d > 1 ? 's' : ''}`, cls: 'bg-red-100 text-red-700' };
  if (d === 0) return { chave: 'aberta', rotulo: 'Vence hoje', cls: 'bg-amber-100 text-amber-700' };
  return { chave: 'aberta', rotulo: `Vence em ${-d} dia${-d > 1 ? 's' : ''}`, cls: 'bg-blue-100 text-blue-700' };
};

export default function CobrancasPage({ abaInicial = 'cobrancas' }) {
  const { empresaId, user } = useAuth();
  const { toast } = useToast();
  const [aba, setAba] = useState(abaInicial);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [clientes, setClientes] = useState([]);
  const [cobrancas, setCobrancas] = useState([]);
  const [filtroSituacao, setFiltroSituacao] = useState('abertas');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');

  const [dlgCobranca, setDlgCobranca] = useState(null); // { id?, form }
  const [dlgCliente, setDlgCliente] = useState(null); // { id?, form, aoSalvar? }
  const [dlgPago, setDlgPago] = useState(null); // { cobranca, pago_em, valor_pago, forma }
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    setErro('');
    try {
      const [cli, cob] = await Promise.all([
        supabase.from('clientes_cobranca').select('*').eq('empresa_id', empresaId).order('razao_social'),
        supabase.from('cobrancas').select('*').eq('empresa_id', empresaId).order('vencimento', { ascending: true }),
      ]);
      if (cli.error) throw cli.error;
      if (cob.error) throw cob.error;
      setClientes(cli.data || []);
      setCobrancas(cob.data || []);
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar as cobranças.');
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNum = soDigitos(termo);
    return cobrancas.filter((c) => {
      const sit = situacaoDe(c, hoje).chave;
      if (filtroSituacao === 'abertas' && !(sit === 'aberta' || sit === 'vencida')) return false;
      if (filtroSituacao === 'vencidas' && sit !== 'vencida') return false;
      if (filtroSituacao === 'pagas' && sit !== 'paga') return false;
      if (filtroSituacao === 'canceladas' && sit !== 'cancelada') return false;
      if (de && c.vencimento < de) return false;
      if (ate && c.vencimento > ate) return false;
      if (!termo) return true;
      const cli = clientePorId.get(c.cliente_id);
      return `${cli?.razao_social || ''} ${cli?.nome_fantasia || ''} ${c.descricao || ''} ${c.numero_documento || ''} ${c.pedido_ref || ''}`.toLowerCase().includes(termo)
        || (termoNum.length >= 4 && soDigitos(cli?.documento).includes(termoNum));
    });
  }, [cobrancas, filtroSituacao, de, ate, busca, hoje, clientePorId]);

  const resumo = useMemo(() => {
    const soma = (lista) => lista.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const abertas = cobrancas.filter((c) => situacaoDe(c, hoje).chave === 'aberta');
    const vencidas = cobrancas.filter((c) => situacaoDe(c, hoje).chave === 'vencida');
    const mes = hoje.slice(0, 7);
    const pagasMes = cobrancas.filter((c) => c.status === 'pago' && String(c.pago_em || '').startsWith(mes));
    return {
      aberto: { n: abertas.length, v: soma(abertas) },
      vencido: { n: vencidas.length, v: soma(vencidas) },
      pagoMes: { n: pagasMes.length, v: pagasMes.reduce((s, c) => s + (Number(c.valor_pago ?? c.valor) || 0), 0) },
    };
  }, [cobrancas, hoje]);

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase();
    const termoNum = soDigitos(termo);
    return clientes.filter((c) => !termo || `${c.razao_social} ${c.nome_fantasia || ''}`.toLowerCase().includes(termo) || (termoNum.length >= 4 && c.documento.includes(termoNum)));
  }, [clientes, buscaCliente]);

  // ---------------------------------------------------------------- clientes
  const abrirCliente = (c = null, aoSalvar = null) => setDlgCliente({
    id: c?.id || null,
    form: c ? { ...CLIENTE_VAZIO, ...Object.fromEntries(Object.entries(c).filter(([k]) => k in CLIENTE_VAZIO).map(([k, v]) => [k, v ?? ''])) } : { ...CLIENTE_VAZIO },
    aoSalvar,
  });

  const salvarCliente = async () => {
    const f = dlgCliente.form;
    if (!f.razao_social.trim()) { toast({ title: 'Informe a razão social ou o nome', variant: 'destructive' }); return; }
    if (!documentoValido(f.documento)) { toast({ title: 'CPF/CNPJ inválido', description: 'Confira os números digitados.', variant: 'destructive' }); return; }
    if (f.uf && !/^[A-Za-z]{2}$/.test(f.uf.trim())) { toast({ title: 'UF inválida', description: 'Use 2 letras, por exemplo SP.', variant: 'destructive' }); return; }
    const payload = {
      razao_social: f.razao_social.trim(), nome_fantasia: f.nome_fantasia.trim() || null, documento: soDigitos(f.documento),
      email: f.email.trim() || null, telefone: f.telefone.trim() || null, cep: soDigitos(f.cep) || null, logradouro: f.logradouro.trim() || null,
      numero: f.numero.trim() || null, complemento: f.complemento.trim() || null, bairro: f.bairro.trim() || null, municipio: f.municipio.trim() || null,
      uf: f.uf.trim() ? f.uf.trim().toUpperCase() : null, observacao: f.observacao.trim() || null, updated_at: new Date().toISOString(),
    };
    setSalvando(true);
    try {
      let salvo;
      if (dlgCliente.id) {
        const { data, error } = await supabase.from('clientes_cobranca').update(payload).eq('id', dlgCliente.id).eq('empresa_id', empresaId).select('*').maybeSingle();
        if (error) throw error;
        salvo = data;
      } else {
        const { data, error } = await supabase.from('clientes_cobranca').insert({ ...payload, empresa_id: empresaId }).select('*').maybeSingle();
        if (error) throw error;
        salvo = data;
      }
      toast({ title: 'Cliente salvo' });
      const aoSalvar = dlgCliente.aoSalvar;
      setDlgCliente(null);
      await carregar();
      if (aoSalvar && salvo) aoSalvar(salvo);
    } catch (e) {
      toast({ title: 'Não foi possível salvar o cliente', description: /duplicate|unique/i.test(e.message) ? 'Já existe um cliente com esse CPF/CNPJ.' : e.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const excluirCliente = async (c) => {
    if (!window.confirm(`Excluir o cliente ${c.razao_social}?`)) return;
    const { error } = await supabase.from('clientes_cobranca').delete().eq('id', c.id).eq('empresa_id', empresaId);
    if (error) {
      toast({ title: 'Não foi possível excluir', description: /foreign|violates/i.test(error.message) ? 'Esse cliente tem cobranças. Cancele ou mantenha o cadastro.' : error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Cliente excluído' });
    carregar();
  };

  // --------------------------------------------------------------- cobranças
  const abrirCobranca = (c = null) => setDlgCobranca({
    id: c?.id || null,
    form: c ? { ...COBRANCA_VAZIA(), ...Object.fromEntries(Object.entries(c).filter(([k]) => k in COBRANCA_VAZIA()).map(([k, v]) => [k, v ?? ''])), valor: Number(c.valor).toFixed(2).replace('.', ',') } : COBRANCA_VAZIA(),
  });

  const salvarCobranca = async () => {
    const f = dlgCobranca.form;
    const valor = numeroSimples(f.valor);
    if (!f.cliente_id) { toast({ title: 'Escolha o cliente', variant: 'destructive' }); return; }
    if (!f.descricao.trim()) { toast({ title: 'Descreva a cobrança', description: 'Por exemplo: "Salgados - evento 27/11".', variant: 'destructive' }); return; }
    if (!(valor > 0)) { toast({ title: 'Informe um valor maior que zero', variant: 'destructive' }); return; }
    if (!f.vencimento) { toast({ title: 'Informe o vencimento', variant: 'destructive' }); return; }
    if (f.url_boleto.trim() && !/^https:\/\//i.test(f.url_boleto.trim())) { toast({ title: 'O link do boleto precisa começar com https://', variant: 'destructive' }); return; }
    const payload = {
      cliente_id: f.cliente_id, descricao: f.descricao.trim(), valor: Math.round(valor * 100) / 100, vencimento: f.vencimento,
      numero_documento: f.numero_documento.trim() || null, linha_digitavel: f.linha_digitavel.trim() || null, url_boleto: f.url_boleto.trim() || null,
      pix_copia_cola: f.pix_copia_cola.trim() || null, pedido_ref: f.pedido_ref.trim() || null, nota_fiscal_ref: f.nota_fiscal_ref.trim() || null,
      observacao: f.observacao.trim() || null, updated_at: new Date().toISOString(),
    };
    setSalvando(true);
    try {
      const { error } = dlgCobranca.id
        ? await supabase.from('cobrancas').update(payload).eq('id', dlgCobranca.id).eq('empresa_id', empresaId)
        : await supabase.from('cobrancas').insert({ ...payload, empresa_id: empresaId, created_by: user?.id || null });
      if (error) throw error;
      toast({ title: dlgCobranca.id ? 'Cobrança atualizada' : 'Cobrança registrada' });
      setDlgCobranca(null);
      carregar();
    } catch (e) {
      toast({ title: 'Não foi possível salvar a cobrança', description: e.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const marcarPaga = async () => {
    const { cobranca, pago_em, valor_pago, forma } = dlgPago;
    const v = numeroSimples(valor_pago);
    if (!pago_em) { toast({ title: 'Informe a data do pagamento', variant: 'destructive' }); return; }
    if (!(v > 0)) { toast({ title: 'Informe o valor recebido', variant: 'destructive' }); return; }
    setSalvando(true);
    const { error } = await supabase.from('cobrancas').update({
      status: 'pago', pago_em, valor_pago: Math.round(v * 100) / 100, forma_recebimento: forma, updated_at: new Date().toISOString(),
    }).eq('id', cobranca.id).eq('empresa_id', empresaId);
    setSalvando(false);
    if (error) { toast({ title: 'Não foi possível registrar o pagamento', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Pagamento registrado' });
    setDlgPago(null);
    carregar();
  };

  const mudarStatus = async (c, status, confirmacao) => {
    if (confirmacao && !window.confirm(confirmacao)) return;
    const extra = status === 'aberto' ? { pago_em: null, valor_pago: null, forma_recebimento: null } : {};
    const { error } = await supabase.from('cobrancas').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', c.id).eq('empresa_id', empresaId);
    if (error) { toast({ title: 'Não foi possível atualizar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: status === 'cancelado' ? 'Cobrança cancelada' : 'Cobrança reaberta' });
    carregar();
  };

  const copiar = async (texto, titulo) => {
    try { await navigator.clipboard.writeText(texto); toast({ title: titulo }); }
    catch { toast({ title: 'Não foi possível copiar', description: texto, variant: 'destructive' }); }
  };

  const exportarCsv = () => {
    const aspas = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Vencimento', 'Cliente', 'CNPJ/CPF', 'Descrição', 'Nº documento', 'Valor', 'Situação', 'Pago em', 'Valor pago', 'Pedido', 'Nota fiscal'],
      ...filtradas.map((c) => { const cli = clientePorId.get(c.cliente_id); return [fmtData(c.vencimento), cli?.razao_social || '', formatarDocumento(cli?.documento), c.descricao, c.numero_documento || '',
        (Number(c.valor) || 0).toFixed(2).replace('.', ','), situacaoDe(c, hoje).rotulo, c.pago_em ? fmtData(c.pago_em) : '', c.valor_pago != null ? Number(c.valor_pago).toFixed(2).replace('.', ',') : '', c.pedido_ref || '', c.nota_fiscal_ref || '']; })];
    const csv = `﻿${linhas.map((l) => l.map(aspas).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `cobrancas_${hoje}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const Cartao = ({ id, titulo, valor, sub, destaque }) => (
    <div className={`rounded-xl border p-4 ${destaque || 'bg-white'}`}>
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-xl font-bold text-gray-900" data-testid={id}>{valor}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
  const campo = (rotulo, id, valor, onChange, extra = {}) => (
    <div className={extra.className}>
      <Label htmlFor={id} className="text-gray-900 text-xs">{rotulo}</Label>
      <Input id={id} value={valor} onChange={(e) => onChange(e.target.value)} {...(extra.props || {})} />
    </div>
  );

  return (
    <DashboardLayout>
      <Helmet><title>Cobranças - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-5" data-testid="pagina-cobrancas">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet className="h-6 w-6" /> Cobranças</h1>
            <p className="text-sm text-gray-500 mt-1">Boletos e cobranças de clientes empresa. Emita o boleto no internet banking (ou na Sicredi) e registre aqui para acompanhar vencimento e pagamento.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => abrirCliente()} className="gap-1.5" data-testid="btn-novo-cliente"><Users className="h-4 w-4" /> Novo cliente</Button>
            <Button size="sm" onClick={() => abrirCobranca()} className="gap-1.5" data-testid="btn-nova-cobranca"><Plus className="h-4 w-4" /> Nova cobrança</Button>
          </div>
        </div>

        <div className="flex gap-2 border-b">
          {[['cobrancas', 'Cobranças'], ['clientes', `Clientes (${clientes.length})`]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setAba(v)} data-testid={`aba-${v}`}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${aba === v ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
          ))}
        </div>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3" data-testid="erro-cobrancas">{erro}</div>}

        {aba === 'cobrancas' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Cartao id="resumo-aberto" titulo="A vencer" valor={fmtMoeda(resumo.aberto.v)} sub={`${resumo.aberto.n} cobrança(s)`} destaque="bg-sky-50 border-sky-200" />
              <Cartao id="resumo-vencido" titulo="Vencidas" valor={fmtMoeda(resumo.vencido.v)} sub={`${resumo.vencido.n} cobrança(s)`} destaque={resumo.vencido.n > 0 ? 'bg-red-50 border-red-200' : 'bg-white'} />
              <Cartao id="resumo-pago" titulo="Recebido neste mês" valor={fmtMoeda(resumo.pagoMes.v)} sub={`${resumo.pagoMes.n} cobrança(s)`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end border rounded-xl bg-white p-4">
              <div>
                <Label htmlFor="cb-situacao" className="text-gray-900 text-xs">Situação</Label>
                <select id="cb-situacao" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)}>
                  <option value="abertas">Em aberto (a vencer e vencidas)</option><option value="vencidas">Só vencidas</option><option value="pagas">Pagas</option><option value="canceladas">Canceladas</option><option value="todas">Todas</option>
                </select>
              </div>
              <div><Label htmlFor="cb-de" className="text-gray-900 text-xs">Vencimento de</Label><Input id="cb-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
              <div><Label htmlFor="cb-ate" className="text-gray-900 text-xs">até</Label><Input id="cb-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
              <div>
                <Label htmlFor="cb-busca" className="text-gray-900 text-xs">Buscar</Label>
                <div className="relative"><Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" /><Input id="cb-busca" className="pl-8" placeholder="Cliente, CNPJ, descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
              </div>
            </div>

            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={exportarCsv} disabled={filtradas.length === 0} className="gap-1.5"><Download className="h-4 w-4" /> Exportar planilha</Button></div>

            <div className="rounded-xl border bg-white overflow-x-auto">
              <table className="w-full text-sm" data-testid="tabela-cobrancas">
                <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400 inline" /></td></tr>
                    : filtradas.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-gray-400" data-testid="sem-cobrancas">Nenhuma cobrança neste filtro.</td></tr>
                      : filtradas.map((c) => {
                        const cli = clientePorId.get(c.cliente_id);
                        const sit = situacaoDe(c, hoje);
                        return (
                          <tr key={c.id} className="border-b last:border-0" data-testid="linha-cobranca">
                            <td className="px-3 py-2 whitespace-nowrap">{fmtData(c.vencimento)}</td>
                            <td className="px-3 py-2"><p className="font-medium text-gray-900">{cli?.razao_social || '—'}</p><p className="text-xs text-gray-500">{formatarDocumento(cli?.documento)}</p></td>
                            <td className="px-3 py-2"><p>{c.descricao}</p><p className="text-xs text-gray-400">{[`Cobrança ${c.numero}`, c.numero_documento && `Boleto ${c.numero_documento}`, c.pedido_ref && `Pedido ${c.pedido_ref}`].filter(Boolean).join(' · ')}</p></td>
                            <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{fmtMoeda(c.valor)}</td>
                            <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${sit.cls}`} data-testid="situacao">{sit.rotulo}</span></td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="inline-flex gap-1">
                                {c.status === 'aberto' && <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setDlgPago({ cobranca: c, pago_em: hoje, valor_pago: Number(c.valor).toFixed(2).replace('.', ','), forma: 'boleto' })} data-testid="btn-pago"><CheckCircle2 className="h-3 w-3" /> Pago</Button>}
                                {c.linha_digitavel && <Button size="sm" variant="outline" className="h-7 px-2" title="Copiar a linha digitável" aria-label="Copiar linha digitável" onClick={() => copiar(c.linha_digitavel, 'Linha digitável copiada')}><Copy className="h-3 w-3" /></Button>}
                                {c.url_boleto && <a href={c.url_boleto} target="_blank" rel="noopener noreferrer" title="Abrir o boleto"><Button size="sm" variant="outline" className="h-7 px-2" aria-label="Abrir o boleto"><ExternalLink className="h-3 w-3" /></Button></a>}
                                {c.status !== 'cancelado' && <Button size="sm" variant="outline" className="h-7 px-2" title="Editar" aria-label="Editar" onClick={() => abrirCobranca(c)}><Pencil className="h-3 w-3" /></Button>}
                                {c.status === 'aberto' && <Button size="sm" variant="outline" className="h-7 px-2 text-red-600" title="Cancelar cobrança" aria-label="Cancelar cobrança" onClick={() => mudarStatus(c, 'cancelado', `Cancelar a cobrança de ${fmtMoeda(c.valor)} para ${cli?.razao_social || 'o cliente'}? Se o boleto já foi emitido, cancele-o também no banco.`)}><XCircle className="h-3 w-3" /></Button>}
                                {c.status !== 'aberto' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => mudarStatus(c, 'aberto', 'Reabrir esta cobrança?')}>Reabrir</Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-sm relative"><Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" /><Input className="pl-8" placeholder="Buscar cliente ou CNPJ" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} data-testid="busca-cliente" /></div>
            <div className="rounded-xl border bg-white overflow-x-auto">
              <table className="w-full text-sm" data-testid="tabela-clientes">
                <thead><tr className="text-left text-xs text-gray-500 border-b bg-gray-50"><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">CNPJ/CPF</th><th className="px-3 py-2">Contato</th><th className="px-3 py-2">Cidade</th><th className="px-3 py-2 text-right">Ações</th></tr></thead>
                <tbody>
                  {clientesFiltrados.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nenhum cliente cadastrado.</td></tr> : clientesFiltrados.map((c) => (
                    <tr key={c.id} className="border-b last:border-0" data-testid="linha-cliente">
                      <td className="px-3 py-2"><p className="font-medium text-gray-900">{c.razao_social}</p>{c.nome_fantasia && <p className="text-xs text-gray-500">{c.nome_fantasia}</p>}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatarDocumento(c.documento)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{c.email || '—'}{c.telefone ? ` · ${c.telefone}` : ''}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{[c.municipio, c.uf].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" className="h-7 px-2 mr-1" aria-label="Editar cliente" onClick={() => abrirCliente(c)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-red-600" aria-label="Excluir cliente" onClick={() => excluirCliente(c)}><Trash2 className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Nova / editar cobrança */}
        <Dialog open={!!dlgCobranca} onOpenChange={(o) => !o && setDlgCobranca(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {dlgCobranca && (() => {
              const f = dlgCobranca.form;
              const set = (k) => (v) => setDlgCobranca((d) => ({ ...d, form: { ...d.form, [k]: v } }));
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{dlgCobranca.id ? 'Editar cobrança' : 'Nova cobrança'}</DialogTitle>
                    <DialogDescription>Registre a cobrança. Os dados do boleto emitido no banco são opcionais.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="cb-cliente" className="text-gray-900 text-xs">Cliente</Label>
                      <div className="flex gap-2">
                        <select id="cb-cliente" className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={f.cliente_id} onChange={(e) => set('cliente_id')(e.target.value)} data-testid="form-cliente">
                          <option value="">Escolha o cliente</option>
                          {clientes.map((c) => <option key={c.id} value={c.id}>{c.razao_social} — {formatarDocumento(c.documento)}</option>)}
                        </select>
                        <Button type="button" variant="outline" size="sm" onClick={() => abrirCliente(null, (novo) => set('cliente_id')(novo.id))} data-testid="btn-cliente-rapido">Novo</Button>
                      </div>
                    </div>
                    {campo('Descrição', 'cb-desc', f.descricao, set('descricao'), { props: { placeholder: 'Ex.: Salgados — entrega 27/11', 'data-testid': 'form-descricao' } })}
                    <div className="grid grid-cols-2 gap-3">
                      {campo('Valor (R$)', 'cb-valor', f.valor, set('valor'), { props: { inputMode: 'decimal', placeholder: '0,00', 'data-testid': 'form-valor' } })}
                      <div><Label htmlFor="cb-venc" className="text-gray-900 text-xs">Vencimento</Label><Input id="cb-venc" type="date" value={f.vencimento} onChange={(e) => set('vencimento')(e.target.value)} data-testid="form-vencimento" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {campo('Nº do boleto (opcional)', 'cb-num', f.numero_documento, set('numero_documento'))}
                      {campo('Pedido / nota (opcional)', 'cb-ped', f.pedido_ref, set('pedido_ref'), { props: { placeholder: 'Nº do pedido' } })}
                    </div>
                    {campo('Linha digitável (opcional)', 'cb-linha', f.linha_digitavel, set('linha_digitavel'))}
                    {campo('Link do boleto (opcional, https)', 'cb-url', f.url_boleto, set('url_boleto'), { props: { placeholder: 'https://...' } })}
                    {campo('Pix copia e cola (opcional)', 'cb-pix', f.pix_copia_cola, set('pix_copia_cola'))}
                    {campo('Nota fiscal (opcional)', 'cb-nf', f.nota_fiscal_ref, set('nota_fiscal_ref'), { props: { placeholder: 'Número ou chave da nota' } })}
                    {campo('Observação (opcional)', 'cb-obs', f.observacao, set('observacao'))}
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setDlgCobranca(null)}>Cancelar</Button>
                    <Button onClick={salvarCobranca} disabled={salvando} data-testid="btn-salvar-cobranca">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar cobrança'}</Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Novo / editar cliente */}
        <Dialog open={!!dlgCliente} onOpenChange={(o) => !o && setDlgCliente(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {dlgCliente && (() => {
              const f = dlgCliente.form;
              const set = (k) => (v) => setDlgCliente((d) => ({ ...d, form: { ...d.form, [k]: v } }));
              // CNPJ completo e válido: busca razão social e endereço na Receita (via BrasilAPI).
              // Automático só preenche campos vazios; o botão "Buscar dados" sobrescreve.
              const buscarDadosCnpj = async (doc, sobrescrever) => {
                setBuscandoCnpj(true);
                const r = await consultarCnpj(doc);
                setBuscandoCnpj(false);
                if (!r.ok) {
                  toast({ title: r.motivo === 'nao_encontrado' ? 'CNPJ não encontrado na Receita' : 'Não foi possível consultar o CNPJ agora', description: 'Preencha os dados manualmente.' });
                  return;
                }
                setDlgCliente((dd) => {
                  if (!dd || soDigitos(dd.form.documento) !== doc) return dd;
                  const novo = { ...dd.form };
                  for (const [k, v] of Object.entries(r.dados)) if (v && (sobrescrever || !String(novo[k] ?? '').trim())) novo[k] = v;
                  return { ...dd, form: novo };
                });
                if (r.situacao && !/^ativa$/i.test(r.situacao)) toast({ title: `Situação do CNPJ na Receita: ${r.situacao}`, description: 'Confirme com o cliente antes de emitir nota.', variant: 'destructive' });
                else toast({ title: 'Dados preenchidos pela Receita', description: 'Confira e complete número, complemento, e-mail e telefone se precisar.' });
              };
              const onDoc = (v) => {
                const d = soDigitos(v).slice(0, 14);
                set('documento')(d);
                if (d.length === 14 && cnpjValido(d) && !dlgCliente.id) buscarDadosCnpj(d, false);
              };

              // Ao completar os 8 dígitos do CEP, preenche rua, bairro, município e UF (número e complemento ficam por conta do usuário).
              const onCep = async (v) => {
                const d = soDigitosCep(v);
                set('cep')(d);
                if (d.length !== 8) return;
                setBuscandoCep(true);
                const r = await buscarCep(d);
                setBuscandoCep(false);
                if (!r) { toast({ title: 'CEP não encontrado', description: 'Confira o CEP ou preencha o endereço manualmente.' }); return; }
                setDlgCliente((dd) => (dd && soDigitosCep(dd.form.cep) === d
                  ? { ...dd, form: { ...dd.form, ...Object.fromEntries(Object.entries(r).filter(([, val]) => val)) } }
                  : dd));
              };
              return (
                <>
                  <DialogHeader><DialogTitle>{dlgCliente.id ? 'Editar cliente' : 'Novo cliente'}</DialogTitle><DialogDescription>Cadastro usado na NF-e e nos boletos. Digite o CNPJ que os dados são preenchidos pela Receita.</DialogDescription></DialogHeader>
                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      {campo('CNPJ ou CPF', 'cl-doc', formatarDocumento(f.documento), onDoc, { className: 'flex-1', props: { inputMode: 'numeric', placeholder: '00.000.000/0000-00', 'data-testid': 'cli-doc', autoFocus: !dlgCliente.id } })}
                      {soDigitos(f.documento).length === 14 && cnpjValido(f.documento) && (
                        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={buscandoCnpj} onClick={() => buscarDadosCnpj(soDigitos(f.documento), true)} data-testid="btn-buscar-cnpj">
                          {buscandoCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar dados
                        </Button>
                      )}
                    </div>
                    {campo('Razão social ou nome', 'cl-razao', f.razao_social, set('razao_social'), { props: { 'data-testid': 'cli-razao' } })}
                    {campo('Nome fantasia (opcional)', 'cl-fant', f.nome_fantasia, set('nome_fantasia'))}
                    
                    <div className="grid grid-cols-2 gap-3">{campo('E-mail', 'cl-email', f.email, set('email'))}{campo('Telefone', 'cl-tel', f.telefone, set('telefone'))}</div>
                    <div className="grid grid-cols-3 gap-3">{campo(buscandoCep ? 'CEP (buscando...)' : 'CEP', 'cl-cep', formatarCep(f.cep), onCep, { props: { inputMode: 'numeric', placeholder: '00000-000', 'data-testid': 'cli-cep' } })}{campo('Município', 'cl-mun', f.municipio, set('municipio'), { className: 'col-span-1' })}{campo('UF', 'cl-uf', f.uf, (v) => set('uf')(v.slice(0, 2)))}</div>
                    <div className="grid grid-cols-3 gap-3">{campo('Rua', 'cl-rua', f.logradouro, set('logradouro'), { className: 'col-span-2' })}{campo('Número', 'cl-num', f.numero, set('numero'))}</div>
                    <div className="grid grid-cols-2 gap-3">{campo('Complemento', 'cl-comp', f.complemento, set('complemento'))}{campo('Bairro', 'cl-bairro', f.bairro, set('bairro'))}</div>
                    {campo('Observação', 'cl-obs', f.observacao, set('observacao'))}
                  </div>
                  <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDlgCliente(null)}>Cancelar</Button><Button onClick={salvarCliente} disabled={salvando} data-testid="btn-salvar-cliente">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar cliente'}</Button></DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Marcar como paga */}
        <Dialog open={!!dlgPago} onOpenChange={(o) => !o && setDlgPago(null)}>
          <DialogContent>
            {dlgPago && (
              <>
                <DialogHeader><DialogTitle>Registrar pagamento</DialogTitle><DialogDescription>{clientePorId.get(dlgPago.cobranca.cliente_id)?.razao_social} — {fmtMoeda(dlgPago.cobranca.valor)}</DialogDescription></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="pg-data" className="text-gray-900 text-xs">Data do pagamento</Label><Input id="pg-data" type="date" value={dlgPago.pago_em} onChange={(e) => setDlgPago((d) => ({ ...d, pago_em: e.target.value }))} data-testid="pago-data" /></div>
                  <div><Label htmlFor="pg-valor" className="text-gray-900 text-xs">Valor recebido (R$)</Label><Input id="pg-valor" inputMode="decimal" value={dlgPago.valor_pago} onChange={(e) => setDlgPago((d) => ({ ...d, valor_pago: e.target.value }))} data-testid="pago-valor" /></div>
                </div>
                <div>
                  <Label htmlFor="pg-forma" className="text-gray-900 text-xs">Forma de recebimento</Label>
                  <select id="pg-forma" className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={dlgPago.forma} onChange={(e) => setDlgPago((d) => ({ ...d, forma: e.target.value }))}>
                    {FORMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDlgPago(null)}>Cancelar</Button><Button onClick={marcarPaga} disabled={salvando} data-testid="btn-confirmar-pago">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar pagamento'}</Button></DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
