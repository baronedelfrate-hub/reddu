import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, AlertTriangle, Calendar, MapPin, DollarSign, Layers } from 'lucide-react';
import AuditoriaDetalhesModal from './AuditoriaDetalhesModal';

export default function RelatorioAuditoriasTabela({ data = [], loading = false, empresaLogoUrl, empresaNome }) {
  const [selectedAuditoria, setSelectedAuditoria] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value || 0);

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleViewDetails = (audit) => {
    setSelectedAuditoria(audit);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedAuditoria(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Nenhuma Auditoria Encontrada</h3>
            <p className="text-sm text-gray-600">Não há auditorias registradas para os filtros selecionados.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-bold text-gray-700 uppercase text-xs">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Data</div>
                </TableHead>
                <TableHead className="font-bold text-gray-700 uppercase text-xs">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Mercado</div>
                </TableHead>
                <TableHead className="text-center font-bold text-gray-700 uppercase text-xs">
                  <div className="flex items-center justify-center gap-2"><Layers className="h-4 w-4" /> Lotes</div>
                </TableHead>
                <TableHead className="text-right font-bold text-gray-700 uppercase text-xs">
                  <div className="flex items-center justify-end gap-2"><DollarSign className="h-4 w-4" /> Total Vendido</div>
                </TableHead>
                <TableHead className="text-center font-bold text-gray-700 uppercase text-xs">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((auditoria, idx) => (
                <TableRow key={auditoria.id || idx} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-gray-900 whitespace-nowrap">
                    {formatDateTime(auditoria.data_auditoria)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">
                    {auditoria.locais?.nome || 'N/A'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                      {auditoria.total_itens || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-700">
                    {formatCurrency(auditoria.total_vendido)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                      onClick={() => handleViewDetails(auditoria)}
                    >
                      <Eye className="h-4 w-4" /> Ver Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedAuditoria && (
        <AuditoriaDetalhesModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          auditoria={selectedAuditoria}
          empresaLogoUrl={empresaLogoUrl}
          empresaNome={empresaNome}
        />
      )}
    </>
  );
}