import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertasEstoqueBaixoTabela from './AlertasEstoqueBaixoTabela';
import AlertasLotesVencendoTabela from './AlertasLotesVencendoTabela';
import AlertasLotesVencidosTabela from './AlertasLotesVencidosTabela';

export default function AlertasTabelaDetalhada({ vencidos, vencendo, estoqueBaixo }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <Tabs defaultValue="vencidos" className="w-full">
        <div className="px-6 pt-4 border-b border-gray-100">
          <TabsList className="grid w-full grid-cols-3 max-w-lg bg-gray-100/50 p-1 rounded-lg">
            <TabsTrigger 
              value="vencidos" 
              className="data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm font-medium"
            >
              Vencidos ({vencidos.length})
            </TabsTrigger>
            <TabsTrigger 
              value="vencendo" 
              className="data-[state=active]:bg-white data-[state=active]:text-yellow-700 data-[state=active]:shadow-sm font-medium"
            >
              Vencendo ({vencendo.length})
            </TabsTrigger>
            <TabsTrigger 
              value="estoque" 
              className="data-[state=active]:bg-white data-[state=active]:text-orange-700 data-[state=active]:shadow-sm font-medium"
            >
              Estoque Baixo ({estoqueBaixo.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="vencidos" className="m-0">
          <AlertasLotesVencidosTabela data={vencidos} />
        </TabsContent>

        <TabsContent value="vencendo" className="m-0">
          <AlertasLotesVencendoTabela data={vencendo} />
        </TabsContent>

        <TabsContent value="estoque" className="m-0">
          <AlertasEstoqueBaixoTabela data={estoqueBaixo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}