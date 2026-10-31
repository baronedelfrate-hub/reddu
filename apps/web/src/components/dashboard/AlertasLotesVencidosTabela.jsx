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

export default function AlertasLotesVencidosTabela({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        Nenhum lote vencido encontrado.
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
            <TableHead className="text-right">Dias Vencido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium text-red-700">{item.produtoNome}</TableCell>
              <TableCell>{item.numeroLote}</TableCell>
              <TableCell>{item.localNome}</TableCell>
              <TableCell className="text-right font-medium">{item.quantidade}</TableCell>
              <TableCell className="text-red-600 font-medium">{formatDate(item.dataValidade)}</TableCell>
              <TableCell className="text-right">
                <Badge variant="destructive" className="font-bold shadow-sm">
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