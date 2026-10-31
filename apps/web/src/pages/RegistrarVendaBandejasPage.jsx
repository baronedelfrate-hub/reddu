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

export default function RegistrarVendaBandejasPage() {
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
      const { data: locaisData } = await supabase.from('locais').select('*').eq('empresa_id', empresaId).eq('nome', 'ESTOQUE BANDEJAS').maybeSingle();
      if (locaisData) setLocalOrigem(locaisData);
      
      const { data: prods } = await supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).order('nome');
      setProdutos(prods || []);
    } finally { setIsLoadingData(false); }
  };

  const fetchLotes = async (prodId, localId) => {
    try {
      const { data: estoque } = await supabase.from('estoque_por_local').select('lote_id, numero_lote, quantidade_atual').eq('empresa_id', empresaId).eq('produto_id', prodId).eq('local_id', localId).gt('quantidade_atual', 0);
      const loteIds = estoque?.map(e => e.lote_id) || [];
      
      let detalhesMap = {};
      if (loteIds.length > 0) {
        const { data: detalhes } = await supabase.from('lotes').select('id, tipo_lote, unidades_por_bandeja, data_validade, lote_devolvido').in('id', loteIds);
        detalhes?.forEach(d => detalhesMap[d.id] = d);
      }

      const mappedLotes = (estoque || []).map(e => ({
        id: e.lote_id, 
        numero_lote: e.numero_lote, 
        quantidade: e.quantidade_atual,
        tipo_lote: detalhesMap[e.lote_id]?.tipo_lote || 'base',
        unidades_por_bandeja: detalhesMap[e.lote_id]?.unidades_por_bandeja,
        data_validade: detalhesMap[e.lote_id]?.data_validade,
        lote_devolvido: detalhesMap[e.lote_id]?.lote_devolvido
      }));
      setLotes(ordenarLotes(mappedLotes));
      setLoteId('');
    } catch (err) { toast({ title: 'Erro', description: 'Falha ao carregar lotes', variant: 'destructive' }); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!produtoId || !loteId || !quantidade || !localOrigem) return;
    setIsSubmitting(true);
    const vendaId = crypto.randomUUID();
    try {
      const { error: movError } = await supabase.from('movimentacoes').insert({
        empresa_id: empresaId, tipo: 'venda', produto_id: produtoId, lote_id: loteId,
        local_origem_id: localOrigem.id, quantidade: Number(quantidade), data_movimentacao: new Date().toISOString(), venda_id: vendaId
      });
      if (movError) throw movError;

      const { data: loteAtual } = await supabase.from('lotes').select('quantidade').eq('id', loteId).single();
      await supabase.from('lotes').update({ quantidade: loteAtual.quantidade - Number(quantidade) }).eq('id', loteId);

      toast({ title: 'Sucesso', description: 'Venda registrada.' });
      setProdutoId(''); setLoteId(''); setQuantidade('');
      fetchLotes(produtoId, localOrigem.id);
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setIsSubmitting(false); }
  };

  const selectedLote = lotes.find(l => l.id === loteId);

  return (
    <>
      <Helmet><title>Venda Bandejas</title></Helmet>
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg"><ShoppingCart className="h-6 w-6" /></div>
            <h1 className="text-3xl font-bold">Venda Bandejas</h1>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            {isLoadingData ? <Loader2 className="animate-spin mx-auto h-8 w-8" /> : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Select value={produtoId} onValueChange={setProdutoId}><SelectTrigger className="bg-white"><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select>
                <Select value={loteId} onValueChange={setLoteId} disabled={!produtoId}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Lote" /></SelectTrigger>
                  <SelectContent>
                    {lotes.map(l => (
                      <SelectItem 
                        key={l.id} 
                        value={l.id}
                        className={l.lote_devolvido ? "text-orange-600 font-semibold focus:text-orange-700 bg-orange-50/50" : ""}
                      >
                        {formatLoteDisplay(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} disabled={!loteId} placeholder={`Quantidade ${selectedLote?.tipo_lote === 'bandeja' ? 'de bandejas' : ''}`} className="bg-white" />
                <Button type="submit" disabled={isSubmitting || !quantidade} className="w-full">Confirmar</Button>
              </form>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}