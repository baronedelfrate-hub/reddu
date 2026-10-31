import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useMovimentacaoValidation } from '@/hooks/useMovimentacaoValidation';
import { Loader2, Plus, ArrowLeft, ArrowRightLeft, AlertCircle, RefreshCw, Filter, X } from 'lucide-react';

export default function MovimentacoesPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const { validateMovimentacao } = useMovimentacaoValidation();
  
  const [view, setView] = useState('list'); // 'list' or 'form'
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [locaisList, setLocaisList] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  const [estoqueAtual, setEstoqueAtual] = useState(null);

  const getTodayDate = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    return (new Date(today.getTime() - offset)).toISOString().slice(0, 10);
  };

  const [filters, setFilters] = useState({
    dataInicio: getTodayDate(),
    dataFim: getTodayDate(),
    tipo: 'todos',
    localId: 'todos',
    mercadoId: 'todos',
    apenasAbastecimentos: false,
  });

  const [formData, setFormData] = useState({
    lote_id: '',
    tipo: 'entrada',
    local_origem_id: 'none',
    local_destino_id: 'none',
    quantidade: '',
    observacao: '',
    data_movimentacao: new Date().toISOString().slice(0, 16),
  });

  const isAbastecimento = useCallback((mov) => {
    const origemTipo = mov.origem?.tipo;
    const destinoTipo = mov.destino?.tipo;
    return (origemTipo === 'Armazém' || origemTipo === 'Loja Própria') && destinoTipo === 'Mercado';
  }, []);

  const fetchLocaisGlobally = useCallback(async () => {
    if (!empresaId) return;
    try {
      const { data, error } = await supabase
        .from('locais')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (error) throw error;
      setLocaisList(data || []);
    } catch (err) {
      console.error('Error fetching locais:', err);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchLocaisGlobally();
  }, [fetchLocaisGlobally]);

  // Fetch Estoque Atual when form inputs change
  useEffect(() => {
    let isMounted = true;
    const fetchEstoque = async () => {
      if (view !== 'form' || !formData.lote_id) {
        if (isMounted) setEstoqueAtual(null);
        return;
      }
      
      try {
        let qty = 0;
        // If it's an entry or no specific origin is selected, fetch total lote balance
        if (['entrada', 'producao'].includes(formData.tipo) || formData.local_origem_id === 'none' || !formData.local_origem_id) {
          const { data } = await supabase.from('lotes').select('quantidade').eq('id', formData.lote_id).single();
          qty = data?.quantidade || 0;
        } else {
          // Otherwise fetch balance for the specific origin location
          const { data } = await supabase.from('estoque_por_local')
            .select('quantidade_atual')
            .eq('lote_id', formData.lote_id)
            .eq('local_id', formData.local_origem_id)
            .single();
          qty = data?.quantidade_atual || 0;
        }
        if (isMounted) setEstoqueAtual(qty);
      } catch (e) {
        console.error("Erro ao buscar estoque", e);
        if (isMounted) setEstoqueAtual(0);
      }
    };
    
    fetchEstoque();
    return () => { isMounted = false; };
  }, [formData.lote_id, formData.local_origem_id, formData.tipo, view]);

  const fetchMovimentacoes = useCallback(async (currentFilters = filters) => {
    if (!empresaId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      let query = supabase
        .from('movimentacoes')
        .select(`
          *,
          produtos(nome),
          lotes(numero_lote),
          origem:locais!local_origem_id(id, nome, tipo),
          destino:locais!local_destino_id(id, nome, tipo)
        `)
        .eq('empresa_id', empresaId)
        .order('data_movimentacao', { ascending: false });

      if (currentFilters.dataInicio) {
        query = query.gte('data_movimentacao', `${currentFilters.dataInicio}T00:00:00.000Z`);
      }
      if (currentFilters.dataFim) {
        const endDate = new Date(`${currentFilters.dataFim}T00:00:00.000Z`);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        query = query.lt('data_movimentacao', endDate.toISOString());
      }

      if (currentFilters.tipo !== 'todos') {
        if (currentFilters.tipo === 'entrada') {
          query = query.in('tipo', ['producao', 'entrada']);
        } else if (currentFilters.tipo === 'baixa') {
          query = query.in('tipo', ['venda', 'ajuste_manual', 'baixa', 'ajuste', 'saida', 'venda_mercado', 'devolucao']);
        } else if (currentFilters.tipo === 'transferência' || currentFilters.tipo === 'transferencia') {
          query = query.eq('tipo', 'transferencia');
        }
      }

      if (currentFilters.localId && currentFilters.localId !== 'todos') {
        query = query.or(`local_origem_id.eq.${currentFilters.localId},local_destino_id.eq.${currentFilters.localId}`);
      }

      if (currentFilters.mercadoId && currentFilters.mercadoId !== 'todos') {
        query = query.eq('local_destino_id', currentFilters.mercadoId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      let finalData = data || [];
      
      if (currentFilters.apenasAbastecimentos) {
        finalData = finalData.filter(isAbastecimento);
      }

      // Calculate running balances based on fetched list
      if (finalData.length > 0) {
        const loteIds = [...new Set(finalData.map(m => m.lote_id).filter(Boolean))];
        if (loteIds.length > 0) {
          const { data: lotesData } = await supabase.from('lotes').select('id, quantidade').in('id', loteIds);
          const loteBalances = {};
          if (lotesData) {
            lotesData.forEach(l => loteBalances[l.id] = l.quantidade);
          }

          finalData.forEach(mov => {
            const lid = mov.lote_id;
            if (!lid) return;
            
            const currentBal = loteBalances[lid] || 0;
            mov.estoque_novo_calc = currentBal;
            
            const qty = mov.quantidade || 0;
            let anterior = currentBal;
            
            if (['entrada', 'producao', 'producao_bandeja'].includes(mov.tipo)) {
              anterior = currentBal - qty;
            } else if (['saida', 'baixa', 'venda', 'venda_mercado', 'venda_unitario', 'devolucao', 'descarte'].includes(mov.tipo)) {
              anterior = currentBal + qty;
            } else if (['ajuste', 'ajuste_manual'].includes(mov.tipo)) {
              anterior = currentBal - qty; 
            } else if (mov.tipo === 'transferencia') {
              anterior = currentBal; // Total Lote balance doesn't change on transfer
            }
            
            mov.estoque_anterior_calc = anterior;
            loteBalances[lid] = anterior;
          });
        }
      }

      setMovimentacoes(finalData);
    } catch (err) {
      console.error('Error fetching movimentacoes:', err);
      setError(err.message);
      toast({
        title: 'Erro ao carregar movimentações',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, filters, toast, isAbastecimento]);

  useEffect(() => {
    if (empresaId) {
      if (view === 'list') {
        fetchMovimentacoes();
      } else {
        fetchDependencies();
      }
    } else {
      setIsLoading(false);
    }
  }, [empresaId, view, fetchMovimentacoes]);

  const fetchDependencies = async () => {
    try {
      setIsLoading(true);
      
      const { data: lotesResponse, error: lotesError } = await supabase
        .from('lotes')
        .select('id, numero_lote, produto_id, produtos(nome)')
        .eq('empresa_id', empresaId);

      if (lotesError) throw lotesError;

      setLotes(lotesResponse || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
      setView('list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchMovimentacoes(filters);
  };

  const handleClearFilters = () => {
    const defaultFilters = {
      dataInicio: getTodayDate(),
      dataFim: getTodayDate(),
      tipo: 'todos',
      localId: 'todos',
      mercadoId: 'todos',
      apenasAbastecimentos: false,
    };
    setFilters(defaultFilters);
    fetchMovimentacoes(defaultFilters);
  };

  const handleNewMovimentacao = () => {
    setView('form');
  };

  const handleCancel = () => {
    setView('list');
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      lote_id: '',
      tipo: 'entrada',
      local_origem_id: 'none',
      local_destino_id: 'none',
      quantidade: '',
      observacao: '',
      data_movimentacao: new Date().toISOString().slice(0, 16),
    });
    setEstoqueAtual(null);
  };

  const validateBasicForm = () => {
    const { tipo, local_origem_id, local_destino_id, quantidade, lote_id, data_movimentacao } = formData;
    
    if (!lote_id || !data_movimentacao) {
      return "Lote e data são obrigatórios.";
    }
    
    if (tipo !== 'ajuste' && (!quantidade || parseFloat(quantidade) <= 0)) {
      return "A quantidade deve ser maior que zero.";
    }

    const origem = local_origem_id === 'none' ? null : local_origem_id;
    const destino = local_destino_id === 'none' ? null : local_destino_id;

    if (tipo === 'entrada') {
      if (!destino) return "Para 'Entrada', o local de destino é obrigatório.";
      if (origem) return "Para 'Entrada', o local de origem deve estar vazio.";
    } else if (tipo === 'transferencia') {
      if (!origem || !destino) return "Para 'Transferência', os locais de origem e destino são obrigatórios.";
      if (origem === destino) return "O local de origem e destino não podem ser iguais.";
    } else if (tipo === 'baixa') {
      if (!origem) return "Para 'Baixa', o local de origem é obrigatório.";
      if (destino) return "Para 'Baixa', o local de destino deve estar vazio.";
    } else if (tipo === 'ajuste') {
       if (!origem) return "Para 'Ajuste', o local de origem (onde o ajuste ocorre) é obrigatório.";
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    const basicValidationError = validateBasicForm();
    if (basicValidationError) {
      toast({
        title: 'Erro de Validação',
        description: basicValidationError,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { isValid, error: hookError } = await validateMovimentacao(empresaId, formData);
      if (!isValid) {
        toast({
          title: 'Ação não permitida',
          description: hookError,
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const selectedLote = lotes.find((l) => l.id === formData.lote_id);
      if (!selectedLote) throw new Error("Lote não encontrado");

      const origem = formData.local_origem_id === 'none' ? null : formData.local_origem_id;
      const destino = formData.local_destino_id === 'none' ? null : formData.local_destino_id;

      // Map older UI types to new strict DB constraints to prevent 23514 errors
      let dbTipo = formData.tipo;
      if (dbTipo === 'entrada') dbTipo = 'producao';
      if (dbTipo === 'ajuste') dbTipo = 'ajuste_manual';

      const { error: insertError } = await supabase.from('movimentacoes').insert({
        empresa_id: empresaId,
        produto_id: selectedLote.produto_id,
        lote_id: formData.lote_id,
        tipo: dbTipo,
        local_origem_id: origem,
        local_destino_id: destino,
        quantidade: parseInt(formData.quantidade, 10),
        observacao: formData.observacao || null,
        data_movimentacao: new Date(formData.data_movimentacao).toISOString(),
      });

      if (insertError) throw insertError;

      toast({
        title: 'Movimentação registrada com sucesso!',
      });

      resetForm();
      setView('list');
      fetchMovimentacoes();
    } catch (err) {
      toast({
        title: 'Erro ao registrar movimentação',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTipoStyle = (tipo) => {
    switch (tipo) {
      case 'entrada': 
      case 'producao': return 'text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium border border-green-200';
      case 'saida':
      case 'venda':
      case 'venda_mercado':
      case 'baixa': return 'text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium border border-red-200';
      case 'transferencia': return 'text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-medium border border-blue-200';
      case 'ajuste': 
      case 'ajuste_manual': return 'text-purple-600 bg-purple-50 px-2 py-1 rounded-full text-xs font-medium border border-purple-200';
      case 'devolucao': return 'text-orange-600 bg-orange-50 px-2 py-1 rounded-full text-xs font-medium border border-orange-200';
      default: return 'text-gray-600 bg-gray-50 px-2 py-1 rounded-full text-xs font-medium border border-gray-200';
    }
  };

  const getTipoLabel = (tipo) => {
    switch (tipo) {
      case 'entrada': return 'Entrada';
      case 'producao': return 'Produção (Entrada)';
      case 'saida':
      case 'baixa': return 'Baixa';
      case 'venda': return 'Venda';
      case 'venda_mercado': return 'Venda (Mercado)';
      case 'transferencia': return 'Transferência';
      case 'ajuste': 
      case 'ajuste_manual': return 'Ajuste Manual';
      case 'devolucao': return 'Devolução';
      default: return tipo;
    }
  };

  const mercados = locaisList.filter(l => l.tipo === 'Mercado');
  const hasAbastecimentos = movimentacoes.some(isAbastecimento);
  const showMercadoFilter = hasAbastecimentos || filters.mercadoId !== 'todos';

  // Form Summary Calculations
  const formAnterior = estoqueAtual !== null ? estoqueAtual : 0;
  const formQtd = parseInt(formData.quantidade || '0', 10);
  let formNovo = formAnterior;
  
  if (['entrada', 'producao'].includes(formData.tipo)) {
    formNovo = formAnterior + formQtd;
  } else if (['baixa', 'saida', 'venda', 'venda_mercado', 'devolucao', 'transferencia'].includes(formData.tipo)) {
    formNovo = formAnterior - formQtd;
  } else if (['ajuste', 'ajuste_manual'].includes(formData.tipo)) {
    formNovo = formAnterior + formQtd;
  }

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>Movimentações - Sistema de Estoque</title>
        <meta name="description" content="Registro de movimentações de estoque" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Movimentações</h1>
              <p className="text-gray-600 mt-1">
                {view === 'list' ? 'Histórico de movimentações do estoque.' : 'Registre entradas, transferências, baixas e ajustes de estoque.'}
              </p>
            </div>
            {view === 'list' && (
              <Button onClick={handleNewMovimentacao} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4" />
                Nova Movimentação
              </Button>
            )}
            {view === 'form' && (
              <Button variant="outline" onClick={handleCancel} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Lista
              </Button>
            )}
          </div>

          {view === 'list' && (
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-700">
                <Filter className="h-4 w-4" />
                Filtros de Busca
              </div>
              
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2 w-full sm:w-auto flex-1 min-w-[160px]">
                  <Label htmlFor="dataInicio">Data Inicial</Label>
                  <Input
                    id="dataInicio"
                    type="date"
                    value={filters.dataInicio}
                    onChange={(e) => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2 w-full sm:w-auto flex-1 min-w-[160px]">
                  <Label htmlFor="dataFim">Data Final</Label>
                  <Input
                    id="dataFim"
                    type="date"
                    value={filters.dataFim}
                    onChange={(e) => setFilters(f => ({ ...f, dataFim: e.target.value }))}
                    className="bg-white text-gray-900"
                  />
                </div>
                <div className="space-y-2 w-full sm:w-auto flex-1 min-w-[160px]">
                  <Label>Tipo de Movimentação</Label>
                  <Select 
                    value={filters.tipo} 
                    onValueChange={(val) => setFilters(f => ({ ...f, tipo: val }))}
                  >
                    <SelectTrigger className="bg-white text-gray-900">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="entrada">Entrada / Produção</SelectItem>
                      <SelectItem value="baixa">Saída / Baixa / Venda / Devolução</SelectItem>
                      <SelectItem value="transferência">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 w-full sm:w-auto flex-1 min-w-[160px]">
                  <Label>Local</Label>
                  <Select 
                    value={filters.localId} 
                    onValueChange={(val) => setFilters(f => ({ ...f, localId: val }))}
                  >
                    <SelectTrigger className="bg-white text-gray-900">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Locais</SelectItem>
                      {locaisList.map((local) => (
                        <SelectItem key={local.id} value={local.id}>
                          {local.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showMercadoFilter && (
                  <div className="space-y-2 w-full sm:w-auto flex-1 min-w-[160px]">
                    <Label>Mercado</Label>
                    <Select 
                      value={filters.mercadoId} 
                      onValueChange={(val) => setFilters(f => ({ ...f, mercadoId: val }))}
                    >
                      <SelectTrigger className="bg-white text-gray-900">
                        <SelectValue placeholder="Todos os Mercados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os Mercados</SelectItem>
                        {mercados.map((mercado) => (
                          <SelectItem key={mercado.id} value={mercado.id}>
                            {mercado.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center space-x-2 w-full sm:w-auto flex-none min-w-[160px] pb-2">
                  <Checkbox
                    id="apenasAbastecimentos"
                    checked={filters.apenasAbastecimentos}
                    onCheckedChange={(checked) => setFilters(f => ({ ...f, apenasAbastecimentos: checked }))}
                  />
                  <Label htmlFor="apenasAbastecimentos" className="text-sm font-medium leading-none text-gray-700 cursor-pointer">
                    Apenas Abastecimentos
                  </Label>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button variant="outline" onClick={handleClearFilters} className="gap-2 border-gray-200 text-gray-700 hover:bg-gray-50">
                  <X className="h-4 w-4" /> Limpar
                </Button>
                <Button onClick={handleApplyFilters} className="bg-slate-800 hover:bg-slate-900 text-white shadow-sm">
                  Aplicar Filtros
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                <span className="text-gray-600">Carregando dados...</span>
              </div>
            ) : error && view === 'list' ? (
              <div className="flex flex-col items-center justify-center p-12">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Erro ao carregar dados</h3>
                <p className="text-gray-500 mb-6 text-center">{error}</p>
                <Button onClick={() => fetchMovimentacoes()} className="gap-2 bg-blue-600 text-white">
                  <RefreshCw className="h-4 w-4" />
                  Tentar Novamente
                </Button>
              </div>
            ) : view === 'list' ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold text-gray-700">Data</TableHead>
                      <TableHead className="font-semibold text-gray-700">Tipo</TableHead>
                      <TableHead className="font-semibold text-gray-700">Classificação</TableHead>
                      <TableHead className="font-semibold text-gray-700">Produto</TableHead>
                      <TableHead className="font-semibold text-gray-700">Lote</TableHead>
                      <TableHead className="font-semibold text-gray-700">Origem</TableHead>
                      <TableHead className="font-semibold text-gray-700">Destino</TableHead>
                      <TableHead className="text-right font-semibold text-gray-700">Estoque Ant.</TableHead>
                      <TableHead className="text-right font-semibold text-gray-700">Qtd Movida</TableHead>
                      <TableHead className="text-right font-semibold text-gray-700">Estoque Novo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentacoes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-gray-500">
                          Nenhuma movimentação encontrada para o período selecionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movimentacoes.map((mov) => (
                        <TableRow key={mov.id} className="hover:bg-gray-50/50">
                          <TableCell className="text-sm text-gray-700 whitespace-nowrap font-medium">
                            {formatDateTime(mov.data_movimentacao)}
                          </TableCell>
                          <TableCell>
                            <span className={getTipoStyle(mov.tipo)}>
                              {getTipoLabel(mov.tipo)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isAbastecimento(mov) && (
                              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200">
                                Abastecimento
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-gray-900">
                            {mov.produtos?.nome || '-'}
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {mov.lotes?.numero_lote || '-'}
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {mov.origem?.nome || '-'}
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {mov.destino?.nome || '-'}
                          </TableCell>
                          <TableCell className="text-right text-gray-600 font-medium">
                            {mov.estoque_anterior_calc !== undefined ? mov.estoque_anterior_calc : '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-gray-900">
                            {['entrada', 'producao', 'ajuste_manual', 'ajuste'].includes(mov.tipo) && mov.quantidade > 0 ? '+' : ''}
                            {['saida', 'baixa', 'venda', 'venda_mercado', 'devolucao'].includes(mov.tipo) ? '-' : ''}
                            {mov.quantidade}
                          </TableCell>
                          <TableCell className="text-right text-gray-600 font-medium">
                            {mov.estoque_novo_calc !== undefined ? mov.estoque_novo_calc : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
                  
                  {estoqueAtual !== null && formData.lote_id && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 mb-6 flex flex-wrap gap-6 items-center justify-between shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">
                          Estoque Anterior {formData.tipo === 'transferencia' ? '(Origem)' : ''}
                        </span>
                        <span className="text-3xl font-black text-blue-950">{formAnterior}</span>
                      </div>
                      
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Qtd Movida</span>
                        <span className="text-2xl font-bold text-blue-700">{formQtd}</span>
                      </div>
                      
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Variação</span>
                        <span className={`text-2xl font-bold ${
                          ['entrada', 'producao', 'ajuste_manual', 'ajuste'].includes(formData.tipo) && formQtd > 0 ? 'text-emerald-600' : 
                          ['saida', 'baixa', 'venda', 'venda_mercado', 'devolucao', 'transferencia'].includes(formData.tipo) && formQtd > 0 ? 'text-rose-600' : 'text-blue-900'
                        }`}>
                          {['entrada', 'producao', 'ajuste', 'ajuste_manual'].includes(formData.tipo) && formQtd > 0 ? '+' : ''}
                          {['saida', 'baixa', 'venda', 'venda_mercado', 'devolucao', 'transferencia'].includes(formData.tipo) && formQtd > 0 ? '-' : ''}
                          {formQtd}
                        </span>
                      </div>
                      
                      <div className="flex flex-col text-right">
                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">
                          Estoque Novo {formData.tipo === 'transferencia' ? '(Origem)' : ''}
                        </span>
                        <span className="text-3xl font-black text-blue-950">{formNovo}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tipo" className="text-gray-900">Tipo de Movimentação <span className="text-red-500">*</span></Label>
                      <Select
                        value={formData.tipo}
                        onValueChange={(value) => {
                          let newOrigem = formData.local_origem_id;
                          let newDestino = formData.local_destino_id;
                          
                          if (value === 'entrada') newOrigem = 'none';
                          if (value === 'baixa' || value === 'ajuste') newDestino = 'none';
                          
                          setFormData({ ...formData, tipo: value, local_origem_id: newOrigem, local_destino_id: newDestino });
                        }}
                      >
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="ajuste">Ajuste Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lote" className="text-gray-900">Lote / Produto <span className="text-red-500">*</span></Label>
                      <Select
                        value={formData.lote_id}
                        onValueChange={(value) => setFormData({ ...formData, lote_id: value })}
                      >
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue placeholder="Selecione um lote" />
                        </SelectTrigger>
                        <SelectContent>
                          {lotes.map((lote) => (
                            <SelectItem key={lote.id} value={lote.id}>
                              {lote.numero_lote} ({lote.produtos?.nome})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quantidade" className="text-gray-900">
                        {formData.tipo === 'ajuste' ? 'Quantidade (+ para adicionar, - para remover)' : 'Quantidade'} <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="quantidade"
                        type="number"
                        min={formData.tipo === 'ajuste' ? undefined : "1"}
                        value={formData.quantidade}
                        onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                        placeholder={formData.tipo === 'ajuste' ? "Ex: -5 ou 10" : "1"}
                        className="bg-white text-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="local_origem" className={`text-gray-900 ${formData.tipo === 'entrada' ? 'opacity-50' : ''}`}>
                        {formData.tipo === 'ajuste' ? 'Local do Ajuste' : 'Local de Origem'} {formData.tipo === 'entrada' ? '(Não aplicável)' : <span className="text-red-500">*</span>}
                      </Label>
                      <Select
                        value={formData.local_origem_id}
                        onValueChange={(value) => setFormData({ ...formData, local_origem_id: value })}
                        disabled={formData.tipo === 'entrada'}
                      >
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Nenhum --</SelectItem>
                          {locaisList.map((local) => (
                            <SelectItem key={local.id} value={local.id}>
                              {local.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="local_destino" className={`text-gray-900 ${['baixa', 'ajuste'].includes(formData.tipo) ? 'opacity-50' : ''}`}>
                        Local de Destino {['baixa', 'ajuste'].includes(formData.tipo) ? '(Não aplicável)' : <span className="text-red-500">*</span>}
                      </Label>
                      <Select
                        value={formData.local_destino_id}
                        onValueChange={(value) => setFormData(f => ({ ...f, local_destino_id: value }))}
                        disabled={['baixa', 'ajuste'].includes(formData.tipo)}
                      >
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue placeholder="Selecione o destino" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Nenhum --</SelectItem>
                          {locaisList.map((local) => (
                            <SelectItem key={local.id} value={local.id}>
                              {local.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.tipo === 'ajuste' && (
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="observacao" className="text-gray-900">Observação do Ajuste <span className="text-red-500">*</span></Label>
                        <Textarea
                          id="observacao"
                          value={formData.observacao}
                          onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                          placeholder="Motivo do ajuste manual..."
                          className="bg-white text-gray-900 min-h-[100px]"
                        />
                      </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="data_movimentacao" className="text-gray-900">Data e Hora <span className="text-red-500">*</span></Label>
                      <Input
                        id="data_movimentacao"
                        type="datetime-local"
                        value={formData.data_movimentacao}
                        onChange={(e) => setFormData({ ...formData, data_movimentacao: e.target.value })}
                        className="bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleCancel}
                      disabled={isSubmitting}
                      className="border-gray-200 text-gray-700"
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="h-4 w-4" />
                      )}
                      Registrar Movimentação
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}