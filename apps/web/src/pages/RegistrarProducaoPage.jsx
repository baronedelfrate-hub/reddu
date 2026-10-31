import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, ArrowLeft, Factory, CheckCircle2, Package, Calendar, Hash, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LoteTypeSelector from '@/components/lotes/LoteTypeSelector';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function RegistrarProducaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { checkLoteExists, validateManualLote, generateAutomaticLote, createLote } = useLoteManagement();

  const [produtos, setProdutos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [recentProducoes, setRecentProducoes] = useState([]);

  const getTodayDateString = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const initialFormState = {
    produto_id: '',
    quantidade: '',
    data_fabricacao: getTodayDateString(),
    data_validade: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [loteType, setLoteType] = useState('automatico');
  const [numeroLoteManual, setNumeroLoteManual] = useState('');
  const [loteValidationError, setLoteValidationError] = useState('');

  useEffect(() => {
    if (empresaId) { fetchProdutos(); fetchRecentProducoes(); }
    else setIsLoading(false);
  }, [empresaId]);

  const fetchProdutos = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from('produtos').select('id, nome, controla_validade').eq('empresa_id', empresaId).order('nome');
      if (error) throw error;
      setProdutos(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar produtos', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecentProducoes = async () => {
    try {
      const { data } = await supabase.from('movimentacoes')
        .select('produto_id, quantidade, data_movimentacao, lotes(numero_lote, data_validade), produtos(nome)')
        .eq('empresa_id', empresaId).eq('tipo', 'producao')
        .order('data_movimentacao', { ascending: false }).limit(5);
      setRecentProducoes(data || []);
    } catch {}
  };

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const selectedProduto = produtos.find(p => p.id === formData.produto_id);
  const formatDateBR = (d) => { if (!d) return '—'; return d.split('-').reverse().join('/'); };
  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoteValidationError('');
    if (!empresaId) return;

    const validation = validateMovimentacaoData({ tipo: 'producao', quantidade: Number(formData.quantidade) });
    if (!validation.valid) { toast({ title: 'Erro de Sistema', description: validation.error, variant: 'destructive' }); return; }

    setIsSubmitting(true);

    const errors = {};
    if (!formData.produto_id) errors.produto_id = "Selecione o produto.";
    if (!formData.quantidade || parseInt(formData.quantidade, 10) <= 0) errors.quantidade = "Quantidade inválida.";
    if (!formData.data_validade) {
      errors.data_validade = "Data de validade obrigatória.";
    } else {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [year, month, day] = formData.data_validade.split('-');
      if (new Date(year, month - 1, day) <= today) errors.data_validade = "A data de validade deve ser futura.";
    }

    if (Object.keys(errors).length > 0) {
      toast({ title: 'Verifique os campos', description: Object.values(errors).join(' | '), variant: 'destructive' });
      setIsSubmitting(false); return;
    }

    if (loteType === 'manual') {
      const legacyStrErr = validateManualLote(numeroLoteManual);
      if (legacyStrErr) { setLoteValidationError(legacyStrErr); setIsSubmitting(false); return; }
      const exists = await checkLoteExists(empresaId, formData.produto_id, numeroLoteManual);
      if (exists) { setLoteValidationError('Este lote já existe.'); setIsSubmitting(false); return; }
    }

    try {
      let localId = null;
      const { data: locais } = await supabase.from('locais').select('id').eq('empresa_id', empresaId).ilike('nome', '%estoque central%').limit(1);
      if (locais?.length > 0) localId = locais[0].id;
      else {
        const { data: fb } = await supabase.from('locais').select('id').eq('empresa_id', empresaId).eq('tipo', 'Armazém').limit(1);
        if (fb?.length > 0) localId = fb[0].id;
        else throw new Error('Nenhum local de armazenamento encontrado.');
      }

      const finalNumeroLote = loteType === 'manual' ? numeroLoteManual : await generateAutomaticLote(empresaId, formData.data_fabricacao);
      const qtd = parseInt(formData.quantidade, 10);

      const creationResult = await createLote({
        empresa_id: empresaId, produto_id: formData.produto_id,
        numero_lote: finalNumeroLote, data_validade: formData.data_validade || null,
        quantidade: qtd, local_id: localId, tipo_lote: 'base'
      });

      if (!creationResult.success) throw new Error(creationResult.error);
      const loteData = creationResult.data;
      const produtoNome = selectedProduto?.nome || 'Produto';

      if (loteData) {
        await supabase.from('movimentacoes').insert({
          empresa_id: empresaId, tipo: 'producao',
          produto_id: formData.produto_id, lote_id: loteData.id,
          local_origem_id: null, local_destino_id: localId,
          quantidade: qtd, data_movimentacao: new Date().toISOString(),
          observacao: `Produção registrada (${loteType})`
        });
      }

      setSuccessData({ lote_id: finalNumeroLote, produto_nome: produtoNome, data_validade: formatDateBR(formData.data_validade), quantidade: qtd });
      setShowSuccess(true);
      fetchRecentProducoes();

      toast({
        title: <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /><span>Lote criado com sucesso!</span></div>,
        className: 'bg-green-600 text-white border-none', duration: 5000,
      });

      setTimeout(() => { setFormData(initialFormState); setNumeroLoteManual(''); setLoteType('automatico'); }, 3000);
      setTimeout(() => setShowSuccess(false), 6000);
    } catch (err) {
      toast({ title: 'Erro ao criar lote', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!empresaId) return <DashboardLayout><div className="p-12"><p>Aguardando empresa...</p></div></DashboardLayout>;

  return (
    <>
      <Helmet><title>Registrar Produção - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Factory className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Registrar Produção</h1>
                <p className="text-gray-500 text-sm mt-0.5">Crie um novo lote no Estoque Central.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {/* Success banner */}
          {showSuccess && successData && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex items-start gap-4 animate-in slide-in-from-top-2">
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-800">Lote registrado com sucesso!</p>
                <p className="text-green-700 text-sm mt-1">
                  <strong>{successData.produto_nome}</strong> · Lote <strong>{successData.lote_id}</strong> · {fmtNum(successData.quantidade)} unidades · Val: {successData.data_validade}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Formulário */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-blue-600" />
                  <span className="font-bold text-gray-800 text-sm">Novo Lote de Produção</span>
                </div>

                {isLoading ? (
                  <div className="flex justify-center items-center p-16">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="p-6 space-y-6">

                    {/* Produto */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-gray-400" /> Produto Produzido <span className="text-red-500">*</span>
                      </Label>
                      <Select value={formData.produto_id} onValueChange={(v) => handleChange('produto_id', v)} disabled={isSubmitting}>
                        <SelectTrigger className="h-11 bg-gray-50 border-gray-200 focus:border-blue-400">
                          <SelectValue placeholder="Selecione o produto fabricado..." />
                        </SelectTrigger>
                        <SelectContent>
                          {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {selectedProduto && (
                        <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                          ✓ {selectedProduto.nome} selecionado
                        </p>
                      )}
                    </div>

                    {/* Lote */}
                    <div>
                      <LoteTypeSelector
                        loteType={loteType} onLoteTypeChange={setLoteType}
                        numeroLote={numeroLoteManual} onNumeroLoteChange={setNumeroLoteManual}
                        validationError={loteValidationError} disabled={isSubmitting}
                      />
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <Hash className="h-4 w-4 text-gray-400" /> Quantidade Produzida <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number" min="1" value={formData.quantidade}
                        onChange={(e) => handleChange('quantidade', e.target.value)}
                        className="h-11 bg-gray-50 border-gray-200 focus:border-blue-400 text-lg font-bold"
                        placeholder="0" disabled={isSubmitting}
                        style={{ fontSize: '16px' }}
                      />
                    </div>

                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" /> Data de Fabricação <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="date" value={formData.data_fabricacao}
                          onChange={(e) => handleChange('data_fabricacao', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-blue-400"
                          disabled={isSubmitting} style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-red-400" /> Data de Validade <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="date" value={formData.data_validade}
                          min={formData.data_fabricacao}
                          onChange={(e) => handleChange('data_validade', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-blue-400"
                          disabled={isSubmitting} style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    {/* Preview do lote */}
                    {formData.produto_id && formData.quantidade && formData.data_validade && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Resumo do Lote</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-gray-500">Produto:</span> <span className="font-semibold text-gray-900">{selectedProduto?.nome}</span></div>
                          <div><span className="text-gray-500">Qtd:</span> <span className="font-semibold text-gray-900">{fmtNum(parseInt(formData.quantidade) || 0)} un.</span></div>
                          <div><span className="text-gray-500">Fabricação:</span> <span className="font-semibold text-gray-900">{formatDateBR(formData.data_fabricacao)}</span></div>
                          <div><span className="text-gray-500">Validade:</span> <span className="font-semibold text-gray-900">{formatDateBR(formData.data_validade)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Botões */}
                    <div className="pt-2 flex gap-3">
                      <Button type="button" variant="outline" onClick={() => { setFormData(initialFormState); setNumeroLoteManual(''); }} disabled={isSubmitting} className="gap-2">
                        <RotateCcw className="h-4 w-4" /> Limpar
                      </Button>
                      <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                        {isSubmitting
                          ? <><Loader2 className="h-5 w-5 animate-spin" /> Registrando...</>
                          : <><Plus className="h-5 w-5" /> Registrar Produção</>
                        }
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Sidebar — produções recentes */}
            <div className="space-y-4">
              {/* Dica */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">💡 Como funciona</p>
                <ul className="text-xs text-blue-700 space-y-1.5">
                  <li>• O lote será criado no <strong>Estoque Central</strong></li>
                  <li>• Número automático: gerado pelo sistema</li>
                  <li>• Número manual: você define o código</li>
                  <li>• Após criar, transfira para outros locais</li>
                </ul>
              </div>

              {/* Produções recentes */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Últimas Produções</p>
                </div>
                {recentProducoes.length === 0 ? (
                  <div className="p-6 text-center">
                    <Factory className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400">Nenhuma produção recente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {recentProducoes.map((p, i) => (
                      <div key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.produtos?.nome || '—'}</p>
                            <p className="text-xs text-gray-500 font-mono">{p.lotes?.numero_lote || '—'}</p>
                            {p.lotes?.data_validade && (
                              <p className="text-xs text-gray-400">Val: {formatDateBR(p.lotes.data_validade)}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-blue-600">{fmtNum(p.quantidade)}</p>
                            <p className="text-xs text-gray-400">un.</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </DashboardLayout>
    </>
  );
}