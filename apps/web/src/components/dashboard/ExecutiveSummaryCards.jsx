import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ExecutiveSummaryCards({ data, isLoading, error, rankingData = [] }) {
  const [mostrarDetalheProduzido, setMostrarDetalheProduzido] = useState(false);

  if (error) {
    return <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200">Erro ao carregar resumo: {error}</div>;
  }

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);

  const produzidoDetalhado = [...rankingData]
    .filter(r => r.quantidade_produzida > 0)
    .sort((a, b) => b.quantidade_produzida - a.quantidade_produzida);

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Card 1: Total Produzido */}
      <button
        onClick={() => !isLoading && produzidoDetalhado.length > 0 && setMostrarDetalheProduzido(true)}
        className="rounded-xl shadow-lg hover:shadow-2xl transition-shadow p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white relative overflow-hidden text-left"
      >
        <h3 className="text-blue-100 font-medium text-lg mb-2">Total Produzido</h3>
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70 mt-2" />
        ) : (
          <div>
            <span className="text-4xl font-bold">{formatNumber(data?.total_produzido)}</span>
            <span className="text-blue-200 ml-2 text-sm">unidades</span>
            {produzidoDetalhado.length > 0 && (
              <p className="text-blue-100 text-xs mt-2 underline">Ver por produto</p>
            )}
          </div>
        )}
      </button>

      {/* Card 2: Total Vendido */}
      <div className="rounded-xl shadow-lg hover:shadow-2xl transition-shadow p-6 bg-gradient-to-br from-green-500 to-green-600 text-white relative overflow-hidden">
        <h3 className="text-green-100 font-medium text-lg mb-2">Total Vendido</h3>
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70 mt-2" />
        ) : (
          <div>
            <span className="text-4xl font-bold">{formatNumber(data?.total_vendido)}</span>
            <span className="text-green-200 ml-2 text-sm">unidades</span>
          </div>
        )}
      </div>

      {/* Card 3: Produto Mais Vendido */}
      <div className="rounded-xl shadow-lg hover:shadow-2xl transition-shadow p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white relative overflow-hidden">
        <h3 className="text-purple-100 font-medium text-lg mb-2">Produto Mais Vendido</h3>
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70 mt-2" />
        ) : (
          <div>
            <p className="text-xl font-bold truncate" title={data?.produto_mais_vendido_nome || 'N/A'}>
              {data?.produto_mais_vendido_nome || 'Nenhum'}
            </p>
            <p className="text-purple-200 text-sm mt-1">{formatNumber(data?.quantidade_mais_vendido)} unidades vendidas</p>
          </div>
        )}
      </div>

      {/* Card 4: Maior Estoque Parado */}
      <div className="rounded-xl shadow-lg hover:shadow-2xl transition-shadow p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white relative overflow-hidden">
        <h3 className="text-orange-100 font-medium text-lg mb-2">Maior Estoque Parado</h3>
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70 mt-2" />
        ) : (
          <div>
            <p className="text-xl font-bold truncate" title={data?.produto_maior_estoque_parado_nome || 'N/A'}>
              {data?.produto_maior_estoque_parado_nome || 'Nenhum'}
            </p>
            <p className="text-orange-200 text-sm mt-1">{formatNumber(data?.quantidade_estoque_parado)} unidades em estoque</p>
          </div>
        )}
      </div>
    </div>

    {mostrarDetalheProduzido && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMostrarDetalheProduzido(false)}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">Total Produzido — por produto</p>
              <p className="text-xs text-gray-500">Período selecionado no filtro</p>
            </div>
            <button onClick={() => setMostrarDetalheProduzido(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="overflow-y-auto p-5 space-y-2">
            {produzidoDetalhado.map(p => (
              <div key={p.produto_id} className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{p.produto_nome}</p>
                <span className="text-sm font-black text-blue-700">{formatNumber(p.quantidade_produzida)} un.</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 bg-blue-50 flex items-center justify-between">
            <p className="font-bold text-blue-800 text-sm">Total</p>
            <p className="font-black text-blue-700">{formatNumber(data?.total_produzido)} un.</p>
          </div>
        </div>
      </div>
    )}
    </>
  );
}