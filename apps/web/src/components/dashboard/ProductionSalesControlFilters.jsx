import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export default function ProductionSalesControlFilters({ 
  produtos, 
  locais, 
  filters, 
  onFilterChange 
}) {
  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap gap-6 items-center">
      <div className="w-64">
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
          Filtrar por Produto
        </Label>
        <Select 
          value={filters.produtoId || "todos"} 
          onValueChange={(val) => handleChange('produtoId', val === "todos" ? "" : val)}
        >
          <SelectTrigger className="bg-white border-slate-200">
            <SelectValue placeholder="Todos os produtos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os produtos</SelectItem>
            {produtos.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-64">
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
          Filtrar por Local
        </Label>
        <Select 
          value={filters.localId || "todos"} 
          onValueChange={(val) => handleChange('localId', val === "todos" ? "" : val)}
        >
          <SelectTrigger className="bg-white border-slate-200">
            <SelectValue placeholder="Todos os locais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os locais</SelectItem>
            {locais.map(l => (
              <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2 mt-6 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
        <Checkbox 
          id="saldo-positivo-checkbox" 
          checked={filters.somenteSaldoPositivo} 
          onCheckedChange={(checked) => handleChange('somenteSaldoPositivo', checked)}
        />
        <Label htmlFor="saldo-positivo-checkbox" className="text-sm font-medium text-slate-700 cursor-pointer">
          Mostrar apenas lotes com saldo {'>'} 0
        </Label>
      </div>
    </div>
  );
}