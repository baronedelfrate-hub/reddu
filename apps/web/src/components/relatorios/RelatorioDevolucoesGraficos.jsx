import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#ff7c43', '#f95d6a', '#d45087'];

export default function RelatorioDevolucoesGraficos({ data }) {
  if (!data || data.length === 0) {
    return null;
  }

  // Motivos
  const motivosCount = data.reduce((acc, item) => {
    const motivo = (item.motivo_devolucao || 'outro').replace('_', ' ');
    acc[motivo] = (acc[motivo] || 0) + 1;
    return acc;
  }, {});
  const dataMotivos = Object.keys(motivosCount).map(key => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    count: motivosCount[key]
  })).sort((a, b) => b.count - a.count);

  // Mercados
  const mercadosCount = data.reduce((acc, item) => {
    const mercado = item.locais?.nome || 'Desconhecido';
    acc[mercado] = (acc[mercado] || 0) + 1;
    return acc;
  }, {});
  const dataMercados = Object.keys(mercadosCount).map(key => ({
    name: key,
    value: mercadosCount[key]
  })).sort((a, b) => b.value - a.value).slice(0, 8); // Top 8

  // Período (Últimos 30 dias com dados)
  const dataMap = data.reduce((acc, item) => {
    if (!item.data_movimentacao) return acc;
    const date = new Date(item.data_movimentacao).toLocaleDateString('pt-BR');
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});
  
  const dataPeriodo = Object.keys(dataMap).map(date => {
    const [day, month, year] = date.split('/');
    return {
      dateStr: date,
      sortDate: new Date(`${year}-${month}-${day}`).getTime(),
      count: dataMap[date]
    };
  }).sort((a, b) => a.sortDate - b.sortDate).slice(-30);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6" id="charts-container">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Devoluções por Motivo</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataMotivos} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Top Mercados (Devoluções)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataMercados}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {dataMercados.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Tendência de Devoluções (Por Dia)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataPeriodo} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dateStr" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}