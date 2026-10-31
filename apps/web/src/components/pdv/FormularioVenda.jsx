import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePDVManagement } from '@/hooks/usePDVManagement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShoppingCart, PlusCircle, AlertCircle } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatUnit } from '@/utils/currencyFormatter';
import { formatBandejaPriceForDisplay } from '@/utils/bandejaPriceFormatter';
import SeletorLotes from './SeletorLotes';
import ItemTypeSelector from '@/components/ItemTypeSelector';
import { withEstoqueBandejas, STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';
import { supabase } from '@/lib/customSupabaseClient';

export default function FormularioVenda({ onAddToCart, currentMercadoId, setMercadoId, formKey, locais = [] }) {
  const { empresaId } = useAuth();
  const { fetchProdutosComEstoque } = usePDVManagement();

  const [mercados, setMercados] = useState([]);
  const [produtosEstoque, setProdutosEstoque] = useState([]);
  
  const [produtoId, setProdutoId] = useState('');
  const [tipoVenda, setTipoVenda] = useState('bandeja');
  const [tipoItem, setTipoItem] = useState('NORMAL');
  const [selectedLote, setSelectedLote] = useState(null);
  const [quantidade, setQuantidade] = useState('');
  
  const [errors, setErrors] = useState({});
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false);

  useEffect(() => {
    setProdutoId('');
    setSelectedLote(null);
    setQuantidade('');
    setTipoVenda('bandeja');
    setTipoItem('NORMAL');
    setErrors({});
  }, [formKey]);

  useEffect(() => {
    if (locais && locais.length > 0) {
      setMercados(withEstoqueBandejas(locais));
    } else if (empresaId) {
      supabase.from('locais').select('*').eq('empresa_id', empresaId).eq('tipo', 'Estoque').order('nome')
        .then(({ data, error }) => {
          if (!error) {
            setMercados(withEstoqueBandejas(data || []));
          }
        });
    }
  }, [empresaId, locais]);

  useEffect(() => {
    if (empresaId && currentMercadoId) {
      setIsLoadingProdutos(true);
      fetchProdutosComEstoque(empresaId, currentMercadoId)
        .then(setProdutosEstoque)
        .catch(console.error)
        .finally(() => setIsLoadingProdutos(false));
    } else {
      setProdutosEstoque([]);
    }
    setProdutoId('');
    setSelectedLote(null);
    setQuantidade('');
  }, [empresaId, currentMercadoId]);

  const displayedProdutos = useMemo(() => {
    if (tipoVenda === 'bandeja') {
      return produtosEstoque.filter(p => parseFloat(p.preco_bandeja) > 0);
    } else {
      return produtosEstoque.filter(p => parseFloat(p.preco_unitario) > 0);
    }
  }, [tipoVenda, produtosEstoque]);

  const handleTipoVendaChange = (val) => {
    setTipoVenda(val);
    setProdutoId('');
    setSelectedLote(null);
    setQuantidade('');
    setErrors({});
  };

  const handleAdd = () => {
    const newErrors = {};
    if (!currentMercadoId) newErrors.mercado = "Mercado/Local é obrigatório";
    if (!produtoId) newErrors.produto = "Produto é obrigatório";
    if (tipoVenda === 'bandeja' && !selectedLote) newErrors.lote = "Lote é obrigatório";
    
    const qty = parseInt(quantidade, 10);
    const produto = displayedProdutos.find(p => p.id === produtoId);

    if (!quantidade || isNaN(qty) || qty <= 0) {
      newErrors.quantidade = "Quantidade deve ser maior que 0";
    } else if (tipoVenda === 'bandeja' && selectedLote && qty > selectedLote.quantidade) {
      newErrors.quantidade = `Quantidade excede o saldo disponível (${selectedLote.quantidade} bandejas)`;
    } else if (tipoVenda === 'unitario' && produto && qty > produto.total_unidades) {
      newErrors.quantidade = `Quantidade excede o saldo disponível (${produto.total_unidades} unidades)`;
    }

    if (produto) {
      const precoAplicado = tipoVenda === 'bandeja' ? parseFloat(produto.preco_bandeja) : parseFloat(produto.preco_unitario);
      if (!precoAplicado || precoAplicado <= 0) {
        newErrors.produto = `Produto não possui preço configurado para o tipo ${tipoVenda}`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const precoFinal = tipoVenda === 'bandeja' ? parseFloat(produto.preco_bandeja) : parseFloat(produto.preco_unitario);
    const maxQty = tipoVenda === 'bandeja' ? (selectedLote?.quantidade || Infinity) : (produto?.total_unidades || Infinity);
    
    onAddToCart({
      produto_id: produto.id,
      produto_nome: produto.nome,
      tipo: tipoVenda,
      preco: precoFinal,
      lote_id: selectedLote?.id || null,
      numero_lote: selectedLote?.numero_lote || '-',
      quantidade: qty,
      max_quantidade: maxQty,
      tipo_item: tipoItem
    });

    setSelectedLote(null);
    setQuantidade('');
    setTipoItem('NORMAL');
    setErrors({});
  };

  const selectedProduto = displayedProdutos.find(p => p.id === produtoId);
  const precoAtualDisplay = selectedProduto 
    ? (tipoVenda === 'bandeja' ? selectedProduto.preco_bandeja : selectedProduto.preco_unitario)
    : null;

  const locaisEstoque = mercados.filter(local => 
    local.tipo === 'Estoque' || 
    local.tipo === 'estoque' || 
    local.id === STATIC_ESTOQUE_BANDEJAS_ID || 
    local.is_system
  );

  return (
    <Card className="border-gray-200 shadow-sm h-full flex flex-col">
      <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
        <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-[var(--color-primary)]" />
          Adicionar Item
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-5 flex-1">
        
        <div className="space-y-1.5">
          <Label className="text-gray-700 font-semibold">Mercado/Local (Apenas Estoque)</Label>
          <Select value={currentMercadoId} onValueChange={(v) => setMercadoId(v)}>
            <SelectTrigger className={`w-full text-gray-900 ${errors.mercado ? 'border-[var(--color-error)]' : ''}`}>
              <SelectValue placeholder="Selecione o Local de Estoque" />
            </SelectTrigger>
            <SelectContent>
              {locaisEstoque.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.mercado && <p className="text-xs text-[var(--color-error)]">{errors.mercado}</p>}
        </div>

        <div className="space-y-3 pt-2 pb-1">
          <Label className="text-gray-700 font-semibold">Tipo de Venda</Label>
          <RadioGroup 
            value={tipoVenda} 
            onValueChange={handleTipoVendaChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="bandeja" id="r1" />
              <Label htmlFor="r1" className="cursor-pointer text-gray-800">Bandeja</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="unitario" id="r2" />
              <Label htmlFor="r2" className="cursor-pointer text-gray-800">Unitário</Label>
            </div>
          </RadioGroup>
        </div>

        <ItemTypeSelector value={tipoItem} onChange={setTipoItem} />

        <div className="space-y-1.5">
          <Label className="text-gray-700 font-semibold">Produto</Label>
          <Select 
            value={produtoId} 
            onValueChange={(v) => {
              setProdutoId(v);
              setSelectedLote(null);
              setQuantidade('');
              setErrors((prev) => ({ ...prev, produto: undefined }));
            }} 
            disabled={!currentMercadoId || isLoadingProdutos || displayedProdutos.length === 0}
          >
            <SelectTrigger className={`w-full text-gray-900 ${errors.produto ? 'border-[var(--color-error)]' : ''}`}>
              <SelectValue placeholder={
                !currentMercadoId ? "Selecione o local primeiro" :
                isLoadingProdutos ? "Carregando produtos..." :
                displayedProdutos.length === 0 ? `Sem produtos ativos para o tipo ${tipoVenda === 'bandeja' ? 'Bandeja' : 'Unitário'}` :
                "Selecione o Produto"
              } />
            </SelectTrigger>
            <SelectContent>
              {displayedProdutos.map(p => {
                const isBandeja = tipoVenda === 'bandeja';
                const dispText = isBandeja 
                  ? `${p.total_bandejas} ${p.total_bandejas === 1 ? 'bandeja disp.' : 'bandejas disp.'}`
                  : `${p.total_unidades} ${p.total_unidades === 1 ? 'unidade disp.' : 'unidades disp.'}`;
                  
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} ({dispText})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {errors.produto && <p className="text-xs text-[var(--color-error)]">{errors.produto}</p>}
          {currentMercadoId && displayedProdutos.length === 0 && !isLoadingProdutos && (
            <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              Nenhum produto com lote ativo disponível para venda do tipo {tipoVenda === 'bandeja' ? 'Bandeja' : 'Unitário'}.
            </p>
          )}
        </div>

        {selectedProduto && (
          <div className="bg-[var(--color-primary-light)]/20 p-3 rounded-md text-sm text-[var(--color-primary-dark)] flex justify-between items-center">
            <span className="font-medium">Preço Aplicado:</span>
            <span className="font-bold text-lg">
              {tipoItem === 'NORMAL' 
                ? (tipoVenda === 'bandeja' 
                    ? formatBandejaPriceForDisplay(precoAtualDisplay)
                    : formatUnit(precoAtualDisplay))
                : formatUnit(0)
              }
            </span>
          </div>
        )}

        {tipoVenda === 'bandeja' && (
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-semibold">Lote</Label>
            <SeletorLotes 
              produtoId={produtoId} 
              mercadoId={currentMercadoId} 
              onSelect={setSelectedLote}
              selectedLoteId={selectedLote?.id}
              tipo={tipoVenda}
            />
            {errors.lote && <p className="text-xs text-[var(--color-error)]">{errors.lote}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-gray-700 font-semibold">
            {tipoVenda === 'bandeja' ? 'Quantidade (Bandejas)' : 'Quantidade (Unidades)'}
          </Label>
          <Input 
            type="number"
            inputMode="decimal"
            min="1" 
            max={tipoVenda === 'bandeja' ? (selectedLote?.quantidade || "") : (selectedProduto?.total_unidades || "")}
            value={quantidade} 
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex: 5"
            className={`w-full text-gray-900 ${errors.quantidade ? 'border-[var(--color-error)]' : ''}`}
            disabled={tipoVenda === 'bandeja' ? !selectedLote : !produtoId}
          />
          {errors.quantidade && <p className="text-xs text-[var(--color-error)]">{errors.quantidade}</p>}
        </div>

        <div className="pt-2">
          <Button 
            onClick={handleAdd} 
            disabled={!currentMercadoId || !produtoId || (tipoVenda === 'bandeja' && !selectedLote) || !quantidade}
            className="w-full h-11 font-bold"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Adicionar ao Carrinho
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}