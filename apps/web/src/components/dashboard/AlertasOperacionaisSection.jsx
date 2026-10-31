import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import AlertasResumoCards from './AlertasResumoCards';
import AlertasTabelaDetalhada from './AlertasTabelaDetalhada';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function AlertasOperacionaisSection({ empresaId }) {
  const [data, setData] = useState({
    vencidos: [],
    vencendo: [],
    estoqueBaixo: [],
    totais: { vencidos: 0, vencendo: 0, estoqueBaixo: 0, financeiroPendente: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlertas = async () => {
    if (!empresaId) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch Estoque Baixo dynamically from active lots
      const [lotesEstoqueRes, produtosRes] = await Promise.all([
        supabase
          .from('lotes')
          .select('produto_id, quantidade, locais(id, nome)')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .eq('lote_devolvido', false),
        supabase
          .from('produtos')
          .select('id, nome, estoque_minimo')
          .eq('empresa_id', empresaId)
      ]);

      if (lotesEstoqueRes.error) throw lotesEstoqueRes.error;
      if (produtosRes.error) throw produtosRes.error;

      const estoqueMap = {};
      (lotesEstoqueRes.data || []).forEach(l => {
        const key = `${l.produto_id}_${l.locais?.id}`;
        if (!estoqueMap[key]) {
          estoqueMap[key] = {
            produto_id: l.produto_id,
            local_nome: l.locais?.nome || 'Desconhecido',
            quantidade_atual: 0
          };
        }
        estoqueMap[key].quantidade_atual += (l.quantidade || 0);
      });

      const produtosMap = (produtosRes.data || []).reduce((acc, p) => {
        acc[p.id] = { min: p.estoque_minimo || 0, nome: p.nome };
        return acc;
      }, {});

      const estoqueBaixoRaw = [];
      Object.values(estoqueMap).forEach(est => {
        const prod = produtosMap[est.produto_id];
        if (!prod || prod.min <= 0) return;
        
        // Critical stock logic matching original requirement
        if (est.quantidade_atual <= 10) {
          const percentual = (est.quantidade_atual / prod.min) * 100;
          estoqueBaixoRaw.push({
            produtoNome: prod.nome,
            localNome: est.local_nome,
            quantidadeAtual: est.quantidade_atual,
            estoqueMinimo: prod.min,
            percentual: percentual
          });
        }
      });

      // Sort by percentual ASC (most critical first)
      const estoqueBaixo = estoqueBaixoRaw.sort((a, b) => a.percentual - b.percentual);

      // 2. Fetch Lotes for Vencidos & Vencendo
      const { data: lotesData, error: lotesError } = await supabase
        .from('lotes')
        .select(`
          id, numero_lote, data_validade, quantidade,
          produtos (id, nome),
          locais (id, nome)
        `)
        .eq('empresa_id', empresaId)
        .gt('quantidade', 0)
        .eq('ativo', true)
        .eq('lote_devolvido', false)
        .not('data_validade', 'is', null);

      if (lotesError) throw lotesError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const vencidosRaw = [];
      const vencendoRaw = [];

      (lotesData || []).forEach(lote => {
        if (!lote.data_validade) return;
        
        const [year, month, day] = lote.data_validade.split('-');
        const validadeDate = new Date(year, month - 1, day);
        
        const diffTime = validadeDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const item = {
          produtoNome: lote.produtos?.nome || 'Desconhecido',
          numeroLote: lote.numero_lote,
          localNome: lote.locais?.nome || 'Desconhecido',
          quantidade: lote.quantidade,
          dataValidade: lote.data_validade,
          dias: Math.abs(diffDays)
        };

        if (diffDays < 0) {
          vencidosRaw.push(item);
        } else if (diffDays >= 0 && diffDays <= 7) {
          item.dias = diffDays; // actual remaining days
          vencendoRaw.push(item);
        }
      });

      // Sort Vencidos by dias DESC (oldest expired first)
      const vencidos = vencidosRaw.sort((a, b) => b.dias - a.dias);
      
      // Sort Vencendo by dias ASC (most urgent first)
      const vencendo = vencendoRaw.sort((a, b) => a.dias - b.dias);

      // Vendas com pagamento pendente de baixa
      const { count: financeiroPendenteCount, error: erroFinanceiro } = await supabase
        .from('vendas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('financeiro_baixado', false)
        .neq('status', 'CANCELADO');
      if (erroFinanceiro) throw erroFinanceiro;

      setData({
        vencidos,
        vencendo,
        estoqueBaixo,
        totais: {
          vencidos: vencidos.length,
          vencendo: vencendo.length,
          estoqueBaixo: estoqueBaixo.length,
          financeiroPendente: financeiroPendenteCount || 0
        }
      });

    } catch (err) {
      console.error('Error fetching alertas operacionais:', err);
      setError('Falha ao carregar os alertas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  if (isLoading) {
    return (
      <section className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-8 flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-gray-500 font-medium">Analisando dados operacionais...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-red-50 rounded-2xl p-8 border border-red-200 mb-8 flex flex-col items-center text-center">
        <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-lg font-bold text-red-700 mb-1">Erro ao carregar alertas</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={fetchAlertas} variant="outline" className="gap-2 bg-white text-red-700 border-red-200 hover:bg-red-50">
          <RefreshCw className="h-4 w-4" />
          Tentar Novamente
        </Button>
      </section>
    );
  }

  const hasAlerts = data.totais.vencidos > 0 || data.totais.vencendo > 0 || data.totais.estoqueBaixo > 0 || data.totais.financeiroPendente > 0;

  return (
    <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-red-100 mb-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 text-red-50 opacity-50 pointer-events-none">
        <AlertTriangle className="h-64 w-64" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 text-red-600 rounded-xl shadow-sm">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Alertas Operacionais</h2>
              <p className="text-gray-500 text-sm mt-1">Ações necessárias imediatas de estoque e validade</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAlertas} className="text-gray-600 hover:text-gray-900 gap-2 border-gray-200 bg-white">
            <RefreshCw className="h-4 w-4" /> Atualizar Dados
          </Button>
        </div>

        <div className="space-y-8">
          {/* Synchronized Banner */}
          {hasAlerts ? (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-6 bg-orange-50 rounded-xl border border-orange-200 shadow-sm">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-full shrink-0">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div className="text-center sm:text-left pt-1">
                <h3 className="text-xl font-bold text-gray-900">Existem alertas operacionais que precisam de atenção.</h3>
                <p className="text-gray-700 mt-1">Verifique os indicadores abaixo para mais detalhes.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-6 bg-green-50 rounded-xl border border-green-200 shadow-sm">
              <div className="p-3 bg-green-100 text-green-600 rounded-full shrink-0">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="text-center sm:text-left pt-1">
                <h3 className="text-xl font-bold text-green-800">Tudo sob controle!</h3>
                <p className="text-green-700 mt-1">Nenhum lote vencido, prestes a vencer ou produto com estoque crítico no momento.</p>
              </div>
            </div>
          )}

          {/* Cards and Tables Always Visible to ensure synchronization state */}
          <AlertasResumoCards totais={data.totais} />
          
          <AlertasTabelaDetalhada 
            vencidos={data.vencidos} 
            vencendo={data.vencendo} 
            estoqueBaixo={data.estoqueBaixo} 
          />
        </div>
      </div>
    </section>
  );
}