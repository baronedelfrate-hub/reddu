import React, { useState, useMemo } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowUpDown, PackageX } from 'lucide-react';

export default function RelatorioVendasTabela({ data }) {
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'data_movimentacao', direction: 'desc' });
  const limit = 10;

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    const sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        // Handle nested properties for sorting
        if (sortConfig.key === 'mercado') aValue = a.locais?.nome || '';
        if (sortConfig.key === 'mercado') bValue = b.locais?.nome || '';
        if (sortConfig.key === 'produto') aValue = a.produtos?.nome || '';
        if (sortConfig.key === 'produto') bValue = b.produtos?.nome || '';
        if (sortConfig.key === 'lote') aValue = a.lotes?.numero_lote || '';
        if (sortConfig.key === 'lote') bValue = b.lotes?.numero_lote || '';

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const paginatedData = sortedData.slice(page * limit, (page + 1) * limit);
  const totalPages = Math.ceil(sortedData.length / limit);

  // Calcula o total da quantidade vendida baseada nos dados filtrados
  const totalQuantidadeVendida = useMemo(() => {
    return data.reduce((acc, row) => acc + (row.quantidade || 0), 0);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 flex flex-col items-center justify-center text-center">
        <div className="p-4 bg-gray-50 rounded-full mb-4">
          <PackageX className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum registro encontrado</h3>
        <p className="text-gray-500 max-w-md">
          Não foram encontradas vendas com os filtros selecionados. Tente ajustar o período ou os filtros de mercado e produto.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead onClick={() => handleSort('data_movimentacao')} className="cursor-pointer hover:bg-gray-100">
                <div className="flex items-center gap-1">Data da Venda <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('mercado')} className="cursor-pointer hover:bg-gray-100">
                <div className="flex items-center gap-1">Mercado <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('produto')} className="cursor-pointer hover:bg-gray-100">
                <div className="flex items-center gap-1">Produto <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('lote')} className="cursor-pointer hover:bg-gray-100">
                <div className="flex items-center gap-1">Lote <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('quantidade')} className="cursor-pointer hover:bg-gray-100 text-right">
                <div className="flex items-center justify-end gap-1">Qtd. Vendida <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(row.data_movimentacao).toLocaleString('pt-BR')}
                </TableCell>
                <TableCell className="font-medium text-gray-900">{row.locais?.nome || 'N/A'}</TableCell>
                <TableCell>{row.produtos?.nome || 'Produto Desconhecido'}</TableCell>
                <TableCell>{row.lotes?.numero_lote || 'N/A'}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {row.quantidade}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="bg-gray-50/80 border-t-2 border-gray-200">
            <TableRow>
              <TableCell colSpan={2}></TableCell>
              <TableCell className="font-bold text-gray-900 text-right">TOTAL</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-bold text-emerald-700 text-lg">
                {totalQuantidadeVendida}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-700">
            Mostrando <span className="font-medium">{page * limit + 1}</span> a{' '}
            <span className="font-medium">{Math.min((page + 1) * limit, data.length)}</span> de{' '}
            <span className="font-medium">{data.length}</span> resultados
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}