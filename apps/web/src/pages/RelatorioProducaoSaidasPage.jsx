import React from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import ProductionSalesControlTable from '@/components/dashboard/ProductionSalesControlTable';
import { Activity } from 'lucide-react';

export default function RelatorioProducaoSaidasPage() {
  const { empresaId } = useAuth();
  return (
    <>
      <Helmet><title>Controle de Produção e Saídas - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Controle de Produção e Saídas</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Rastreie cada lote: bandejas produzidas, saídas ao mercado e saldo atual em estoque.
              </p>
            </div>
          </div>
          <ProductionSalesControlTable empresaId={empresaId} />
        </div>
      </DashboardLayout>
    </>
  );
}