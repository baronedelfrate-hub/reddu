import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Play, CheckCircle2, XCircle, Calendar, User, Info, Loader2, Store, FileText, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { usePedidosManagement } from '@/hooks/usePedidosManagement';
import PedidoStatusBadge from '@/components/pedidos/PedidoStatusBadge';
import PedidoItemsTable from '@/components/pedidos/PedidoItemsTable';

export default function PedidoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPedidoById, updateStatus } = usePedidosManagement();
  
  const [pedido, setPedido] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProducaoDialogOpen, setIsProducaoDialogOpen] = useState(false);

  const fetchPedidoDetails = async () => {
    setIsLoading(true);
    const data = await getPedidoById(id);
    setPedido(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPedidoDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    const success = await updateStatus(id, newStatus);
    if (success) {
      fetchPedidoDetails();
    }
  };

  const handleGerarProducao = (item) => {
    setIsProducaoDialogOpen(false);
    navigate(`/dashboard/produzir-bandejas?produto_id=${item.produto_id}&quantidade_bandejas=${item.quantidade_bandejas}&pedido_id=${pedido.id}`);
  };

  const onGerarProducaoClick = () => {
    if (pedido?.itens?.length === 1) {
      handleGerarProducao(pedido.itens[0]);
    } else if (pedido?.itens?.length > 1) {
      setIsProducaoDialogOpen(true);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const [y, m, d] = dateString.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Carregando detalhes do pedido...</p>
        </div>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-16">
        <Info className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Pedido não encontrado</h2>
        <p className="text-slate-500 mt-2 mb-6">O pedido que você está procurando não existe ou você não tem acesso a ele.</p>
        <Button onClick={() => navigate('/pedidos')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Pedidos
        </Button>
      </div>
    );
  }

  const canGenerateProducao = (pedido.status === 'pendente' || pedido.status === 'em_producao') && pedido.itens && pedido.itens.length > 0;

  return (
    <>
      <Helmet>
        <title>Detalhes do Pedido | Estoque 360</title>
      </Helmet>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => navigate('/pedidos')} className="text-slate-600">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          
          <div className="flex flex-wrap items-center gap-2">
            {canGenerateProducao && (
              <Button 
                onClick={onGerarProducaoClick}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                title="Gerar produção para este pedido"
              >
                <Zap className="h-4 w-4 mr-2" /> Gerar Produção
              </Button>
            )}

            {pedido.status === 'pendente' && (
              <Button 
                onClick={() => handleStatusChange('em_producao')}
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Play className="h-4 w-4 mr-2" /> Iniciar Produção
              </Button>
            )}
            
            {pedido.status === 'em_producao' && (
              <Button 
                onClick={() => handleStatusChange('concluido')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Marcar Concluído
              </Button>
            )}

            {(pedido.status === 'pendente' || pedido.status === 'em_producao') && (
              <Button 
                onClick={() => handleStatusChange('cancelado')}
                variant="outline"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
              >
                <XCircle className="h-4 w-4 mr-2" /> Cancelar Pedido
              </Button>
            )}
          </div>
        </div>

        {/* Summary Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="w-full">
                <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-4">
                  <h1 className="text-3xl font-bold text-slate-900">Pedido #{pedido.id.substring(0, 8).toUpperCase()}</h1>
                  <PedidoStatusBadge status={pedido.status} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                  <div className="flex items-center gap-3 text-slate-600">
                    <div className="bg-indigo-50 p-2 rounded-lg">
                      <Store className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mercado</p>
                      <p className="text-slate-900 font-semibold">{pedido.locais?.nome || 'Desconhecido'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-slate-600">
                    <div className="bg-blue-50 p-2 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Data de Entrega</p>
                      <p className="text-slate-900 font-semibold">{formatDate(pedido.data_entrega)}</p>
                    </div>
                  </div>

                  {pedido.observacao && (
                    <div className="flex items-start gap-3 text-slate-600 md:col-span-2 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <FileText className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Observações</p>
                        <p className="text-slate-700 text-sm whitespace-pre-wrap">{pedido.observacao}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Section */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
            <CardTitle className="text-lg text-slate-800">Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PedidoItemsTable items={pedido.itens} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Select Item Dialog for Production */}
      <Dialog open={isProducaoDialogOpen} onOpenChange={setIsProducaoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Produção</DialogTitle>
            <DialogDescription>
              Este pedido contém múltiplos itens. Selecione qual produto você deseja produzir agora:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {pedido?.itens?.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleGerarProducao(item)}
              >
                <div>
                  <p className="font-medium text-slate-900">{item.produtos?.nome}</p>
                  <p className="text-sm text-slate-500">{item.quantidade_bandejas} bandejas solicitadas</p>
                </div>
                <Button variant="ghost" size="icon" className="text-blue-600">
                  <Zap className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}