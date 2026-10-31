import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AlertasEstoqueBaixoTabela({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        Nenhum produto com estoque crítico no momento.
      </div>
    );
  }

  const getProgressColor = (percentual) => {
    if (percentual >= 80) return 'bg-green-500';
    if (percentual >= 50) return 'bg-yellow-500';
    if (percentual >= 20) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/50">
            <TableHead>Produto</TableHead>
            <TableHead>Local</TableHead>
            <TableHead className="text-right">Estoque Mínimo</TableHead>
            <TableHead className="text-right">Quantidade Atual</TableHead>
            <TableHead className="w-[200px]">Status do Estoque</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => {
            const min = item.estoqueMinimo || 1; // Prevent division by zero
            const percentual = Math.min(100, Math.max(0, (item.quantidadeAtual / min) * 100));
            const barColor = getProgressColor(percentual);

            return (
              <TableRow key={idx}>
                <TableCell className="font-medium">{item.produtoNome}</TableCell>
                <TableCell>{item.localNome}</TableCell>
                <TableCell className="text-right">{item.estoqueMinimo || '-'}</TableCell>
                <TableCell className="text-right font-bold text-gray-900">{item.quantidadeAtual}</TableCell>
                <TableCell>
                  <div className="w-full space-y-1">
                    <div className="flex justify-between text-xs font-medium text-gray-500">
                      <span>{percentual.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${barColor} transition-all duration-500`} 
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400 text-right">
                      {item.quantidadeAtual} de {item.estoqueMinimo || 0} unidades
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}