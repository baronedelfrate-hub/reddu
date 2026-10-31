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
import { Loader2, Plus, ArrowLeft, Factory } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LoteTypeSelector from '@/components/lotes/LoteTypeSelector';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { generateAutomaticLot, validateLotDuplicate } from '@/lib/lotFormatUtils';

export default function RegistrarProducaoClassicosPage() {
  console.log('[RegistrarProducaoClassicosPage] Component rendering');
  
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { validateManualLote } = useLoteManagement();

  const [produtos, setProdutos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localOrigem, setLocalOrigem] = useState(null);
  
  const getTodayDateString = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    produto_id: '',
    quantidade: '',
    data_fabricacao: getTodayDateString(),
    data_validade: '',
  });

  const [loteType, setLoteType] = useState('automatico');
  const [numeroLoteManual, setNumeroLoteManual] = useState('');
  const [loteValidationError, setLoteValidationError] = useState('');

  useEffect(() => {
    if (empresaId) {
      console.log('[RegistrarProducaoClassicosPage] Fetching initial data');
      fetchInitialData();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      
      const { data: locaisData } = await supabase
        .from('locais')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .eq('nome', 'ESTOQUE CLÁSSICOS')
        .maybeSingle();

      if (locaisData) {
        setLocalOrigem(locaisData);
      } else {
        toast({ title: 'Aviso', description: 'Local "ESTOQUE CLÁSSICOS" não encontrado.', variant: 'destructive' });
      }

      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, controla_validade')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (error) throw error;
      setProdutos(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar dados iniciais', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoteValidationError('');
    
    if (!empresaId) return;

    if (!localOrigem) {
       toast({ title: 'Erro', description: 'Local de destino não configurado.', variant: 'destructive' });
       return;
    }

    if (!formData.produto_id || !formData.quantidade || !formData.data_fabricacao || !formData.data_validade) {
      toast({ title: 'Campos obrigatórios', description: 'Por favor, preencha todos os campos do formulário.', variant: 'destructive' });
      return;
    }

    if (parseInt(formData.quantidade, 10) <= 0) {
      toast({ title: 'Quantidade inválida', description: 'A quantidade deve ser maior que zero.', variant: 'destructive' });
      return;
    }

    if (new Date(formData.data_validade) < new Date(formData.data_fabricacao)) {
      toast({ title: 'Datas inválidas', description: 'A data de validade não pode ser anterior à data de fabricação.', variant: 'destructive' });
      return;
    }

    if (loteType === 'manual') {
      const err = validateManualLote(numeroLoteManual);
      if (err) {
        setLoteValidationError(err);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let finalNumeroLote;
      
      if (loteType === 'manual') {
        finalNumeroLote = numeroLoteManual.startsWith('BDJ-') ? numeroLoteManual : `BDJ-${numeroLoteManual}`;
      } else {
        finalNumeroLote = await generateAutomaticLot(empresaId, formData.data_fabricacao);
      }

      const { exists } = await validateLotDuplicate(supabase, empresaId, finalNumeroLote);
      
      if (exists) {
        const errorMsg = `Lote ${finalNumeroLote} já existe. Não é possível criar lote duplicado.`;
        setLoteValidationError(errorMsg);
        toast({
          title: 'Lote Duplicado',
          description: errorMsg,
          variant: 'destructive'
        });
        setIsSubmitting(false);
        return;
      }

      const qtd = parseInt(formData.quantidade, 10);

      const { data: loteData, error: loteError } = await supabase
        .from('lotes')
        .insert({
          empresa_id: empresaId,
          produto_id: formData.produto_id,
          numero_lote: finalNumeroLote,
          data_validade: formData.data_validade,
          quantidade: qtd,
          local_id: localOrigem.id
        }).select().single();

      if (loteError) throw loteError;

      if (loteData) {
        const { error: movError } = await supabase.from('movimentacoes').insert({
          empresa_id: empresaId,
          tipo: 'producao',
          produto_id: formData.produto_id,
          lote_id: loteData.id,
          local_origem_id: null,
          local_destino_id: localOrigem.id,
          quantidade: qtd,
          data_movimentacao: new Date().toISOString(),
          observacao: `Produção Clássicos (${loteType})`
        });

        if (movError) console.error('Erro ao registrar movimentação:', movError);
      }

      toast({
        title: 'Produção registrada!',
        description: `Lote ${finalNumeroLote} gerado no Estoque Clássicos.`,
        className: 'bg-green-600 text-white border-none'
      });

      setFormData({
        produto_id: '',
        quantidade: '',
        data_fabricacao: getTodayDateString(),
        data_validade: '',
      });
      setNumeroLoteManual('');
      setLoteType('automatico');

    } catch (err) {
      toast({ title: 'Erro ao registrar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet><title>Registrar Produção Clássicos - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Factory className="h-8 w-8 text-blue-600" />
                Registrar Produção (Clássicos)
              </h1>
              <p className="text-gray-600 mt-1">
                Gere lotes de produção diretamente no Estoque Clássicos.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2 bg-white">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-16">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
              </div>
            ) : !localOrigem ? (
              <div className="p-8 text-center bg-red-50 text-red-600">
                O local padrão "ESTOQUE CLÁSSICOS" não foi encontrado no sistema.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-3 md:col-span-2">
                    <Label className="text-gray-900 font-medium text-base">Produto <span className="text-red-500">*</span></Label>
                    <Select value={formData.produto_id} onValueChange={(value) => handleChange('produto_id', value)}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 h-12 text-gray-900 focus:ring-blue-500">
                        <SelectValue placeholder="Selecione o produto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2">
                    <LoteTypeSelector 
                      loteType={loteType}
                      onLoteTypeChange={(val) => { setLoteType(val); setLoteValidationError(''); }}
                      numeroLote={numeroLoteManual}
                      onNumeroLoteChange={(val) => { setNumeroLoteManual(val); setLoteValidationError(''); }}
                      validationError={loteValidationError}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-gray-900 font-medium text-base">Quantidade <span className="text-red-500">*</span></Label>
                    <Input type="number" min="1" value={formData.quantidade} onChange={(e) => handleChange('quantidade', e.target.value)} className="bg-slate-50 border-slate-200 h-12 text-gray-900" required />
                  </div>

                  <div className="hidden md:block"></div>

                  <div className="space-y-3">
                    <Label className="text-gray-900 font-medium text-base">Fabricação <span className="text-red-500">*</span></Label>
                    <Input type="date" value={formData.data_fabricacao} onChange={(e) => handleChange('data_fabricacao', e.target.value)} className="bg-slate-50 border-slate-200 h-12 text-gray-900" required />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-gray-900 font-medium text-base">Validade <span className="text-red-500">*</span></Label>
                    <Input type="date" value={formData.data_validade} min={formData.data_fabricacao} onChange={(e) => handleChange('data_validade', e.target.value)} className="bg-slate-50 border-slate-200 h-12 text-gray-900" required />
                  </div>

                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>Cancelar</Button>
                  <Button type="submit" disabled={isSubmitting} className="px-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Registrar Produção
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}