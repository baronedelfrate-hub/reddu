import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle2 } from 'lucide-react';

export default function FinalizarChecklistModal({ 
  isOpen, 
  onClose, 
  products, 
  onConfirm, 
  onGenerateReport,
  isSubmitting 
}) {
  
  // Venda Direta = Positive Difference (Sold)
  const vendasDiretas = products.filter(p => p.diff > 0);
  // Consignado = Negative Difference (Surplus/Shortage logic depending on context, prompt says shortage but diff definition is prev-current. If prev=10, current=12 => -2)
  const consignados = products.filter(p => p.diff < 0);
  const conformes = products.filter(p => p.diff === 0);

  const renderProductList = (title, items, isVenda) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h4 className={`text-sm font-bold uppercase mb-2 ${isVenda ? 'text-emerald-700' : 'text-amber-700'}`}>
          {title} ({items.length})
        </h4>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.lote_id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded border border-gray-100">
              <span className="font-medium text-gray-800">{item.produto_nome}</span>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-xs">Giro: {item.turnover}%</span>
                <Badge variant={isVenda ? "default" : "outline"} className={isVenda ? "bg-emerald-500" : "border-amber-500 text-amber-700"}>
                  {isVenda ? 'Vendido: ' : 'Dif: '}{Math.abs(item.diff)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <CheckCircle2 className="h-6 w-6 text-[var(--color-primary)]" />
            Resumo do Checklist
          </DialogTitle>
          <DialogDescription>
            Revise as divergências antes de finalizar o checklist deste mercado.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {renderProductList('Venda Direta (Saídas)', vendasDiretas, true)}
          {renderProductList('Consignado / Sobras', consignados, false)}
          
          {conformes.length > 0 && (
            <div className="mb-2">
              <h4 className="text-sm font-bold uppercase text-gray-500 mb-2">Conformes ({conformes.length})</h4>
              <p className="text-sm text-gray-500 italic">Produtos sem divergência no estoque.</p>
            </div>
          )}

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-6">
            <h4 className="font-semibold text-blue-900 mb-1">Ações Automáticas</h4>
            <ul className="text-sm text-blue-800 list-disc pl-5 space-y-1">
              <li>Logs de auditoria serão gerados.</li>
              <li>Ajustes de estoque serão consolidados.</li>
              {vendasDiretas.length > 0 && (
                <li>Pedidos de reposição serão criados para itens vendidos.</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onGenerateReport} className="text-gray-600">
            <FileText className="h-4 w-4 mr-2" /> Gerar Relatório
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={onConfirm} disabled={isSubmitting} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Finalização'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}