import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, X } from 'lucide-react';

export default function FilterBar({
  locais,
  filters,
  setFilters,
  onClearFilters
}) {
  const handleChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Local Select */}
        <div className="flex-1 min-w-[200px]">
          <Select
            value={filters.local_id || "all"}
            onValueChange={(val) => handleChange('local_id', val === "all" ? "" : val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os Locais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Locais</SelectItem>
              {locais.map((local) => (
                <SelectItem key={local.id} value={local.id}>
                  {local.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prazo de Validade Select */}
        <div className="flex-1 min-w-[200px]">
          <Select
            value={filters.prazo_validade || "todos"}
            onValueChange={(val) => handleChange('prazo_validade', val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Prazo de Validade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Validades</SelectItem>
              <SelectItem value="7d">Vencendo em até 7 dias</SelectItem>
              <SelectItem value="15d">Vencendo em até 15 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Product / Lot Search */}
        <div className="flex-[2] min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome do produto ou lote..."
            value={filters.product_name}
            onChange={(e) => handleChange('product_name', e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="saldo_positivo"
              checked={filters.saldo_positivo}
              onCheckedChange={(checked) => handleChange('saldo_positivo', checked)}
            />
            <label
              htmlFor="saldo_positivo"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 cursor-pointer"
            >
              Apenas Saldo Positivo
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="saldo_negativo"
              checked={filters.saldo_negativo}
              onCheckedChange={(checked) => handleChange('saldo_negativo', checked)}
            />
            <label
              htmlFor="saldo_negativo"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 cursor-pointer"
            >
              Apenas Saldo Negativo
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="abaixo_minimo"
              checked={filters.abaixo_minimo}
              onCheckedChange={(checked) => handleChange('abaixo_minimo', checked)}
            />
            <label
              htmlFor="abaixo_minimo"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 cursor-pointer"
            >
              Abaixo do Estoque Mínimo
            </label>
          </div>
        </div>

        <Button
          variant="ghost"
          onClick={onClearFilters}
          className="text-gray-500 hover:text-gray-900 mt-2 sm:mt-0 px-3 h-9"
        >
          <X className="h-4 w-4 mr-2" />
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}