import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import ConfirmInactivateLoteModal from '@/components/lotes/ConfirmInactivateLoteModal';
import EditLoteModal from '@/components/lotes/EditLoteModal';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { emitLoteUpdated } from '@/hooks/useEditLoteSync';
import {
  Loader2, AlertCircle, RefreshCw, ShieldAlert, PackageX, TrendingDown,
  Copy, Link2Off, CheckCircle2, ChevronDown, ChevronRight, Pencil,
  PackageMinus, Eraser, ArrowRightLeft
} from 'lucide-react';

// ─── Página "Saúde do Estoque" ──────────────────────────────────────────────
// Reaplica, direto no app, os mesmos checks de pente-fino já validados por
// SQL: lotes inativos/devolvidos com sobra de quantidade, quantidade
// negativa, lotes ativos duplicados e lotes órfãos (referenciando
// produto/local/lote de origem que não existem mais). Nenhuma correção
// acontece sozinha — toda ação aqui exige confirmação explícita e reaproveita
// os mesmos modais/registro de auditoria já usados em Alertas e Lotes.
export default function SaudeEstoquePage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const { inactivateLote } = useLoteManagement();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [expandedChecks, setExpandedChecks] = useState({ fantasma: true });

  const [fantasmas, setFantasmas] = useState([]);
  const [negativos, setNegativos] = useState([]);
  const [duplicados, setDuplicados] = useState([]);
  const [orfaos, setOrfaos] = useState([]);

  // Ações
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const [showZerarModal, setShowZerarModal] = useState(false);
  const [selectedLote, setSelectedLote] = useState(null);
  const [isInactivating, setIsInactivating] = useState(false);
  const [isZerando, setIsZerando] = useState(false);

  useEffect(() => {
    if (empresaId) fetchSaude();
    else setIsLoading(false);
  }, [empresaId]);

  const fetchSaude = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [lotesRes, produtosRes, locaisRes] = await Promise.all([
        supabase.from('lotes').select('*').eq('empresa_id', empresaId).limit(10000),
        supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId),
      ]);
      if (lotesRes.error) throw lotesRes.error;
      if (produtosRes.error) throw produtosRes.error;
      if (locaisRes.error) throw locaisRes.error;

      const lotes = lotesRes.data || [];
      const produtoMap = (produtosRes.data || []).reduce((acc, p) => { acc[p.id] = p.nome; return acc; }, {});
      const localMap = (locaisRes.data || []).reduce((acc, l) => { acc[l.id] = l.nome; return acc; }, {});
      const loteMap = lotes.reduce((acc, l) => { acc[l.id] = l; return acc; }, {});

      // Formato compatível com EditLoteModal / ConfirmInactivateLoteModal
      // (que esperam lote_id e quantidade_atual, como em AlertasPage).
      const enrich = (l) => ({
        ...l,
        lote_id: l.id,
        quantidade_atual: l.quantidade,
        produto_nome: produtoMap[l.produto_id] || '(produto não encontrado)',
        local_nome: l.local_id ? (localMap[l.local_id] || '(local não encontrado)') : 'Sem local',
      });

      // 1) Estoque fantasma: lote inativo ou devolvido, mas ainda com saldo positivo
      const listaFantasmas = lotes
        .filter(l => (l.ativo === false || l.lote_devolvido === true) && Number(l.quantidade) > 0)
        .map(enrich)
        .sort((a, b) => Number(b.quantidade) - Number(a.quantidade));

      // 2) Quantidade negativa (nunca deveria acontecer)
      const listaNegativos = lotes
        .filter(l => Number(l.quantidade) < 0)
        .map(enrich)
        .sort((a, b) => Number(a.quantidade) - Number(b.quantidade));

      // 3) Lotes ativos duplicados: mesmo produto + local + número de lote
      const chaveDuplicidade = (l) => `${l.produto_id}|${l.local_id}|${(l.numero_lote || '').trim()}`;
      const gruposAtivos = {};
      lotes.filter(l => l.ativo === true && l.numero_lote).forEach(l => {
        const chave = chaveDuplicidade(l);
        if (!gruposAtivos[chave]) gruposAtivos[chave] = [];
        gruposAtivos[chave].push(l);
      });
      const listaDuplicados = Object.values(gruposAtivos)
        .filter(grupo => grupo.length > 1)
        .flatMap(grupo => grupo.map(enrich));

      // 4) Lotes órfãos: produto, local ou lote de origem referenciando um
      // registro que não existe mais.
      const listaOrfaos = lotes
        .filter(l => (l.produto_id && !produtoMap[l.produto_id])
          || (l.local_id && !localMap[l.local_id])
          || (l.lote_origem_id && !loteMap[l.lote_origem_id]))
        .map(l => ({
          ...enrich(l),
          motivo: [
            l.produto_id && !produtoMap[l.produto_id] ? 'produto inexistente' : null,
            l.local_id && !localMap[l.local_id] ? 'local inexistente' : null,
            l.lote_origem_id && !loteMap[l.lote_origem_id] ? 'lote de origem inexistente' : null,
          ].filter(Boolean).join(', '),
        }));

      setFantasmas(listaFantasmas);
      setNegativos(listaNegativos);
      setDuplicados(listaDuplicados);
      setOrfaos(listaOrfaos);
      setLastCheckedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);
  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const toggleCheck = (key) => setExpandedChecks(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── Ações sobre um lote ───────────────────────────────────────────────
  const handleEditClick = (item) => { setSelectedLote(item); setShowEditModal(true); };
  const handleInactivateClick = (item) => { setSelectedLote(item); setShowInactivateModal(true); };
  const handleZerarClick = (item) => { setSelectedLote(item); setShowZerarModal(true); };
  const handleTransferirClick = (item) => { window.location.href = `/transferencia-estoque?lote_id=${item.lote_id}&local_id=${item.local_id || ''}`; };

  const handleSaveEdit = () => { setShowEditModal(false); setSelectedLote(null); emitLoteUpdated(); fetchSaude(); };

  const handleConfirmInactivate = async () => {
    if (!selectedLote || !empresaId) return;
    setIsInactivating(true);
    try {
      const response = await inactivateLote(selectedLote.lote_id, empresaId);
      if (response.success) {
        toast({ title: 'Lote inativado!', className: 'bg-green-600 text-white border-none' });
        setShowInactivateModal(false);
        setSelectedLote(null);
        emitLoteUpdated();
        fetchSaude();
      } else {
        toast({ title: 'Erro ao inativar', description: response.error, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Erro inesperado', description: err.message, variant: 'destructive' });
    } finally {
      setIsInactivating(false);
    }
  };

  const handleConfirmZerar = async () => {
    if (!selectedLote || !empresaId) return;
    setIsZerando(true);
    try {
      const { error: updateError } = await supabase
        .from('lotes')
        .update({ quantidade: 0 })
        .eq('id', selectedLote.lote_id)
        .eq('empresa_id', empresaId);
      if (updateError) throw updateError;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || currentUser?.id;
      await supabase.from('logs_auditoria').insert({
        empresa_id: empresaId,
        usuario_id: userId,
        acao: 'editar',
        entidade: 'lotes',
        entidade_id: selectedLote.lote_id,
        dados_antes: { quantidade: selectedLote.quantidade_atual },
        dados_depois: { quantidade: 0, motivo: 'Zerado via painel Saúde do Estoque (lote inativo/devolvido com saldo residual)' },
      });

      toast({ title: 'Quantidade zerada', description: 'O saldo residual do lote foi zerado e a ação ficou registrada na auditoria.', className: 'bg-green-600 text-white border-none' });
      setShowZerarModal(false);
      setSelectedLote(null);
      emitLoteUpdated();
      fetchSaude();
    } catch (err) {
      toast({ title: 'Erro ao zerar quantidade', description: err.message, variant: 'destructive' });
    } finally {
      setIsZerando(false);
    }
  };

  const totalProblemas = fantasmas.length + negativos.length + duplicados.length + orfaos.length;

  const acoesFantasma = (item) => (
    <div className="flex items-center justify-end gap-1">
      <button onClick={() => handleEditClick(item)} title="Editar lote"
        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => handleZerarClick(item)} title="Zerar quantidade"
        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-lg transition-colors ring-1 ring-red-300">
        <Eraser className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const acoesNegativo = (item) => (
    <div className="flex items-center justify-end gap-1">
      <button onClick={() => handleEditClick(item)} title="Editar lote (corrigir quantidade)"
        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const acoesAtivo = (item) => (
    <div className="flex items-center justify-end gap-1">
      <button onClick={() => handleEditClick(item)} title="Editar lote"
        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => handleTransferirClick(item)} title="Transferir lote"
        className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => handleInactivateClick(item)} title="Inativar lote"
        className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
        <PackageMinus className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const checks = [
    {
      key: 'fantasma',
      titulo: 'Estoque fantasma',
      descricao: 'Lotes inativos ou devolvidos que ainda têm quantidade positiva — ficam invisíveis para a Auditoria de Mercado mas continuam contando no estoque.',
      icon: PackageX,
      color: 'red',
      itens: fantasmas,
      colunas: ['Produto', 'Local', 'Lote', 'Tipo', 'Qtd.', 'Validade', 'Status', 'Ações'],
      renderRow: (item, idx) => (
        <TableRow key={item.id || idx} className="border-b border-gray-50">
          <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
          <TableCell className="text-gray-600">{item.local_nome}</TableCell>
          <TableCell className="text-gray-600 font-mono text-sm">{item.numero_lote || '—'}</TableCell>
          <TableCell className="text-gray-600">{item.tipo_lote || '—'}</TableCell>
          <TableCell className="text-right font-bold text-gray-900">{formatNumber(item.quantidade)}</TableCell>
          <TableCell className="text-right text-gray-600">{formatDate(item.data_validade)}</TableCell>
          <TableCell className="text-right">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {item.lote_devolvido ? 'Devolvido' : 'Inativo'}
            </span>
          </TableCell>
          <TableCell className="text-right">{acoesFantasma(item)}</TableCell>
        </TableRow>
      ),
    },
    {
      key: 'negativo',
      titulo: 'Quantidade negativa',
      descricao: 'Lotes com saldo negativo — indica um movimento de baixa maior do que o estoque disponível no momento.',
      icon: TrendingDown,
      color: 'orange',
      itens: negativos,
      colunas: ['Produto', 'Local', 'Lote', 'Qtd.', 'Status', 'Ações'],
      renderRow: (item, idx) => (
        <TableRow key={item.id || idx} className="border-b border-gray-50">
          <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
          <TableCell className="text-gray-600">{item.local_nome}</TableCell>
          <TableCell className="text-gray-600 font-mono text-sm">{item.numero_lote || '—'}</TableCell>
          <TableCell className="text-right font-bold text-red-600">{formatNumber(item.quantidade)}</TableCell>
          <TableCell className="text-right">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              {item.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </TableCell>
          <TableCell className="text-right">{acoesNegativo(item)}</TableCell>
        </TableRow>
      ),
    },
    {
      key: 'duplicado',
      titulo: 'Lotes ativos duplicados',
      descricao: 'Mesmo produto, local e número de lote aparecendo em mais de um lote ativo — pode indicar lançamento repetido em vez de atualização do lote existente.',
      icon: Copy,
      color: 'amber',
      itens: duplicados,
      colunas: ['Produto', 'Local', 'Lote', 'Qtd.', 'Criado em', 'Ações'],
      renderRow: (item, idx) => (
        <TableRow key={item.id || idx} className="border-b border-gray-50">
          <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
          <TableCell className="text-gray-600">{item.local_nome}</TableCell>
          <TableCell className="text-gray-600 font-mono text-sm">{item.numero_lote || '—'}</TableCell>
          <TableCell className="text-right font-bold text-gray-900">{formatNumber(item.quantidade)}</TableCell>
          <TableCell className="text-right text-gray-500 text-sm">
            {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '—'}
          </TableCell>
          <TableCell className="text-right">{acoesAtivo(item)}</TableCell>
        </TableRow>
      ),
    },
    {
      key: 'orfao',
      titulo: 'Lotes órfãos',
      descricao: 'Lotes referenciando produto, local ou lote de origem que não existem mais na base — normalmente sobra de um cadastro excluído.',
      icon: Link2Off,
      color: 'slate',
      itens: orfaos,
      colunas: ['Produto', 'Local', 'Lote', 'Qtd.', 'Motivo', 'Ações'],
      renderRow: (item, idx) => (
        <TableRow key={item.id || idx} className="border-b border-gray-50">
          <TableCell className="font-semibold text-gray-900">{item.produto_nome}</TableCell>
          <TableCell className="text-gray-600">{item.local_nome}</TableCell>
          <TableCell className="text-gray-600 font-mono text-sm">{item.numero_lote || '—'}</TableCell>
          <TableCell className="text-right font-bold text-gray-900">{formatNumber(item.quantidade)}</TableCell>
          <TableCell className="text-right text-slate-600 text-sm">{item.motivo}</TableCell>
          <TableCell className="text-right">{item.ativo ? acoesAtivo(item) : acoesNegativo(item)}</TableCell>
        </TableRow>
      ),
    },
  ];

  const colorClasses = {
    red: { bg: 'bg-red-600', soft: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
    orange: { bg: 'bg-orange-500', soft: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100' },
    amber: { bg: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
    slate: { bg: 'bg-slate-600', soft: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  };

  if (!empresaId) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-red-100 mt-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
      </div>
    </DashboardLayout>
  );

  return (
    <>
      <Helmet><title>Saúde do Estoque - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="h-7 w-7 text-red-500" /> Saúde do Estoque
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Checagens automáticas de consistência do estoque. Cada ação abaixo pede confirmação e fica registrada na auditoria.
              </p>
            </div>
            <Button onClick={fetchSaude} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Verificar agora
            </Button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl shadow-sm border border-gray-100">
              <Loader2 className="h-10 w-10 animate-spin text-red-500 mb-4" />
              <span className="text-gray-500">Rodando verificações...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl shadow-sm border border-gray-100">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-gray-500 mb-4">{error}</p>
              <Button onClick={fetchSaude} className="gap-2"><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {checks.map(({ key, titulo, itens, icon: Icon, color }) => (
                  <div key={key} className={`${colorClasses[color].bg} text-white rounded-2xl p-4 relative overflow-hidden`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">{titulo}</p>
                      <Icon className="h-5 w-5 opacity-70" />
                    </div>
                    <p className="text-3xl font-black">{itens.length}</p>
                    <p className="text-xs opacity-70 mt-0.5">lote{itens.length === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>

              {lastCheckedAt && (
                <p className="text-xs text-gray-400">
                  Última verificação: {lastCheckedAt.toLocaleString('pt-BR')}
                </p>
              )}

              {totalProblemas === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 flex flex-col items-center">
                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="text-gray-700 font-semibold">Nenhuma inconsistência encontrada.</p>
                  <p className="text-gray-400 text-sm mt-1">Todos os checks passaram nesta verificação.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {checks.filter(c => c.itens.length > 0).map((check) => {
                    const Icon = check.icon;
                    const cc = colorClasses[check.color];
                    const isOpen = !!expandedChecks[check.key];
                    return (
                      <div key={check.key} className={`bg-white rounded-2xl shadow-sm border ${cc.border} overflow-hidden`}>
                        <button
                          onClick={() => toggleCheck(check.key)}
                          className={`w-full flex items-center justify-between px-5 py-4 ${cc.soft} text-left`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${cc.text}`} />
                            <div>
                              <p className={`font-bold ${cc.text}`}>{check.titulo} · {check.itens.length}</p>
                              <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">{check.descricao}</p>
                            </div>
                          </div>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-white hover:bg-white border-b border-gray-100">
                                  {check.colunas.map((col, i) => (
                                    <TableHead key={i} className={`text-xs font-bold text-gray-500 uppercase ${i > 0 ? 'text-right' : ''}`}>
                                      {col}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {check.itens.map((item, idx) => check.renderRow(item, idx))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <EditLoteModal
          isOpen={showEditModal}
          onClose={() => { setShowEditModal(false); setSelectedLote(null); }}
          onSave={handleSaveEdit}
          lote={selectedLote}
        />

        <ConfirmInactivateLoteModal
          isOpen={showInactivateModal}
          onClose={() => { setShowInactivateModal(false); setSelectedLote(null); }}
          onConfirmInactivate={handleConfirmInactivate}
          lote={selectedLote}
          isInactivating={isInactivating}
        />

        {/* Confirmação de "Zerar quantidade" — só aparece no check de estoque fantasma */}
        <Dialog open={showZerarModal} onOpenChange={(open) => { if (!open && !isZerando) { setShowZerarModal(false); setSelectedLote(null); } }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-full">
                  <Eraser className="h-6 w-6 text-red-600" />
                </div>
                <DialogTitle className="text-xl text-red-600">Zerar Quantidade</DialogTitle>
              </div>
              <DialogDescription className="pt-3 text-base text-gray-700">
                {selectedLote && (
                  <>Zerar o saldo residual do lote <strong>{selectedLote.numero_lote}</strong>?</>
                )}
              </DialogDescription>
            </DialogHeader>

            {selectedLote && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 my-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Produto:</span>
                  <span className="font-semibold text-gray-900">{selectedLote.produto_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Local:</span>
                  <span className="font-semibold text-gray-900">{selectedLote.local_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Quantidade atual:</span>
                  <span className="font-bold text-gray-900">{formatNumber(selectedLote.quantidade_atual)}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 bg-red-50 text-red-800 p-3 rounded-md text-sm border border-red-200 mt-2">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
              <p>
                Esse lote já está inativo/devolvido — este saldo não é vendido nem contado na Auditoria de Mercado, mas segue somando no estoque geral. Zerar aqui só ajusta a quantidade e registra a ação na auditoria; não afeta vendas nem movimentações já lançadas.
              </p>
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowZerarModal(false); setSelectedLote(null); }}
                disabled={isZerando}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmZerar}
                disabled={isZerando}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white"
              >
                {isZerando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Zerando...
                  </>
                ) : (
                  'Zerar quantidade'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}