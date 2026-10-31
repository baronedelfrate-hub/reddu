import React, { useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Info } from 'lucide-react';

export default function ProductRankingTable({ data, isLoading, error }) {
  const [page, setPage] = useState(0);
  const limit = 10;

  if (error) {
    return <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200">Erro ao carregar ranking: {error}</div>;
  }

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);

  const totalPages = Math.ceil((data?.length || 0) / limit);
  const paginatedData = data?.slice(page * limit, (page + 1) * limit) || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">Ranking de Produtos</h3>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Produzido</TableHead>
              <TableHead className="text-right">Vendido</TableHead>
              <TableHead className="text-right">Estoque Atual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)] mx-auto" />
                  <p className="text-gray-500 mt-2">Carregando ranking...</p>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-500 space-y-2">
                    <Info className="h-6 w-6 text-blue-400" />
                    <p>Nenhum dado disponível. Se um reset operacional ocorreu, novos dados aparecerão assim que houver movimentação.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, idx) => (
                <TableRow key={row.produto_id || idx}>
                  <TableCell className="font-medium text-gray-900">{row.produto_nome}</TableCell>
                  <TableCell className="text-right text-[var(--color-primary)] font-medium">{formatNumber(row.quantidade_produzida)}</TableCell>
                  <TableCell className="text-right text-green-600 font-medium">{formatNumber(row.quantidade_vendida)}</TableCell>
                  <TableCell className="text-right text-orange-600 font-medium">{formatNumber(row.estoque_atual)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && data?.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-700">
            Mostrando <span className="font-medium">{page * limit + 1}</span> a{' '}
            <span className="font-medium">{Math.min((page + 1) * limit, data.length)}</span> de{' '}
            <span className="font-medium">{data.length}</span> produtos
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