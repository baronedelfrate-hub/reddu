import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import BarcodeChecklist from '@/components/checklist/BarcodeChecklist';
import ProdutosConferidos from '@/components/checklist/ProdutosConferidos';
import FinalizarChecklistModal from '@/components/checklist/FinalizarChecklistModal';
import { useChecklistManagement } from '@/hooks/useChecklistManagement';
import { useChecklistFinalization } from '@/hooks/useChecklistFinalization';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ClipboardCheck, Store, Calendar, CheckSquare } from 'lucide-react';
import { formatDateBR } from '@/utils/dateFormatter';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';
import { useToast } from '@/hooks/use-toast';

export default function ChecklistMercadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [mercados, setMercados] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    checkedProducts,
    marketProducts,
    lastChecklistDate,
    fetchLastChecklist,
    fetchMarketProducts,
    addProductToChecklist,
    updateProductQuantity,
    removeProduct,
    clearChecklist,
    generateReport
  } = useChecklistManagement(empresaId);

  const { finalizeChecklist, isFinalizing } = useChecklistFinalization(empresaId);

  useEffect(() => {
    if (empresaId) {
      supabase.from('locais')
        .select('id, nome, tipo')
        .eq('empresa_id', empresaId)
        .order('nome')
        .then(({ data }) => setMercados(data || []));
    }
  }, [empresaId]);

  useEffect(() => {
    if (selectedMarketId) {
      fetchLastChecklist(selectedMarketId);
      fetchMarketProducts(selectedMarketId);
      clearChecklist();
    }
  }, [selectedMarketId, fetchLastChecklist, fetchMarketProducts, clearChecklist]);

  const handleFinalizeClick = () => {
    setIsModalOpen(true);
  };

  const handleConfirmFinalization = async () => {
    // Adicionando validação preventiva garantindo que o tipo 'conferencia' ou 'ajuste_manual' está mapeado e válido.
    const validacao = validateMovimentacaoData({ tipo: 'conferencia' }); // Assumindo que a finalização usa conferencia
    if (!validacao.valid) {
       toast({ title: 'Erro de Configuração do Sistema', description: validacao.error, variant: 'destructive' });
       return;
    }

    const success = await finalizeChecklist(selectedMarketId, checkedProducts);
    if (success) {
      setIsModalOpen(false);
      clearChecklist();
      fetchLastChecklist(selectedMarketId);
      fetchMarketProducts(selectedMarketId);
    }
  };

  const progressPercentage = marketProducts.length > 0 
    ? Math.min(100, Math.round((checkedProducts.length / marketProducts.length) * 100))
    : 0;

  return (
    <>
      <Helmet>
        <title>Checklist de Mercado - Estoque 360</title>
      </Helmet>

      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border shadow-sm">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-[var(--color-primary)]" /> 
              Checklist de Mercado
            </h1>
            <p className="text-gray-600 mt-2">Auditoria rápida de estoque e conferência física.</p>
          </div>
          
          <div className="w-full sm:w-80">
            <Label className="text-xs text-gray-500 font-bold uppercase mb-1 flex items-center gap-1">
              <Store className="h-4 w-4" /> Selecione o Mercado
            </Label>
            <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
              <SelectTrigger className="border-gray-300 bg-gray-50 h-12 text-lg font-semibold">
                <SelectValue placeholder="Escolha um mercado..." />
              </SelectTrigger>
              <SelectContent>
                {mercados.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome} {m.tipo ? `(${m.tipo})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedMarketId && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-4 col-span-1">
                <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-bold uppercase">Último Checklist</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {lastChecklistDate ? formatDateBR(lastChecklistDate) : 'Nunca realizado'}
                  </p>
                </div>
              </div>
              
              <div className="bg-white border p-4 rounded-xl flex flex-col justify-center col-span-1 md:col-span-2">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-bold text-gray-600 uppercase flex items-center gap-2">
                    <CheckSquare className="h-4 w-4" /> Progresso da Conferência
                  </p>
                  <span className="text-sm font-semibold text-[var(--color-primary)]">
                    {checkedProducts.length} de {marketProducts.length} itens
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-3" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Escanear Produto</h2>
              <BarcodeChecklist 
                empresaId={empresaId} 
                localId={selectedMarketId} 
                onAddProduct={addProductToChecklist} 
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Produtos Conferidos</h2>
                {checkedProducts.length > 0 && (
                  <Button onClick={handleFinalizeClick} className="bg-emerald-600 hover:bg-emerald-700">
                    Finalizar Checklist
                  </Button>
                )}
              </div>
              
              <ProdutosConferidos 
                products={checkedProducts} 
                onUpdateQuantity={updateProductQuantity}
                onRemove={removeProduct}
              />
            </div>
          </>
        )}

        <FinalizarChecklistModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          products={checkedProducts}
          onConfirm={handleConfirmFinalization}
          onGenerateReport={generateReport}
          isSubmitting={isFinalizing}
        />
      </div>
    </>
  );
}