import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import LogsTable from '@/components/logs/LogsTable';
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
import { History, Filter, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LogsAuditoriaPage() {
  const { empresaId, isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [logs, setLogs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const itemsPerPage = 50;

  const [filters, setFilters] = useState({
    dataInicio: '',
    dataFim: '',
    usuarioId: 'todos',
    acao: 'todas',
    entidade: 'todas'
  });

  useEffect(() => {
    if (empresaId) {
      fetchUsuarios();
      fetchLogs(0);
    }
  }, [empresaId]);

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (!error && data) setUsuarios(data);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  const fetchLogs = async (currentPage = 0) => {
    if (!empresaId) return;
    
    setLoading(true);
    try {
      // By dropping user_id constraint, the query is no longer ambiguous
      let query = supabase
        .from('logs_auditoria')
        .select('*, usuarios(nome)', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (filters.dataInicio) {
        query = query.gte('created_at', `${filters.dataInicio}T00:00:00.000Z`);
      }
      if (filters.dataFim) {
        query = query.lte('created_at', `${filters.dataFim}T23:59:59.999Z`);
      }
      if (filters.usuarioId !== 'todos') {
        query = query.eq('usuario_id', filters.usuarioId);
      }
      if (filters.acao !== 'todas') {
        query = query.eq('acao', filters.acao);
      }
      if (filters.entidade !== 'todas') {
        query = query.eq('entidade', filters.entidade);
      }

      const from = currentPage * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      
      setLogs(data || []);
      setHasMore(count > to + 1);
      setPage(currentPage);
      
    } catch (error) {
      toast({
        title: 'Erro ao carregar auditoria',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    fetchLogs(0);
  };

  const handleClearFilters = () => {
    setFilters({
      dataInicio: '',
      dataFim: '',
      usuarioId: 'todos',
      acao: 'todas',
      entidade: 'todas'
    });
    setTimeout(() => fetchLogs(0), 0);
  };

  const nextPage = () => {
    if (hasMore) fetchLogs(page + 1);
  };

  const prevPage = () => {
    if (page > 0) fetchLogs(page - 1);
  };

  if (!isAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <History className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-gray-600">Apenas administradores podem visualizar os logs de auditoria.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>Auditoria do Sistema - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Auditoria do Sistema</h1>
              <p className="text-gray-600 mt-1">Histórico completo de alterações em dados sensíveis</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-700">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dataInicio">Data Início</Label>
                <Input
                  id="dataInicio"
                  type="date"
                  value={filters.dataInicio}
                  onChange={(e) => setFilters(f => ({ ...f, dataInicio: e.target.value }))}
                  className="bg-white text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataFim">Data Fim</Label>
                <Input
                  id="dataFim"
                  type="date"
                  value={filters.dataFim}
                  onChange={(e) => setFilters(f => ({ ...f, dataFim: e.target.value }))}
                  className="bg-white text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label>Usuário</Label>
                <Select 
                  value={filters.usuarioId} 
                  onValueChange={(val) => setFilters(f => ({ ...f, usuarioId: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Todos os usuários" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os usuários</SelectItem>
                    {usuarios.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select 
                  value={filters.acao} 
                  onValueChange={(val) => setFilters(f => ({ ...f, acao: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="criar">Criar</SelectItem>
                    <SelectItem value="editar">Editar</SelectItem>
                    <SelectItem value="deletar">Deletar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entidade</Label>
                <Select 
                  value={filters.entidade} 
                  onValueChange={(val) => setFilters(f => ({ ...f, entidade: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                    <SelectItem value="venda">Venda</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="ajuste_manual">Ajuste Manual</SelectItem>
                    <SelectItem value="produto">Produto</SelectItem>
                    <SelectItem value="lote">Lote</SelectItem>
                    <SelectItem value="usuario">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={handleClearFilters} className="gap-2">
                <X className="h-4 w-4" /> Limpar
              </Button>
              <Button onClick={handleApplyFilters} className="bg-slate-800 hover:bg-slate-900">
                Aplicar Filtros
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                <p className="text-gray-500">Buscando registros...</p>
              </div>
            ) : (
              <>
                <LogsTable logs={logs} />
                
                {logs.length > 0 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                    <p className="text-sm text-gray-500">
                      Página {page + 1}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={prevPage}
                        disabled={page === 0}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" /> Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={nextPage}
                        disabled={!hasMore}
                        className="gap-1"
                      >
                        Próxima <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </DashboardLayout>
    </>
  );
}