import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function DashboardFilters({ onFilterChange }) {
  // Default to last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const [dataInicio, setDataInicio] = useState(formatDate(thirtyDaysAgo));
  const [dataFim, setDataFim] = useState(formatDate(today));

  const handleApply = () => {
    onFilterChange({ dataInicio, dataFim });
  };

  const handleClear = () => {
    const dInicio = formatDate(thirtyDaysAgo);
    const dFim = formatDate(today);
    setDataInicio(dInicio);
    setDataFim(dFim);
    onFilterChange({ dataInicio: dInicio, dataFim: dFim });
  };

  return (
    <div className="flex flex-col md:flex-row items-end gap-4 py-4 border-b border-gray-200 bg-white p-4 rounded-xl shadow-sm mb-6">
      <div className="space-y-1.5 w-full md:w-auto flex-1">
        <Label htmlFor="dataInicio">Data Início</Label>
        <Input
          id="dataInicio"
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="bg-white text-gray-900"
        />
      </div>
      
      <div className="space-y-1.5 w-full md:w-auto flex-1">
        <Label htmlFor="dataFim">Data Fim</Label>
        <Input
          id="dataFim"
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="bg-white text-gray-900"
        />
      </div>

      <div className="flex gap-2 w-full md:w-auto">
        <Button onClick={handleApply} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white">
          Aplicar Filtros
        </Button>
        <Button onClick={handleClear} variant="outline" className="flex-1 md:flex-none">
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}