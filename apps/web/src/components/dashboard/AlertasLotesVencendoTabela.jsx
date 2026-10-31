import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AlertasLotesVencendoTabela({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        Nenhum lote vencendo nos próximos 7 dias.
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/50">
            <TableHead>Produto</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Local</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
            <TableHead>Data Validade</TableHead>
            <TableHead className="text-right">Dias p/ Vencer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{item.produtoNome}</TableCell>
              <TableCell>{item.numeroLote}</TableCell>
              <TableCell>{item.localNome}</TableCell>
              <TableCell className="text-right">{item.quantidade}</TableCell>
              <TableCell>{formatDate(item.dataValidade)}</TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 font-bold">
                  {item.dias} dias
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}