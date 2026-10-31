import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShoppingBag, Trash2, CheckCircle, AlertCircle, CreditCard, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUnit, formatMoney } from '@/utils/currencyFormatter';
import { formatBandejaPriceForDisplay } from '@/utils/bandejaPriceFormatter';
import { usePDVManagement } from '@/hooks/usePDVManagement';
import { Badge } from '@/components/ui/badge';

export default function CarrinhoVenda({ 
  cart, 
  onRemove, 
  onClear, 
  onFinalize, 
  isSubmitting,
  discount,
  setDiscount,
  calculateDiscountTotals,
  validateDiscount
}) {
  const { calculateCartTotals, calculateItemTotal } = usePDVManagement();
  const { totalItens, totalBandejas, totalUnitarios } = calculateCartTotals(cart);
  
  const { subtotal, desconto_valor, total_final } = calculateDiscountTotals(cart);
  const validation = validateDiscount(subtotal);
  
  const [formaPagamento, setFormaPagamento] = useState('');
  const [valorRecebido, setValorRecebido] = useState('');

  const valRecebidoNum = parseFloat(valorRecebido) || 0;
  const isDinheiro = formaPagamento === 'dinheiro';
  const troco = isDinheiro ? valRecebidoNum - total_final : 0;
  
  const isDinheiroValido = isDinheiro ? valRecebidoNum >= total_final : true;
  const isDinheiroInvalido = isDinheiro && valRecebidoNum > 0 && valRecebidoNum < total_final;

  const handleAddValorRecebido = (val) => {
    setValorRecebido((prev) => {
      const current = parseFloat(prev) || 0;
      return (current + val).toString();
    });
  };

  const handleFinalizeClick = () => {
    if (!formaPagamento || !isDinheiroValido || !validation.isValid) return;
    
    const finalTroco = isDinheiro ? troco : null;
    const finalValorRecebido = isDinheiro ? valRecebidoNum : null;
    
    onFinalize(formaPagamento, finalValorRecebido, finalTroco);
  };

  const handleClearAll = () => {
    setFormaPagamento('');
    setValorRecebido('');
    onClear();
  };

  const getTypeColor = (tipo_item) => {
    if (tipo_item === 'BRINDE') return 'bg-emerald-100 text-emerald-800';
    if (tipo_item === 'PERDA') return 'bg-red-100 text-red-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <Card className="border-gray-200 shadow-sm h-full flex flex-col">
      <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[var(--color-primary)]" />
            Carrinho de Venda
          </CardTitle>
          <span className="bg-[var(--color-primary-light)]/20 text-[var(--color-primary-dark)] text-xs font-bold px-2.5 py-1 rounded-full">
            {totalItens} itens
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-auto max-h-[380px]">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400 space-y-3">
            <AlertCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">O carrinho está vazio.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[30%] text-gray-700">Produto</TableHead>
                <TableHead className="text-gray-700">Tipo/Lote</TableHead>
                <TableHead className="text-center text-gray-700">Qtd</TableHead>
                <TableHead className="text-right text-gray-700">V. Unitário</TableHead>
                <TableHead className="text-right text-gray-700">Total</TableHead>
                <TableHead className="text-center text-gray-700">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* CRITICAL FIX: Render ONLY product items in main table */}
              {cart.map((item, index) => {
                // CRITICAL: Use full precision for calculations
                const itemTotal = calculateItemTotal(item.quantidade, item.preco, item.tipo_item);
                
                // Get the full precision unit price
                const valorUnitario = 
                  item.tipo === 'unitario'
                    ? Number(item.original_preco ?? item.preco)
                    : Number(item.preco);

                const displayPrice = item.tipo_item === 'NORMAL' ? valorUnitario : 0;
                
                // CRITICAL: Use formatUnit() for BOTH unit price AND item total (up to 3 decimals, no rounding)
                const formattedUnitPrice = item.tipo === 'bandeja' && item.tipo_item === 'NORMAL'
                  ? formatBandejaPriceForDisplay(displayPrice)
                  : formatUnit(displayPrice);
                
                const formattedItemTotal = formatUnit(itemTotal);
                
                return (
                  <TableRow key={`${item.lote_id}-${index}`} className="hover:bg-[var(--color-primary-light)]/10">
                    <TableCell className="font-medium text-gray-900 py-3">
                      <div className="flex flex-col">
                        <span className="line-clamp-1" title={item.produto_nome}>{item.produto_nome}</span>
                        {item.tipo_item !== 'NORMAL' && (
                           <Badge className={`w-fit mt-1 text-[10px] uppercase font-bold ${getTypeColor(item.tipo_item)}`}>
                             {item.tipo_item}
                           </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 py-3 text-xs">
                      <div className="flex flex-col">
                        <span className="capitalize">{item.tipo}</span>
                        <span className="text-gray-400">{item.numero_lote}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-gray-900 py-3">
                      {item.quantidade}
                    </TableCell>
                    <TableCell className="text-right text-gray-600 py-3">
                      {formattedUnitPrice}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700 py-3">
                      {formattedItemTotal}
                    </TableCell>
                    <TableCell className="text-center py-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onRemove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* CRITICAL FIX: Add DESCONTO as separate row (ONCE per sale, not per item) */}
              {desconto_valor > 0 && (
                <TableRow className="bg-red-50/30 border-t-2 border-red-100">
                  <TableCell colSpan={4} className="font-bold text-red-700 py-3">
                    Desconto {discount.tipo === '%' && discount.valor ? `(${discount.valor}%)` : ''}
                  </TableCell>
                  <TableCell className="text-right font-bold text-red-700 py-3">
                    - {formatMoney(desconto_valor)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}

              {/* Summary row with total */}
              <TableRow className="bg-green-50 border-t-2 border-green-200">
                <TableCell colSpan={4} className="font-bold text-green-800 py-3 text-base">
                  Total Final
                </TableCell>
                <TableCell className="text-right font-black text-green-700 py-3 text-lg">
                  {formatMoney(total_final)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CardFooter className="border-t border-gray-200 bg-white flex flex-col p-0 pb-5 space-y-4">
        {cart.length > 0 && (
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="w-full md:w-1/2 space-y-2">
              <Label className="text-gray-700 font-semibold">Desconto</Label>
              <div className="flex gap-2">
                <Select value={discount.tipo} onValueChange={(v) => setDiscount(v, discount.valor)}>
                  <SelectTrigger className="w-[80px] bg-white text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R$">R$</SelectItem>
                    <SelectItem value="%">%</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  step="0.001"
                  min="0"
                  value={discount.valor} 
                  onChange={(e) => setDiscount(discount.tipo, e.target.value)} 
                  className={`bg-white flex-1 text-gray-900 ${!validation.isValid ? 'border-red-500' : ''}`}
                  placeholder="0"
                />
              </div>
              {!validation.isValid && discount.valor !== '' && (
                <p className="text-xs text-red-500 font-medium mt-1">{validation.error}</p>
              )}
            </div>
            
            <div className="w-full md:w-1/2 flex flex-col gap-1 text-right">
              <div className="flex justify-between items-center text-gray-500">
                <span className="text-sm font-medium">Subtotal (Apenas Normais):</span>
                <span className="text-sm">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-red-500">
                <span className="text-sm font-medium">
                  Desconto {discount.tipo === '%' && discount.valor ? `(${discount.valor}%)` : ''}:
                </span>
                <span className="text-sm">- {formatMoney(desconto_valor)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-1">
                <span className="text-lg font-bold text-gray-800">Total Final:</span>
                <span className="text-xl font-black text-green-700">{formatMoney(total_final)}</span>
              </div>
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="px-5 w-full space-y-4 mt-2">
             <div className="space-y-2">
               <Label className="text-gray-700 font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 w-4" /> Forma de Pagamento
               </Label>
               <Select value={formaPagamento} onValueChange={(val) => {
                 setFormaPagamento(val);
                 if (val !== 'dinheiro') setValorRecebido('');
               }}>
                 <SelectTrigger className={`w-full bg-white text-gray-900 ${!formaPagamento ? 'border-amber-500' : ''}`}>
                   <SelectValue placeholder="Selecione a forma de pagamento..." />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="dinheiro">Dinheiro</SelectItem>
                   <SelectItem value="pix">Pix</SelectItem>
                   <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                   <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                 </SelectContent>
               </Select>
               {!formaPagamento && <p className="text-xs text-amber-600">Obrigatório para finalizar a venda</p>}
             </div>

             {isDinheiro && (
               <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-gray-700 font-semibold flex items-center gap-2">
                       <DollarSign className="w-4 h-4" /> Valor Recebido (R$)
                    </Label>
                    <Input 
                      type="number" 
                      step="0.001"
                      min="0"
                      value={valorRecebido} 
                      onChange={(e) => setValorRecebido(e.target.value)}
                      placeholder="0,000"
                      required
                      className={`bg-white text-lg font-bold text-gray-900 h-11 ${isDinheiroInvalido ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    />
                    {isDinheiroInvalido && (
                      <p className="text-xs text-red-500 font-medium">Valor insuficiente</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {[10, 20, 50, 100].map(val => (
                      <Button 
                        key={val} 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 border-gray-300 bg-white hover:bg-green-50 hover:text-green-700 font-bold"
                        onClick={() => handleAddValorRecebido(val)}
                      >
                        + R$ {val}
                      </Button>
                    ))}
                  </div>

                  <div className={`p-3 rounded-md flex justify-between items-center border ${troco >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <span className="font-bold">Troco:</span>
                    <span className="text-lg font-black">{formatMoney(troco)}</span>
                  </div>
               </div>
             )}
          </div>
        )}

        <div className="px-5 pt-1 w-full mt-2">
          <div className="grid grid-cols-3 gap-4 w-full bg-gray-50 rounded-lg p-3 border border-gray-100 mb-4">
            <div className="flex flex-col text-center border-r border-gray-200">
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Itens</span>
              <span className="text-lg font-bold text-gray-900">{totalItens}</span>
            </div>
            <div className="flex flex-col text-center border-r border-gray-200">
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Bandejas</span>
              <span className="text-lg font-bold text-gray-900">{totalBandejas}</span>
            </div>
            <div className="flex flex-col text-center">
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Unidades</span>
              <span className="text-lg font-bold text-gray-900">{totalUnitarios}</span>
            </div>
          </div>
          
          <div className="flex gap-3 w-full">
            <Button 
              variant="outline" 
              className="flex-1 border-gray-300 text-[var(--color-secondary)] hover:text-white hover:bg-[var(--color-secondary)]"
              onClick={handleClearAll}
              disabled={cart.length === 0 || isSubmitting}
            >
              Limpar
            </Button>
            <Button 
              className="flex-[2] font-bold h-11 disabled:bg-gray-300"
              onClick={handleFinalizeClick}
              disabled={cart.length === 0 || isSubmitting || !validation.isValid || !formaPagamento || !isDinheiroValido}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              {isSubmitting ? 'Finalizando...' : 'Confirmar Venda'}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}