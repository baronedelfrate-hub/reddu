import React, { useMemo } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';

export default function ControleBandejasTotalRow({ data }) {
  const totals = useMemo(() => {
    return data.reduce((acc, item) => {
      acc.bandejas += (item.quantidade || 0);
      acc.unidades += ((item.quantidade || 0) * (item.unidades_por_bandeja || 0));
      return acc;
    }, { bandejas: 0, unidades: 0 });
  }, [data]);

  if (!data || data.length === 0) return null;

  return (
    <TableRow className="bg-gray-100/80 hover:bg-gray-100/80 font-bold">
      <TableCell colSpan={5} className="text-right text-gray-900">
        Total Geral (Filtrado)
      </TableCell>
      <TableCell className="text-right text-gray-900">
        {totals.bandejas}
      </TableCell>
      <TableCell className="text-right text-gray-900">
        {totals.unidades}
      </TableCell>
      <TableCell className="text-center text-gray-500">-</TableCell>
      <TableCell className="text-center text-gray-500">-</TableCell>
    </TableRow>
  );
}