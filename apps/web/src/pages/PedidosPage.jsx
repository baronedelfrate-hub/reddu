import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ClipboardList, Plus, Search, Eye, Edit, Trash2, Loader2, Calendar } from 'lucide-react';
import PedidoStatusBadge from '@/components/pedidos/PedidoStatusBadge';
import PedidoFormDialog from '@/components/pedidos/PedidoFormDialog';
import { usePedidosManagement } from '@/hooks/usePedidosManagement';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PedidosPage() {
  const { empresaId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { deletePedido } = usePedidosManagement();

  const [pedidos, setPedidos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pedidoToEdit, setPedidoToEdit] = useState(null);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pedidoToDelete, setPedidoToDelete] = useState(null);

  const fetchPedidos = async () => {
    if (!empresaId) return;
    try {
      setIsLoading(true);
      let query = supabase
        .from('pedidos')
        .select('*, locais(nome)')
        .eq('empresa_id', empresaId)
        .order('data_entrega', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setPedidos(data || []);
    } catch (err) {
      console.error('Error fetching pedidos:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar a lista de pedidos.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const handleEdit = async (pedido) => {
    try {
      const { data: itens, error } = await supabase
        .from('pedido_itens')
        .select('*')
        .eq('pedido_id', pedido.id);
      
      if (error) throw error;
      setPedidoToEdit({ ...pedido, itens });
      setIsFormOpen(true);
    } catch (err) {
      console.error('Error fetching items for edit:', err);
      toast({ title: 'Erro', description: 'Erro ao carregar itens do pedido.', variant: 'destructive' });
    }
  };

  const handleDeleteClick = (pedido) => {
    setPedidoToDelete(pedido);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (pedidoToDelete) {
      const success = await deletePedido(pedidoToDelete.id);
      if (success) fetchPedidos();
    }
    setIsDeleteDialogOpen(false);
    setPedidoToDelete(null);
  };

  const filteredPedidos = pedidos.filter(p => {
    const mercadoNome = p.locais?.nome || '';
    const matchesSearch = mercadoNome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const [y, m, d] = dateString.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateString;
    }
  };

  return (
    <>
      <Helmet>
        <title>Pedidos de Produção | Estoque 360</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-indigo-600" />
              Pedidos de Produção
            </h1>
            <p className="text-slate-500 text-sm mt-1">Gerencie os pedidos de mercados e acompanhe a produção.</p>
          </div>
          <Button 
            onClick={() => { setPedidoToEdit(null); setIsFormOpen(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> Novo Pedido
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por mercado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 text-slate-900"
            />
          </div>
          <div className="w-full md:w-64">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-slate-50 text-slate-900 border-slate-200">
                <SelectValue placeholder="Filtrar por Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_producao">Em Produção</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[100px] font-semibold text-slate-700">ID</TableHead>
                <TableHead className="font-semibold text-slate-700">Mercado</TableHead>
                <TableHead className="font-semibold text-slate-700">Data Entrega</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
                <TableHead className="text-right font-semibold text-slate-700">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
                  </TableCell>
                </TableRow>
              ) : filteredPedidos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                    Nenhum pedido encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPedidos.map((pedido) => (
                  <TableRow key={pedido.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-500 text-xs">
                      {pedido.id.substring(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {pedido.locais?.nome || <span className="text-slate-400 italic">Desconhecido</span>}
                    </TableCell>
                    <TableCell className="text-slate-600 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatDate(pedido.data_entrega)}
                    </TableCell>
                    <TableCell>
                      <PedidoStatusBadge status={pedido.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Ver Detalhes"
                          onClick={() => navigate(`/pedidos/${pedido.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Editar"
                          onClick={() => handleEdit(pedido)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Excluir"
                          onClick={() => handleDeleteClick(pedido)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PedidoFormDialog 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSuccess={fetchPedidos}
        pedidoToEdit={pedidoToEdit}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o pedido de <strong>{pedidoToDelete?.locais?.nome || 'este mercado'}</strong>? 
              Esta ação excluirá todos os itens vinculados e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}