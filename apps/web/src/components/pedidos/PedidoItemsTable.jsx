import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

export default function PedidoItemsTable({ items, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-50/50 border rounded-lg border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-sm font-medium">Carregando itens...</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 border rounded-lg bg-slate-50 border-dashed">
        <p className="text-sm">Nenhum item encontrado neste pedido.</p>
      </div>
    );
  }

  const totalGeral = items.reduce((acc, item) => {
    const unidadesPorBandeja = item.produtos?.unidades_por_bandeja || 0;
    return acc + (Number(item.quantidade_bandejas) * unidadesPorBandeja);
  }, 0);

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50/80">
          <TableRow>
            <TableHead className="font-semibold text-slate-700">Produto</TableHead>
            <TableHead className="text-right font-semibold text-slate-700">Qtd Solicitada (Bandejas)</TableHead>
            <TableHead className="text-right font-semibold text-slate-700">Total a Produzir (Unidades)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const unidadesPorBandeja = item.produtos?.unidades_por_bandeja || 0;
            const totalProduzir = Number(item.quantidade_bandejas) * unidadesPorBandeja;

            return (
              <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-medium text-slate-900">
                  {item.produtos?.nome || 'Produto Desconhecido'}
                  {unidadesPorBandeja > 0 && (
                    <span className="text-xs text-slate-500 ml-2">({unidadesPorBandeja} un/bdj)</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-700">
                  {item.quantidade_bandejas}
                </TableCell>
                <TableCell className="text-right font-bold text-indigo-600">
                  {totalProduzir}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-indigo-50/80 border-t-2 border-indigo-200">
          <TableRow>
            <TableCell colSpan={2} className="text-right font-bold text-indigo-900">
              Total geral de unidades a produzir:
            </TableCell>
            <TableCell className="text-right font-bold text-indigo-700 text-lg">
              {totalGeral}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}