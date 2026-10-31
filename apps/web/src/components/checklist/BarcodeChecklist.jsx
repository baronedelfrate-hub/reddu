import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/customSupabaseClient';
import { Barcode, Search, Loader2, XCircle, PackagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BarcodeChecklist({ empresaId, localId, onAddProduct }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundStock, setFoundStock] = useState(null);
  const [currentCount, setCurrentCount] = useState('');
  const inputRef = useRef(null);
  const countRef = useRef(null);
  const debounceTimeout = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const searchProductInStock = async (query) => {
    if (!query || !empresaId || !localId) {
      setFoundStock(null);
      return;
    }

    setIsSearching(true);

    try {
      // First find the product id from barcode
      const { data: prodData, error: prodErr } = await supabase
        .from('produtos')
        .select('id, nome, barcode')
        .eq('empresa_id', empresaId)
        .eq('barcode', query)
        .maybeSingle();

      let targetProdutoId = prodData?.id;

      if (!prodData && !prodErr) {
        // Try to search by name if barcode fails
        const { data: nameData } = await supabase
          .from('produtos')
          .select('id, nome')
          .eq('empresa_id', empresaId)
          .ilike('nome', `%${query}%`)
          .limit(1)
          .maybeSingle();
        targetProdutoId = nameData?.id;
      }

      if (targetProdutoId) {
        // Find lotes in this local
        const { data: stockData, error: stockErr } = await supabase
          .from('estoque_por_local')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('local_id', localId)
          .eq('produto_id', targetProdutoId)
          .order('quantidade_atual', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (stockErr) throw stockErr;

        if (stockData) {
          setFoundStock(stockData);
          setCurrentCount(stockData.quantidade_atual.toString());
          if (countRef.current) countRef.current.focus();
        } else {
          toast({ title: 'Produto sem estoque', description: 'Este produto não possui saldo registrado neste mercado.', variant: 'destructive' });
          setFoundStock(null);
        }
      } else {
        setFoundStock(null);
      }
    } catch (err) {
      console.error('Error searching stock:', err);
      toast({ title: 'Erro na busca', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      searchProductInStock(value.trim());
    }, 500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      searchProductInStock(searchTerm.trim());
    }
  };

  const handleAdd = () => {
    if (!foundStock) return;
    const qty = parseInt(currentCount, 10);
    if (isNaN(qty) || qty < 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    
    onAddProduct(foundStock, qty);
    
    // Reset form
    setSearchTerm('');
    setFoundStock(null);
    setCurrentCount('');
    if (inputRef.current) inputRef.current.focus();
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFoundStock(null);
    setCurrentCount('');
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="barcode-checklist" className="sr-only">Código de Barras</Label>
        <div className="relative flex items-center">
          <Barcode className="absolute left-4 h-6 w-6 text-gray-400" />
          <Input
            ref={inputRef}
            id="barcode-checklist"
            type="text"
            placeholder="Escaneie o código ou digite o nome..."
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="pl-12 pr-12 py-6 text-lg shadow-sm checklist-input"
            autoComplete="off"
            disabled={!localId}
          />
          {isSearching ? (
            <Loader2 className="absolute right-4 h-6 w-6 animate-spin text-gray-400" />
          ) : searchTerm ? (
            <button onClick={clearSearch} className="absolute right-4 text-gray-400 hover:text-gray-600">
              <XCircle className="h-6 w-6" />
            </button>
          ) : (
            <Search className="absolute right-4 h-6 w-6 text-gray-400" />
          )}
        </div>
      </div>

      {foundStock && (
        <Card className="bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20 shadow-sm animate-in fade-in slide-in-from-top-4">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">{foundStock.produto_nome}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-white font-mono">{foundStock.numero_lote}</Badge>
                <span className="text-sm text-gray-500">Saldo Sistema: <strong className="text-gray-900">{foundStock.quantidade_atual}</strong></span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-32">
                <Label className="text-xs text-gray-500 uppercase font-bold">Físico Contado</Label>
                <Input 
                  ref={countRef}
                  type="number" 
                  min="0" 
                  value={currentCount}
                  onChange={(e) => setCurrentCount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  className="text-xl font-bold text-center h-12"
                />
              </div>
              <Button onClick={handleAdd} className="h-12 w-full sm:w-auto mt-5 shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]">
                <PackagePlus className="mr-2 h-5 w-5" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}