import { useState, useCallback } from 'react';
import { fiscalService } from '@/services/fiscalService';
import { useToast } from '@/hooks/use-toast';

export function useNFCeEmission() {
  const [isEmitting, setIsEmitting] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, emitting, success, error
  const [error, setError] = useState(null);
  const [lastVendaData, setLastVendaData] = useState(null);
  const { toast } = useToast();

  const emitirNFCeHook = useCallback(async (venda, empresaId) => {
    if (!venda || !venda.id) {
      console.warn('[useNFCeEmission] Venda inválida ou ausente');
      return;
    }

    setIsEmitting(true);
    setStatus('emitting');
    setError(null);
    setLastVendaData({ venda, empresaId });

    try {
      // Small timeout to allow UI to breathe
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await fiscalService.emitirNFCe(venda, empresaId);

      if (result.success) {
        setStatus('success');
        toast({
          title: result.modelo === '55' ? 'NF-e Emitida' : 'NFC-e Emitida',
          description: result.modelo === '55' ? 'Cliente com CNPJ: foi emitida NF-e (modelo 55) com sucesso.' : 'A nota fiscal foi gerada com sucesso.',
          className: 'bg-emerald-600 text-white border-none'
        });
      } else {
        setStatus('error');
        setError(result.erro);
        toast({
          title: result.modelo === '55' ? 'Erro na Emissão NF-e' : 'Erro na Emissão NFC-e',
          description: result.erro || 'Falha ao processar nota fiscal.',
          variant: 'destructive'
        });
      }
      return result;
    } catch (err) {
      setStatus('error');
      setError(err.message);
      toast({
        title: 'Erro de Comunicação',
        description: err.message,
        variant: 'destructive'
      });
      return { success: false, erro: err.message };
    } finally {
      setIsEmitting(false);
    }
  }, [toast]);

  const retry = useCallback(() => {
    if (lastVendaData) {
      return emitirNFCeHook(lastVendaData.venda, lastVendaData.empresaId);
    }
  }, [lastVendaData, emitirNFCeHook]);

  return {
    isEmitting,
    status,
    error,
    emitirNFCeHook,
    retry
  };
}