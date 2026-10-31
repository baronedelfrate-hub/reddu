import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ordenarLotes, formatLoteDisplay } from '@/lib/getLotesOrdenados';
import { validateMovimentacaoData } from '@/utils/movimentacaoValidator';

export default function RegistrarVendaClassicosPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  
  const [produtos, setProdutos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [localOrigem, setLocalOrigem] = useState(null);
  
  const [produtoId, setProdutoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { if (empresaId) fetchInitialData(); }, [empresaId]);
  useEffect(() => {
    if (produtoId && localOrigem) fetchLotes(produtoId, localOrigem.id);
    else { setLotes([]); setLoteId(''); }
  }, [produtoId, localOrigem]);

  const fetchInitialData = async () => {
    setIsLoadingData(true);
    try {
      const { data: locaisData } = await supabase.from('locais').select('id, nome').eq('empresa_id', empresaId).eq('nome', 'ESTOQUE CLÁSSICOS').maybeSingle();
      if (locaisData) setLocalOrigem(locaisData);
      const { data: produtosData } = await supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome');
      setProdutos(produtosData || []);
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchLotes = async (prodId, localId) => {
    try {
      const { data } = await supabase.from('estoque_por_local').select('lote_id, numero_lote, quantidade_atual').eq('empresa_id', empresaId).eq('produto_id', prodId).eq('local_id', localId).gt('quantidade_atual', 0);
      const loteIds = data?.map(d => d.lote_id) || [];
      let lotesInfo = {};
      if (loteIds.length > 0) {
        const { data: details } = await supabase.from('lotes').select('id, data_validade, lote_devolvido').in('id', loteIds);
        details?.forEach(d => lotesInfo[d.id] = d);
      }
      const mappedLotes = (data || []).map(item => ({
        id: item.lote_id, numero_lote: item.numero_lote, quantidade: item.quantidade_atual,
        data_validade: lotesInfo[item.lote_id]?.data_validade, lote_devolvido: lotesInfo[item.lote_id]?.lote_devolvido
      }));
      setLotes(ordenarLotes(mappedLotes));
      setLoteId('');
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao carregar lotes', variant: 'destructive' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!produtoId || !loteId || !quantidade || Number(quantidade) <= 0 || !localOrigem) return;

    // Constraint Validation
    const validation = validateMovimentacaoData({ tipo: 'venda_unitario', quantidade: Number(quantidade) });
    if (!validation.valid) {
      toast({ title: 'Erro de Sistema', description: validation.error, variant: 'destructive' });
      return;
    }

    const selectedLoteObj = lotes.find(l => l.id === loteId);
    if (Number(quantidade) > selectedLoteObj.quantidade) {
      return toast({ title: 'Estoque insuficiente', description: `Saldo: ${selectedLoteObj.quantidade}`, variant: 'destructive' });
    }

    setIsSubmitting(true);
    try {
      const vendaId = crypto.randomUUID();
      const { data: movData, error: movError } = await supabase.from('movimentacoes').insert({
        empresa_id: empresaId,
        tipo: 'venda_unitario',
        produto_id: produtoId,
        lote_id: loteId,
        local_origem_id: localOrigem.id,
        quantidade: Number(quantidade),
        data_movimentacao: new Date().toISOString(),
        observacao: 'Venda Clássicos',
        venda_id: vendaId
      }).select().single();

      if (movError) throw movError;

      const { data: loteData } = await supabase.from('lotes').select('quantidade').eq('id', loteId).single();
      if (loteData) {
        await supabase.from('lotes').update({ quantidade: loteData.quantidade - Number(quantidade) }).eq('id', loteId);
      }

      toast({ title: 'Sucesso', description: 'Venda registrada com sucesso.' });
      setProdutoId(''); setLoteId(''); setQuantidade('');
      fetchLotes(produtoId, localOrigem.id);
    } catch (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet><title>Registrar Venda Clássicos - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><ShoppingCart className="h-6 w-6" /></div>
            <h1 className="text-3xl font-bold text-gray-900">Venda Clássicos</h1>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            {isLoadingData ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /> : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <Select value={produtoId} onValueChange={setProdutoId}><SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select>
                <Select value={loteId} onValueChange={setLoteId} disabled={!produtoId}><SelectTrigger><SelectValue placeholder="Lote" /></SelectTrigger><SelectContent>{lotes.map(l => <SelectItem key={l.id} value={l.id}>{formatLoteDisplay(l)}</SelectItem>)}</SelectContent></Select>
                <Input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} disabled={!loteId} placeholder="Qtd" />
                <Button type="submit" className="w-full" disabled={isSubmitting || !produtoId || !loteId || !quantidade}>Confirmar</Button>
              </form>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}