import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, X, DollarSign, Package, CheckCircle, Calendar, MapPin, FileText, Layers } from 'lucide-react';
import { formatDateBR } from '@/utils/dateFormatter';
import { formatMoney } from '@/utils/currencyFormatter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function AuditoriaDetalhesModal({ isOpen, onClose, auditoria, empresaLogoUrl, empresaNome }) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const modalContentRef = useRef(null);

  useEffect(() => {
    if (isOpen && auditoria) {
      console.log('[AuditoriaDetalhesModal] auditoria:', auditoria);
    }
  }, [isOpen, auditoria]);

  if (!auditoria) return null;

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Itens da auditoria — vêm de auditoria_mercado_itens já processados pelo hook
  // com numero_lote e lote_origem_numero resolvidos.
  const itens = Array.isArray(auditoria.itens) ? auditoria.itens : [];
  const hasItens = itens.length > 0;
  const itensVendidos = itens.filter(i => Number(i.quantidade_calculada_vendida) > 0);
  const itensReabastecidos = itens.filter(i => Number(i.reabastecimento) > 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const element = modalContentRef.current;
      if (!element) throw new Error('Modal content not found');

      const printContainer = document.createElement('div');
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-9999px';
      printContainer.style.width = '800px';
      printContainer.style.padding = '40px';
      printContainer.style.backgroundColor = 'white';
      document.body.appendChild(printContainer);

      const clonedContent = element.cloneNode(true);
      printContainer.appendChild(clonedContent);

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(printContainer, {
        scale: 2, logging: false, useCORS: true, allowTaint: true
      });

      document.body.removeChild(printContainer);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `auditoria_${auditoria.locais?.nome || 'mercado'}_${formatDateBR(auditoria.data_auditoria).replace(/\//g, '-')}.pdf`;
      pdf.save(filename);

      toast({ title: '✅ PDF Exportado', description: 'O relatório foi baixado com sucesso.', duration: 3000 });
    } catch (error) {
      console.error('[AuditoriaDetalhesModal] Export error:', error);
      toast({ title: 'Erro ao Exportar PDF', description: error.message || 'Ocorreu um erro ao gerar o PDF.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="h-6 w-6 text-blue-600" />
              Detalhes da Auditoria
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div ref={modalContentRef} className="space-y-6 py-4">

          {/* Header Info */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-blue-700 font-semibold uppercase">Mercado</p>
                  <p className="text-sm font-bold text-blue-900">{auditoria.locais?.nome || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-blue-700 font-semibold uppercase">Data/Hora</p>
                  <p className="text-sm font-bold text-blue-900">{formatDateTime(auditoria.data_auditoria)}</p>
                </div>
              </div>
            </div>
            {empresaLogoUrl && (
              <div className="mt-4 h-12 w-auto max-w-[150px] flex items-center">
                <img src={empresaLogoUrl} alt={empresaNome} className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Total Vendido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-900">{formatMoney(auditoria.total_vendido)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <Package className="h-4 w-4" /> Lotes Contados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-900">{auditoria.total_itens || 0}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-purple-700 uppercase flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Reabastecidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-purple-900">{itensReabastecidos.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Itens da Auditoria — com Lote e Lote de Origem */}
          {hasItens ? (
            <Card className="border-teal-200">
              <CardHeader className="bg-teal-50 border-b border-teal-200">
                <CardTitle className="text-lg flex items-center gap-2 text-teal-900">
                  <Layers className="h-5 w-5 text-teal-600" />
                  Itens Contados ({itens.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-teal-50/60 hover:bg-teal-50/60">
                        <TableHead className="font-bold text-teal-900">Produto</TableHead>
                        <TableHead className="font-bold text-teal-900">Lote da Bandeja</TableHead>
                        <TableHead className="font-bold text-teal-900">Lote de Origem</TableHead>
                        <TableHead className="font-bold text-teal-900 text-right">Contado</TableHead>
                        <TableHead className="font-bold text-teal-900 text-right">Vendido</TableHead>
                        <TableHead className="font-bold text-teal-900 text-right">Reabastecido</TableHead>
                        <TableHead className="font-bold text-teal-900 text-right">Valor Unit.</TableHead>
                        <TableHead className="font-bold text-teal-900 text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item, idx) => (
                        <TableRow key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-teal-50/20'}>
                          <TableCell className="font-medium text-gray-900">{item.produto_nome}</TableCell>
                          <TableCell className="font-mono text-xs text-gray-700">{item.numero_lote || '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-purple-600">{item.lote_origem_numero || '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-gray-900">{item.quantidade_contada ?? '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-teal-700">
                            {Number(item.quantidade_calculada_vendida) > 0 ? item.quantidade_calculada_vendida : '—'}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {Number(item.reabastecimento) > 0 ? `+${item.reabastecimento}` : '—'}
                          </TableCell>
                          <TableCell className="text-right text-gray-700">{formatMoney(item.valor_unitario)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-700">{formatMoney(item.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-6 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-lg font-bold text-gray-700">Nenhum Item Registrado</p>
                <p className="text-sm text-gray-500 mt-1">Não foram registrados itens nesta auditoria.</p>
              </CardContent>
            </Card>
          )}

          {/* Observação */}
          {auditoria.observacao && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{auditoria.observacao}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          <div className="bg-gray-50 p-4 rounded-lg text-xs text-gray-600 text-center">
            <p>Relatório gerado automaticamente pelo sistema de auditoria de mercados.</p>
            <p className="mt-1">ID da Auditoria: <span className="font-mono font-semibold">{auditoria.id}</span></p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isExporting ? (
              <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exportando...</>
            ) : (
              <><Download className="h-4 w-4" /> Exportar PDF</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}