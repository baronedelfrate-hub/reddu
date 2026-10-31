import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, RotateCcw, Search, XCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import RelatorioDevolucoesSummaryCards from '@/components/relatorios/RelatorioDevolucoesSummaryCards';
import RelatorioDevolucoesGraficos from '@/components/relatorios/RelatorioDevolucoesGraficos';
import RelatorioDevolucoesTabelaDetalhada from '@/components/relatorios/RelatorioDevolucoesTabelaDetalhada';
import RelatorioDevolucoesExportacao from '@/components/relatorios/RelatorioDevolucoesExportacao';

export default function RelatorioDevolucoesMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [mercados, setMercados] = useState([]);
  const [produtos, setProdutos] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    dataInicial: '',
    dataFinal: '',
    mercadoId: 'all',
    produtoId: 'all',
    motivo: 'all'
  });

  const MOTIVOS = [
    { value: 'troca', label: 'Troca de Produto' },
    { value: 'vencido', label: 'Vencido' },
    { value: 'danificado', label: 'Danificado/Avariado no Ponto' },
    { value: 'avaria_transporte', label: 'Avaria de Transporte' },
    { value: 'outro', label: 'Outro' },
  ];

  useEffect(() => {
    if (empresaId) {
      fetchFilterOptions();
      fetchRelatorio();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const fetchFilterOptions = async () => {
    try {
      const [mercadosRes, produtosRes] = await Promise.all([
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'Mercado').order('nome'),
        supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome')
      ]);
      if (mercadosRes.data) setMercados(mercadosRes.data);
      if (produtosRes.data) setProdutos(produtosRes.data);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchRelatorio = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('movimentacoes')
        .select(`
          id, quantidade, data_movimentacao, motivo_devolucao, observacao,
          produtos:produto_id (id, nome),
          lotes:lote_id (id, numero_lote),
          locais:local_origem_id (id, nome),
          local_destino:local_destino_id (id, nome)
        `)
        .eq('empresa_id', empresaId)
        .in('tipo', ['devolucao', 'descarte'])
        .not('motivo_devolucao', 'is', null)
        .order('data_movimentacao', { ascending: false });

      if (filters.dataInicial) {
        query = query.gte('data_movimentacao', `${filters.dataInicial}T00:00:00Z`);
      }
      if (filters.dataFinal) {
        query = query.lte('data_movimentacao', `${filters.dataFinal}T23:59:59Z`);
      }
      if (filters.mercadoId && filters.mercadoId !== 'all') {
        query = query.eq('local_origem_id', filters.mercadoId);
      }
      if (filters.produtoId && filters.produtoId !== 'all') {
        query = query.eq('produto_id', filters.produtoId);
      }
      if (filters.motivo && filters.motivo !== 'all') {
        query = query.eq('motivo_devolucao', filters.motivo);
      }

      const { data: reportData, error: reportError } = await query;

      if (reportError) throw reportError;
      setData(reportData || []);
    } catch (err) {
      console.error('Erro ao buscar relatorio:', err);
      setError('Falha ao carregar os dados.');
      toast({ title: 'Erro', description: 'Falha ao carregar o relatório.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchRelatorio();
  };

  const handleClearFilters = () => {
    setFilters({
      dataInicial: '',
      dataFinal: '',
      mercadoId: 'all',
      produtoId: 'all',
      motivo: 'all'
    });
    setTimeout(fetchRelatorio, 0);
  };

  return (
    <>
      <Helmet>
        <title>Relatório de Devoluções por Mercado - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6 pb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Relatório de Devoluções</h1>
                <p className="text-gray-600 mt-1">
                  Análise detalhada de produtos devolvidos pelos mercados.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <RelatorioDevolucoesExportacao data={data} filters={filters} />
              <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
              <div className="space-y-1.5">
                <Label>Data Inicial</Label>
                <Input type="date" value={filters.dataInicial} onChange={(e) => setFilters(p => ({ ...p, dataInicial: e.target.value }))} className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Data Final</Label>
                <Input type="date" value={filters.dataFinal} onChange={(e) => setFilters(p => ({ ...p, dataFinal: e.target.value }))} className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Mercado</Label>
                <Select value={filters.mercadoId} onValueChange={(val) => setFilters(p => ({ ...p, mercadoId: val }))}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os mercados</SelectItem>
                    {mercados.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Produto</Label>
                <Select value={filters.produtoId} onValueChange={(val) => setFilters(p => ({ ...p, produtoId: val }))}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos</SelectItem>
                    {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select value={filters.motivo} onValueChange={(val) => setFilters(p => ({ ...p, motivo: val }))}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os motivos</SelectItem>
                    {MOTIVOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 lg:flex-col lg:w-32 justify-end mt-4 lg:mt-0">
              <Button onClick={handleApplyFilters} className="flex-1 bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Search className="h-4 w-4" />
                Filtrar
              </Button>
              <Button onClick={handleClearFilters} variant="outline" className="flex-1 gap-2">
                <XCircle className="h-4 w-4" />
                Limpar
              </Button>
            </div>
          </div>

          {error ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchRelatorio} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Tentar Novamente
              </Button>
            </div>
          ) : isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-24 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
              <p className="text-gray-500 mt-4">Carregando relatório...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-24 text-center">
              <RotateCcw className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Nenhuma devolução encontrada</h3>
              <p className="text-gray-500 mt-1">Ajuste os filtros ou selecione outro período.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <RelatorioDevolucoesSummaryCards data={data} />
              <RelatorioDevolucoesGraficos data={data} />
              <RelatorioDevolucoesTabelaDetalhada data={data} />
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}