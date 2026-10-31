import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEtiquetaDimensions } from '@/hooks/useEtiquetaDimensions';
import { Save, RotateCcw, Settings2, Maximize, Printer, AlertCircle } from 'lucide-react';
import EtiquetaPreviewNew from '@/components/etiquetas/EtiquetaPreviewNew';
import { getThermalPageConfig, generateThermalPDF } from '@/utils/thermalPrinterUtils';
import { createPortal } from 'react-dom';

export default function ConfiguracaoEtiquetaPage() {
  const { dimensions, saveDimensions, resetDimensions } = useEtiquetaDimensions();
  const { toast } = useToast();
  
  const [width, setWidth] = useState(dimensions.width.toString());
  const [height, setHeight] = useState(dimensions.height.toString());
  const [isPrintingTest, setIsPrintingTest] = useState(false);

  // Mock data for preview
  const mockLote = {
    id: 'mock-123',
    numero_lote: 'LOTE-TESTE-001',
    produto: { nome: 'PRODUTO DE TESTE COM NOME LONGO PARA VALIDAR OVERFLOW' },
    quantidade: 150,
    data_fabricacao: new Date().toISOString(),
    data_validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    codigo_barra: '123456789012',
    tipo_lote: 'base'
  };

  useEffect(() => {
    setWidth(dimensions.width.toString());
    setHeight(dimensions.height.toString());
  }, [dimensions]);

  const handleSave = () => {
    const w = parseFloat(width);
    const h = parseFloat(height);

    if (isNaN(w) || isNaN(h) || w < 20 || h < 20) {
      toast({
        title: 'Dimensões inválidas',
        description: 'A largura e altura devem ser números válidos e maiores que 20mm.',
        variant: 'destructive',
      });
      return;
    }

    saveDimensions(w, h);
    toast({
      title: 'Configurações salvas',
      description: `As etiquetas serão impressas no formato ${w}mm x ${h}mm.`,
      className: 'bg-green-600 text-white border-none',
    });
  };

  const handleReset = () => {
    resetDimensions();
    toast({
      title: 'Padrão restaurado',
      description: 'As dimensões foram restauradas para o padrão (60mm x 40mm).',
    });
  };

  const handleTestPrint = async () => {
    setIsPrintingTest(true);
    try {
      const config = getThermalPageConfig(`${width}x${height}`);
      const success = await generateThermalPDF('test-print-root', config);
      if (success) {
        toast({
          title: 'Teste Gerado',
          description: 'Verifique se a impressão não sofre cortes físicos.',
          className: 'bg-green-600 text-white'
        });
      }
    } catch (e) {
      toast({
        title: 'Erro no Teste',
        description: 'Falha ao gerar o PDF de teste.',
        variant: 'destructive'
      });
    } finally {
      setIsPrintingTest(false);
    }
  };

  const mappedProps = {
    productName: mockLote.produto.nome,
    lotNumber: mockLote.numero_lote,
    quantity: mockLote.quantidade,
    manufacturingDate: mockLote.data_fabricacao,
    expirationDate: mockLote.data_validade,
    qrCodeValue: `${window.location.origin}/estoque/lote/${mockLote.id}`,
    barcodeValue: mockLote.codigo_barra || mockLote.numero_lote,
    width: `${width}mm`,
    height: `${height}mm`
  };

  const thermalPrintRoot = (
    <div id="test-print-root" className="fixed top-[-9999px] left-[-9999px] flex flex-col z-[-1] bg-white m-0 p-0">
      <div style={{ width: `${width}mm`, height: `${height}mm`, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }} className="box-border m-0 p-0">
        <EtiquetaPreviewNew {...mappedProps} forPrint={true} />
      </div>
    </div>
  );

  return (
    <>
      <Helmet><title>Configuração de Etiquetas - Estoque 360</title></Helmet>
      <div className="space-y-6 max-w-5xl mx-auto pb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Settings2 className="h-8 w-8 text-blue-600" />
            Ajuste Fino de Etiquetas Térmicas
          </h1>
          <p className="text-gray-600 mt-1">
            Configure as dimensões exatas para a sua impressora (ex: Elgin L42DT) e valide o layout.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-1 lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dimensões da Bobina</CardTitle>
                <CardDescription>
                  Recomendado para Elgin L42DT: 60x40mm. Use zero margens na impressora.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="width">Largura (mm)</Label>
                  <div className="relative">
                    <Input
                      id="width"
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="pr-12 text-gray-900 font-bold"
                      min="20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">
                      mm
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Altura (mm)</Label>
                  <div className="relative">
                    <Input
                      id="height"
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="pr-12 text-gray-900 font-bold"
                      min="20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">
                      mm
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 space-y-2 mt-4">
                  <h4 className="font-bold flex items-center gap-1"><AlertCircle className="h-4 w-4"/> Novo Layout Otimizado</h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    <li>O layout usa <strong>Flexbox Centralizado</strong> com escala ajustada (0.65x).</li>
                    <li>Nenhuma informação será cortada nas bordas da etiqueta.</li>
                    <li>Adequado nativamente para resoluções de 60x40mm.</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2 border-t p-4 bg-gray-50 rounded-b-xl">
                <div className="flex justify-between w-full">
                  <Button variant="outline" onClick={handleReset} className="text-gray-600 text-xs">
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Padrão (60x40)
                  </Button>
                  <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                    <Save className="w-3.5 h-3.5 mr-1" /> Salvar
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>

          <div className="col-span-1 lg:col-span-7">
             <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Maximize className="w-5 h-5 text-blue-600" /> Preview ao Vivo</span>
                  <Button onClick={handleTestPrint} disabled={isPrintingTest} variant="secondary" size="sm" className="font-bold">
                    <Printer className="w-4 h-4 mr-2"/> {isPrintingTest ? 'Gerando...' : 'Impressão de Teste'}
                  </Button>
                </CardTitle>
                <CardDescription>
                  Verifique se o conteúdo cabe exatamente na área sem ser cortado.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-gray-100 rounded-lg mx-4 mb-4 border border-dashed border-gray-300 relative p-4 overflow-hidden">
                
                {parseFloat(width) > 0 && parseFloat(height) > 0 ? (
                  <div className="flex flex-col items-center gap-4 w-full">
                    {/* Component Rendering the Label */}
                    <div className="shadow-lg bg-white inline-block flex items-center justify-center">
                      <EtiquetaPreviewNew {...mappedProps} forPrint={false} />
                    </div>
                    
                    <p className="text-xs text-gray-500 font-medium text-center max-w-sm">
                      Este é o novo modelo com escala ajustada para 60x40mm. As margens foram eliminadas e o conteúdo centralizado.
                    </p>
                  </div>
                ) : (
                  <span className="text-gray-400">Dimensões inválidas</span>
                )}

              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {createPortal(thermalPrintRoot, document.body)}
    </>
  );
}