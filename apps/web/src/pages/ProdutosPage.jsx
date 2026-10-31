import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { formatUnit } from '@/utils/currencyFormatter';
import { formatBandejaPriceForDisplay, parseBandejaPriceForStorage, validateBandejaPriceInput } from '@/utils/bandejaPriceFormatter';
import { validateDecimalInput } from '@/utils/validateDecimalInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Pencil, Trash2, AlertCircle, Search } from 'lucide-react';
import TabelaNutricionalFormSection from '@/components/produtos/TabelaNutricionalFormSection';

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState(null);
  const [deletingProduto, setDeletingProduto] = useState(null);
  
  const initialFormState = {
    nome: '',
    categoria: '',
    barcode: '',
    imagem_url: '',
    estoque_minimo: 0,
    preco_unitario: '',
    preco_bandeja: '',
    preco_bandeja_mercado: '',
    unidades_por_bandeja: 0,
    controla_validade: false,
    tem_bandeja: false,
    ncm: '',
    cest: '',
    cfop_padrao: '5102',
    origem_produto: '0',
    // Tabela Nutricional (RDC 429/2020)
    possui_tabela_nutricional: false,
    porcao_valor: '',
    porcao_unidade: 'g',
    porcoes_por_embalagem: '',
    medida_caseira: '',
    valor_energetico_kcal: '',
    carboidratos_g: '',
    acucares_totais_g: '',
    acucares_adicionados_g: '',
    proteinas_g: '',
    gorduras_totais_g: '',
    gorduras_saturadas_g: '',
    gorduras_trans_g: '',
    fibra_alimentar_g: '',
    sodio_mg: '',
    alergenicos_contem: '',
    alergenicos_pode_conter: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [uploadingImagem, setUploadingImagem] = useState(false);
  const { empresaId } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (empresaId) {
      fetchProdutos();
    } else {
      setLoading(false);
    }
  }, [empresaId]);

  const fetchProdutos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (error) throw error;
      setProdutos(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatFromDb = (val) => {
    if (val === null || val === undefined) return '';
    return String(val);
  };

  const handleOpenForm = (produto = null) => {
    setEditingProduto(produto);
    setFieldErrors({});
    setFormData(
      produto
        ? {
            nome: produto.nome,
            categoria: produto.categoria || '',
            barcode: produto.barcode || '',
            imagem_url: produto.imagem_url || '',
            estoque_minimo: produto.estoque_minimo || 0,
            preco_unitario: formatFromDb(produto.preco_unitario),
            preco_bandeja: formatFromDb(produto.preco_bandeja),
            preco_bandeja_mercado: formatFromDb(produto.preco_bandeja_mercado),
            unidades_por_bandeja: produto.unidades_por_bandeja || 0,
            controla_validade: produto.controla_validade || false,
            tem_bandeja: produto.tem_bandeja || false,
            ncm: produto.ncm || '',
            cest: produto.cest || '',
            cfop_padrao: produto.cfop_padrao || '5102',
            origem_produto: produto.origem_produto !== null && produto.origem_produto !== undefined ? String(produto.origem_produto) : '0',
            possui_tabela_nutricional: produto.possui_tabela_nutricional || false,
            porcao_valor: formatFromDb(produto.porcao_valor),
            porcao_unidade: produto.porcao_unidade || 'g',
            porcoes_por_embalagem: formatFromDb(produto.porcoes_por_embalagem),
            medida_caseira: produto.medida_caseira || '',
            valor_energetico_kcal: formatFromDb(produto.valor_energetico_kcal),
            carboidratos_g: formatFromDb(produto.carboidratos_g),
            acucares_totais_g: formatFromDb(produto.acucares_totais_g),
            acucares_adicionados_g: formatFromDb(produto.acucares_adicionados_g),
            proteinas_g: formatFromDb(produto.proteinas_g),
            gorduras_totais_g: formatFromDb(produto.gorduras_totais_g),
            gorduras_saturadas_g: formatFromDb(produto.gorduras_saturadas_g),
            gorduras_trans_g: formatFromDb(produto.gorduras_trans_g),
            fibra_alimentar_g: formatFromDb(produto.fibra_alimentar_g),
            sodio_mg: formatFromDb(produto.sodio_mg),
            alergenicos_contem: produto.alergenicos_contem || '',
            alergenicos_pode_conter: produto.alergenicos_pode_conter || '',
          }
        : { ...initialFormState }
    );
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingProduto(null);
    setFormData({ ...initialFormState });
    setFieldErrors({});
  };

  const handlePriceChange = (field, value) => {
    let sanitizedValue = value.replace(/[^\d.,]/g, '');
    sanitizedValue = sanitizedValue.replace(/,/g, '.');
    const parts = sanitizedValue.split('.');
    if (parts.length > 2) {
      sanitizedValue = parts[0] + '.' + parts.slice(1).join('');
    }

    setFormData(prev => ({ ...prev, [field]: sanitizedValue }));
    
    let validation;
    if (field === 'preco_bandeja') {
      validation = validateBandejaPriceInput(sanitizedValue);
    } else {
      validation = validateDecimalInput(sanitizedValue, 3);
    }
    
    if (validation.isValid || sanitizedValue === '') {
      setFieldErrors(prev => ({ ...prev, [field]: null }));
    } else {
      setFieldErrors(prev => ({ ...prev, [field]: validation.error || validation.message }));
    }
  };

  const handleImagemUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem (jpg, png, webp).', variant: 'destructive' });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: 'Imagem muito grande', description: 'Envie uma imagem de até 3MB.', variant: 'destructive' });
      return;
    }

    setUploadingImagem(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${empresaId}/${editingProduto?.id || 'novo'}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('produtos-imagens')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('produtos-imagens')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, imagem_url: publicUrlData.publicUrl }));
      toast({ title: 'Imagem enviada com sucesso!' });
    } catch (error) {
      toast({ title: 'Erro ao enviar imagem', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingImagem(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    // Validate prices before submission
    const pricesToValidate = ['preco_unitario'];
    if (formData.tem_bandeja) {
      pricesToValidate.push('preco_bandeja');
    }

    for (const field of pricesToValidate) {
      let validation;
      if (field === 'preco_bandeja') {
        validation = validateBandejaPriceInput(formData[field]);
      } else {
        validation = validateDecimalInput(formData[field], 3);
      }
      
      if (!validation.isValid && formData[field] !== '') {
        setFieldErrors(prev => ({ ...prev, [field]: validation.error || validation.message }));
        toast({
          title: `Erro de validação`,
          description: validation.error || validation.message,
          variant: 'destructive',
        });
        return;
      }
      
      const numericVal = parseFloat(formData[field]);
      const minValue = field === 'preco_bandeja' ? 0.01 : 0.001;
      if (isNaN(numericVal) || numericVal < minValue) {
        const errorMsg = field === 'preco_bandeja' ? 'Preço mínimo é R$ 0,01' : 'Preço mínimo é R$ 0,001';
        setFieldErrors(prev => ({ ...prev, [field]: errorMsg }));
        toast({
          title: `Erro de validação`,
          description: errorMsg,
          variant: 'destructive',
        });
        return;
      }
    }

    // Fiscal validation
    if (formData.ncm && !/^\d+$/.test(formData.ncm)) {
      setFieldErrors(prev => ({ ...prev, ncm: 'NCM deve conter apenas números' }));
      return;
    }
    if (formData.cest && !/^\d+$/.test(formData.cest)) {
      setFieldErrors(prev => ({ ...prev, cest: 'CEST deve conter apenas números' }));
      return;
    }
    if (formData.cfop_padrao && !/^\d+$/.test(formData.cfop_padrao)) {
      setFieldErrors(prev => ({ ...prev, cfop_padrao: 'CFOP deve conter apenas números' }));
      return;
    }

    const parseToFloat = (val) => {
      if (!val) return 0;
      return parseFloat(val) || 0;
    };

    // Tabela nutricional: número opcional (null quando vazio) ou null se a
    // seção estiver desativada para o produto.
    const parseNutriNum = (val) => {
      if (!formData.possui_tabela_nutricional) return null;
      if (val === '' || val === null || val === undefined) return null;
      const n = parseFloat(val);
      return Number.isNaN(n) ? null : n;
    };

    const precoUnitarioVal = parseToFloat(formData.preco_unitario);
    const precoBandejaVal = formData.tem_bandeja ? parseBandejaPriceForStorage(formData.preco_bandeja) : 0;
    const unidadesBandejaVal = parseInt(formData.unidades_por_bandeja) || 0;

    if (formData.tem_bandeja && unidadesBandejaVal <= 0) {
      toast({ title: 'Atenção', description: 'As Unidades por Bandeja devem ser maiores que zero.', variant: 'destructive' });
      return;
    }

    const barcodeVal = formData.barcode?.trim() || null;
    const ncmVal = formData.ncm?.trim() || null;
    const cestVal = formData.cest?.trim() || null;
    const cfopVal = formData.cfop_padrao?.trim() || '5102';
    const origemVal = parseInt(formData.origem_produto) || 0;

    // Validate barcode uniqueness
    if (barcodeVal) {
      let query = supabase.from('produtos').select('id').eq('barcode', barcodeVal);
      if (editingProduto) {
        query = query.neq('id', editingProduto.id);
      }
      
      const { data: existingData, error: existingError } = await query.maybeSingle();
      
      if (existingData) {
        toast({
          title: 'Código de Barras Duplicado',
          description: 'Este código de barras já está cadastrado para outro produto',
          variant: 'destructive',
        });
        setFieldErrors(prev => ({ ...prev, barcode: 'Código de barras já cadastrado' }));
        return;
      }
    }

    try {
      const payload = {
        nome: formData.nome,
        categoria: formData.categoria || null,
        barcode: barcodeVal,
        imagem_url: formData.imagem_url || null,
        estoque_minimo: parseInt(formData.estoque_minimo) || 0,
        preco_unitario: precoUnitarioVal,
        preco_venda: precoUnitarioVal, 
        preco_bandeja: precoBandejaVal,
        preco_bandeja_mercado: formData.tem_bandeja && formData.preco_bandeja_mercado
          ? parseBandejaPriceForStorage(formData.preco_bandeja_mercado)
          : null,
        unidades_por_bandeja: formData.tem_bandeja ? unidadesBandejaVal : 0,
        controla_validade: formData.controla_validade,
        tem_bandeja: formData.tem_bandeja,
        ncm: ncmVal,
        cest: cestVal,
        cfop_padrao: cfopVal,
        origem_produto: origemVal,
        possui_tabela_nutricional: formData.possui_tabela_nutricional,
        porcao_valor: parseNutriNum(formData.porcao_valor),
        porcao_unidade: formData.possui_tabela_nutricional ? (formData.porcao_unidade || 'g') : null,
        porcoes_por_embalagem: parseNutriNum(formData.porcoes_por_embalagem),
        medida_caseira: formData.possui_tabela_nutricional ? (formData.medida_caseira?.trim() || null) : null,
        valor_energetico_kcal: parseNutriNum(formData.valor_energetico_kcal),
        carboidratos_g: parseNutriNum(formData.carboidratos_g),
        acucares_totais_g: parseNutriNum(formData.acucares_totais_g),
        acucares_adicionados_g: parseNutriNum(formData.acucares_adicionados_g),
        proteinas_g: parseNutriNum(formData.proteinas_g),
        gorduras_totais_g: parseNutriNum(formData.gorduras_totais_g),
        gorduras_saturadas_g: parseNutriNum(formData.gorduras_saturadas_g),
        gorduras_trans_g: parseNutriNum(formData.gorduras_trans_g),
        fibra_alimentar_g: parseNutriNum(formData.fibra_alimentar_g),
        sodio_mg: parseNutriNum(formData.sodio_mg),
        alergenicos_contem: formData.possui_tabela_nutricional ? (formData.alergenicos_contem?.trim() || null) : null,
        alergenicos_pode_conter: formData.possui_tabela_nutricional ? (formData.alergenicos_pode_conter?.trim() || null) : null,
      };

      if (editingProduto) {
        const { error } = await supabase
          .from('produtos')
          .update(payload)
          .eq('id', editingProduto.id);

        if (error) throw error;
        toast({ title: 'Produto atualizado com sucesso!' });
      } else {
        const { error } = await supabase.from('produtos').insert({
          ...payload,
          empresa_id: empresaId,
        });

        if (error) throw error;
        toast({ title: 'Produto criado com sucesso!' });
      }

      handleCloseForm();
      fetchProdutos();
    } catch (error) {
      toast({
        title: 'Erro ao salvar produto',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!empresaId) return;

    try {
      const { error } = await supabase
        .from('produtos')
        .delete()
        .eq('id', deletingProduto.id);

      if (error) throw error;
      toast({ title: 'Produto excluído com sucesso!' });

      setDeleteOpen(false);
      setDeletingProduto(null);
      fetchProdutos();
    } catch (error) {
      toast({
        title: 'Erro ao excluir produto',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  const hasErrors = Object.values(fieldErrors).some(err => err !== null);

  const produtosFiltrados = produtos.filter(p => {
    if (!searchTerm.trim()) return true;
    const termo = searchTerm.toLowerCase();
    return p.nome?.toLowerCase().includes(termo) || p.barcode?.toLowerCase().includes(termo);
  });

  return (
    <>
      <Helmet>
        <title>Produtos - Sistema de Estoque</title>
        <meta name="description" content="Gerencie os produtos cadastrados" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Produtos</h1>
              <p className="text-gray-600 mt-1">Gerencie os produtos cadastrados</p>
            </div>
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Produto
            </Button>
          </div>

          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar produto por nome ou código de barras..."
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent"></div>
                <p className="mt-4 text-gray-600">Carregando produtos...</p>
              </div>
            ) : produtos.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum produto cadastrado</p>
              </div>
            ) : produtosFiltrados.length === 0 ? (
              <div className="p-12 text-center">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum produto encontrado para "{searchTerm}"</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[52px]">Foto</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Cód. Barras</TableHead>
                    <TableHead>Preço Unit.</TableHead>
                    <TableHead>Bandeja?</TableHead>
                    <TableHead>Preço Band.</TableHead>
                    <TableHead>Unid./Band.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosFiltrados.map((produto) => {
                    const fmtPrecoUnitario = formatUnit(produto.preco_unitario);
                    const fmtPrecoBandeja = produto.tem_bandeja ? formatBandejaPriceForDisplay(produto.preco_bandeja) : '-';

                    return (
                      <TableRow key={produto.id}>
                        <TableCell>
                          <div className="w-9 h-9 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                            {produto.imagem_url ? (
                              <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <Package className="w-4 h-4 text-gray-300" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {produto.nome}
                            {produto.possui_tabela_nutricional && (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-transparent text-[10px] px-1.5 py-0">
                                Nutricional
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {produto.categoria ? (
                            <Badge variant="outline">{produto.categoria}</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">
                          {produto.barcode || <span className="text-gray-400">-</span>}
                        </TableCell>
                        <TableCell className="font-medium text-[var(--color-success)]">
                          {fmtPrecoUnitario}
                        </TableCell>
                        <TableCell>
                          {produto.tem_bandeja ? (
                            <Badge className="bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20 border-transparent">Sim</Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">Não</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-[var(--color-success)]">
                          {fmtPrecoBandeja}
                        </TableCell>
                        <TableCell>{produto.tem_bandeja ? produto.unidades_por_bandeja : '-'}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenForm(produto)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeletingProduto(produto);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProduto ? 'Editar Produto' : 'Novo Produto'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do produto abaixo.
              </DialogDescription>
            </DialogHeader>
           <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4 py-4 px-1">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-gray-900">Nome do Produto</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Pão de Queijo"
                    required
                    className="bg-white text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imagem" className="text-gray-900">Foto do Produto</Label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                      {formData.imagem_url ? (
                        <img src={formData.imagem_url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <Input
                        id="imagem"
                        type="file"
                        accept="image/*"
                        onChange={handleImagemUpload}
                        disabled={uploadingImagem}
                        className="bg-white text-gray-900"
                      />
                      {uploadingImagem && <p className="text-xs text-gray-500">Enviando imagem...</p>}
                      {formData.imagem_url && !uploadingImagem && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, imagem_url: '' }))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remover foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="categoria" className="text-gray-900">Categoria</Label>
                    <Input
                      id="categoria"
                      value={formData.categoria}
                      onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                      placeholder="Ex: Congelados"
                      className="bg-white text-gray-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estoque_minimo" className="text-gray-900">Estoque Mínimo</Label>
                    <Input
                      id="estoque_minimo"
                      type="number"
                      min="0"
                      value={formData.estoque_minimo}
                      onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
                      className="bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="barcode" className={`text-gray-900 ${fieldErrors.barcode ? 'text-red-500' : ''}`}>
                    Código de Barras (Opcional)
                  </Label>
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => {
                      setFormData({ ...formData, barcode: e.target.value });
                      if (fieldErrors.barcode) setFieldErrors(prev => ({ ...prev, barcode: null }));
                    }}
                    placeholder="Ex: 7891234567890"
                    className={`bg-white text-gray-900 ${fieldErrors.barcode ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  />
                  {fieldErrors.barcode && <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.barcode}</p>}
                  {formData.tem_bandeja && !fieldErrors.barcode && (
                    <p className="text-xs text-amber-600 mt-1">Recomendado informar o código de barras para produtos com bandeja.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="controla_validade"
                      checked={formData.controla_validade}
                      onCheckedChange={(checked) => setFormData({ ...formData, controla_validade: checked })}
                    />
                    <Label htmlFor="controla_validade" className="font-normal text-gray-900 cursor-pointer">
                      Controla validade
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 bg-[var(--color-primary-light)]/10 p-2 rounded-md border border-[var(--color-primary-light)]/20">
                    <Checkbox
                      id="tem_bandeja"
                      checked={formData.tem_bandeja}
                      onCheckedChange={(checked) => {
                        setFormData({ ...formData, tem_bandeja: checked });
                        if (!checked) {
                          setFieldErrors(prev => ({ ...prev, preco_bandeja: null }));
                        }
                      }}
                      className="data-[state=checked]:bg-[var(--color-primary)] data-[state=checked]:border-[var(--color-primary)]"
                    />
                    <Label htmlFor="tem_bandeja" className="font-medium text-[var(--color-primary-dark)] cursor-pointer">
                      Tem Bandeja?
                    </Label>
                  </div>
                </div>

                <div className="border-t pt-4 mt-2">
                  <h4 className="font-semibold text-gray-800 mb-3">Preços e Medidas</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="preco_unitario" className={`text-gray-900 ${fieldErrors.preco_unitario ? 'text-red-500' : ''}`}>
                        Preço Unitário (R$)
                        <span className="text-xs text-gray-500 ml-1">(até 3 decimais)</span>
                      </Label>
                      <Input
                        id="preco_unitario"
                        type="text"
                        inputMode="decimal"
                        pattern="^\d+([.,]\d{1,3})?$"
                        required
                        value={formData.preco_unitario}
                        onChange={(e) => handlePriceChange('preco_unitario', e.target.value)}
                        placeholder="0.000"
                        className={`bg-white text-gray-900 ${fieldErrors.preco_unitario ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {fieldErrors.preco_unitario && <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.preco_unitario}</p>}
                    </div>
                  </div>

                  <div 
                    className={`grid grid-cols-2 gap-4 transition-all duration-300 ease-in-out overflow-hidden
                      ${formData.tem_bandeja ? 'opacity-100 max-h-[200px] mt-4 pt-4 border-t border-[var(--color-primary-light)]/20' : 'opacity-0 max-h-0 m-0 border-transparent'}
                    `}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="preco_bandeja" className={`text-[var(--color-primary-dark)] ${fieldErrors.preco_bandeja ? 'text-red-500' : ''}`}>
                        Preço Bandeja (R$)
                        <span className="text-xs text-[var(--color-primary)] ml-1 font-semibold">(máx 2 decimais)</span>
                      </Label>
                      <Input
                        id="preco_bandeja"
                        type="text"
                        inputMode="decimal"
                        pattern="^\d+([.,]\d{1,2})?$"
                        required={formData.tem_bandeja}
                        value={formData.preco_bandeja}
                        onChange={(e) => handlePriceChange('preco_bandeja', e.target.value)}
                        placeholder="0.00"
                        className={`bg-[var(--color-primary-light)]/5 text-gray-900 ${fieldErrors.preco_bandeja ? 'border-red-500 focus-visible:ring-red-500' : 'border-[var(--color-primary-light)]/20 focus-visible:ring-[var(--color-primary)]'}`}
                      />
                      {fieldErrors.preco_bandeja && formData.tem_bandeja && (
                        <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.preco_bandeja}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unidades_por_bandeja" className="text-[var(--color-primary-dark)]">Unidades por Bandeja</Label>
                      <Input
                        id="unidades_por_bandeja"
                        type="number"
                        min="1"
                        required={formData.tem_bandeja}
                        value={formData.unidades_por_bandeja}
                        onChange={(e) => setFormData({ ...formData, unidades_por_bandeja: e.target.value })}
                        placeholder="Ex: 10"
                        className="bg-[var(--color-primary-light)]/5 text-gray-900 border-[var(--color-primary-light)]/20 focus-visible:ring-[var(--color-primary)]"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="preco_bandeja_mercado" className="text-[var(--color-primary-dark)]">
                        Preço Bandeja Mercado (R$)
                        <span className="text-xs text-orange-500 ml-1 font-semibold">(opcional)</span>
                      </Label>
                      <Input
                        id="preco_bandeja_mercado"
                        type="text"
                        inputMode="decimal"
                        value={formData.preco_bandeja_mercado}
                        onChange={(e) => handlePriceChange('preco_bandeja_mercado', e.target.value)}
                        placeholder="0.00 (deixe vazio para usar o mesmo do PDV)"
                        className="bg-[var(--color-primary-light)]/5 text-gray-900 border-[var(--color-primary-light)]/20 focus-visible:ring-[var(--color-primary)]"
                      />
                      <p className="text-xs text-orange-600">Preço praticado nos mercados/consignados. Se vazio, usa o Preço Bandeja do PDV.</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 bg-slate-50 p-3 rounded-md border border-slate-100">
                    <p className="text-xs text-slate-500 font-medium">
                      <span className="text-slate-700 font-bold">Preço Unitário:</span> Preço cobrado por unidade avulsa (até 3 decimais: R$ 0,001).<br/>
                      {formData.tem_bandeja && <><span className="text-slate-700 font-bold">Preço Bandeja:</span> Preço do PDV. <span className="text-slate-700 font-bold">Preço Bandeja Mercado:</span> Preço nos mercados/consignados (opcional).</>}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4 mt-2">
                  <h4 className="font-semibold text-gray-800 mb-3">Informações Fiscais (Opcional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ncm" className={`text-gray-900 ${fieldErrors.ncm ? 'text-red-500' : ''}`}>
                        Código NCM
                      </Label>
                      <Input
                        id="ncm"
                        maxLength={8}
                        value={formData.ncm}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormData({ ...formData, ncm: val });
                          if (fieldErrors.ncm) setFieldErrors(prev => ({ ...prev, ncm: null }));
                        }}
                        placeholder="00000000"
                        className={`bg-white text-gray-900 ${fieldErrors.ncm ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {fieldErrors.ncm && <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.ncm}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cest" className={`text-gray-900 ${fieldErrors.cest ? 'text-red-500' : ''}`}>
                        Código CEST (Opcional)
                      </Label>
                      <Input
                        id="cest"
                        maxLength={7}
                        value={formData.cest}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormData({ ...formData, cest: val });
                          if (fieldErrors.cest) setFieldErrors(prev => ({ ...prev, cest: null }));
                        }}
                        placeholder="0000000"
                        className={`bg-white text-gray-900 ${fieldErrors.cest ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {fieldErrors.cest && <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.cest}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cfop_padrao" className={`text-gray-900 ${fieldErrors.cfop_padrao ? 'text-red-500' : ''}`}>
                        CFOP Padrão
                      </Label>
                      <Input
                        id="cfop_padrao"
                        maxLength={4}
                        value={formData.cfop_padrao}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormData({ ...formData, cfop_padrao: val });
                          if (fieldErrors.cfop_padrao) setFieldErrors(prev => ({ ...prev, cfop_padrao: null }));
                        }}
                        placeholder="5102"
                        className={`bg-white text-gray-900 ${fieldErrors.cfop_padrao ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {fieldErrors.cfop_padrao && <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.cfop_padrao}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="origem_produto" className="text-gray-900">
                        Origem do Produto
                      </Label>
                      <Select 
                        value={formData.origem_produto} 
                        onValueChange={(val) => setFormData({ ...formData, origem_produto: val })}
                      >
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 - Nacional</SelectItem>
                          <SelectItem value="1">1 - Importado</SelectItem>
                          <SelectItem value="2">2 - Importado (Adquirido no merc. interno)</SelectItem>
                          <SelectItem value="3">3 - Nacional, mercadoria ou bem com Conteúdo de Importação superior a 40%</SelectItem>
                          <SelectItem value="4">4 - Nacional, cuja produção tenha sido feita em conformidade com os processos produtivos básicos de que tratam as legislações citadas nos Ajustes</SelectItem>
                          <SelectItem value="5">5 - Nacional, mercadoria ou bem com Conteúdo de Importação inferior ou igual a 40%</SelectItem>
                          <SelectItem value="6">6 - Estrangeira - Importação direta, sem similar nacional, constante em lista da CAMEX e gás natural</SelectItem>
                          <SelectItem value="7">7 - Estrangeira - Adquirida no mercado interno, sem similar nacional, constante lista CAMEX e gás natural</SelectItem>
                          <SelectItem value="8">8 - Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <TabelaNutricionalFormSection formData={formData} setFormData={setFormData} />

              </div>
              <DialogFooter className="mt-4 pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleCloseForm} className="text-[var(--color-secondary)]">
                  Cancelar
                </Button>
                <Button type="submit" disabled={hasErrors}>
                  {editingProduto ? 'Salvar' : 'Criar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o produto "{deletingProduto?.nome}"? Esta ação
                não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/80 border-transparent">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}