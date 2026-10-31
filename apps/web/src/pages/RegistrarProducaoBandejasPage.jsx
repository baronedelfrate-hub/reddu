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
import { Loader2, Plus, ArrowLeft, Factory, Package, Calendar, Hash, RotateCcw, CheckCircle2, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LoteTypeSelector from '@/components/lotes/LoteTypeSelector';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function RegistrarProducaoBandejasPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { validateManualLote, validateLotDuplicate, generateAutomaticLote } = useLoteManagement();

  const [produtos, setProdutos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localOrigem, setLocalOrigem] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [recentProducoes, setRecentProducoes] = useState([]);

  const getTodayDateString = () => {
    const today = new Date();
    return new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    produto_id: '',
    quantidade: '',
    unidades_por_bandeja: '',
    data_fabricacao: getTodayDateString(),
    data_validade: '',
  });

  const [loteType, setLoteType] = useState('automatico');
  const [numeroLoteManual, setNumeroLoteManual] = useState('');
  const [loteValidationError, setLoteValidationError] = useState('');

  useEffect(() => {
    if (empresaId) fetchInitialData();
    else setIsLoading(false);
  }, [empresaId]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const { data: locaisData } = await supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('nome', 'ESTOQUE BANDEJAS').maybeSingle();
      if (locaisData) setLocalOrigem(locaisData);
      else toast({ title: 'Aviso', description: 'Local "ESTOQUE BANDEJAS" não encontrado.', variant: 'destructive' });
      const { data, error } = await supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome');
      if (error) throw error;
      setProdutos(data || []);
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecentProducoes = async () => {
    try {
      const { data } = await supabase.from('movimentacoes')
        .select('produto_id, quantidade, data_movimentacao, lotes(numero_lote, data_validade, unidades_por_bandeja), produtos(nome)')
        .eq('empresa_id', empresaId).eq('tipo', 'producao_bandeja')
        .order('data_movimentacao', { ascending: false }).limit(5);
      setRecentProducoes(data || []);
    } catch {}
  };

  useEffect(() => { if (empresaId) fetchRecentProducoes(); }, [empresaId]);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const selectedProduto = produtos.find(p => p.id === formData.produto_id);
  const totalUnidades = (parseInt(formData.quantidade) || 0) * (parseInt(formData.unidades_por_bandeja) || 0);
  const formatDateBR = (d) => { if (!d) return '—'; return d.split('-').reverse().join('/'); };
  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoteValidationError('');
    if (!empresaId || !localOrigem) return;

    if (!formData.produto_id || !formData.quantidade || !formData.data_fabricacao || !formData.data_validade || !formData.unidades_por_bandeja) {
      return toast({ title: 'Campos obrigatórios', description: 'Preencha todos os campos.', variant: 'destructive' });
    }

    const validation = validateMovimentacaoData({ tipo: 'producao_bandeja', quantidade: Number(formData.quantidade) });
    if (!validation.valid) { toast({ title: 'Erro de Sistema', description: validation.error, variant: 'destructive' }); return; }

    if (parseInt(formData.quantidade, 10) <= 0 || parseInt(formData.unidades_por_bandeja, 10) <= 0) {
      return toast({ title: 'Inválido', description: 'Quantidades devem ser maiores que zero.', variant: 'destructive' });
    }

    if (loteType === 'manual') {
      const err = validateManualLote(numeroLoteManual);
      if (err) return setLoteValidationError(err);
    }

    setIsSubmitting(true);
    try {
      let finalNumeroLote = loteType === 'manual'
        ? (numeroLoteManual.startsWith('BDJ-') ? numeroLoteManual : `BDJ-${numeroLoteManual}`)
        : await generateAutomaticLote(empresaId, formData.data_fabricacao);

      const { exists, message } = await validateLotDuplicate(empresaId, formData.produto_id, finalNumeroLote, 'bandeja');
      if (exists) {
        setLoteValidationError(message);
        toast({ title: 'Lote Duplicado', description: `O lote ${finalNumeroLote} já está cadastrado.`, variant: 'destructive' });
        setIsSubmitting(false); return;
      }

      const { data: loteData, error: loteError } = await supabase.from('lotes').insert({
        empresa_id: empresaId, produto_id: formData.produto_id,
        numero_lote: finalNumeroLote, data_validade: formData.data_validade,
        quantidade: parseInt(formData.quantidade, 10),
        local_id: localOrigem.id, tipo_lote: 'bandeja',
        unidades_por_bandeja: parseInt(formData.unidades_por_bandeja, 10)
      }).select().single();

      if (loteError) throw loteError;

      if (loteData) {
        await supabase.from('movimentacoes').insert({
          empresa_id: empresaId, tipo: 'producao_bandeja',
          produto_id: formData.produto_id, lote_id: loteData.id,
          local_origem_id: null, local_destino_id: localOrigem.id,
          quantidade: parseInt(formData.quantidade, 10),
          data_movimentacao: new Date().toISOString(),
          observacao: `Produção Bandejas Direta (${loteType})`
        });
      }

      const qtd = parseInt(formData.quantidade, 10);
      const upb = parseInt(formData.unidades_por_bandeja, 10);
      setSuccessData({
        lote_id: finalNumeroLote,
        produto_nome: selectedProduto?.nome || 'Produto',
        data_validade: formatDateBR(formData.data_validade),
        quantidade: qtd, unidades_por_bandeja: upb,
        total_unidades: qtd * upb
      });
      setShowSuccess(true);
      fetchRecentProducoes();

      toast({ title: 'Bandejas registradas!', description: `Lote ${finalNumeroLote} criado com sucesso.`, className: 'bg-green-600 text-white border-none' });

      setFormData({ produto_id: '', quantidade: '', unidades_por_bandeja: '', data_fabricacao: getTodayDateString(), data_validade: '' });
      setNumeroLoteManual(''); setLoteType('automatico');
      setTimeout(() => setShowSuccess(false), 6000);
    } catch (err) {
      toast({ title: 'Erro ao registrar produção', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet><title>Registrar Bandejas - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Produção de Bandejas</h1>
                <p className="text-gray-500 text-sm mt-0.5">Registre bandejas diretamente no Estoque Bandejas.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {/* Local não encontrado */}
          {!isLoading && !localOrigem && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Factory className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-bold text-red-700">Local não encontrado</p>
                <p className="text-sm text-red-600">O local "ESTOQUE BANDEJAS" não existe no sistema. Crie-o em Cadastros → Locais.</p>
              </div>
            </div>
          )}

          {/* Success banner */}
          {showSuccess && successData && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-800">Bandejas registradas com sucesso!</p>
                <p className="text-green-700 text-sm mt-1">
                  <strong>{successData.produto_nome}</strong> · Lote <strong>{successData.lote_id}</strong>
                </p>
                <div className="flex gap-4 mt-2">
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                    {fmtNum(successData.quantidade)} bandejas
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                    {fmtNum(successData.unidades_por_bandeja)} un/bandeja
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                    {fmtNum(successData.total_unidades)} unidades totais
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Formulário */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-purple-600" />
                  <span className="font-bold text-gray-800 text-sm">Novo Lote de Bandejas</span>
                </div>

                {isLoading ? (
                  <div className="flex justify-center items-center p-16">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                  </div>
                ) : !localOrigem ? (
                  <div className="p-8 text-center text-gray-400">
                    <p>Configure o local "ESTOQUE BANDEJAS" para continuar.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="p-6 space-y-6">

                    {/* Produto */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-gray-400" /> Produto <span className="text-red-500">*</span>
                      </Label>
                      <Select value={formData.produto_id} onValueChange={v => handleChange('produto_id', v)} disabled={isSubmitting}>
                        <SelectTrigger className="h-11 bg-gray-50 border-gray-200 focus:border-purple-400">
                          <SelectValue placeholder="Selecione o produto..." />
                        </SelectTrigger>
                        <SelectContent>
                          {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {selectedProduto && (
                        <p className="text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg">✓ {selectedProduto.nome} selecionado</p>
                      )}
                    </div>

                    {/* Lote */}
                    <LoteTypeSelector
                      loteType={loteType}
                      onLoteTypeChange={v => { setLoteType(v); setLoteValidationError(''); }}
                      numeroLote={numeroLoteManual}
                      onNumeroLoteChange={v => { setNumeroLoteManual(v); setLoteValidationError(''); }}
                      validationError={loteValidationError}
                      disabled={isSubmitting}
                    />

                    {/* Quantidades */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-gray-400" /> Unidades por Bandeja <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="number" min="1" value={formData.unidades_por_bandeja}
                          onChange={e => handleChange('unidades_por_bandeja', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-purple-400 text-lg font-bold text-center"
                          placeholder="0" disabled={isSubmitting} style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Hash className="h-4 w-4 text-gray-400" /> Qtd de Bandejas <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          type="number" min="1" value={formData.quantidade}
                          onChange={e => handleChange('quantidade', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-purple-400 text-lg font-bold text-center"
                          placeholder="0" disabled={isSubmitting} style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    {/* Total de unidades */}
                    {totalUnidades > 0 && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-purple-700 font-semibold">Total de unidades no lote:</span>
                        <span className="text-xl font-black text-purple-700">{fmtNum(totalUnidades)} un.</span>
                      </div>
                    )}

                    {/* Datas */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" /> Fabricação <span className="text-red-500">*</span>
                        </Label>
                        <Input type="date" value={formData.data_fabricacao}
                          onChange={e => handleChange('data_fabricacao', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-purple-400"
                          disabled={isSubmitting} style={{ fontSize: '16px' }} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-red-400" /> Validade <span className="text-red-500">*</span>
                        </Label>
                        <Input type="date" value={formData.data_validade}
                          min={formData.data_fabricacao}
                          onChange={e => handleChange('data_validade', e.target.value)}
                          className="h-11 bg-gray-50 border-gray-200 focus:border-purple-400"
                          disabled={isSubmitting} style={{ fontSize: '16px' }} />
                      </div>
                    </div>

                    {/* Preview */}
                    {formData.produto_id && formData.quantidade && formData.unidades_por_bandeja && formData.data_validade && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">Resumo do Lote</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-gray-500">Produto:</span> <span className="font-semibold text-gray-900">{selectedProduto?.nome}</span></div>
                          <div><span className="text-gray-500">Bandejas:</span> <span className="font-semibold text-gray-900">{fmtNum(parseInt(formData.quantidade) || 0)}</span></div>
                          <div><span className="text-gray-500">Un/bandeja:</span> <span className="font-semibold text-gray-900">{fmtNum(parseInt(formData.unidades_por_bandeja) || 0)}</span></div>
                          <div><span className="text-gray-500">Total un.:</span> <span className="font-black text-purple-700">{fmtNum(totalUnidades)}</span></div>
                          <div><span className="text-gray-500">Fabricação:</span> <span className="font-semibold text-gray-900">{formatDateBR(formData.data_fabricacao)}</span></div>
                          <div><span className="text-gray-500">Validade:</span> <span className="font-semibold text-gray-900">{formatDateBR(formData.data_validade)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Botões */}
                    <div className="pt-2 flex gap-3">
                      <Button type="button" variant="outline" disabled={isSubmitting}
                        onClick={() => { setFormData({ produto_id: '', quantidade: '', unidades_por_bandeja: '', data_fabricacao: getTodayDateString(), data_validade: '' }); setNumeroLoteManual(''); }}
                        className="gap-2">
                        <RotateCcw className="h-4 w-4" /> Limpar
                      </Button>
                      <Button type="submit" disabled={isSubmitting || !localOrigem}
                        className="flex-1 h-12 gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold">
                        {isSubmitting
                          ? <><Loader2 className="h-5 w-5 animate-spin" /> Registrando...</>
                          : <><Plus className="h-5 w-5" /> Registrar Bandejas</>
                        }
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">

              {/* Dica */}
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">💡 Como funciona</p>
                <ul className="text-xs text-purple-700 space-y-1.5">
                  <li>• Registra bandejas no <strong>Estoque Bandejas</strong></li>
                  <li>• Informe quantas bandejas e unidades por bandeja</li>
                  <li>• O total de unidades é calculado automaticamente</li>
                  <li>• Após criar, transfira para mercados ou PDV</li>
                </ul>
              </div>

              {/* Últimas produções */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Últimas Bandejas</p>
                </div>
                {recentProducoes.length === 0 ? (
                  <div className="p-6 text-center">
                    <Layers className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400">Nenhuma produção recente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {recentProducoes.map((p, i) => (
                      <div key={i} className="px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.produtos?.nome || '—'}</p>
                            <p className="text-xs text-gray-500 font-mono">{p.lotes?.numero_lote || '—'}</p>
                            {p.lotes?.unidades_por_bandeja && (
                              <p className="text-xs text-purple-600">{p.lotes.unidades_por_bandeja} un/bandeja</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-purple-600">{fmtNum(p.quantidade)}</p>
                            <p className="text-xs text-gray-400">bandejas</p>
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