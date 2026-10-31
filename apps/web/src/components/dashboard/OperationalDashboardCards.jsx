import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, AlertTriangle } from 'lucide-react';

export default function OperationalDashboardCards() {
  const { empresaId } = useAuth();
  const [totalItens, setTotalItens] = useState(0);
  const [bandejasPorProduto, setBandejasPorProduto] = useState([]);
  const [totalBandejas, setTotalBandejas] = useState(0);
  const [alertas, setAlertas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarDetalheBandejas, setMostrarDetalheBandejas] = useState(false);

  const fetchOperationalData = async () => {
    if (!empresaId) return;
    try {
      setError(null);
      
      // Calculate total active items directly from lotes to enforce filters
      const { data: lotesData, error: lotesError } = await supabase
        .from('lotes')
        .select('quantidade, data_validade, tipo_lote, produto_id, produtos(nome)')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('lote_devolvido', false);
        
      if (lotesError) throw lotesError;

      const todayStr = new Date().toISOString().split('T')[0];
      const validLotes = (lotesData || []).filter(l => !l.data_validade || l.data_validade > todayStr);
      const totalQtd = validLotes.reduce((sum, l) => sum + (l.quantidade || 0), 0);
      
      setTotalItens(totalQtd);

      // Bandejas: separado do total geral, consolidado por produto
      const lotesBandeja = validLotes.filter(l => (l.tipo_lote || '').toLowerCase().includes('bandeja'));
      const bandejaMap = {};
      lotesBandeja.forEach(l => {
        const key = l.produto_id;
        if (!bandejaMap[key]) bandejaMap[key] = { produto_id: key, nome: l.produtos?.nome || 'Produto', quantidade: 0 };
        bandejaMap[key].quantidade += l.quantidade || 0;
      });
      const bandejasArr = Object.values(bandejaMap).sort((a, b) => b.quantidade - a.quantidade);
      setBandejasPorProduto(bandejasArr);
      setTotalBandejas(bandejasArr.reduce((s, b) => s + b.quantidade, 0));

      const { data: alertasData, error: alertasError } = await supabase
        .from('dashboard_alertas_resumo')
        .select('tipo_alerta, quantidade')
        .eq('empresa_id', empresaId);
        
      if (alertasError) throw alertasError;
      setAlertas(alertasData || []);

    } catch (err) {
      console.error('Error fetching operational cards:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperationalData();
  }, [empresaId]);

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);

  if (error) {
    return <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200">Erro ao carregar operacional: {error}</div>;
  }

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Total Geral de Itens em Estoque</CardTitle>
          <Package className="h-4 w-4 text-gray-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          ) : (
            <div className="text-3xl font-bold text-gray-900">
              {formatNumber(totalItens)} <span className="text-base font-normal text-gray-500">unidades</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        className={`shadow-sm border-gray-200 ${totalBandejas > 0 ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={() => totalBandejas > 0 && setMostrarDetalheBandejas(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Bandejas em Estoque</CardTitle>
          <Package className="h-4 w-4 text-teal-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          ) : (
            <div>
              <div className="text-3xl font-bold text-gray-900">
                {formatNumber(totalBandejas)} <span className="text-base font-normal text-gray-500">bandejas</span>
              </div>
              {totalBandejas > 0 && <p className="text-xs text-teal-600 underline mt-1">Ver por produto</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Resumo de Alertas Ativos</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          ) : alertas.length === 0 ? (
            <div className="text-sm text-gray-500 mt-2">Nenhum alerta ativo.</div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-2">
              {alertas.map((alerta, idx) => (
                <Badge key={idx} variant="destructive" className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-none">
                  {alerta.tipo_alerta}: {alerta.quantidade}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    {mostrarDetalheBandejas && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMostrarDetalheBandejas(false)}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">Bandejas em Estoque — por produto</p>
              <p className="text-xs text-gray-500">Estoque atual, todos os locais</p>
            </div>
            <button onClick={() => setMostrarDetalheBandejas(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="overflow-y-auto p-5 space-y-2">
            {bandejasPorProduto.map(b => (
              <div key={b.produto_id} className="flex items-center justify-between bg-teal-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{b.nome}</p>
                <span className="text-sm font-black text-teal-700">{formatNumber(b.quantidade)} un.</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 bg-teal-50 flex items-center justify-between">
            <p className="font-bold text-teal-800 text-sm">Total</p>
            <p className="font-black text-teal-700">{formatNumber(totalBandejas)} un.</p>
          </div>
        </div>
      </div>
    )}
    </>
  );
}