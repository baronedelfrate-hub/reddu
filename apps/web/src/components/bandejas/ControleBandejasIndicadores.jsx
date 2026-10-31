import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Boxes, Package, TrendingUp, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { isBandeja, countBandejas, countUnidadesInBandejas } from '@/lib/bandejasCountUtils';

export default function ControleBandejasIndicadores({ data }) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        totalBandejas: 0,
        totalUnidades: 0,
        produtoMais: '-',
        localMais: '-'
      };
    }

    let totalBandejas = 0;
    let totalUnidades = 0;
    const produtosCount = {};
    const locaisCount = {};

    data.forEach(item => {
      // Ensure we only count valid bandejas
      if (!isBandeja(item)) return;

      const qtd = Number(item.quantidade_atual !== undefined ? item.quantidade_atual : (item.quantidade || 0));
      const unid = Number(item.unidades_por_bandeja || 0);
      
      // We sum quantities, including potentially negative/zero if the user is just seeing raw totals,
      // but usually for these indicators we sum all active quantities.
      totalBandejas += qtd;
      totalUnidades += (qtd * unid);

      if (qtd > 0) {
        const prodName = item.produtos?.nome || item.produto_nome || 'Desconhecido';
        produtosCount[prodName] = (produtosCount[prodName] || 0) + qtd;

        const locName = item.locais?.nome || item.local_nome || 'Desconhecido';
        locaisCount[locName] = (locaisCount[locName] || 0) + qtd;
      }
    });

    const maxProduto = Object.keys(produtosCount).length > 0 
      ? Object.keys(produtosCount).reduce((a, b) => produtosCount[a] > produtosCount[b] ? a : b) 
      : '-';

    const maxLocal = Object.keys(locaisCount).length > 0
      ? Object.keys(locaisCount).reduce((a, b) => locaisCount[a] > locaisCount[b] ? a : b)
      : '-';

    return {
      totalBandejas,
      totalUnidades,
      produtoMais: maxProduto,
      localMais: maxLocal
    };
  }, [data]);

  const cards = [
    {
      title: 'Total de Bandejas',
      value: stats.totalBandejas,
      icon: Boxes,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Total de Unidades',
      value: stats.totalUnidades,
      icon: Package,
      color: 'bg-green-50 text-green-600',
    },
    {
      title: 'Produto Mais Produzido',
      value: stats.produtoMais,
      icon: TrendingUp,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      title: 'Local com Mais Bandejas',
      value: stats.localMais,
      icon: MapPin,
      color: 'bg-orange-50 text-orange-600',
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="rounded-xl shadow-sm border-gray-100 h-full">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-500 truncate">{card.title}</p>
                  <h3 className="text-2xl font-bold text-gray-900 truncate" title={card.value}>
                    {card.value}
                  </h3>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}