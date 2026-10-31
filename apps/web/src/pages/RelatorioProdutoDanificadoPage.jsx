import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  PackageX, RefreshCw, MapPin, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';

export default function RelatorioProdutoDanificadoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [mercados, setMercados] = useState([]);
  const [expandedMercado, setExpandedMercado] = useState(null);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtN = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);

  const loadDados = useCallback(async () => {
    if (!empresaId) return;
    setIsLoading(true);
    try {
      const { data: auditItens } = await supabase
        .from('auditoria_mercado_itens')
        .select(`
          produto_id, valor_unitario, quantidade_danificada, observacao_danificado,
          auditorias_mercado!inner(local_id, data_auditoria, empresa_id, locais(nome))
        `)
        .eq('auditorias_mercado.empresa_id', empresaId)
        .gt('quantidade_danificada', 0)
        .gte('auditorias_mercado.data_auditoria', `${dataInicio}T00:00:00`)
        .lte('auditorias_mercado.data_auditoria', `${dataFim}T23:59:59`);

      const prodIds = [...new Set((auditItens || []).map(i => i.produto_id))];
      const { data: produtosData } = prodIds.length > 0
        ? await supabase.from('produtos').select('id, nome').in('id', prodIds)
        : { data: [] };
      const prodMap = {};
      (produtosData || []).forEach(p => { prodMap[p.id] = p.nome; });

      const map = {};
      (auditItens || []).forEach(i => {
        const lid = i.auditorias_mercado?.local_id;
        const lnome = i.auditorias_mercado?.locais?.nome || 'Mercado';
        if (!lid) return;
        if (!map[lid]) {
          map[lid] = { local_id: lid, nome: lnome, totalQtd: 0, totalValor: 0, produtos: {} };
        }
        const qtd = Number(i.quantidade_danificada || 0);
        const valor = qtd * Number(i.valor_unitario || 0);
        map[lid].totalQtd += qtd;
        map[lid].totalValor += valor;

        const pkey = i.produto_id;
        if (!map[lid].produtos[pkey]) {
          map[lid].produtos[pkey] = { produto_id: pkey, nome: prodMap[pkey] || 'Produto', qtd: 0, valor: 0, observacoes: [] };
        }
        map[lid].produtos[pkey].qtd += qtd;
        map[lid].produtos[pkey].valor += valor;
        if (i.observacao_danificado) map[lid].produtos[pkey].observacoes.push(i.observacao_danificado);
      });

      const lista = Object.values(map)
        .map(m => ({
          ...m,
          produtos: Object.values(m.produtos).sort((a, b) => b.valor - a.valor),
        }))
        .sort((a, b) => b.totalValor - a.totalValor);

      setMercados(lista);
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, dataInicio, dataFim, toast]);

  useEffect(() => { loadDados(); }, [loadDados]);

  const totalGeralValor = mercados.reduce((s, m) => s + m.totalValor, 0);
  const totalGeralQtd = mercados.reduce((s, m) => s + m.totalQtd, 0);

  return (
    <>
      <Helmet><title>Mercados por Produto Danificado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 text-red-600 rounded-xl">
              <PackageX className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mercados por Produto Danificado</h1>
              <p className="text-gray-500 text-sm mt-0.5">Ranking de prejuízo por mercado — identifique onde mais acontece dano.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-red-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-red-400 focus:outline-none"
                  style={{ fontSize: '14px' }} />
              </div>
              <Button onClick={loadDados} className="gap-2 bg-red-600 hover:bg-red-700 h-10">
                <RefreshCw className="h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-red-400 uppercase">Prejuízo Total</p>
              <p className="text-xl font-black text-red-600 mt-1">{fmt(totalGeralValor)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-gray-500 uppercase">Unidades Danificadas</p>
              <p className="text-xl font-black text-gray-900 mt-1">{fmtN(totalGeralQtd)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs font-semibold text-gray-500 uppercase">Mercados Afetados</p>
              <p className="text-xl font-black text-gray-900 mt-1">{mercados.length}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>
          ) : mercados.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <PackageX className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Nenhum produto danificado registrado no período. 🎉</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mercados.map((m, idx) => (
                <div key={m.local_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedMercado(expandedMercado === m.local_id ? null : m.local_id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                        idx === 0 ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {idx === 0 ? <AlertTriangle className="h-4 w-4" /> : idx + 1}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" /> {m.nome}
                        </p>
                        <p className="text-xs text-gray-500">{m.produtos.length} produto(s) diferentes danificados</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Prejuízo</p>
                        <p className="font-black text-red-600">{fmt(m.totalValor)}</p>
                        <p className="text-[10px] text-gray-400">{fmtN(m.totalQtd)} un.</p>
                      </div>
                      {expandedMercado === m.local_id ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </div>
                  </button>

                  {expandedMercado === m.local_id && (
                    <div className="border-t border-gray-100 p-4 space-y-2">
                      {m.produtos.map(p => (
                        <div key={p.produto_id} className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">{p.nome}</p>
                            {p.observacoes.length > 0 && (
                              <p className="text-xs text-gray-500 italic truncate">{p.observacoes.join(' · ')}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="font-black text-red-600">{fmt(p.valor)}</p>
                            <p className="text-xs text-gray-500">{fmtN(p.qtd)} un.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}