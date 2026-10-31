import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePDVManagement } from '@/hooks/usePDVManagement';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ScanBarcode } from 'lucide-react';
import { filterActiveLotes } from '@/lib/lotFormatUtils';
import { supabase } from '@/lib/customSupabaseClient';
import { STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';
import { useLoteManagement } from '@/hooks/useLoteManagement';

export default function SeletorLotes({ produtoId, mercadoId, onSelect, selectedLoteId, tipo }) {
  const { empresaId } = useAuth();
  const { fetchLotesForProduto } = usePDVManagement();
  const { getLoteByBarcode } = useLoteManagement();
  const { toast } = useToast();
  
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    async function loadLotes() {
      if (!empresaId || !produtoId || !mercadoId || tipo !== 'bandeja') {
        setLotes([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        let isEstoque = false;
        
        // Check if the selected location is an Estoque type
        if (mercadoId === STATIC_ESTOQUE_BANDEJAS_ID) {
          isEstoque = true;
        } else {
          const { data: localData, error: localError } = await supabase
            .from('locais')
            .select('tipo')
            .eq('id', mercadoId)
            .single();
            
          if (!localError && localData && (localData.tipo === 'Estoque' || localData.tipo === 'estoque')) {
            isEstoque = true;
          }
        }

        if (isEstoque) {
          const data = await fetchLotesForProduto(empresaId, produtoId, mercadoId);
          const filteredLotes = filterActiveLotes(data);
          setLotes(filteredLotes);
        } else {
          setLotes([]);
        }
      } catch (err) {
        console.error("Erro ao carregar lotes:", err);
        setError("Não foi possível carregar os lotes.");
      } finally {
        setLoading(false);
      }
    }

    loadLotes();
  }, [empresaId, produtoId, mercadoId, tipo, fetchLotesForProduto]);

  const handleValueChange = (val) => {
    const lote = lotes.find(l => l.id === val);
    if (lote && onSelect) {
      onSelect(lote);
    }
  };

  const handleBarcodeScan = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    setIsScanning(true);
    try {
      const response = await getLoteByBarcode(empresaId, barcodeInput);
      
      if (!response.success) {
        toast({
          title: "Erro ao ler código",
          description: response.error,
          variant: "destructive"
        });
        return;
      }

      const scannedLote = response.data;

      // Check if it matches the current filters
      if (scannedLote.produto_id !== produtoId) {
        toast({
          title: "Lote Incompatível",
          description: "O lote escaneado pertence a outro produto.",
          variant: "destructive"
        });
        return;
      }

      if (scannedLote.local_id !== mercadoId) {
        toast({
          title: "Lote Incompatível",
          description: "O lote escaneado não está no local selecionado.",
          variant: "destructive"
        });
        return;
      }

      // Check if it's in our loaded list
      const loteInList = lotes.find(l => l.id === scannedLote.id);
      
      if (loteInList) {
        handleValueChange(loteInList.id);
        toast({
          title: "Lote selecionado",
          description: `Lote ${scannedLote.numero_lote} selecionado com sucesso via leitor.`,
          className: "bg-green-600 text-white border-none"
        });
      } else {
        toast({
          title: "Lote indisponível",
          description: "O lote escaneado não está disponível para venda (saldo zero ou inativo).",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Erro inesperado",
        description: "Falha ao processar código de barras.",
        variant: "destructive"
      });
    } finally {
      setBarcodeInput('');
      setIsScanning(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  if (tipo === 'unitario') {
    return null;
  }

  if (!produtoId || !mercadoId) {
    return (
      <div className="space-y-2">
        <Select disabled>
          <SelectTrigger className="w-full bg-gray-50 text-gray-400">
            <SelectValue placeholder="Selecione um produto primeiro" />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleBarcodeScan} className="flex items-center gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Escaneie o código de barras..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            disabled={loading || lotes.length === 0 || isScanning}
            className="pl-9 bg-white"
            autoComplete="off"
          />
        </div>
        <Button 
          type="submit" 
          variant="secondary" 
          disabled={loading || lotes.length === 0 || isScanning || !barcodeInput.trim()}
        >
          {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </Button>
      </form>

      <div className="relative">
        <Select value={selectedLoteId || ''} onValueChange={handleValueChange} disabled={loading || lotes.length === 0}>
          <SelectTrigger className="w-full text-gray-900 border-gray-300 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <SelectValue placeholder={
              loading ? "Carregando lotes..." : 
              lotes.length === 0 ? "Nenhum lote ativo disponível neste local de Estoque" : 
              "Selecione um lote ou escaneie"
            } />
          </SelectTrigger>
          <SelectContent>
            {lotes.map(lote => (
              <SelectItem key={lote.id} value={lote.id}>
                Lote #{lote.numero_lote} - {lote.quantidade} {lote.quantidade === 1 ? 'bandeja disponível' : 'bandejas disponíveis'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400 pointer-events-none" />}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}