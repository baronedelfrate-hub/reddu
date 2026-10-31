import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import RelatorioAuditoriasTabela from '@/components/relatorios/RelatorioAuditoriasTabela';
import { useRelatorioAuditorias } from '@/hooks/useRelatorioAuditorias';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Search, RefreshCw, Calendar, MapPin, User, ChevronLeft, ChevronRight } from 'lucide-react';

export default function RelatorioAuditoriasPage() {
  const { empresaId, empresaNome } = useAuth();
  const { toast } = useToast();

  const {
    data,
    loading,
    error,
    currentPage,
    pageSize,
    totalRecords,
    totalPages,
    fetchAuditorias,
    goToPage,
    changePageSize
  } = useRelatorioAuditorias();

  // Filter state
  const todayStr = new Date().toISOString().split('T')[0];
  const [dataInicio, setDataInicio] = useState(todayStr);
  const [dataFim, setDataFim] = useState(todayStr);
  const [selectedLocalId, setSelectedLocalId] = useState('all');
  const [selectedUsuarioId, setSelectedUsuarioId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Dropdown options
  const [locais, setLocais] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [empresaLogoUrl, setEmpresaLogoUrl] = useState(null);

  // Fetch dropdown options and logo
  useEffect(() => {
    if (!empresaId) return;

    const fetchOptions = async () => {
      try {
        // Fetch locais
        const { data: locaisData, error: locaisError } = await supabase
          .from('locais')
          .select('id, nome')
          .eq('empresa_id', empresaId)
          .order('nome');

        if (locaisError) throw locaisError;
        if (locaisData) setLocais(locaisData);

        // Fetch usuarios
        const { data: usuariosData, error: usuariosError } = await supabase
          .from('usuarios')
          .select('id, nome')
          .eq('empresa_id', empresaId)
          .order('nome');

        if (usuariosError) throw usuariosError;
        if (usuariosData) setUsuarios(usuariosData);

        // Fetch empresa logo
        const { data: empresaData, error: empresaError } = await supabase
          .from('empresas')
          .select('logo_url')
          .eq('id', empresaId)
          .single();

        if (!empresaError && empresaData) {
          setEmpresaLogoUrl(empresaData.logo_url);
        }

      } catch (err) {
        console.error('[RelatorioAuditoriasPage] Error fetching options:', err);
      }
    };

    fetchOptions();
  }, [empresaId]);

  // Initial data fetch
  useEffect(() => {
    if (empresaId) {
      handleApplyFilters();
    }
  }, [empresaId]);

  const handleApplyFilters = async () => {
    const filters = {
      dataInicio,
      dataFim,
      localId: selectedLocalId,
      usuarioId: selectedUsuarioId,
      searchTerm
    };

    await fetchAuditorias(filters, 'data_auditoria', true, 1, pageSize);

    toast({
      title: 'Filtros Aplicados',
      description: 'Os resultados foram atualizados.',
    });
  };

  const handleClearFilters = () => {
    setDataInicio(todayStr);
    setDataFim(todayStr);
    setSelectedLocalId('all');
    setSelectedUsuarioId('all');
    setSearchTerm('');

    fetchAuditorias({}, 'data_auditoria', true, 1, pageSize);

    toast({
      title: 'Filtros Limpos',
      description: 'Todos os filtros foram removidos.',
    });
  };

  const handleRefresh = () => {
    handleApplyFilters();
  };

  const handlePageChange = (newPage) => {
    const filters = {
      dataInicio,
      dataFim,
      localId: selectedLocalId,
      usuarioId: selectedUsuarioId,
      searchTerm
    };

    fetchAuditorias(filters, 'data_auditoria', true, newPage, pageSize);
    goToPage(newPage);
  };

  const handlePageSizeChange = (newSize) => {
    const filters = {
      dataInicio,
      dataFim,
      localId: selectedLocalId,
      usuarioId: selectedUsuarioId,
      searchTerm
    };

    fetchAuditorias(filters, 'data_auditoria', true, 1, newSize);
    changePageSize(newSize);
  };

  return (
    <>
      <Helmet>
        <title>Relatório de Auditorias - Estoque 360</title>
        <meta name="description" content="Visualize e analise todas as auditorias de mercado realizadas." />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Relatório de Auditorias</h1>
                <p className="text-gray-600 mt-1">Histórico completo de auditorias de mercado</p>
              </div>
            </div>

            <Button 
              onClick={handleRefresh}
              variant="outline" 
              className="gap-2 shadow-sm"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {/* Filters Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4 bg-slate-50/50">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Date Range */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Data Inicial
                  </Label>
                  <Input 
                    type="date" 
                    value={dataInicio} 
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Data Final
                  </Label>
                  <Input 
                    type="date" 
                    value={dataFim} 
                    onChange={(e) => setDataFim(e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Mercado Filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Mercado
                  </Label>
                  <Select value={selectedLocalId} onValueChange={setSelectedLocalId}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Todos os mercados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Mercados</SelectItem>
                      {locais.map(local => (
                        <SelectItem key={local.id} value={local.id}>
                          {local.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Operador Filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Operador
                  </Label>
                  <Select value={selectedUsuarioId} onValueChange={setSelectedUsuarioId}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Todos os operadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Operadores</SelectItem>
                      {usuarios.map(usuario => (
                        <SelectItem key={usuario.id} value={usuario.id}>
                          {usuario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Search Input */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">
                    Buscar Mercado
                  </Label>
                  <Input 
                    placeholder="Nome do mercado..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex gap-3 mt-6">
                <Button onClick={handleApplyFilters} className="gap-2" disabled={loading}>
                  <Search className="h-4 w-4" />
                  Aplicar Filtros
                </Button>
                <Button onClick={handleClearFilters} variant="outline" disabled={loading}>
                  Limpar Filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          {!loading && data && data.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-600 bg-slate-50 px-4 py-3 rounded-lg border">
              <p>
                Mostrando <span className="font-semibold text-gray-900">{data.length}</span> de{' '}
                <span className="font-semibold text-gray-900">{totalRecords}</span> auditoria(s)
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Itens por página:</Label>
                <Select value={String(pageSize)} onValueChange={(val) => handlePageSizeChange(Number(val))}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Table */}
          <RelatorioAuditoriasTabela 
            data={data} 
            loading={loading}
            empresaLogoUrl={empresaLogoUrl}
            empresaNome={empresaNome}
          />

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg border shadow-sm">
              <div className="text-sm text-gray-600">
                Página <span className="font-semibold">{currentPage}</span> de{' '}
                <span className="font-semibold">{totalPages}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  className="gap-1"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}