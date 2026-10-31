import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Store, ShoppingCart, Smartphone, Activity, HelpCircle, Tag, TrendingDown } from 'lucide-react';

/**
 * Formata valores para moeda brasileira
 */
const formatMoney = (value) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export default function RelatorioVendasChannelSummary({ data }) {
  const summary = useMemo(() => {
    // Inicialização dos canais principais
    const totals = {
      PDV: { count: 0, bruto: 0, desconto: 0, taxa: 0, liquido: 0, icon: Store, color: 'text-blue-600', bg: 'bg-blue-50' },
      MERCADO: { count: 0, bruto: 0, desconto: 0, taxa: 0, liquido: 0, icon: ShoppingCart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      APP: { count: 0, bruto: 0, desconto: 0, taxa: 0, liquido: 0, icon: Smartphone, color: 'text-purple-600', bg: 'bg-purple-50' }
    };

    let geral = { count: 0, bruto: 0, desconto: 0, taxa: 0, liquido: 0 };

    data.forEach(item => {
      const canal = item.canal_venda || 'NÃO INFORMADO';
      
      if (!totals[canal]) {
        totals[canal] = { count: 0, bruto: 0, desconto: 0, taxa: 0, liquido: 0, icon: HelpCircle, color: 'text-slate-600', bg: 'bg-slate-50' };
      }
      
      // Extração de valores processados na página pai
      const vBruto = Number(item.subtotal || 0);
      const vDesc = Math.abs(Number(item.desconto_valor || 0));
      const vTaxa = Number(item.taxa_motoboy || 0);
      const vLiquido = Number(item.total_final || (vBruto + vTaxa - vDesc));

      // Soma por canal
      totals[canal].count += 1;
      totals[canal].bruto += vBruto;
      totals[canal].desconto += vDesc;
      totals[canal].taxa += vTaxa;
      totals[canal].liquido += vLiquido;

      // Soma geral
      geral.count += 1;
      geral.bruto += vBruto;
      geral.desconto += vDesc;
      geral.taxa += vTaxa;
      geral.liquido += vLiquido;
    });

    return { totals, geral };
  }, [data]);

  return (
    <Card className="shadow-sm border-slate-200 overflow-hidden">
      <CardHeader className="bg-slate-50/50 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-800">
          <Activity className="w-5 h-5 text-indigo-500" />
          Resumo Financeiro por Canal
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-slate-600">Canal</TableHead>
              <TableHead className="text-right font-semibold text-slate-600">Qtd</TableHead>
              <TableHead className="text-right font-semibold text-slate-600">Bruto</TableHead>
              <TableHead className="text-right font-semibold text-red-600">Descontos</TableHead>
              <TableHead className="text-right font-semibold text-indigo-600">Taxas</TableHead>
              <TableHead className="text-right font-semibold text-slate-900">Líquido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(summary.totals).map(([canal, stats]) => {
              if (stats.count === 0) return null;
              const Icon = stats.icon;
              return (
                <TableRow key={canal} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${stats.bg}`}>
                        <Icon className={`w-4 h-4 ${stats.color}`} />
                      </div>
                      {canal}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-500">{stats.count}</TableCell>
                  <TableCell className="text-right text-slate-600">{formatMoney(stats.bruto)}</TableCell>
                  <TableCell className="text-right text-red-500">-{formatMoney(stats.desconto)}</TableCell>
                  <TableCell className="text-right text-indigo-500">{formatMoney(stats.taxa)}</TableCell>
                  <TableCell className="text-right font-bold text-slate-800">{formatMoney(stats.liquido)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-slate-100/80 hover:bg-slate-100 font-bold border-t-2 border-slate-200">
              <TableCell className="text-slate-900">TOTAL GERAL</TableCell>
              <TableCell className="text-right font-mono">{summary.geral.count}</TableCell>
              <TableCell className="text-right text-slate-700">{formatMoney(summary.geral.bruto)}</TableCell>
              <TableCell className="text-right text-red-600">-{formatMoney(summary.geral.desconto)}</TableCell>
              <TableCell className="text-right text-indigo-700">{formatMoney(summary.geral.taxa)}</TableCell>
              <TableCell className="text-right text-emerald-700 text-lg">{formatMoney(summary.geral.liquido)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}