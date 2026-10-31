import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrencyBR } from '@/utils/CaixaMovimentacoesService';
import { ArrowDownCircle } from 'lucide-react';

export default function CaixaMovimentacoesHistorico({ movimentacoes = [] }) {
  if (!movimentacoes || movimentacoes.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-gray-500 bg-gray-50 rounded-md border border-dashed border-gray-200">
        Nenhuma movimentação registrada neste caixa.
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden bg-white print:border-none">
      <Table>
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="w-[100px]">Tipo</TableHead>
            <TableHead>Data/Hora</TableHead>
            <TableHead>Observação</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimentacoes.map((mov) => (
            <TableRow key={mov.id}>
              <TableCell>
                <div className="flex items-center gap-1 text-red-600 font-medium text-xs">
                  <ArrowDownCircle className="w-3 h-3" />
                  {mov.tipo}
                </div>
              </TableCell>
              <TableCell className="text-xs text-gray-600">
                {new Date(mov.created_at).toLocaleString('pt-BR')}
              </TableCell>
              <TableCell className="text-xs text-gray-600 max-w-[150px] truncate" title={mov.observacao}>
                {mov.observacao || '-'}
              </TableCell>
              <TableCell className="text-xs text-gray-600">
                {mov.usuarios?.nome || 'Sistema'}
              </TableCell>
              <TableCell className="text-right font-bold text-red-600">
                -{formatCurrencyBR(mov.valor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}