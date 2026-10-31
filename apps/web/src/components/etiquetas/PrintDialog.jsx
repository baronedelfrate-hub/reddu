import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Printer, X, CheckCircle2, SplitSquareHorizontal, Settings2, Eye, Ruler } from 'lucide-react';
import EtiquetaPreview from './EtiquetaPreview';
import EtiquetaNutricionalPreview from './EtiquetaNutricionalPreview';
import PrinterSelector from './PrinterSelector';
import { supabase } from '@/lib/customSupabaseClient';
import { getThermalPageConfig, generateThermalPDF } from '@/utils/thermalPrinterUtils';
import { produtoTemTabelaNutricional } from '@/utils/nutritionalTable';

const NUTRI_LABEL_SIZES = ['80x150', '80x120', '100x150'];
const DEFAULT_NUTRI_LABEL_SIZE = '80x150';

export default function PrintDialog({ isOpen, onClose, lotes = [] }) {
  const { toast } = useToast();
  const [enrichedLotes, setEnrichedLotes] = useState([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [fracQty, setFracQty] = useState('');
  const [fracError, setFracError] = useState('');

  const [printMode, setPrintMode] = useState('thermal'); // Default to thermal for exact 60x40
  const [labelSize, setLabelSize] = useState('60x40');
  const [tipoEtiqueta, setTipoEtiqueta] = useState('padrao'); // 'padrao' | 'nutricional'

  useEffect(() => {
    if (!isOpen) {
      setFracQty('');
      setFracError('');
      setIsSuccess(false);
      setIsGenerating(false);
      setTipoEtiqueta('padrao');
      setPrintMode('thermal');
      setLabelSize('60x40');
    }
  }, [isOpen]);

  const produtoTemNutricional = enrichedLotes.length > 0 && enrichedLotes.every(
    (l) => produtoTemTabelaNutricional(l.produtos || l.produto)
  );

  const handleTipoEtiquetaChange = (val) => {
    setTipoEtiqueta(val);
    if (val === 'nutricional') {
      setPrintMode('standard');
      setLabelSize(DEFAULT_NUTRI_LABEL_SIZE);
    } else {
      setPrintMode('thermal');
      setLabelSize('60x40');
    }
  };

  useEffect(() => {
    async function fetchOriginLoteDetails() {
      if (!lotes || lotes.length === 0) {
        setEnrichedLotes([]);
        return;
      }

      console.log('DEBUG: Iniciando fetchOriginLoteDetails. Lotes recebidos:', lotes);

      const lotesToProcess = [...lotes];
      const originIdsToFetch = lotesToProcess
        .filter(l => l.tipo_lote === 'bandeja' && l.lote_origem_id && !l.lote_origem_numero)
        .map(l => l.lote_origem_id);
      
      console.log('DEBUG: IDs de origem a buscar:', originIdsToFetch);
      
      if (originIdsToFetch.length > 0) {
        try {
          const uniqueIds = [...new Set(originIdsToFetch)];
          const { data, error } = await supabase
            .from('lotes')
            .select('id, numero_lote')
            .in('id', uniqueIds);

          if (!error && data) {
            console.log('DEBUG: Lotes de origem encontrados:', data);
            const originMap = data.reduce((acc, curr) => {
              acc[curr.id] = curr.numero_lote;
              return acc;
            }, {});

            lotesToProcess.forEach(l => {
              if (l.tipo_lote === 'bandeja' && l.lote_origem_id && originMap[l.lote_origem_id]) {
                l.lote_origem_numero = originMap[l.lote_origem_id];
              }
            });
          } else if (error) {
            console.error('DEBUG: Erro ao buscar lotes de origem:', error);
          }
        } catch (err) {
          console.error('Erro ao buscar lote(s) de origem:', err);
        }
      }

      console.log('DEBUG: Lotes enriquecidos prontos para uso:', lotesToProcess);
      setEnrichedLotes(lotesToProcess);
    }

    if (isOpen) {
      fetchOriginLoteDetails();
    }
  }, [lotes, isOpen]);

  const handleFracChange = (e) => {
    const val = e.target.value;
    setFracQty(val);
    
    if (!val) {
      setFracError('');
      return;
    }
    
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      setFracError('Quantidade deve ser maior que 0');
      return;
    }
    
    if (enrichedLotes.length === 1) {
      if (num > enrichedLotes[0].quantidade) {
        setFracError('Não pode exceder a quantidade do lote');
        return;
      }
    } else if (enrichedLotes.length > 1) {
      const exceeds = enrichedLotes.some(l => num > l.quantidade);
      if (exceeds) {
        setFracError('Excede a quantidade de um dos lotes selecionados');
        return;
      }
    }
    
    setFracError('');
  };

  const finalLabelsToPrint = useMemo(() => {
    if (fracError || !fracQty) {
      return enrichedLotes.map(l => ({ ...l, labelQuantity: l.quantidade }));
    }
    
    const num = parseInt(fracQty, 10);
    let labels = [];
    
    enrichedLotes.forEach(lote => {
      let rem = lote.quantidade;
      while (rem > 0) {
        let take = Math.min(rem, num);
        labels.push({ ...lote, labelQuantity: take });
        rem -= take;
      }
    });
    
    return labels;
  }, [enrichedLotes, fracQty, fracError]);

  const handlePrint = async () => {
    if (fracError) {
      toast({ title: 'Quantidade Inválida', description: fracError, variant: 'destructive' });
      return;
    }

    if (!finalLabelsToPrint.length) return;

    if (printMode === 'thermal') {
      setIsGenerating(true);
      console.log('DEBUG: Iniciando impressão térmica com os lotes:', finalLabelsToPrint);
      
      try {
        const config = getThermalPageConfig(labelSize);
        const success = await generateThermalPDF(finalLabelsToPrint, config);
        
        if (success) {
          setIsSuccess(true);
          toast({
            title: 'PDF Termal Gerado',
            description: 'Pronto para impressão direta sem margens na Elgin L42DT.',
            className: 'bg-green-600 text-white'
          });
          setTimeout(() => onClose(), 2000);
        } else {
          throw new Error("Falha na geração do PDF");
        }
      } catch (error) {
        console.error("Erro no handlePrint termal:", error);
        toast({
          title: 'Erro na Impressão',
          description: 'Não foi possível gerar o PDF termal exato.',
          variant: 'destructive'
        });
      } finally {
        setIsGenerating(false);
      }
    } else {
      try {
        window.print();
        setIsSuccess(true);
        toast({
          title: 'Impressão Finalizada',
          description: `O diálogo de impressão do sistema foi fechado.`,
          className: 'bg-green-600 text-white border-none'
        });
        setTimeout(() => onClose(), 2000);
      } catch (error) {
        toast({
          title: 'Erro de Impressão',
          description: 'Não foi possível abrir o diálogo de impressão.',
          variant: 'destructive'
        });
      }
    }
  };

  const thermalConfig = getThermalPageConfig(labelSize);

  const printRoot = (
    <div id="print-root" className="hidden print:block absolute top-0 left-0 m-0 p-0 z-[9999] bg-white w-full h-full">
      <style>
        {`@media print {
            @page {
              size: ${thermalConfig.width}mm ${thermalConfig.height}mm;
              margin: 0;
              padding: 0;
            }
            body { margin: 0; padding: 0; }
          }`}
      </style>
      {printMode === 'standard' && finalLabelsToPrint.map((lote, index) => (
        <div key={`${lote.id}-${index}`} className="page-break overflow-hidden box-border m-0 p-0" style={{ width: `${thermalConfig.width}mm`, height: `${thermalConfig.height}mm` }}>
          {tipoEtiqueta === 'nutricional' ? (
            <EtiquetaNutricionalPreview lote={lote} forPrint={true} labelQuantity={lote.labelQuantity} labelSize={labelSize} />
          ) : (
            <EtiquetaPreview lote={lote} forPrint={true} labelQuantity={lote.labelQuantity} printMode={printMode} labelSize={labelSize} />
          )}
        </div>
      ))}
    </div>
  );

  const thermalPrintRoot = printMode === 'thermal' && tipoEtiqueta === 'padrao' && (
    <div id="thermal-print-root" className="fixed top-[-9999px] left-[-9999px] flex flex-col z-[-1] bg-white m-0 p-0">
      {finalLabelsToPrint.map((lote, index) => (
        <div key={`thermal-${lote.id}-${index}`} style={{ width: `${thermalConfig.width}mm`, height: `${thermalConfig.height}mm`, pageBreakAfter: 'always', margin: 0, padding: 0, overflow: 'hidden' }} className="box-border">
          <EtiquetaPreview lote={lote} forPrint={true} labelQuantity={lote.labelQuantity} printMode="thermal" labelSize={labelSize} />
        </div>
      ))}
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md md:max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden print:hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="bg-gray-50 p-4 border-b border-gray-100 rounded-t-xl pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-800">
              <Printer className="h-5 w-5 text-blue-600" />
              {tipoEtiqueta === 'nutricional'
                ? `Configurar Impressão Nutricional (${labelSize.replace('x', 'mm x ')}mm)`
                : 'Configurar Impressão Exata (60x40mm)'}
            </DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-6">
            {isSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Processo Finalizado!</h3>
                <p className="text-gray-500">A sua impressão foi processada com sucesso sem margens.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Col: Configs */}
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 font-semibold text-gray-800 pb-2 border-b border-gray-100">
                        <Settings2 className="h-4 w-4" /> Configurações
                      </div>

                      <div className="space-y-3">
                        <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tipo de Etiqueta</Label>
                        <RadioGroup value={tipoEtiqueta} onValueChange={handleTipoEtiquetaChange} className="flex flex-col gap-2">
                          <div className={`flex items-center space-x-2 border p-2 rounded-lg cursor-pointer ${tipoEtiqueta === 'padrao' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                            <RadioGroupItem value="padrao" id="r-tipo-padrao" />
                            <Label htmlFor="r-tipo-padrao" className="cursor-pointer font-medium text-sm">Padrão (Lote / QR)</Label>
                          </div>
                          <div className={`flex items-center space-x-2 border p-2 rounded-lg ${!produtoTemNutricional ? 'opacity-50 cursor-not-allowed border-gray-200' : (tipoEtiqueta === 'nutricional' ? 'border-blue-500 bg-blue-50 cursor-pointer' : 'border-gray-200 cursor-pointer')}`}>
                            <RadioGroupItem value="nutricional" id="r-tipo-nutricional" disabled={!produtoTemNutricional} />
                            <Label htmlFor="r-tipo-nutricional" className={`font-medium text-sm ${produtoTemNutricional ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                              Nutricional (RDC 429/2020)
                            </Label>
                          </div>
                        </RadioGroup>
                        {!produtoTemNutricional && (
                          <p className="text-[11px] text-gray-400 leading-tight">
                            Cadastre a tabela nutricional no produto para habilitar esta etiqueta.
                          </p>
                        )}
                      </div>

                      {tipoEtiqueta === 'padrao' && (
                        <div className="space-y-3">
                          <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Modo de Impressão</Label>
                          <RadioGroup value={printMode} onValueChange={setPrintMode} className="flex flex-col gap-2">
                            <div className={`flex items-center space-x-2 border p-2 rounded-lg cursor-pointer ${printMode === 'thermal' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                              <RadioGroupItem value="thermal" id="r-thermal" />
                              <Label htmlFor="r-thermal" className="cursor-pointer font-medium text-sm">Térmica Exata (Elgin L42DT)</Label>
                            </div>
                            <div className={`flex items-center space-x-2 border p-2 rounded-lg cursor-pointer ${printMode === 'standard' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                              <RadioGroupItem value="standard" id="r-standard" />
                              <Label htmlFor="r-standard" className="cursor-pointer font-medium text-sm">Padrão (Navegador com Margem)</Label>
                            </div>
                          </RadioGroup>
                        </div>
                      )}

                      {tipoEtiqueta === 'padrao' && printMode === 'thermal' && (
                        <div className="space-y-3 pt-2">
                          <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tamanho da Etiqueta</Label>
                          <Select value={labelSize} onValueChange={setLabelSize}>
                            <SelectTrigger className="w-full bg-white text-sm h-10">
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="60x40">60mm x 40mm (Recomendado)</SelectItem>
                              <SelectItem value="55x38">55mm x 38mm (Com margem extra)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {tipoEtiqueta === 'nutricional' && (
                        <div className="space-y-3 pt-2">
                          <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tamanho da Etiqueta</Label>
                          <Select value={labelSize} onValueChange={setLabelSize}>
                            <SelectTrigger className="w-full bg-white text-sm h-10">
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {NUTRI_LABEL_SIZES.map((size) => (
                                <SelectItem key={size} value={size}>{size.replace('x', 'mm x ')}mm</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-gray-400 leading-tight">
                            Impressa via diálogo padrão do navegador (não usa o modo térmico exato).
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-1">
                        <SplitSquareHorizontal className="h-4 w-4 text-blue-600" />
                        <Label className="font-semibold text-gray-700">Fracionar Quantidade</Label>
                      </div>
                      <p className="text-xs text-gray-500 mb-2 leading-tight">
                        Divida a quantidade total do lote em múltiplas etiquetas.
                      </p>
                      <Input
                        type="number"
                        placeholder="Ex: 30"
                        value={fracQty}
                        onChange={handleFracChange}
                        className={`bg-white h-9 ${fracError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {fracError && <p className="text-xs text-red-500 mt-1 font-medium">{fracError}</p>}
                    </div>
                  </div>

                  {/* Right Col: Preview */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-gray-700 flex items-center gap-1"><Eye className="h-4 w-4"/> Preview Final</span>
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                        {finalLabelsToPrint.length} Etiquetas
                      </span>
                    </div>

                    {printMode === 'thermal' && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] p-2 rounded flex items-start gap-1.5 leading-tight">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p>Modo Exato: O PDF gerado terá exatamente {labelSize} sem margens ou dimensionamento do navegador, ideal para impressoras térmicas.</p>
                      </div>
                    )}
                    
                    <div className="bg-gray-100/50 p-4 rounded-xl border border-gray-200 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden">
                      <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white shadow-sm z-20">
                        <Ruler className="h-3 w-3" /> {labelSize.replace('x', 'mm x ')}mm
                      </div>
                      
                      {finalLabelsToPrint.length > 0 && (
                        <div className="py-2 w-full flex justify-center">
                          {tipoEtiqueta === 'nutricional' ? (
                            <EtiquetaNutricionalPreview
                              lote={finalLabelsToPrint[0]}
                              forPrint={false}
                              labelQuantity={finalLabelsToPrint[0].labelQuantity}
                              labelSize={labelSize}
                            />
                          ) : (
                            <EtiquetaPreview
                              lote={finalLabelsToPrint[0]}
                              forPrint={false}
                              labelQuantity={finalLabelsToPrint[0].labelQuantity}
                              printMode={printMode}
                              labelSize={labelSize}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>

          {!isSuccess && (
            <DialogFooter className="bg-gray-50 p-4 border-t border-gray-100 gap-2 sm:gap-0 flex flex-col sm:flex-row justify-between items-center">
               <PrinterSelector />
               <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="border-gray-300" disabled={isGenerating}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button 
                  onClick={handlePrint} 
                  disabled={enrichedLotes.length === 0 || !!fracError || isGenerating}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md font-semibold"
                >
                  {isGenerating ? (
                    <span className="animate-pulse">Gerando PDF Exato...</span>
                  ) : (
                    <>
                      <Printer className="h-4 w-4 mr-2" />
                      {tipoEtiqueta === 'nutricional'
                        ? 'Imprimir Nutricional'
                        : (printMode === 'thermal' ? 'Imprimir Térmica' : 'Imprimir Padrão')}
                    </>
                  )}
                </Button>
               </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {createPortal(printRoot, document.body)}
      {createPortal(thermalPrintRoot, document.body)}
    </>
  );
}