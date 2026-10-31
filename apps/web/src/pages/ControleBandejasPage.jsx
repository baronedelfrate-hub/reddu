import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import ControleBandejasIndicadores from '@/components/bandejas/ControleBandejasIndicadores';
import ControleBandejasTotalRow from '@/components/bandejas/ControleBandejasTotalRow';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, XCircle, Package, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ordenarLotes, formatLoteDisplay } from '@/lib/getLotesOrdenados';
import { getLotDisplayValue } from '@/lib/lotDisplayUtils';
import { isBandeja } from '@/lib/bandejasCountUtils';

export default function ControleBandejasPage() {
  const { empresaId } = useAuth();
  const [bandejas, setBandejas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProduto, setFilterProduto] = useState('all');
  const [filterLote, setFilterLote] = useState('all');
  const [filterLocal, setFilterLocal] = useState('all');
  const [mostrarZeradas, setMostrarZeradas] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const fetchBandejas = async () => {
    if (!empresaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: bandejasData, error: err } = await supabase
        .from('lotes')
        .select(`
          *,
          produtos (id, nome),
          locais (id, nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('tipo_lote', 'bandeja');

      if (err) throw err;

      if (!bandejasData || bandejasData.length === 0) {
        setBandejas([]);
        setLoading(false);
        return;
      }

      // Filter to ensure only valid bandejas are processed
      const validBandejasData = bandejasData.filter(b => isBandeja(b));

      const origemIds = [...new Set(validBandejasData.map(b => b.lote_origem_id).filter(Boolean))];

      let originMap = {};
      if (origemIds.length > 0) {
        const { data: originData, error: originErr } = await supabase
          .from('lotes')
          .select('id, numero_lote, quantidade, data_validade, ativo')
          .in('id', origemIds);

        if (originErr) {
          console.error('Erro ao buscar lotes de origem:', originErr);
        } else if (originData) {
          originData.forEach(lote => {
            originMap[lote.id] = lote;
          });
        }
      }

      const combinedData = validBandejasData.map(bandeja => ({
        ...bandeja,
        lote_origem: bandeja.lote_origem_id && originMap[bandeja.lote_origem_id] 
          ? { id: bandeja.lote_origem_id, numero_lote: originMap[bandeja.lote_origem_id].numero_lote }
          : null
      }));

      setBandejas(ordenarLotes(combinedData)); // filters inactive lots
    } catch (err) {
      console.error('Erro ao buscar bandejas:', err);
      setError('Falha ao carregar os dados das bandejas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBandejas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const filterOptions = useMemo(() => {
    const produtos = new Map();
    const lotes = new Map();
    const locais = new Map();

    bandejas.forEach(b => {
      if (b.produtos) produtos.set(b.produtos.id, b.produtos.nome);
      if (b.numero_lote) {
        if (!lotes.has(b.numero_lote)) lotes.set(b.numero_lote, b);
      }
      if (b.locais) locais.set(b.locais.id, b.locais.nome);
    });

    return {
      produtos: Array.from(produtos.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      lotes: Array.from(lotes.values()).sort((a, b) => a.numero_lote.localeCompare(b.numero_lote)),
      locais: Array.from(locais.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [bandejas]);

  const filteredData = useMemo(() => {
    let result = bandejas;

    if (!mostrarZeradas) {
      result = result.filter(b => (b.quantidade || 0) > 0);
    }

    if (filterProduto !== 'all') {
      result = result.filter(b => b.produto_id === filterProduto);
    }
    if (filterLote !== 'all') {
      result = result.filter(b => b.numero_lote === filterLote);
    }
    if (filterLocal !== 'all') {
      result = result.filter(b => b.local_id === filterLocal);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(b => 
        (b.produtos?.nome || '').toLowerCase().includes(lowerSearch) ||
        (b.numero_lote || '').toLowerCase().includes(lowerSearch) ||
        (b.lote_origem?.numero_lote || '').toLowerCase().includes(lowerSearch) ||
        (b.locais?.nome || '').toLowerCase().includes(lowerSearch)
      );
    }

    return result;
  }, [bandejas, filterProduto, filterLote, filterLocal, searchTerm, mostrarZeradas]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, filterProduto, filterLote, filterLocal, mostrarZeradas]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterProduto('all');
    setFilterLote('all');
    setFilterLocal('all');
    setMostrarZeradas(false);
    setPage(0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <>
      <Helmet>
        <title>Controle de Bandejas - Estoque 360</title>
      </Helmet>
      
      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Controle de Bandejas</h1>
                <p className="text-gray-600 mt-1">Acompanhe os lotes de bandejas gerados pela produção</p>
              </div>
            </div>
            <Button onClick={fetchBandejas} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <Card className="shadow-sm border-gray-100">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row gap-4 items-end">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                  <div className="space-y-1.5 md:col-span-1">
                    <Label htmlFor="search" className="text-gray-600 text-xs font-semibold uppercase tracking-wider">Busca Livre</Label>
                    <div className="relative">
                      <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="search"
                        placeholder="Buscar produto, lote..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-gray-600 text-xs font-semibold uppercase tracking-wider">Produto</Label>
                    <Select value={filterProduto} onValueChange={setFilterProduto}>
                      <SelectTrigger className="bg-white text-gray-900">
<SelectValue placeholder="Todos os produtos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os produtos</SelectItem>
                        {filterOptions.produtos.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-gray-600 text-xs font-semibold uppercase tracking-wider">Lote Bandeja</Label>
                    <Select value={filterLote} onValueChange={setFilterLote}>
                      <SelectTrigger className="bg-white text-gray-900">
                        <SelectValue placeholder="Todos os lotes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os lotes</SelectItem>
                        {filterOptions.lotes.map(l => (
                          <SelectItem key={l.numero_lote} value={l.numero_lote}>{formatLoteDisplay(l)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-gray-600 text-xs font-semibold uppercase tracking-wider">Local</Label>
                    <Select value={filterLocal} onValueChange={setFilterLocal}>
                      <SelectTrigger className="bg-white text-gray-900">
                        <SelectValue placeholder="Todos os locais" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os locais</SelectItem>
                        {filterOptions.locais.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-3 lg:w-auto mt-4 lg:mt-0">
                  <div className="flex items-center space-x-2 bg-gray-50/80 px-3 py-2.5 rounded-md border border-gray-200">
                    <Checkbox 
                      id="mostrarZeradas" 
                      checked={mostrarZeradas}
                      onCheckedChange={setMostrarZeradas}
                    />
                    <Label htmlFor="mostrarZeradas" className="text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                      Mostrar zeradas
                    </Label>
                  </div>
                  <Button variant="outline" onClick={handleClearFilters} className="text-gray-600 whitespace-nowrap">
                    <XCircle className="h-4 w-4 mr-2" />
                    Limpar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Indicators Section */}
          {!loading && !error && (
            <ControleBandejasIndicadores data={filteredData} />
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
                <p className="text-red-700 font-medium mb-4">{error}</p>
                <Button onClick={fetchBandejas} variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                  Tentar Novamente
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Table Area */}
          {!error && (
            <Card className="shadow-sm border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                      <TableHead className="font-semibold text-gray-900">Produto</TableHead>
                      <TableHead className="font-semibold text-gray-900">Lote de Origem (Exibição)</TableHead>
                      <TableHead className="font-semibold text-gray-900">Lote Interno (Bandeja)</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-center">Data Produção</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">Unid. por Bandeja</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">Qtd. de Bandejas</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">Total Unidades</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-center">Local Atual</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-center">Validade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-gray-500">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                            Carregando bandejas...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center text-gray-500">
                          {searchTerm || filterProduto !== 'all' || filterLote !== 'all' || filterLocal !== 'all' || !mostrarZeradas
                            ? "Nenhuma bandeja encontrada com os filtros atuais." 
                            : "Nenhuma bandeja registrada no sistema."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {paginatedData.map((row) => {
                          const qty = Number(row.quantidade || 0);
                          const unids = Number(row.unidades_por_bandeja || 0);
                          const totalUnidades = qty * unids;
                          const isVencido = row.data_validade && new Date(row.data_validade) < new Date();
                          
                          return (
                            <TableRow key={row.id} className="hover:bg-gray-50 transition-colors">
                              <TableCell className="font-medium text-gray-900">
                                {row.produtos?.nome || '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    {getLotDisplayValue(row.numero_lote, row.tipo_lote, row.lote_origem?.numero_lote)}
                                  </Badge>
                                  {row.lote_devolvido && (
                                    <Badge title="Este lote foi devolvido e deve ser utilizado primeiro" className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0">DEVOLVIDO</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-500 font-mono text-xs">
                                {row.numero_lote || '-'}
                              </TableCell>
                              <TableCell className="text-gray-700 text-center">
                                {formatDate(row.created_at)}
                              </TableCell>
                              <TableCell className="text-right text-gray-700">
                                {unids}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {qty}
                              </TableCell>
                              <TableCell className="text-right font-bold text-gray-900 bg-gray-50/50">
                                {totalUnidades}
                              </TableCell>
                              <TableCell className="text-gray-700 text-center">
                                {row.locais?.nome || '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.data_validade ? (
                                  <span className={isVencido ? 'text-red-600 font-medium' : 'text-gray-700'}>
                                    {formatDate(row.data_validade)}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <ControleBandejasTotalRow data={filteredData} />
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {!loading && totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                  <p className="text-sm text-gray-600">
                    Mostrando <span className="font-medium text-gray-900">{(page * ITEMS_PER_PAGE) + 1}</span> a <span className="font-medium text-gray-900">{Math.min((page + 1) * ITEMS_PER_PAGE, filteredData.length)}</span> de <span className="font-medium text-gray-900">{filteredData.length}</span> registros
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      Página {page + 1} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}