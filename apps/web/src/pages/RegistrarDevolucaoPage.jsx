import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RotateCcw, ArrowLeft, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { withEstoqueBandejas, STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';

const MOTIVOS_DEVOLUCAO = [
  { value: 'troca', label: 'Troca de Produto' },
  { value: 'danificado', label: 'Danificado/Avariado no Ponto' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'avaria_transporte', label: 'Avaria de Transporte' },
  { value: 'outro', label: 'Outro' },
];

const isValidUUID = (uuid) => {
  return typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
};

export default function RegistrarDevolucaoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [mercados, setMercados] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [lotes, setLotes] = useState([]);

  const [mercadoId, setMercadoId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false);
  const [isLoadingLotes, setIsLoadingLotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (empresaId) {
      fetchInitialData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    if (mercadoId && empresaId && isValidUUID(mercadoId)) {
      fetchProdutosPorMercado(mercadoId);
    } else {
      setProdutos([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mercadoId, empresaId]);

  useEffect(() => {
    if (mercadoId && produtoId && isValidUUID(mercadoId) && isValidUUID(produtoId)) {
      fetchLotes(mercadoId, produtoId);
    } else {
      setLotes([]);
      setLoteId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mercadoId, produtoId]);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setSubmitError(null);
    try {
      const { data: locaisData, error: locaisError } = await supabase
        .from('locais')
        .select('id, nome, tipo')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'Mercado')
        .order('nome');

      if (locaisError) throw locaisError;
      setMercados(withEstoqueBandejas(locaisData || []));
    } catch (error) {
      console.error('Error fetching initial data:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar mercados.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProdutosPorMercado = async (selectedMercado) => {
    setIsLoadingProdutos(true);
    try {
      const { data, error } = await supabase
        .from('estoque_por_local')
        .select('produto_id, produto_nome')
        .eq('empresa_id', empresaId)
        .eq('local_id', selectedMercado)
        .gt('quantidade_atual', 0);

      if (error) throw error;

      // Extract unique products
      const uniqueProductsMap = new Map();
      (data || []).forEach(item => {
        if (!uniqueProductsMap.has(item.produto_id)) {
          uniqueProductsMap.set(item.produto_id, {
            id: item.produto_id,
            nome: item.produto_nome
          });
        }
      });

      const uniqueProducts = Array.from(uniqueProductsMap.values())
        .sort((a, b) => a.nome.localeCompare(b.nome));

      setProdutos(uniqueProducts);
    } catch (error) {
      console.error('Error fetching products by market:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar produtos disponíveis neste mercado.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingProdutos(false);
    }
  };

  const fetchLotes = async (selectedMercado, selectedProduto) => {
    setIsLoadingLotes(true);
    try {
      const query = supabase
        .from('estoque_por_local')
        .select('lote_id, numero_lote, quantidade_atual, local_id')
        .eq('empresa_id', empresaId)
        .eq('local_id', selectedMercado)
        .eq('produto_id', selectedProduto)
        .gt('quantidade_atual', 0)
        .order('numero_lote');

      const { data, error } = await query;

      if (error) throw error;

      const mappedLotes = (data || []).map((item) => ({
        id: item.lote_id,
        numero_lote: item.numero_lote,
        quantidade_disponivel: Number(item.quantidade_atual),
        local_id: item.local_id
      }));

      setLotes(mappedLotes);
      setLoteId('');
    } catch (error) {
      console.error('Error fetching lotes:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar lotes disponíveis do mercado.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingLotes(false);
    }
  };

  const handleMercadoChange = (value) => {
    setMercadoId(value);
    setProdutoId('');
    setLotes([]);
    setLoteId('');
    setQuantidade('');
    setSubmitError(null);
    setSuccessData(null);
  };

  const handleProdutoChange = (value) => {
    setProdutoId(value);
    setLotes([]);
    setLoteId('');
    setQuantidade('');
    setSubmitError(null);
    setSuccessData(null);
  };

  const handleLoteChange = (value) => {
    setLoteId(value);
    setSubmitError(null);
    setSuccessData(null);
  };

  const validatePreSubmission = () => {
    setSubmitError(null);
    
    if (!empresaId) {
      setSubmitError('Sessão expirada ou empresa não identificada.');
      return false;
    }
    if (!mercadoId || !isValidUUID(mercadoId)) {
      setSubmitError('Selecione um mercado de origem válido.');
      return false;
    }
    if (!produtoId || !isValidUUID(produtoId)) {
      setSubmitError('Selecione um produto válido.');
      return false;
    }
    if (!loteId || !isValidUUID(loteId)) {
      setSubmitError('Selecione um lote válido.');
      return false;
    }
    if (!motivoDevolucao) {
      setSubmitError('Selecione o motivo da devolução.');
      return false;
    }

    const qtd = Number(quantidade);
    if (!quantidade || isNaN(qtd) || qtd <= 0) {
      setSubmitError('A quantidade deve ser um número válido maior que zero.');
      return false;
    }
    
    const selectedLote = lotes.find(l => l.id === loteId);
    if (selectedLote && qtd > selectedLote.quantidade_disponivel) {
      setSubmitError(`A quantidade solicitada (${qtd}) é maior que a disponível no lote (${selectedLote.quantidade_disponivel}).`);
      return false;
    }

    if (!dataDevolucao) {
      setSubmitError('Informe a data da devolução.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validatePreSubmission()) {
      return;
    }

    if (mercadoId === STATIC_ESTOQUE_BANDEJAS_ID) {
      setSubmitError('O local "Estoque Bandejas" não pode ser origem direta através desta página, a menos que processado no backend.');
      toast({ title: 'Ação não permitida', description: 'O local estático não suporta registro direto de devolução via formulário se não possuir UUID real sincronizado.', variant: 'destructive'});
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessData(null);
    
    const qtd = Number(quantidade);

    try {
      const { data: rpcData, error } = await supabase.rpc('rpc_devolucao', {
        p_empresa_id: empresaId,
        p_local_origem_id: mercadoId,
        p_produto_id: produtoId,
        p_lote_id: loteId,
        p_quantidade: qtd,
        p_motivo_devolucao: motivoDevolucao,
        p_observacao: observacao || null
      });

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: `Devolução registrada com sucesso.`,
        className: 'bg-green-600 text-white border-none'
      });

      setSuccessData({
        id: rpcData,
        quantidade: qtd,
        motivo: MOTIVOS_DEVOLUCAO.find(m => m.value === motivoDevolucao)?.label || motivoDevolucao,
        destino: motivoDevolucao === 'troca' ? 'ESTOQUE BANDEJAS' : 'DESCARTE'
      });

      // Clear form except the selected market
      setProdutoId('');
      setLotes([]);
      setLoteId('');
      setQuantidade('');
      setMotivoDevolucao('');
      setObservacao('');
      
      if (mercadoId) {
        fetchProdutosPorMercado(mercadoId);
      }

    } catch (error) {
      console.error('Error in return submission:', error);
      
      let errorMessage = error.message || 'Ocorreu um erro inesperado ao registrar a devolução.';
      if (errorMessage.includes('Insufficient stock') || errorMessage.includes('Quantidade insuficiente')) {
        errorMessage = 'A quantidade solicitada é maior do que o saldo atual no lote.';
      } else if (errorMessage.includes('ESTOQUE BANDEJAS não encontrado')) {
        errorMessage = 'Local ESTOQUE BANDEJAS não encontrado. Configure-o primeiro no sistema.';
      } else if (errorMessage.includes('foreign key constraint')) {
        errorMessage = 'O mercado selecionado possui restrições e não pode concluir esta ação.';
      }
      
      setSubmitError(errorMessage);
      
      toast({
        title: 'Erro ao registrar',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Registrar Devolução - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-lg">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Registrar Devolução</h1>
                <p className="text-gray-600 mt-1">
                  Retorne produtos de um mercado para estoque de bandejas ou área técnica de descarte.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          <Alert className="bg-blue-50 text-blue-900 border-blue-200">
            <Info className="h-5 w-5 text-blue-600" />
            <AlertTitle className="font-semibold">Informação de Destino</AlertTitle>
            <AlertDescription className="mt-1">
              Produtos com motivo <strong>'Troca de Produto'</strong> retornam diretamente para o local <strong>ESTOQUE BANDEJAS</strong>.<br/>
              Para todos os outros motivos, os itens são enviados para a área técnica de <strong>DESCARTE</strong>.
            </AlertDescription>
          </Alert>

          {submitError && (
            <Alert variant="destructive" className="bg-red-50">
              <AlertTitle>Erro de Validação</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {successData && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <AlertTitle className="text-green-800 font-bold">Devolução Concluída</AlertTitle>
              <AlertDescription className="text-green-700 mt-1">
                Foram devolvidos {successData.quantidade} itens (Motivo: {successData.motivo}). <br/>
                Os produtos foram transferidos para o local <strong>{successData.destino}</strong>.<br/>
                <span className="text-sm opacity-80 mt-1 inline-block">ID de Rastreamento: {successData.id}</span>
              </AlertDescription>
            </Alert>
          )}

          <Card className="shadow-sm border-gray-100">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle>Detalhes da Devolução</CardTitle>
              <CardDescription>
                Selecione os dados do produto que está retornando do mercado e informe o motivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex flex-col justify-center items-center py-12 space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-gray-500">Carregando dados iniciais...</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Mercado de Origem <span className="text-red-500">*</span></Label>
                      <Select value={mercadoId} onValueChange={handleMercadoChange}>
                        <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                          <SelectValue placeholder="Selecione o mercado" />
                        </SelectTrigger>
                        <SelectContent>
                          {mercados.length === 0 ? (
                            <SelectItem value="none" disabled>Nenhum mercado cadastrado</SelectItem>
                          ) : (
                            mercados.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Produto <span className="text-red-500">*</span></Label>
                      <Select value={produtoId} onValueChange={handleProdutoChange} disabled={!mercadoId || isLoadingProdutos}>
                        <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                          <SelectValue 
                            placeholder={
                              !mercadoId 
                                ? "Selecione o mercado primeiro" 
                                : isLoadingProdutos
                                  ? "Carregando produtos..."
                                  : produtos.length === 0
                                    ? "Nenhum produto com saldo"
                                    : "Selecione o produto"
                            } 
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {produtos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Lote <span className="text-red-500">*</span></Label>
                      <Select value={loteId} onValueChange={handleLoteChange} disabled={!mercadoId || !produtoId || isLoadingLotes}>
                        <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                          <SelectValue 
                            placeholder={
                              !mercadoId 
                                ? "Selecione o mercado primeiro" 
                                : !produtoId
                                  ? "Selecione o produto primeiro"
                                  : isLoadingLotes 
                                    ? "Carregando lotes..." 
                                    : lotes.length === 0 
                                      ? "Nenhum lote com saldo" 
                                      : "Selecione o lote"
                            } 
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {lotes.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.numero_lote} (Saldo: {l.quantidade_disponivel})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Quantidade Devolvida <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Ex: 2"
                        value={quantidade}
                        onChange={(e) => {
                          setQuantidade(e.target.value);
                          setSubmitError(null);
                        }}
                        disabled={!loteId}
                        className="bg-white text-gray-900 border-gray-300"
                      />
                      {loteId && (
                        <p className="text-xs text-gray-500">
                          Máximo no mercado: {lotes.find((l) => l.id === loteId)?.quantidade_disponivel || 0}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Motivo da Devolução <span className="text-red-500">*</span></Label>
                      <Select value={motivoDevolucao} onValueChange={(v) => { setMotivoDevolucao(v); setSubmitError(null); }}>
                        <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                          <SelectValue placeholder="Selecione o motivo" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_DEVOLUCAO.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-900 font-medium">Data da Devolução</Label>
                      <Input
                        type="date"
                        value={dataDevolucao}
                        onChange={(e) => setDataDevolucao(e.target.value)}
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-gray-900 font-medium">Observação (Opcional)</Label>
                      <Textarea
                        placeholder="Adicione detalhes extras sobre a devolução..."
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        className="bg-white text-gray-900 border-gray-300 min-h-[100px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => navigate(-1)}
                      disabled={isSubmitting}
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={isSubmitting || !mercadoId || !produtoId || !loteId || !quantidade || !motivoDevolucao || !dataDevolucao}
                      className="bg-red-600 hover:bg-red-700 text-white min-w-[180px] shadow-sm"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Registrando...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Confirmar Devolução
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </>
  );
}