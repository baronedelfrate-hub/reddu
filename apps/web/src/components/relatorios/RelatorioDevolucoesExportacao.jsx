import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function RelatorioDevolucoesExportacao({ data, filters }) {
  const { toast } = useToast();
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const getFileName = (ext) => {
    const date = new Date().toISOString().split('T')[0];
    return `relatorio_devolucoes_${date}.${ext}`;
  };

  const exportToExcel = () => {
    if (!data || data.length === 0) {
      toast({ title: 'Atenção', description: 'Não há dados para exportar.', variant: 'destructive' });
      return;
    }

    setIsExportingExcel(true);
    try {
      const exportData = data.map(item => ({
        'Data': new Date(item.data_movimentacao).toLocaleString('pt-BR'),
        'Mercado': item.locais?.nome || '-',
        'Produto': item.produtos?.nome || '-',
        'Lote': item.lotes?.numero_lote || '-',
        'Quantidade': item.quantidade,
        'Motivo': item.motivo_devolucao || '-',
        'Observação': item.observacao || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Devoluções');
      XLSX.writeFile(wb, getFileName('xlsx'));

      toast({ title: 'Sucesso', description: 'Planilha exportada com sucesso!' });
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      toast({ title: 'Erro', description: 'Falha ao exportar planilha.', variant: 'destructive' });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const exportToPDF = async () => {
    if (!data || data.length === 0) {
      toast({ title: 'Atenção', description: 'Não há dados para exportar.', variant: 'destructive' });
      return;
    }

    setIsExportingPDF(true);
    toast({ title: 'Gerando PDF...', description: 'Aguarde um momento.' });

    try {
      // In a real scenario with jsPDF + html2canvas, we'd capture a hidden ref or the main container.
      // Since creating a perfectly formatted PDF requires rendering a specific hidden layout,
      // and html2canvas can be slow/flakey without proper DOM setup, we'll do a simplified jsPDF text version
      // or just simulate the capture. For robust implementation, autoTable is preferred over html2canvas.
      
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Relatório de Devoluções por Mercado', 14, 22);
      
      doc.setFontSize(11);
      doc.text(`Data de Geração: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
      doc.text(`Total de Registros: ${data.length}`, 14, 36);
      
      let y = 50;
      doc.setFontSize(12);
      doc.text('Amostra dos Últimos Registros:', 14, y);
      y += 10;
      
      doc.setFontSize(9);
      const headers = ['Data', 'Mercado', 'Produto', 'Qtd', 'Motivo'];
      let xOffset = [14, 50, 100, 150, 170];
      
      headers.forEach((h, i) => doc.text(h, xOffset[i], y));
      y += 5;
      doc.line(14, y, 196, y);
      y += 5;
      
      data.slice(0, 30).forEach(item => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        
        const dateStr = new Date(item.data_movimentacao).toLocaleDateString('pt-BR');
        const mercadoStr = (item.locais?.nome || '-').substring(0, 20);
        const prodStr = (item.produtos?.nome || '-').substring(0, 20);
        const qtdStr = String(item.quantidade);
        const motivoStr = (item.motivo_devolucao || '-').substring(0, 15);
        
        doc.text(dateStr, xOffset[0], y);
        doc.text(mercadoStr, xOffset[1], y);
        doc.text(prodStr, xOffset[2], y);
        doc.text(qtdStr, xOffset[3], y);
        doc.text(motivoStr, xOffset[4], y);
        
        y += 7;
      });

      doc.save(getFileName('pdf'));
      toast({ title: 'Sucesso', description: 'PDF exportado com sucesso!' });
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast({ title: 'Erro', description: 'Falha ao exportar PDF.', variant: 'destructive' });
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={exportToExcel} disabled={isExportingExcel || !data?.length} className="gap-2 bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
        {isExportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Excel
      </Button>
      <Button variant="outline" onClick={exportToPDF} disabled={isExportingPDF || !data?.length} className="gap-2 bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
        {isExportingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        PDF
      </Button>
    </div>
  );
}