import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Clock, AlertOctagon, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function AlertasResumoCards({ totais }) {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Vencido',
      value: totais.vencidos,
      icon: AlertOctagon,
      // background #EF4444 (red) with white text and icons
      color: 'bg-[#EF4444] text-white',
      borderColor: 'border-[#EF4444]'
    },
    {
      title: 'Vencendo em 7 dias',
      value: totais.vencendo,
      icon: Clock,
      // background #FBBF24 (amber/gold) with white text and icons
      color: 'bg-[#FBBF24] text-white',
      borderColor: 'border-[#FBBF24]'
    },
    {
      title: 'Estoque Mínimo',
      value: totais.estoqueBaixo,
      icon: AlertTriangle,
      // background #FB923C (orange) with white text and icons
      color: 'bg-[#FB923C] text-white',
      borderColor: 'border-[#FB923C]'
    },
    {
      title: 'Financeiro Pendente',
      value: totais.financeiroPendente || 0,
      icon: DollarSign,
      // background #8B5CF6 (roxo) with white text and icons
      color: 'bg-[#8B5CF6] text-white',
      borderColor: 'border-[#8B5CF6]',
      onClick: () => navigate('/dashboard/relatorio-vendas-pendentes'),
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            onClick={card.onClick}
            className={card.onClick ? 'cursor-pointer' : ''}
          >
            <Card className={`rounded-xl shadow-md border ${card.borderColor} h-full overflow-hidden transition-transform hover:-translate-y-1`}>
              <CardContent className={`p-6 flex items-center justify-between gap-4 ${card.color} h-full`}>
                <div className="flex flex-col">
                  <p className="text-sm font-medium opacity-90 uppercase tracking-wider mb-1 text-white">{card.title}</p>
                  <h3 className="text-4xl font-bold text-white">{card.value}</h3>
                </div>
                <div className="p-4 rounded-full bg-white/20 backdrop-blur-md shadow-inner">
                  <Icon className="h-10 w-10 text-white" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}