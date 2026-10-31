import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, XCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function RelatorioVendasFiltros({
  filters,
  setFilters,
  onApply,
  onClear,
  mercados,
  produtos
}) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        <div className="space-y-1.5">
          <Label htmlFor="dataInicio">Data Inicial</Label>
          <Input
            id="dataInicio"
            type="date"
            value={filters.dataInicio}
            onChange={(e) => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))}
            className="bg-white text-gray-900"
          />
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="dataFim">Data Final</Label>
          <Input
            id="dataFim"
            type="date"
            value={filters.dataFim}
            onChange={(e) => setFilters(prev => ({ ...prev, dataFim: e.target.value }))}
            className="bg-white text-gray-900"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mercado">Mercado</Label>
          <Select 
            value={filters.mercadoId} 
            onValueChange={(val) => setFilters(prev => ({ ...prev, mercadoId: val }))}
          >
            <SelectTrigger id="mercado" className="bg-white text-gray-900">
              <SelectValue placeholder="Todos os mercados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os mercados</SelectItem>
              {mercados.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="produto">Produto</Label>
          <Select 
            value={filters.produtoId} 
            onValueChange={(val) => setFilters(prev => ({ ...prev, produtoId: val }))}
          >
            <SelectTrigger id="produto" className="bg-white text-gray-900">
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {produtos.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 lg:flex-col lg:w-32 justify-end mt-4 lg:mt-0">
        <Button onClick={onApply} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
          <Search className="h-4 w-4" />
          Filtrar
        </Button>
        <Button onClick={onClear} variant="outline" className="flex-1 gap-2 text-gray-700">
          <XCircle className="h-4 w-4" />
          Limpar
        </Button>
      </div>
    </div>
  );
}