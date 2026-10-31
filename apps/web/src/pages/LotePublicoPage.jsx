import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Package, MapPin, Calendar, Hash, AlertTriangle, CheckCircle2, RotateCcw, Loader2, ArrowRightLeft, ArrowUpFromLine, ShoppingCart, Trash2, ClipboardCheck, X, ChevronDown } from 'lucide-react';

export default function LotePublicoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, empresaId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loteData, setLoteData] = useState(null);

  // Transfer modal state
  const [showTransfer, setShowTransfer] = useState(false);
  const [locais, setLocais] = useState([]);
  const [destinoId, setDestinoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferError, setTransferError] = useState(null);

  useEffect(() => {
    const fetchLoteDetails = async () => {
      if (!id) { setError("ID do lote não fornecido."); setLoading(false); return; }
      try {
        setLoading(true);
        setError(null);

        const { data: lote, error: loteError } = await supabase
          .from('lotes').select('*').eq('id', id).single();
        if (loteError || !lote) throw new Error('Lote não encontrado ou indisponível.');

        const { data: produto } = await supabase
          .from('produtos').select('nome').eq('id', lote.produto_id).single();

        const { data: local } = await supabase
          .from('locais').select('nome').eq('id', lote.local_id).single();

        setLoteData({ ...lote, produto_nome: produto?.nome || 'Produto desconhecido', local_nome: local?.nome || 'Local desconhecido' });
        setQuantidade(String(lote.quantidade || 1));
      } catch (err) {
        setError(err.message || "Erro ao buscar informações do lote.");
      } finally {
        setLoading(false);
      }
    };
    fetchLoteDetails();
  }, [id]);

  // Load locais when transfer modal opens
  useEffect(() => {
    if (!showTransfer || !empresaId) return;
    supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome')
      .then(({ data }) => setLocais(data || []));
  }, [showTransfer, empresaId]);

  const handleTransfer = async () => {
    if (!destinoId) { setTransferError('Selecione o local de destino.'); return; }
    const qtd = parseInt(quantidade);
    if (!qtd || qtd <= 0) { setTransferError('Informe uma quantidade válida.'); return; }
    if (qtd > loteData.quantidade) { setTransferError(`Quantidade máxima disponível: ${loteData.quantidade}`); return; }

    setTransferLoading(true);
    setTransferError(null);
    try {
      const { error } = await supabase.rpc('transferir_estoque_rpc', {
        p_empresa_id: empresaId,
        p_lote_id: loteData.id,
        p_local_origem_id: loteData.local_id,
        p_local_destino_id: destinoId,
        p_quantidade: qtd,
        p_produto_id: loteData.produto_id,
        p_tipo_lote: loteData.tipo_lote,
        p_unidades_por_bandeja: loteData.unidades_por_bandeja
      });
      if (error) throw error;

      if (window.navigator.vibrate) window.navigator.vibrate(100);
      setTransferSuccess(true);

      // Refresh lote data
      const { data: loteAtualizado } = await supabase.from('lotes').select('*').eq('id', id).single();
      const { data: localNovo } = await supabase.from('locais').select('nome').eq('id', destinoId).single();
      if (loteAtualizado) {
        setLoteData(prev => ({ ...prev, ...loteAtualizado, local_nome: localNovo?.nome || prev.local_nome }));
      }

      setTimeout(() => { setShowTransfer(false); setTransferSuccess(false); setDestinoId(''); }, 2000);
    } catch (err) {
      setTransferError(err.message || 'Erro ao transferir. Tente novamente.');
    } finally {
      setTransferLoading(false);
    }
  };

  const getStatus = (lote) => {
    if (!lote) return null;
    if (lote.lote_devolvido) return { id: 'devolvido', label: 'Devolvido', icon: RotateCcw, className: 'status-badge-devolvido' };
    if (lote.data_validade) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [year, month, day] = lote.data_validade.split('-');
      if (new Date(year, month - 1, day) < today) return { id: 'vencido', label: 'Vencido', icon: AlertTriangle, className: 'status-badge-vencido' };
    }
    return { id: 'normal', label: 'Normal', icon: CheckCircle2, className: 'status-badge-normal' };
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try { const [year, month, day] = dateString.split('T')[0].split('-'); return `${day}/${month}/${year}`; }
    catch { return dateString; }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
      <p className="text-gray-600 font-medium text-lg text-center">Buscando informações do lote...</p>
    </div>
  );

  if (error || !loteData) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Helmet><title>Erro - Lote Não Encontrado</title></Helmet>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-100 max-w-md w-full text-center">
        <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ops! Ocorreu um erro</h1>
        <p className="text-gray-600">{error || "Não foi possível carregar os dados deste lote."}</p>
      </div>
    </div>
  );

  const status = getStatus(loteData);
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 font-sans">
      <Helmet><title>Lote {loteData.numero_lote} — {loteData.produto_nome}</title></Helmet>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-slate-900 p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-slate-800 opacity-50 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-slate-800 opacity-50 pointer-events-none"></div>
          <Package className="h-14 w-14 text-blue-400 mx-auto mb-4 relative z-10" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1 relative z-10 leading-tight">{loteData.produto_nome}</h1>
          <div className="flex items-center justify-center gap-2 text-slate-300 mt-2 relative z-10">
            <Hash className="h-4 w-4" />
            <span className="font-mono text-lg tracking-wider bg-slate-800 px-3 py-1 rounded-lg">{loteData.numero_lote}</span>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Status badge */}
          <div className="flex justify-center -mt-10 relative z-20 mb-6">
            <div className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm shadow-md border-2 ${status.className}`}>
              <StatusIcon className="h-5 w-5" />
              <span className="uppercase tracking-wide">{status.label}</span>
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-gray-400" />Localização Atual
              </span>
              <span className="text-lg font-bold text-gray-900">{loteData.local_nome}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-gray-400" />Validade
                </span>
                <span className={`text-lg font-bold ${status.id === 'vencido' ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatDate(loteData.data_validade)}
                </span>
              </div>

              <div className="flex flex-col bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-gray-400" />Quantidade
                </span>
                <span className="text-2xl font-black text-blue-600 leading-none">
                  {loteData.quantidade}<span className="text-sm font-medium text-gray-500 ml-1">unid</span>
                </span>
              </div>
            </div>
          </div>

          {/* Actions — logged in users only */}
          {currentUser && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Ações Disponíveis</p>
              <button
                onClick={() => { setShowTransfer(true); setTransferSuccess(false); setTransferError(null); }}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 active:scale-95 transition-all"
              >
                <ArrowRightLeft className="h-6 w-6 text-amber-600" />
                <span className="text-base font-bold text-amber-700">Transferir Lote</span>
              </button>
            </div>
          )}

          {!currentUser && (
            <div className="pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 font-medium mb-2">Para realizar ações neste lote</p>
              <button onClick={() => navigate(`/login?redirect=/estoque/lote/${id}`)} className="text-sm font-bold text-blue-600 hover:underline">
                Faça login no sistema →
              </button>
            </div>
          )}

          <div className="text-center pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium">Informação em tempo real do sistema Estoque 360</p>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="bg-amber-50 border-b border-amber-100 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-xl">
                  <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Transferir Lote</p>
                  <p className="text-xs text-gray-500 font-mono">{loteData.numero_lote}</p>
                </div>
              </div>
              <button onClick={() => setShowTransfer(false)} className="p-2 hover:bg-amber-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Success state */}
              {transferSuccess ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
                  <p className="text-xl font-bold text-gray-900">Transferência realizada!</p>
                  <p className="text-sm text-gray-500 mt-1">O lote foi transferido com sucesso.</p>
                </div>
              ) : (
                <>
                  {/* Origin info */}
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Origem atual</p>
                    <p className="font-bold text-gray-900 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />{loteData.local_nome}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Disponível: <span className="font-bold text-blue-600">{loteData.quantidade} unidades</span>
                    </p>
                  </div>

                  {/* Quantity input */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade a transferir</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQuantidade(q => String(Math.max(1, parseInt(q || 1) - 1)))}
                        className="h-12 w-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                      >−</button>
                      <input
                        type="number"
                        value={quantidade}
                        onChange={e => setQuantidade(e.target.value)}
                        min={1}
                        max={loteData.quantidade}
                        className="flex-1 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-amber-400 focus:outline-none"
                        style={{ fontSize: '18px' }}
                      />
                      <button
                        onClick={() => setQuantidade(q => String(Math.min(loteData.quantidade, parseInt(q || 0) + 1)))}
                        className="h-12 w-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                      >+</button>
                    </div>
                  </div>

                  {/* Destination select */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Local de destino</label>
                    <div className="relative">
                      <select
                        value={destinoId}
                        onChange={e => { setDestinoId(e.target.value); setTransferError(null); }}
                        className="w-full h-12 px-4 pr-10 border-2 border-gray-200 rounded-xl focus:border-amber-400 focus:outline-none appearance-none bg-white font-medium text-gray-800"
                        style={{ fontSize: '16px' }}
                      >
                        <option value="">Selecione o destino...</option>
                        {locais.filter(l => l.id !== loteData.local_id).map(l => (
                          <option key={l.id} value={l.id}>{l.nome}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Error */}
                  {transferError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-600 font-medium">{transferError}</p>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    onClick={handleTransfer}
                    disabled={transferLoading || !destinoId}
                    className={`w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                      transferLoading || !destinoId
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95 shadow-lg'
                    }`}
                  >
                    {transferLoading ? (
                      <><Loader2 className="h-5 w-5 animate-spin" /> Transferindo...</>
                    ) : (
                      <><ArrowRightLeft className="h-5 w-5" /> Confirmar Transferência</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}