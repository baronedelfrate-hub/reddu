import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import LotesFilterBar from '@/components/lotes/LotesFilterBar';
import { useLoteManagement } from '@/hooks/useLoteManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Printer, Search, FileText, Info, CalendarX, CalendarClock, CheckCircle2 , Download} from 'lucide-react';
import PrintDialog from '@/components/etiquetas/PrintDialog';
import { ordenarLotes } from '@/lib/getLotesOrdenados';
import { generateBarcode } from '@/utils/barcodeGenerator';

export default function EtiquetasLotePage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const { fetchLotes } = useLoteManagement();
  
  const [dataCombinada, setDataCombinada] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [locais, setLocais] = useState([]);

  // Mapa id -> produto completo (inclui dados da tabela nutricional),
  // usado para enriquecer os itens enviados ao PrintDialog.
  const produtosMap = useMemo(() => (
    produtos.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {})
  ), [produtos]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingBarcodes, setIsGeneratingBarcodes] = useState(false);
  
  // Persisted Filters State
  const getInitialFilters = () => {
    const saved = sessionStorage.getItem('etiquetasLotesFilters');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      produto_id: 'all',
      local_id: 'all',
      status_validade: 'todos',
      saldo: 'positivo'
    };
  };

  const [filters, setFilters] = useState(getInitialFilters);
  const [filterStatus, setFilterStatus] = useState(() => sessionStorage.getItem('etiquetasLotesStatus') || 'ativo');
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('etiquetasLotesSearch') || '');

  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('etiquetasLotesFilters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    sessionStorage.setItem('etiquetasLotesStatus', filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    sessionStorage.setItem('etiquetasLotesSearch', searchTerm);
  }, [searchTerm]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Print Dialog State
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [lotesToPrint, setLotesToPrint] = useState([]);

  useEffect(() => {
    if (empresaId) {
      fetchData();
    }
  }, [empresaId, filterStatus]);

  const generateMissingBarcodes = async (lotesRawData) => {
    const lotesMissingBarcode = lotesRawData.filter(l => !l.codigo_barra && l.numero_lote);
    
    if (lotesMissingBarcode.length > 0) {
      setIsGeneratingBarcodes(true);
      let updatedCount = 0;
      
      for (const lote of lotesMissingBarcode) {
        const newBarcode = generateBarcode(lote.numero_lote);
        if (newBarcode) {
          const { error } = await supabase
            .from('lotes')
            .update({ codigo_barra: newBarcode })
            .eq('id', lote.id);
            
          if (!error) {
            lote.codigo_barra = newBarcode; // Update locally
            updatedCount++;
          }
        }
      }
      
      setIsGeneratingBarcodes(false);
      if (updatedCount > 0) {
        toast({
          title: "Códigos de Barras Gerados",
          description: `${updatedCount} códigos de barras gerados com sucesso.`,
          className: "bg-green-600 text-white border-none"
        });
      }
    }
    return lotesRawData;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Lotes info using useLoteManagement
      const { data: lotesFetchDataRaw, error: fetchError } = await fetchLotes(empresaId, filterStatus);
      if (fetchError) throw new Error(fetchError);

      // Check and generate missing barcodes
      const lotesFetchData = await generateMissingBarcodes(lotesFetchDataRaw || []);

      // 2. Fetch Estoque por Local and supplementary data
      const [eplRes, prodRes, locRes, lotesExtraRes] = await Promise.all([
        supabase.from('estoque_por_local').select('*').eq('empresa_id', empresaId),
        supabase.from('produtos').select(`
          id, nome, possui_tabela_nutricional, porcao_valor, porcao_unidade,
          porcoes_por_embalagem, medida_caseira, valor_energetico_kcal,
          carboidratos_g, acucares_totais_g, acucares_adicionados_g, proteinas_g,
          gorduras_totais_g, gorduras_saturadas_g, gorduras_trans_g,
          fibra_alimentar_g, sodio_mg, alergenicos_contem, alergenicos_pode_conter
        `).eq('empresa_id', empresaId).order('nome'),
        supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('lotes').select('id, numero_lote, lote_origem_id, codigo_barra').eq('empresa_id', empresaId)
      ]);

      if (eplRes.error) throw eplRes.error;
      if (prodRes.error) throw prodRes.error;
      if (locRes.error) throw locRes.error;
      if (lotesExtraRes.error) throw lotesExtraRes.error;

      setProdutos(prodRes.data || []);
      setLocais(locRes.data || []);

      const allLotesMap = (lotesExtraRes.data || []).reduce((acc, l) => {
        acc[l.id] = l;
        return acc;
      }, {});

      // 3. Map lotes data for quick lookup
      const lotesMap = (lotesFetchData || []).reduce((acc, lote) => {
        const extraInfo = allLotesMap[lote.id] || {};
        const originLote = extraInfo.lote_origem_id ? allLotesMap[extraInfo.lote_origem_id] : null;

        acc[lote.id] = {
          data_validade: lote.data_validade,
          tipo_lote: lote.tipo_lote,
          unidades_por_bandeja: lote.unidades_por_bandeja,
          lote_devolvido: lote.lote_devolvido,
          ativo: lote.ativo !== false,
          created_at: lote.created_at,
          data_fabricacao: lote.data_fabricacao,
          codigo_barra: lote.codigo_barra || extraInfo.codigo_barra,
          lote_origem_id: extraInfo.lote_origem_id,
          lote_origem_numero: originLote ? originLote.numero_lote : null
        };
        return acc;
      }, {});

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 4. Combine Estoque with Lotes metadata
      const combinada = (eplRes.data || [])
        .filter(item => lotesMap[item.lote_id]) 
        .map(item => {
          const loteInfo = lotesMap[item.lote_id];
          const dataValidade = loteInfo.data_validade;
          let status = 'OK';
          let diasParaVencer = null;

          if (dataValidade) {
            const [year, month, day] = dataValidade.split('-');
            const validadeDate = new Date(year, month - 1, day);
            const diffTime = validadeDate.getTime() - today.getTime();
            diasParaVencer = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diasParaVencer < 0) {
              status = 'Vencido';
            } else if (diasParaVencer <= 7) {
              status = 'Vencendo';
            }
          }

          return {
            id: `${item.lote_id}-${item.local_id}`,
            lote_id: item.lote_id,
            numero_lote: item.numero_lote,
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            local_id: item.local_id,
            local_nome: item.local_nome,
            quantidade_atual: item.quantidade_atual,
            data_validade: dataValidade,
            tipo_lote: loteInfo.tipo_lote,
            unidades_por_bandeja: loteInfo.unidades_por_bandeja,
            lote_devolvido: loteInfo.lote_devolvido,
            ativo: loteInfo.ativo,
            created_at: loteInfo.created_at,
            data_fabricacao: loteInfo.data_fabricacao,
            codigo_barra: loteInfo.codigo_barra,
            lote_origem_id: loteInfo.lote_origem_id,
            lote_origem_numero: loteInfo.lote_origem_numero,
            status,
            diasParaVencer
          };
      });

      // 5. Sort identically to LotesPage
      setDataCombinada(ordenarLotes(combinada, true)); 
      
    } catch (error) {
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return dataCombinada.filter(item => {
      // Base LotesPage Filters
      if (filters.produto_id !== 'all' && item.produto_id !== filters.produto_id) return false;
      if (filters.local_id !== 'all' && item.local_id !== filters.local_id) return false;
      if (filters.saldo === 'positivo' && item.quantidade_atual <= 0) return false;
      if (filters.status_validade === 'vencidos' && item.status !== 'Vencido') return false;
      if (filters.status_validade === 'vencendo' && item.status !== 'Vencendo') return false;
      
      // Additional text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchSearch = 
          (item.produto_nome || '').toLowerCase().includes(term) ||
          (item.numero_lote || '').toLowerCase().includes(term) ||
          (item.lote_origem_numero || '').toLowerCase().includes(term) ||
          (item.codigo_barra || '').toLowerCase().includes(term);
        if (!matchSearch) return false;
      }
      
      return true;
    });
  }, [dataCombinada, filters, searchTerm]);

  const handleClearFilters = () => {
    setFilters({
      produto_id: 'all',
      local_id: 'all',
      status_validade: 'todos',
      saldo: 'positivo'
    });
    setSearchTerm('');
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(filteredData.map(l => l.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (checked, id) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  // Convert table row format back to expected PrintDialog format
  const mapItemForPrint = (item) => ({
    ...item,
    id: item.lote_id,
    produto: item.produto_nome,
    quantidade: item.quantidade_atual,
    produtos: produtosMap[item.produto_id] || { nome: item.produto_nome },
    locais: { nome: item.local_nome },
    created_at: item.created_at,
    data_fabricacao: item.data_fabricacao,
    codigo_barra: item.codigo_barra,
    tipo_lote: item.tipo_lote,
    lote_origem_id: item.lote_origem_id,
    lote_origem_numero: item.lote_origem_numero
  });

  const handlePrintSingle = (item) => {
    setLotesToPrint([mapItemForPrint(item)]);
    setPrintDialogOpen(true);
  };

  const handlePrintMultiple = () => {
    if (selectedIds.length === 0) return;
    const selectedLotesData = filteredData
      .filter(item => selectedIds.includes(item.id))
      .map(mapItemForPrint);

    setLotesToPrint(selectedLotesData);
    setPrintDialogOpen(true);
  };

  const handleExportInkLaser = async (lotesParaExportar) => {
    if (!lotesParaExportar || lotesParaExportar.length === 0) return;

    const baseUrl = window.location.hostname.includes('app-preview.com') || window.location.hostname.includes('localhost')
      ? 'https://estoque360.barobot.com.br'
      : window.location.origin;

    // 12.7mm a 300 DPI = ~150px de altura
    // Largura proporcional ao QR (quadrado) + margem
    const HEIGHT_PX = 150;
    const QR_PX = 140; // tamanho do QR dentro do canvas

    for (const lote of lotesParaExportar) {
      const loteRealId = lote.lote_id || lote.id;
      const loteNum = lote.numero_lote || loteRealId?.substring(0, 8).toUpperCase();
      const qrUrl = `${baseUrl}/estoque/lote/${loteRealId}`;

      try {
        // Gera QR Code usando QRCodeCanvas em elemento temporário
        const { QRCodeCanvas } = await import('qrcode.react');
        const { createElement } = await import('react');
        const { createRoot } = await import('react-dom/client');

        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(container);

        await new Promise((resolve) => {
          const root = createRoot(container);
          root.render(createElement(QRCodeCanvas, {
            value: qrUrl,
            size: QR_PX,
            level: 'H',
            includeMargin: true,
            id: `qr-inklaser-${loteRealId}`
          }));
          setTimeout(() => {
            try {
              const qrCanvas = container.querySelector('canvas');
              if (!qrCanvas) { resolve(); return; }

              // Cria canvas final com o tamanho exato
              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = QR_PX;
              finalCanvas.height = HEIGHT_PX;
              const ctx = finalCanvas.getContext('2d');

              // Fundo branco
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

              // QR centralizado verticalmente
              const yOffset = Math.floor((HEIGHT_PX - QR_PX) / 2);
              ctx.drawImage(qrCanvas, 0, yOffset < 0 ? 0 : yOffset, QR_PX, Math.min(QR_PX, HEIGHT_PX));

              // Exporta como JPEG
              finalCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `qr_${loteNum}.jpg`;
                a.click();
                URL.revokeObjectURL(url);
                resolve();
              }, 'image/jpeg', 1.0);
            } catch (err) {
              console.error('Erro ao gerar QR JPEG:', err);
              resolve();
            } finally {
              document.body.removeChild(container);
            }
          }, 200);
        });

        // Pequeno delay entre downloads
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        console.error('Erro ao exportar lote:', lote.numero_lote, err);
      }
    }

    toast({
      title: `${lotesParaExportar.length} QR Code(s) exportado(s)`,
      description: 'Arquivos JPEG prontos para a InkLaser.',
      duration: 3000
    });
  };

  const handleClosePrintDialog = () => {
    setPrintDialogOpen(false);
    if (lotesToPrint.length > 1) {
      setSelectedIds([]);
    }
    setLotesToPrint([]);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
    return adjustedDate.toLocaleDateString('pt-BR');
  };

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);

  const renderStatusBadge = (status, dias) => {
    if (status === 'Vencido') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <CalendarX className="h-3 w-3" /> Vencido ({Math.abs(dias)} dias)
        </Badge>
      );
    }
    if (status === 'Vencendo') {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 flex items-center gap-1 w-fit text-white">
          <CalendarClock className="h-3 w-3" /> Vence em {dias} {dias === 1 ? 'dia' : 'dias'}
        </Badge>
      );
    }
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-600 flex items-center gap-1 w-fit text-white">
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    );
  };

  const activeFiltersCount = [
    filters.produto_id !== 'all',
    filters.local_id !== 'all',
    filters.status_validade !== 'todos',
    filters.saldo !== 'positivo',
    searchTerm !== ''
  ].filter(Boolean).length;

  return (
    <>
      <Helmet><title>Etiquetas de Lote - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Printer className="h-8 w-8 text-blue-600" />
                Impressão de Etiquetas
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-600">
                  Gere e imprima etiquetas térmicas com Código de Barras e QR Code.
                </p>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
                  </Badge>
                )}
              </div>
            </div>
            
            {selectedIds.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  onClick={handlePrintMultiple} 
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md gap-2 whitespace-nowrap rounded-xl transition-all active:scale-95"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Selecionadas ({selectedIds.length})
                </Button>
                <Button
                  onClick={() => {
                    const selected = dataCombinada.filter(l => selectedIds.includes(l.id));
                    handleExportInkLaser(selected);
                  }}
                  variant="outline"
                  className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 whitespace-nowrap rounded-xl"
                >
                  <Download className="h-4 w-4" />
                  QR JPEG ({selectedIds.length})
                </Button>
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 mb-2 items-center justify-between">
            <div className="flex gap-2">
              <Button 
                variant={filterStatus === 'todos' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('todos')}
                className={filterStatus === 'todos' ? 'bg-blue-600 text-white' : 'text-gray-600'}
              >
                Todos
              </Button>
              <Button 
                variant={filterStatus === 'ativo' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('ativo')}
                className={filterStatus === 'ativo' ? 'bg-blue-600 text-white' : 'text-gray-600'}
              >
                Ativos
              </Button>
              <Button 
                variant={filterStatus === 'inativo' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('inativo')}
                className={filterStatus === 'inativo' ? 'bg-blue-600 text-white' : 'text-gray-600'}
              >
                Inativos
              </Button>
            </div>
            <div className="relative flex-1 md:max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por produto, nº do lote ou código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white border-gray-200 w-full text-gray-900 focus:ring-blue-500"
              />
            </div>
          </div>

          <LotesFilterBar
            produtos={produtos}
            locais={locais}
            filters={filters}
            setFilters={setFilters}
            onClearFilters={handleClearFilters}
          />

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              {isLoading || isGeneratingBarcodes ? (
                <div className="flex flex-col items-center justify-center p-16">
                  <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
                  <span className="text-gray-500 font-medium">
                    {isGeneratingBarcodes ? 'Gerando códigos de barras faltantes...' : 'Carregando lotes para impressão...'}
                  </span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-gray-500">
                  <FileText className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-lg font-medium text-gray-900">Nenhum lote encontrado</p>
                  <p>Tente ajustar os filtros de busca para encontrar os lotes desejados.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox 
                          checked={filteredData.length > 0 && selectedIds.length === filteredData.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Lote Origem</TableHead>
                      <TableHead>Lote Bandeja</TableHead>
                      <TableHead>Cód. Barras</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-center">Unid. por Bandeja</TableHead>
                      <TableHead>Data de Validade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead className="text-right w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      const isBandeja = item.tipo_lote === 'bandeja';
                      const displayOrigem = isBandeja && item.lote_origem_numero ? item.lote_origem_numero : item.numero_lote;
                      const displayBandeja = isBandeja ? item.numero_lote : '—';

                      return (
                        <TableRow key={item.id} className={`${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/50"} transition-colors ${!item.ativo ? 'bg-gray-50/80 text-gray-500' : ''}`}>
                          <TableCell className="text-center">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={(c) => handleSelectOne(c, item.id)}
                            />
                          </TableCell>
                          <TableCell className={`font-medium whitespace-nowrap ${!item.ativo ? 'text-gray-500' : 'text-gray-900'}`}>
                            <div className="flex items-center gap-2">
                              <span>{displayOrigem}</span>
                              {item.lote_devolvido && (
                                <Badge title="Este lote foi devolvido e deve ser utilizado primeiro" className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0">DEVOLVIDO</Badge>
                              )}
                              {isBandeja && (
                                <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 ml-1">BDJ</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${!item.ativo ? 'text-gray-400' : 'text-gray-500'}`}>
                            {displayBandeja}
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${!item.codigo_barra ? 'text-red-400' : 'text-gray-600'}`}>
                            {item.codigo_barra || 'Não gerado'}
                          </TableCell>
                          <TableCell className={!item.ativo ? 'text-gray-500' : 'text-gray-700'}>{item.produto_nome}</TableCell>
                          <TableCell className={!item.ativo ? 'text-gray-500' : 'text-gray-700'}>{item.local_nome}</TableCell>
                          <TableCell className={`text-right font-semibold ${!item.ativo ? 'text-gray-500' : 'text-blue-700'}`}>
                            {formatNumber(item.quantidade_atual)}
                          </TableCell>
                          <TableCell className={`text-center font-medium ${!item.ativo ? 'text-gray-500' : 'text-gray-700'}`}>
                            {item.tipo_lote === 'bandeja' && item.unidades_por_bandeja ? formatNumber(item.unidades_por_bandeja) : '-'}
                          </TableCell>
                          <TableCell className={`whitespace-nowrap ${!item.ativo ? 'text-gray-500' : 'text-gray-700'}`}>
                            {formatDate(item.data_validade)}
                          </TableCell>
                          <TableCell>
                            {renderStatusBadge(item.status, item.diasParaVencer)}
                          </TableCell>
                          <TableCell>
                            {item.ativo ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">Ativo</Badge>
                            ) : (
                              <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-300 border-gray-300">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handlePrintSingle(item)}
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 bg-blue-50 h-8 w-8 p-0 rounded-full transition-transform active:scale-90"
                              title="Imprimir esta etiqueta"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 text-sm text-gray-500 bg-gray-50 flex justify-between items-center rounded-b-xl">
              <div className="flex items-center gap-2">
                <span>Mostrando {filteredData.length} registros no total.</span>
              </div>
              {selectedIds.length > 0 && (
                <span className="font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs shadow-sm border border-blue-100 animate-in fade-in slide-in-from-right-2">
                  {selectedIds.length} selecionado(s)
                </span>
              )}
            </div>
          </div>

        </div>

        <PrintDialog 
          isOpen={printDialogOpen} 
          onClose={handleClosePrintDialog} 
          lotes={lotesToPrint} 
        />

      </DashboardLayout>
    </>
  );
}