import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { X, Search } from 'lucide-react';
import { withEstoqueBandejas } from '@/lib/staticLocais';

export default function LotesFilterBar({
  produtos,
  locais,
  filters,
  setFilters,
  onClearFilters
}) {
  const handleChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const locaisComBandejas = withEstoqueBandejas(locais);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Produto Select */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Produto</Label>
          <Select
            value={filters.produto_id}
            onValueChange={(val) => handleChange('produto_id', val)}
          >
            <SelectTrigger className="w-full bg-gray-50 border-gray-200">
              <SelectValue placeholder="Todos os Produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Produtos</SelectItem>
              {produtos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Local Select */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Local</Label>
          <Select
            value={filters.local_id}
            onValueChange={(val) => handleChange('local_id', val)}
          >
            <SelectTrigger className="w-full bg-gray-50 border-gray-200">
              <SelectValue placeholder="Todos os Locais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Locais</SelectItem>
              {locaisComBandejas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lote Origem Search */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lote Origem</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por lote origem..."
              value={filters.loteOrigemSearch || ''}
              onChange={(e) => handleChange('loteOrigemSearch', e.target.value)}
              className="bg-gray-50 border-gray-200 pl-9 pr-8"
            />
            {filters.loteOrigemSearch && (
              <button
                onClick={() => handleChange('loteOrigemSearch', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Data Produção De */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Data de Produção (De)</Label>
          <Input
            type="date"
            value={filters.data_producao_de || ''}
            onChange={(e) => handleChange('data_producao_de', e.target.value)}
            className="bg-gray-50 border-gray-200"
          />
        </div>

        {/* Data Produção Até */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Data de Produção (Até)</Label>
          <Input
            type="date"
            value={filters.data_producao_ate || ''}
            onChange={(e) => handleChange('data_producao_ate', e.target.value)}
            className="bg-gray-50 border-gray-200"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
        {/* Status de Validade */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status de Validade</Label>
          <RadioGroup
            value={filters.status_validade}
            onValueChange={(val) => handleChange('status_validade', val)}
            className="flex flex-col sm:flex-row gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="todos" id="status-todos" />
              <Label htmlFor="status-todos" className="cursor-pointer font-normal">Todos</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="vencidos" id="status-vencidos" />
              <Label htmlFor="status-vencidos" className="cursor-pointer font-normal text-red-600">Vencidos</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="vencendo" id="status-vencendo" />
              <Label htmlFor="status-vencendo" className="cursor-pointer font-normal text-amber-600">Vencendo (7 dias)</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Saldo */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saldo em Estoque</Label>
          <RadioGroup
            value={filters.saldo}
            onValueChange={(val) => handleChange('saldo', val)}
            className="flex flex-col sm:flex-row gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="positivo" id="saldo-positivo" />
              <Label htmlFor="saldo-positivo" className="cursor-pointer font-normal">Apenas saldo &gt; 0</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="todos" id="saldo-todos" />
              <Label htmlFor="saldo-todos" className="cursor-pointer font-normal">Incluir zerados</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="ghost"
          onClick={onClearFilters}
          className="text-gray-500 hover:text-gray-900"
        >
          <X className="h-4 w-4 mr-2" />
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}