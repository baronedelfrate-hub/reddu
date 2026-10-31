import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Filter, XCircle } from 'lucide-react';

export default function RelatorioVendasFiltrosConsolidados({ filters, setFilters, onApply, onClear, produtos, locais }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
        <Filter className="h-4 w-4 text-gray-500" />
        <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider">Filtros do Relatório</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Data Inicial</Label>
          <Input 
            type="date" 
            value={filters.dataInicio} 
            onChange={(e) => setFilters({...filters, dataInicio: e.target.value})}
            className="bg-white border-gray-200"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Data Final</Label>
          <Input 
            type="date" 
            value={filters.dataFim} 
            onChange={(e) => setFilters({...filters, dataFim: e.target.value})}
            className="bg-white border-gray-200"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Canal</Label>
          <Select 
            value={filters.canalVenda || 'all'} 
            onValueChange={(val) => setFilters({...filters, canalVenda: val})}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PDV">PDV</SelectItem>
              <SelectItem value="MERCADO">Mercado</SelectItem>
              <SelectItem value="APP">Aplicativo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Pagamento</Label>
          <Select 
            value={filters.formaPagamento} 
            onValueChange={(val) => setFilters({...filters, formaPagamento: val})}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
              <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Produto</Label>
          <Select 
            value={filters.produtoId} 
            onValueChange={(val) => setFilters({...filters, produtoId: val})}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {produtos?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold">Local</Label>
          <Select 
            value={filters.localId} 
            onValueChange={(val) => setFilters({...filters, localId: val})}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {locais?.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onClear} className="gap-2 border-gray-200 text-gray-600 hover:bg-gray-50">
          <XCircle className="h-4 w-4" />
          Limpar Filtros
        </Button>
        <Button onClick={onApply} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Filter className="h-4 w-4" />
          Aplicar Filtros
        </Button>
      </div>
    </div>
  );
}