import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PackagePlus, AlertCircle, CheckCircle2, ArrowRight, Calendar, Info, MapPin, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { ordenarLotes, formatLoteDisplay } from '@/lib/getLotesOrdenados';
import { useLoteManagement } from '@/hooks/useLoteManagement';

export default function ProduzirBandejasPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { isManualLote, generateAutomaticLote, validateLotDuplicate } = useLoteManagement();
  
  const urlProdutoId = searchParams.get('produto_id');
  const urlQtd = searchParams.get('quantidade_bandejas');
  const urlPedidoId = searchParams.get('pedido_id');
  
  const [produtos, setProdutos] = useState([]);
  const [lotesBase, setLotesBase] = useState([]);
  
  const [selectedProdutoId, setSelectedProdutoId] = useState(urlProdutoId || '');
  const [selectedLoteId, setSelectedLoteId] = useState('');
  const [unidadesPorBandeja, setUnidadesPorBandeja] = useState('');
  const [quantidadeBandejas, setQuantidadeBandejas] = useState(urlQtd || '');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const unidadesInputRef = useRef(null);

  useEffect(() => {
    if (empresaId) fetchProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    if (selectedProdutoId && empresaId) {
      fetchLotesBase(selectedProdutoId);
      setSelectedLoteId('');
      if (!urlQtd) setQuantidadeBandejas('');
      setShowConfirmation(false);
      setSuccessData(null);
    } else {
      setLotesBase([]);
      setSelectedLoteId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProdutoId, empresaId]);

  const fetchProdutos = async () => {
    setIsLoading(true);
    try {
      const { data: lotesData, error: lotesError } = await supabase
        .from('lotes')
        .select('produto_id, locais!inner(nome)')
        .eq('empresa_id', empresaId)
        .eq('tipo_lote', 'base')
        .eq('ativo', true)
        .gt('quantidade', 0)
        .ilike('locais.nome', 'Estoque Central');
      
      if (lotesError) throw lotesError;

      const uniqueProdutoIds = [...new Set(lotesData.map(l => l.produto_id))];
      let prodData = [];
      
      if (uniqueProdutoIds.length > 0) {
        const { data, error: prodError } = await supabase
          .from('produtos')
          .select('id, nome, tem_bandeja')
          .in('id', uniqueProdutoIds)
          .eq('tem_bandeja', true)
          .order('nome');
          
        if (prodError) throw prodError;
        prodData = data || [];
      }

      if (urlProdutoId && !prodData.find(p => p.id === urlProdutoId)) {
        const { data: specificProd, error: specificError } = await supabase
          .from('produtos')
          .select('id, nome, tem_bandeja')
          .eq('id', urlProdutoId)
          .eq('tem_bandeja', true)
          .single();
          
        if (!specificError && specificProd) prodData.push(specificProd);
      }
      setProdutos(prodData);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar produtos do Estoque Central.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLotesBase = async (produtoId) => {
    try {
      const { data, error } = await supabase
        .from('lotes')
        .select(`id, numero_lote, data_validade, quantidade, local_id, lote_devolvido, ativo, produtos!inner(nome, tem_bandeja), locais!inner(nome)`)
        .eq('empresa_id', empresaId)
        .eq('produto_id', produtoId)
        .eq('tipo_lote', 'base')
        .eq('produtos.tem_bandeja', true)
        .ilike('locais.nome', 'Estoque Central')
        .gt('quantidade', 0);
        
      if (error) throw error;
      
      const lotesCompletos = data.map(item => ({ 
        ...item, 
        local_nome: item.locais?.nome || 'Desconhecido', 
        produto_nome: item.produtos?.nome || 'Desconhecido' 
      }));
      setLotesBase(ordenarLotes(lotesCompletos)); // automatically filters inactive lots
      
      if (urlProdutoId && urlQtd) {
        setTimeout(() => {
          if (unidadesInputRef.current) unidadesInputRef.current.focus();
        }, 100);
      }
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao carregar lotes base do Estoque Central.', variant: 'destructive' });
    }
  };

  const handleClear = () => {
    if (!urlProdutoId) setSelectedProdutoId('');
    setSelectedLoteId(''); 
    setUnidadesPorBandeja('');
    if (!urlQtd) setQuantidadeBandejas('');
    setShowConfirmation(false); 
    setSuccessData(null);
  };

  const handleProduceAnother = async () => {
    handleClear();
    await fetchProdutos();
  };

  const selectedLoteInfo = lotesBase.find(l => l.id === selectedLoteId);
  const selectedProdutoInfo = produtos.find(p => p.id === selectedProdutoId);
  const totalSubtrair = (parseInt(unidadesPorBandeja) || 0) * (parseInt(quantidadeBandejas) || 0);
  const saldoApos = selectedLoteInfo ? selectedLoteInfo.quantidade - totalSubtrair : 0;
  const isInvalidAmount = totalSubtrair <= 0 || (selectedLoteInfo && totalSubtrair > selectedLoteInfo.quantidade);

  const handlePreview = (e) => {
    e.preventDefault();
    if (!selectedProdutoId || !selectedLoteId || !unidadesPorBandeja || !quantidadeBandejas) return;
    if (isInvalidAmount) return;
    setShowConfirmation(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const originLoteNum = selectedLoteInfo?.numero_lote;
      let finalNumeroLote;
      
      // Preserve manual lot numbers, otherwise generate an automatic one
      if (isManualLote(originLoteNum)) {
         finalNumeroLote = originLoteNum;
      } else {
         const baseDate = selectedLoteInfo?.data_validade || new Date().toISOString().split('T')[0];
         finalNumeroLote = await generateAutomaticLote(empresaId, baseDate);
      }

      // Check for duplicate BEFORE creating (checking for existing bandeja lot to not clash)
      const { exists, message } = await validateLotDuplicate(empresaId, selectedProdutoId, finalNumeroLote, 'bandeja');
      
      if (exists) {
         toast({ 
           title: 'Lote Duplicado', 
           description: `O lote ${finalNumeroLote} já existe para este produto e não pode ser sobrescrito.`, 
           variant: 'destructive' 
         });
         setIsSubmitting(false);
         setShowConfirmation(false);
         return;
      }

      const payload = {
        empresa_id: empresaId,
        produto_id: selectedProdutoId,
        p_lote_base_id: selectedLoteId,
        unidades_por_bandeja: parseInt(unidadesPorBandeja),
        quantidade_bandejas: parseInt(quantidadeBandejas),
        local_id: selectedLoteInfo.local_id,
        numero_lote_bandeja: finalNumeroLote, 
        p_numero_lote_bandeja: finalNumeroLote 
      };

      const { data, error: funcError } = await supabase.functions.invoke('produzir-bandejas', { body: payload });

      if (funcError) {
         const { data: data2, error: funcError2 } = await supabase.functions.invoke('produzir-bandeja', { body: payload });
        if (funcError2) throw new Error(funcError2.message);
        if (data2 && !data2.success) throw new Error(data2.error);
        setSuccessData({ ...data2, numero_lote: data2.numero_lote || finalNumeroLote });
      } else {
        if (data && !data.success) throw new Error(data.error);
        setSuccessData({ ...data, numero_lote: data.numero_lote || finalNumeroLote });
      }

      setShowConfirmation(false);
      toast({ title: 'Sucesso!', description: `Bandejas geradas no lote ${finalNumeroLote} com sucesso.`, className: 'bg-green-600 text-white border-none' });
    } catch (error) {
      toast({ title: 'Erro ao produzir', description: error.message || 'Falha na comunicação com o servidor.', variant: 'destructive' });
      setShowConfirmation(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = String(d).split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  };

  const previewNomeProduto = selectedProdutoInfo?.nome?.startsWith('Bandeja') 
    ? selectedProdutoInfo.nome 
    : `Bandeja ${selectedProdutoInfo?.nome || ''}`;

  return (
    <>
      <Helmet><title>Produzir Bandejas - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><PackagePlus className="h-6 w-6" /></div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Produzir Bandejas</h1>
              <p className="text-gray-600 mt-1">Gere novos lotes do tipo bandeja a partir de um lote base do Estoque Central.</p>
            </div>
          </div>

          {urlPedidoId && !successData && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
              <LinkIcon className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Vinculado ao Pedido <strong>#{urlPedidoId.substring(0, 8).toUpperCase()}</strong></p>
                <p className="text-xs opacity-80 mt-0.5">As informações foram preenchidas automaticamente baseadas no pedido selecionado.</p>
              </div>
            </div>
          )}

          {successData ? (
            <Card className="border-green-200 bg-green-50 shadow-sm animate-in fade-in zoom-in duration-300">
               <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 text-green-600 rounded-full"><CheckCircle2 className="h-8 w-8" /></div>
                  <div>
                    <CardTitle className="text-green-800 text-xl">Produção Concluída!</CardTitle>
                    <CardDescription className="text-green-600">As bandejas foram geradas e o estoque atualizado.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-green-100 shadow-sm space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500 text-sm block">Novo Lote (Bandeja)</span>
                      <span className="font-bold text-gray-900 text-lg">{successData.numero_lote || 'Gerado Automático'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-sm block">Lote de Origem</span>
                      <span className="font-medium text-gray-700">{successData.lote_base_numero || selectedLoteInfo?.numero_lote}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div>
                      <span className="text-gray-500 text-sm block">Produto</span>
                      <span className="font-medium text-gray-900">{successData.nome_produto || selectedProdutoInfo?.nome}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-sm block">Validade (Herdada)</span>
                      <span className="font-medium text-gray-900 flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {formatDate(successData.data_validade || selectedLoteInfo?.data_validade)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <span className="text-gray-500 text-sm block">Armazenamento</span>
                    <span className="font-medium text-green-700 flex items-center gap-1 mt-1 bg-green-50 p-2 rounded-md border border-green-100">
                      <MapPin className="h-4 w-4" />
                      ESTOQUE BANDEJAS
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <Button onClick={handleProduceAnother} className="w-full bg-green-600 hover:bg-green-700 text-white">
                  Produzir Mais Bandejas
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm border-gray-100">
                  <CardContent className="p-6">
                    <form onSubmit={handlePreview} className="space-y-6">
                      <div className="bg-blue-50 border border-blue-100 rounded-md p-4 mb-4 flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-blue-500 mt-0.5" />
                        <p className="text-sm text-blue-800">
                          <strong>Nota:</strong> Todas as bandejas produzidas serão automaticamente armazenadas no local de sistema <span className="font-semibold">ESTOQUE BANDEJAS</span>. Apenas produtos marcados com "Tem Bandeja?" estão disponíveis.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Produto <span className="text-red-500">*</span></Label>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={fetchProdutos} 
                            disabled={isLoading || showConfirmation || !!urlProdutoId}
                            className="h-6 px-2 text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                            Atualizar
                          </Button>
                        </div>
                        <Select value={selectedProdutoId} onValueChange={setSelectedProdutoId} disabled={isLoading || produtos.length === 0 || showConfirmation || !!urlProdutoId}>
                          <SelectTrigger className="bg-white">
                            <SelectValue 
                              placeholder={
                                isLoading ? "Carregando produtos..." : 
                                produtos.length === 0 ? "Nenhum lote disponível no Estoque Central para produção de bandejas" : 
                                "Selecione o produto"
                              } 
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {produtos.length === 0 && !isLoading && (
                          <p className="text-sm text-orange-600 mt-1 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1 inline" /> Nenhum lote disponível no Estoque Central para produção de bandejas
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Lote de Origem (Base) <span className="text-red-500">*</span></Label>
                        <Select value={selectedLoteId} onValueChange={setSelectedLoteId} disabled={!selectedProdutoId || lotesBase.length === 0 || showConfirmation}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={!selectedProdutoId ? "Selecione um produto primeiro" : lotesBase.length === 0 ? "Nenhum lote base ativo no Estoque Central disponível" : "Selecione o lote base do Estoque Central"} />
                          </SelectTrigger>
                          <SelectContent>
                            {lotesBase.map(l => (
                              <SelectItem 
                                key={l.id} 
                                value={l.id}
                                className={l.lote_devolvido ? "text-orange-600 font-semibold focus:text-orange-700 bg-orange-50/50" : ""}
                              >
                                {formatLoteDisplay(l)} - {l.local_nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Unidades por Bandeja <span className="text-red-500">*</span></Label>
                          <Input
                            ref={unidadesInputRef}
                            type="number" min="1" placeholder="Ex: 30"
                            value={unidadesPorBandeja} onChange={e => setUnidadesPorBandeja(e.target.value)}
                            disabled={!selectedLoteId || showConfirmation} className="bg-white text-gray-900"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Quantidade de Bandejas <span className="text-red-500">*</span></Label>
                          <Input
                            type="number" min="1" placeholder="Ex: 5"
                            value={quantidadeBandejas} onChange={e => setQuantidadeBandejas(e.target.value)}
                            disabled={!selectedLoteId || showConfirmation || !!urlQtd} className="bg-white text-gray-900"
                          />
                        </div>
                      </div>

                      {!showConfirmation && (
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                          <Button type="button" variant="outline" onClick={handleClear}>Cancelar</Button>
                          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={!selectedLoteId || isInvalidAmount || !unidadesPorBandeja || !quantidadeBandejas}>
                            Revisar Produção <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </form>
                  </CardContent>
                </Card>

                {showConfirmation && selectedLoteInfo && (
                  <Card className="border-indigo-200 bg-indigo-50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <CardHeader className="pb-3 border-b border-indigo-100">
                      <CardTitle className="text-indigo-900 flex items-center text-lg">
                        <Info className="h-5 w-5 mr-2 text-indigo-600" /> Confirmar Detalhes da Produção
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">Lote de Origem</h4>
                          <div className="bg-white p-3 rounded border border-gray-200 text-sm space-y-2">
                            <p><span className="text-gray-500">Lote:</span> <span className="font-medium">{selectedLoteInfo.numero_lote}</span></p>
                            <p><span className="text-gray-500">Produto:</span> <span className="font-medium">{selectedProdutoInfo?.nome}</span></p>
                            <p><span className="text-gray-500">Local:</span> <span className="font-medium">{selectedLoteInfo.local_nome}</span></p>
                            <p><span className="text-gray-500">Validade:</span> <span className="font-medium">{formatDate(selectedLoteInfo.data_validade)}</span></p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-indigo-700 text-sm uppercase tracking-wider">Nova Bandeja (Preview)</h4>
                          <div className="bg-indigo-100/50 p-3 rounded border border-indigo-200 text-sm space-y-2">
                            <p><span className="text-indigo-600/70">Formato:</span> <span className="font-medium text-indigo-900">
                              {isManualLote(selectedLoteInfo.numero_lote) ? 'Preservado (Manual)' : 'Automático (YYYYMMDD-SEQ)'}
                            </span></p>
                            <p><span className="text-indigo-600/70">Lote Final:</span> <span className="font-bold text-indigo-900">
                              {isManualLote(selectedLoteInfo.numero_lote) ? selectedLoteInfo.numero_lote : 'A Gerar Automaticamente'}
                            </span></p>
                            <p><span className="text-indigo-600/70">Produto:</span> <span className="font-medium text-indigo-900">{previewNomeProduto}</span></p>
                            <p><span className="text-indigo-600/70">Validade:</span> <span className="font-medium text-indigo-900">{formatDate(selectedLoteInfo.data_validade)} (Copiada)</span></p>
                            <p className="pt-2 border-t border-indigo-200/50 mt-2">
                              <span className="text-indigo-600/70">Local de armazenamento:</span> <br/>
                              <span className="font-bold text-indigo-900 inline-flex items-center gap-1 mt-1">
                                <MapPin className="h-4 w-4" /> ESTOQUE BANDEJAS
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => setShowConfirmation(false)} disabled={isSubmitting} className="bg-white">
                        Voltar e Editar
                      </Button>
                      <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Confirmar e Gerar Lote
                      </Button>
                    </CardFooter>
                  </Card>
                )}
              </div>

              <div>
                <Card className="sticky top-6 shadow-sm border-gray-100">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b">Resumo da Operação</h3>
                    <div className="space-y-4 text-sm">
                      <div>
                        <span className="text-gray-500 block">Lote Base:</span>
                        <span className="font-medium text-gray-900">{selectedLoteInfo ? selectedLoteInfo.numero_lote : '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Saldo Atual (Base):</span>
                        <span className="font-medium text-gray-900">{selectedLoteInfo ? selectedLoteInfo.quantidade : '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Total a subtrair (Unidades):</span>
                        <span className={`font-semibold ${totalSubtrair > 0 ? 'text-indigo-600' : 'text-gray-900'}`}>{totalSubtrair || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Saldo Após Produção:</span>
                        <span className={`font-semibold ${saldoApos < 0 ? 'text-red-600' : 'text-green-600'}`}>{selectedLoteInfo ? saldoApos : '—'}</span>
                      </div>

                      {isInvalidAmount && totalSubtrair > 0 && selectedLoteInfo && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-100 flex items-start text-xs">
                          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                          Quantidade excede o saldo disponível no lote base.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}