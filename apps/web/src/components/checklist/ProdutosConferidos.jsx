import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';

export default function ProdutosConferidos({ products, onUpdateQuantity, onRemove }) {
  if (!products || products.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-gray-500">
        Nenhum produto conferido ainda. Comece escaneando os produtos acima.
      </div>
    );
  }

  return (
    <div className="border rounded-xl shadow-sm overflow-hidden bg-white">
      <Table>
        <TableHeader className="checklist-header">
          <TableRow>
            <TableHead>Produto & Lote</TableHead>
            <TableHead className="text-center">Sistema (Ant)</TableHead>
            <TableHead className="text-center w-32">Físico (Atual)</TableHead>
            <TableHead className="text-center">Diferença</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((prod) => (
            <TableRow key={prod.lote_id} className="checklist-row">
              <TableCell>
                <div className="font-semibold text-gray-900">{prod.produto_nome}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">Lote: {prod.numero_lote}</div>
              </TableCell>
              <TableCell className="text-center font-medium text-gray-600">
                {prod.prevBalance}
              </TableCell>
              <TableCell className="p-2">
                <Input 
                  type="number" 
                  min="0"
                  value={prod.currentBalance} 
                  onChange={(e) => onUpdateQuantity(prod.lote_id, e.target.value)}
                  className="text-center font-bold"
                />
              </TableCell>
              <TableCell className="text-center">
                {prod.diff === 0 ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-600">OK</Badge>
                ) : prod.diff > 0 ? (
                  <Badge className="badge-venda-direta">-{prod.diff} (Vendido)</Badge>
                ) : (
                  <Badge className="badge-consignado">+{Math.abs(prod.diff)} (Sobrou)</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => onRemove(prod.lote_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}