import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { QRCodeSVG } from 'qrcode.react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/utils/currencyFormatter';
import { 
  ArrowLeft, 
  Printer, 
  Receipt, 
  AlertTriangle, 
  Loader2, 
  Calendar,
  CreditCard,
  User,
  Store,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function VendaInquiryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresaId, empresaNome } = useAuth();
  
  const [venda, setVenda] = useState(null);
  const [itens, setItens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVendaDetails = async () => {
      if (!empresaId || !id) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch Venda
        const { data: vendaData, error: vendaError } = await supabase
          .from('vendas')
          .select('*')
          .eq('id', id)
          .eq('empresa_id', empresaId)
          .single();
          
        if (vendaError) throw vendaError;
        if (!vendaData) throw new Error('Venda não encontrada');
        
        setVenda(vendaData);

        // Fetch Items (from movimentacoes)
        const { data: itensData, error: itensError } = await supabase
          .from('movimentacoes')
          .select('*, produtos(nome)')
          .eq('venda_id', id)
          .eq('empresa_id', empresaId);
          
        if (itensError) throw itensError;
        
        setItens(itensData || []);
      } catch (err) {
        console.error("Erro ao buscar venda:", err);
        setError("Não foi possível encontrar os detalhes desta venda.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVendaDetails();
  }, [id, empresaId]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR')}`;
  };

  const getMetodoPagamento = (metodo) => {
    const metodos = {
      dinheiro: 'Dinheiro',
      pix: 'PIX',
      cartao_debito: 'Cartão de Débito',
      cartao_credito: 'Cartão de Crédito'
    };
    return metodos[metodo] || metodo;
  };

  // Calculate totals from items if not fully populated in venda
  const subtotal = itens.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
  const descontoTotal = itens.reduce((acc, item) => acc + (Number(item.desconto_valor) || 0), 0);
  const totalFinal = venda?.total_final || itens.reduce((acc, item) => acc + (Number(item.total_final) || 0), 0);
  const formaPagamento = venda?.forma_pagamento || (itens.length > 0 ? itens[0].forma_pagamento : 'N/A');
  const valorRecebido = itens.length > 0 ? itens[0].valor_recebido : 0;
  const troco = itens.length > 0 ? itens[0].troco : 0;

  const currentUrl = window.location.href;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col min-h-[50vh] items-center justify-center p-12 text-gray-500 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-[var(--color-primary)]" />
          <p className="font-medium text-lg">Carregando detalhes da venda...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !venda) {
    return (
      <DashboardLayout>
         <div className="max-w-3xl mx-auto mt-8">
            <Button variant="outline" className="mb-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error || "Venda não encontrada."}</AlertDescription>
            </Alert>
         </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet><title>Detalhes da Venda - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6 print:m-0 print:p-0 print:max-w-none print:w-full">
          
          <div className="flex items-center justify-between print:hidden">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Consulta de Venda</h1>
                <p className="text-gray-500 text-sm">#{venda.id.substring(0, 8).toUpperCase()}</p>
              </div>
            </div>
            <Button onClick={handlePrint} className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white">
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </Button>
          </div>

          <Card className="print:shadow-none print:border-none print:bg-transparent overflow-hidden">
            <div className="h-2 bg-[var(--color-primary)] print:hidden"></div>
            <CardHeader className="bg-gray-50/50 print:bg-transparent border-b print:border-b-2 print:border-black border-gray-100 pb-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-[var(--color-primary)]/10 p-2 rounded-lg print:hidden">
                      <Receipt className="w-6 h-6 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{empresaNome}</CardTitle>
                      <p className="text-sm text-gray-500 print:text-black">Comprovante de Venda</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 print:text-black">
                      <Store className="w-4 h-4 print:hidden" />
                      <span className="font-semibold w-20">Pedido:</span>
                      <span className="font-mono">{venda.id.substring(0, 8).toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 print:text-black">
                      <Calendar className="w-4 h-4 print:hidden" />
                      <span className="font-semibold w-20">Data/Hora:</span>
                      <span>{formatDate(venda.data_venda || venda.created_at)}</span>
                    </div>
                    {venda.canal_venda && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 print:text-black">
                        <Store className="w-4 h-4 print:hidden" />
                        <span className="font-semibold w-20">Canal:</span>
                        <span className="uppercase">{venda.canal_venda}</span>
                      </div>
                    )}
                    {venda.cliente_referencia && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 print:text-black">
                        <User className="w-4 h-4 print:hidden" />
                        <span className="font-semibold w-20">Cliente:</span>
                        <span>{venda.cliente_referencia}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm print:shadow-none print:border-none">
                  <QRCodeSVG 
                    value={currentUrl} 
                    size={120} 
                    level="M"
                    includeMargin={true}
                  />
                  <span className="text-[10px] text-gray-400 mt-2 print:text-black text-center font-mono">
                    Escaneie para verificar
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6 print:pt-4">
              <h3 className="font-bold text-gray-900 mb-4 print:text-black border-b pb-2">Itens da Venda</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 print:bg-transparent print:border-b print:border-black">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg print:rounded-none">Produto</th>
                      <th className="px-4 py-3 text-center">Qtd</th>
                      <th className="px-4 py-3 text-right">V. Unit</th>
                      <th className="px-4 py-3 text-right rounded-tr-lg print:rounded-none">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                    {itens.map((item, idx) => {
                      const itemName = item.produtos?.nome || 'Produto Desconhecido';
                      const vUnit = (item.subtotal || 0) / (item.quantidade || 1);
                      return (
                        <tr key={idx} className="hover:bg-gray-50 print:hover:bg-transparent">
                          <td className="px-4 py-3 font-medium text-gray-900 print:text-black">
                            {itemName}
                            {item.tipo_item && item.tipo_item !== 'NORMAL' && (
                              <span className="ml-2 text-xs text-gray-500">({item.tipo_item})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center print:text-black">{item.quantidade}</td>
                          <td className="px-4 py-3 text-right print:text-black">{formatCurrency(vUnit)}</td>
                          <td className="px-4 py-3 text-right font-medium print:text-black">{formatCurrency(item.subtotal || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(venda.responsavel_retirada || venda.observacao_retirada) && (
                <div className="mt-8 bg-amber-50 border border-amber-100 p-4 rounded-xl print:bg-transparent print:border-black print:rounded-none">
                  <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-3 print:text-black border-b border-amber-200 print:border-black pb-2">
                    <User className="w-4 h-4 print:hidden" /> Informações de Retirada
                  </h4>
                  <div className="space-y-3 text-sm">
                    {venda.responsavel_retirada && (
                      <div>
                        <span className="text-amber-800/80 print:text-black font-semibold block mb-1">Responsável pela Retirada:</span>
                        <span className="text-amber-950 print:text-black">{venda.responsavel_retirada}</span>
                      </div>
                    )}
                    {venda.observacao_retirada && (
                      <div>
                        <span className="text-amber-800/80 print:text-black font-semibold block mb-1">Observação da Retirada:</span>
                        <span className="text-amber-950 print:text-black whitespace-pre-wrap">{venda.observacao_retirada}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 print:block">
                
                <div className="bg-gray-50 p-4 rounded-xl print:bg-transparent print:p-0 print:mb-6">
                  <h4 className="font-bold text-gray-700 flex items-center gap-2 mb-3 print:text-black border-b print:border-black pb-2">
                    <CreditCard className="w-4 h-4 print:hidden" /> Pagamento
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 print:text-black">Método:</span>
                      <span className="font-medium text-gray-900 print:text-black">{getMetodoPagamento(formaPagamento)}</span>
                    </div>
                    {formaPagamento === 'dinheiro' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500 print:text-black">Valor Recebido:</span>
                          <span className="font-medium text-gray-900 print:text-black">{formatCurrency(valorRecebido)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 print:text-black">Troco:</span>
                          <span className="font-medium text-gray-900 print:text-black">{formatCurrency(troco)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 print:border-none print:bg-transparent print:p-0">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 print:text-black">Subtotal:</span>
                      <span className="font-medium text-gray-900 print:text-black">{formatCurrency(subtotal)}</span>
                    </div>
                    {descontoTotal > 0 && (
                      <div className="flex justify-between text-red-600 print:text-black">
                        <span>Desconto:</span>
                        <span>- {formatCurrency(descontoTotal)}</span>
                      </div>
                    )}
                    <div className="border-t border-emerald-200 print:border-black pt-3 mt-3 flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg print:text-black">Total Pago:</span>
                      <span className="font-black text-emerald-700 text-xl print:text-black">{formatCurrency(totalFinal)}</span>
                    </div>
                  </div>
                </div>
                
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </>
  );
}