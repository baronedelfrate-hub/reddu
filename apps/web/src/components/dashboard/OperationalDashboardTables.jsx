import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Loader2, MapPin, AlertCircle, Clock } from 'lucide-react';

export default function OperationalDashboardTables() {
  const { empresaId } = useAuth();
  
  const [distribuicao, setDistribuicao] = useState([]);
  const [criticos, setCriticos] = useState([]);
  const [vencendo, setVencendo] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTablesData = async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      setError(null);

      // Se travar por mais de 15s (rede lenta/instável), desiste e mostra
      // um jeito de tentar de novo — antes ficava preso no loading pra
      // sempre, sem nenhuma saída pro usuário.
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado ao carregar. Tente novamente.')), 15000)
      );

      const dadosPromise = Promise.all([
        supabase
          .from('lotes')
          .select('quantidade, data_validade, numero_lote, produto_id, tipo_lote, local_id, locais(nome), produtos(nome)')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .eq('lote_devolvido', false),
        supabase
          .from('produtos')
          .select('id, nome, estoque_minimo')
          .eq('empresa_id', empresaId),
        supabase
          .from('locais')
          .select('id, tipo')
          .eq('empresa_id', empresaId)
      ]);

      const [lotesRes, produtosRes, locaisRes] = await Promise.race([dadosPromise, timeoutPromise]);

      if (lotesRes.error) throw lotesRes.error;
      if (produtosRes.error) throw produtosRes.error;
      if (locaisRes.error) throw locaisRes.error;

      const tipoLocalMap = {};
      (locaisRes.data || []).forEach(l => { tipoLocalMap[l.id] = l.tipo; });

      // Só considera lotes ainda válidos (não vencidos) pra estoque atual —
      // mesmo critério já usado no resto do Dashboard.
      const todayStr = new Date().toISOString().split('T')[0];
      const lotesValidos = (lotesRes.data || []).filter(l => !l.data_validade || l.data_validade > todayStr);

      // 1. Distribuição — em mercados, só conta bandeja (é o que realmente
      // fica exposto pra venda ali; outros tipos de lote não fazem sentido
      // aparecer como "estoque do mercado").
      const distMap = {};
      lotesValidos.forEach(l => {
        const ehMercado = tipoLocalMap[l.local_id] === 'Mercado';
        if (ehMercado && l.tipo_lote !== 'bandeja') return;
        const localNome = l.locais?.nome || 'Desconhecido';
        distMap[localNome] = (distMap[localNome] || 0) + (l.quantidade || 0);
      });
      const distribuicaoData = Object.entries(distMap)
        .map(([nome, qtd]) => ({ local_nome: nome, quantidade_atual: qtd }))
        .sort((a, b) => b.quantidade_atual - a.quantidade_atual);

      // 2. Críticos — agora só soma lotes válidos (não vencidos). Antes
      // somava tudo, inclusive vencido, o que podia esconder uma situação
      // realmente crítica (estoque "bom" só no papel).
      const prodEstoqueMap = {};
      lotesValidos.forEach(l => {
        prodEstoqueMap[l.produto_id] = (prodEstoqueMap[l.produto_id] || 0) + (l.quantidade || 0);
      });
      const criticosData = [];
      (produtosRes.data || []).forEach(p => {
        const atual = prodEstoqueMap[p.id] || 0;
        if (p.estoque_minimo > 0 && atual <= p.estoque_minimo) {
          criticosData.push({ 
            produto_nome: p.nome, 
            estoque_atual: atual, 
            estoque_minimo: p.estoque_minimo 
          });
        }
      });
      criticosData.sort((a, b) => a.estoque_atual - b.estoque_atual);

      // 3. Vencendo
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const vencendoRaw = [];
      (lotesRes.data || []).forEach(l => {
        if (!l.data_validade || l.quantidade <= 0) return;
        const [year, month, day] = l.data_validade.split('-');
        const vDate = new Date(year, month - 1, day);
        const diffDays = Math.ceil((vDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays <= 7) {
          vencendoRaw.push({
            numero_lote: l.numero_lote,
            produto_nome: l.produtos?.nome || 'Desconhecido',
            data_validade: l.data_validade,
            dias: diffDays
          });
        }
      });
      const vencendoData = vencendoRaw.sort((a, b) => a.dias - b.dias);

      setDistribuicao(distribuicaoData);
      setCriticos(criticosData);
      setVencendo(vencendoData);

    } catch (err) {
      console.error('Error fetching operational tables:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTablesData();
  }, [empresaId]);

  if (error) {
    return (
      <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200 flex items-center justify-between gap-3 flex-wrap">
        <span>Erro ao carregar tabelas: {error}</span>
        <button onClick={fetchTablesData} className="text-sm font-semibold bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">
          Tentar novamente
        </button>
      </div>
    );
  }

  const formatNumber = (num) => new Intl.NumberFormat('pt-BR').format(num || 0);
  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Table 1: Distribuição */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-96">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
          <MapPin className="h-5 w-5 text-[var(--color-primary)]" />
          <div>
            <h3 className="font-semibold text-gray-900">Distribuição por Local</h3>
            <p className="text-[10px] text-gray-400">Em mercados, só bandejas</p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
              <TableRow>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : distribuicao.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8 text-gray-500">Sem dados</TableCell></TableRow>
              ) : (
                distribuicao.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.local_nome}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.quantidade_atual)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Table 2: Críticos */}
      <div className="bg-white rounded-xl shadow-sm border border-[var(--color-primary)]/20 overflow-hidden flex flex-col h-96">
        <div className="p-4 border-b border-[var(--color-primary)]/10 flex items-center gap-2 bg-[var(--color-primary-light)]/10">
          <AlertCircle className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="font-semibold text-[var(--color-primary-dark)]">Produtos Críticos</h3>
        </div>
        <div className="overflow-y-auto flex-1 p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Atual / Min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : criticos.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center py-8 text-gray-500">Nenhum produto crítico</TableCell></TableRow>
              ) : (
                criticos.map((item, idx) => (
                  <TableRow key={idx} className="bg-[var(--color-primary-light)]/10">
                    <TableCell className="font-medium text-[var(--color-primary-dark)]">{item.produto_nome}</TableCell>
                    <TableCell className="text-right text-[var(--color-primary)] font-bold">
                      {formatNumber(item.estoque_atual)} / {formatNumber(item.estoque_minimo)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Table 3: Vencendo */}
      <div className="bg-white rounded-xl shadow-sm border border-[var(--color-warning)]/20 overflow-hidden flex flex-col h-96">
        <div className="p-4 border-b border-[var(--color-warning)]/10 flex items-center gap-2 bg-[var(--color-warning)]/10">
          <Clock className="h-5 w-5 text-[var(--color-warning)]" />
          <h3 className="font-semibold text-orange-900">Lotes Vencendo (7 dias)</h3>
        </div>
        <div className="overflow-y-auto flex-1 p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Validade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
              ) : vencendo.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-gray-500">Nenhum lote vencendo</TableCell></TableRow>
              ) : (
                vencendo.map((item, idx) => (
                  <TableRow key={idx} className="bg-[var(--color-warning)]/10">
                    <TableCell className="font-medium text-orange-800">{item.numero_lote}</TableCell>
                    <TableCell className="text-gray-700 truncate max-w-[100px]">{item.produto_nome}</TableCell>
                    <TableCell className="text-right text-orange-700 font-medium whitespace-nowrap">
                      {formatDate(item.data_validade)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}