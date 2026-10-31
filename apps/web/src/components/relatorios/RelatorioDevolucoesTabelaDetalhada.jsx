import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

export default function RelatorioDevolucoesTabelaDetalhada({ data }) {
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item => 
        (item.produtos?.nome || '').toLowerCase().includes(lowerSearch) ||
        (item.locais?.nome || '').toLowerCase().includes(lowerSearch) ||
        (item.motivo_devolucao || '').toLowerCase().includes(lowerSearch) ||
        (item.local_destino?.nome || '').toLowerCase().includes(lowerSearch)
      );
    }

    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === 'produtos_nome') {
        aVal = a.produtos?.nome || '';
        bVal = b.produtos?.nome || '';
      } else if (sortConfig.key === 'locais_nome') {
        aVal = a.locais?.nome || '';
        bVal = b.locais?.nome || '';
      } else if (sortConfig.key === 'lotes_numero') {
        aVal = a.lotes?.numero_lote || '';
        bVal = b.lotes?.numero_lote || '';
      } else if (sortConfig.key === 'local_destino_nome') {
        aVal = a.local_destino?.nome || '';
        bVal = b.local_destino?.nome || '';
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredAndSortedData.length / limit);
  const paginatedData = filteredAndSortedData.slice(page * limit, (page + 1) * limit);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const SortableHeader = ({ label, sortKey }) => (
    <TableHead onClick={() => handleSort(sortKey)} className="cursor-pointer hover:bg-gray-50">
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-gray-400" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 max-w-sm">
        <Search className="h-4 w-4 text-gray-500 absolute ml-3" />
        <Input
          placeholder="Buscar produto, mercado ou motivo..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0);
          }}
          className="pl-9 bg-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <SortableHeader label="Data" sortKey="data_movimentacao" />
                <SortableHeader label="Mercado Origem" sortKey="locais_nome" />
                <SortableHeader label="Local Destino" sortKey="local_destino_nome" />
                <SortableHeader label="Produto" sortKey="produtos_nome" />
                <SortableHeader label="Lote" sortKey="lotes_numero" />
                <SortableHeader label="Qtd" sortKey="quantidade" />
                <SortableHeader label="Motivo" sortKey="motivo_devolucao" />
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-gray-500">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(item.data_movimentacao)}</TableCell>
                    <TableCell className="font-medium">{item.locais?.nome || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.local_destino?.nome === 'ESTOQUE BANDEJAS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {item.local_destino?.nome || '-'}
                      </span>
                    </TableCell>
                    <TableCell>{item.produtos?.nome || '-'}</TableCell>
                    <TableCell>{item.lotes?.numero_lote || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{item.quantidade}</TableCell>
                    <TableCell className="capitalize">{item.motivo_devolucao?.replace('_', ' ') || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={item.observacao}>
                      {item.observacao || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-sm text-gray-700">
              Página <span className="font-medium">{page + 1}</span> de <span className="font-medium">{totalPages}</span>
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
    </div>
  );
}