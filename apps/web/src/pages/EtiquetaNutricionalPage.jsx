import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Printer, Search, Package, FileText, Loader2 } from 'lucide-react';
import TabelaNutricionalPreview from '@/components/etiquetas/TabelaNutricionalPreview';
import EtiquetaNutricionalPreview from '@/components/etiquetas/EtiquetaNutricionalPreview';
import { hasDadosNutricionais } from '@/utils/nutritionalTable';

export default function EtiquetaNutricionalPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [labelSize, setLabelSize] = useState('60x40');

  useEffect(() => {
    if (!empresaId) {
      setLoading(false);
      return;
    }
    fetchProdutos();
  }, [empresaId]);

  const fetchProdutos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (error) throw error;
      setProdutos(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const produtosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return produtos;
    const termo = searchTerm.toLowerCase();
    return produtos.filter(
      (p) =>
        (p.nome || '').toLowerCase().includes(termo) ||
        (p.categoria || '').toLowerCase().includes(termo)
    );
  }, [produtos, searchTerm]);

  const produtoSelecionado = useMemo(
    () => produtos.find((p) => p.id === selectedId) || null,
    [produtos, selectedId]
  );

  const handlePrint = () => {
    if (!produtoSelecionado || !hasDadosNutricionais(produtoSelecionado)) {
      toast({ title: 'Selecione um produto com tabela nutricional preenchida', variant: 'destructive' });
      return;
    }
    window.print();
  };

  return (
    <>
      <Helmet>
        <title>Etiqueta Nutricional - Reddu</title>
        <meta name="description" content="Pré-visualize e imprima a tabela nutricional dos produtos." />
      </Helmet>
      <DashboardLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-8 w-8 text-blue-600" />
                Etiqueta Nutricional
              </h1>
              <p className="text-gray-600 mt-1">
                Pré-visualize e imprima a tabela nutricional dos produtos cadastrados.
              </p>
            </div>
            <Button
              onClick={handlePrint}
              disabled={!hasDadosNutricionais(produtoSelecionado)}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 print:hidden"
            >
              <Printer className="h-4 w-4" /> Imprimir etiqueta
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Lista de produtos */}
            <div className="space-y-3 print:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar produto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-white"
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[70vh] overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
                    <span className="text-sm text-gray-500">Carregando produtos...</span>
                  </div>
                ) : produtosFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-gray-500">
                    <Package className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-sm">Nenhum produto encontrado.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {produtosFiltrados.map((p) => {
                      const temTabela = hasDadosNutricionais(p);
                      const isSelected = p.id === selectedId;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(p.id)}
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                              {p.categoria && (
                                <p className="text-xs text-gray-400 truncate">{p.categoria}</p>
                              )}
                            </div>
                            {temTabela ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-transparent text-[10px]">
                                Nutricional
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-400 text-[10px]">
                                Sem tabela
                              </Badge>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Pré-visualização */}
            <div className="space-y-4">
              {!produtoSelecionado ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center p-16 text-gray-500">
                  <FileText className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-lg font-medium text-gray-900">Selecione um produto</p>
                  <p className="text-sm">Escolha um produto à esquerda para visualizar sua tabela nutricional.</p>
                </div>
              ) : (
                <>
                  {/* Tabela completa */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 print:hidden">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Tabela nutricional completa</h3>
                      <Badge variant="outline">{produtoSelecionado.nome}</Badge>
                    </div>
                    <TabelaNutricionalPreview produto={produtoSelecionado} />
                  </div>

                  {/* Etiqueta compacta */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between print:hidden">
                      <h3 className="font-semibold text-gray-900">Etiqueta compacta (impressão)</h3>
                      <div className="flex gap-1.5 print:hidden">
                        <Button
                          type="button"
                          size="sm"
                          variant={labelSize === '60x40' ? 'default' : 'outline'}
                          onClick={() => setLabelSize('60x40')}
                        >
                          60×40mm
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={labelSize === '55x38' ? 'default' : 'outline'}
                          onClick={() => setLabelSize('55x38')}
                        >
                          55×38mm
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      <EtiquetaNutricionalPreview
                        produto={produtoSelecionado}
                        labelSize={labelSize}
                      />
                    </div>
                  </div>

                  {/* Versão de impressão (visível apenas no print) */}
                  <div className="hidden print:block flex items-center justify-center">
                    <EtiquetaNutricionalPreview
                      produto={produtoSelecionado}
                      forPrint
                      labelSize={labelSize}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}
