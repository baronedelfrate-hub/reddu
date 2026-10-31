import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { RotateCcw, PackageMinus, Store, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RelatorioDevolucoesSummaryCards({ data }) {
  const totalDevolucoes = data.length;
  const totalUnidades = data.reduce((sum, item) => sum + (item.quantidade || 0), 0);
  
  const mercadosCount = data.reduce((acc, item) => {
    const nome = item.locais?.nome || 'Desconhecido';
    acc[nome] = (acc[nome] || 0) + 1;
    return acc;
  }, {});
  
  const mercadoMaisDevolucoes = Object.keys(mercadosCount).length > 0
    ? Object.keys(mercadosCount).reduce((a, b) => mercadosCount[a] > mercadosCount[b] ? a : b)
    : '-';

  const motivosCount = data.reduce((acc, item) => {
    const motivo = item.motivo_devolucao || 'Não informado';
    acc[motivo] = (acc[motivo] || 0) + 1;
    return acc;
  }, {});
  
  const motivoMaisComum = Object.keys(motivosCount).length > 0
    ? Object.keys(motivosCount).reduce((a, b) => motivosCount[a] > motivosCount[b] ? a : b)
    : '-';

  const formatMotivo = (m) => {
    if (m === 'avaria_transporte') return 'Avaria de Transp.';
    if (m === 'danificado') return 'Danificado';
    return m.charAt(0).toUpperCase() + m.slice(1);
  };

  const cards = [
    {
      title: 'Total de Devoluções',
      value: totalDevolucoes,
      icon: RotateCcw,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Unidades Devolvidas',
      value: totalUnidades,
      icon: PackageMinus,
      color: 'bg-orange-50 text-orange-600',
    },
    {
      title: 'Mercado com Mais Devoluções',
      value: mercadoMaisDevolucoes,
      icon: Store,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      title: 'Motivo Mais Comum',
      value: formatMotivo(motivoMaisComum),
      icon: AlertTriangle,
      color: 'bg-red-50 text-red-600',
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.title}</p>
                  <h3 className="text-2xl font-bold text-gray-900 truncate max-w-[150px] sm:max-w-[200px]" title={card.value}>
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