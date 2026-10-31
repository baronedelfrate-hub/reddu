import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function usePedidosManagement() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const getPedidoById = async (id) => {
    if (!empresaId || !id) return null;
    try {
      setIsLoading(true);
      
      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .select('*, locais(nome)')
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .single();

      if (pedidoError) throw pedidoError;

      const { data: itens, error: itensError } = await supabase
        .from('pedido_itens')
        .select('*, produtos(nome, unidades_por_bandeja)')
        .eq('pedido_id', id);

      if (itensError) throw itensError;

      return { ...pedido, itens };
    } catch (error) {
      console.error('Error fetching pedido:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os detalhes do pedido.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const createPedido = async (pedidoData, itensData) => {
    if (!empresaId) return null;
    try {
      setIsLoading(true);
      
      if (!pedidoData.mercado_id) {
        throw new Error('O Mercado é obrigatório.');
      }

      // 1. Insert Pedido
      const { data: novoPedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          empresa_id: empresaId,
          mercado_id: pedidoData.mercado_id,
          data_entrega: pedidoData.data_entrega,
          observacao: pedidoData.observacao,
          status: 'pendente'
        })
        .select()
        .single();

      if (pedidoError) throw pedidoError;

      // 2. Insert Items
      const itensToInsert = itensData.map(item => ({
        pedido_id: novoPedido.id,
        produto_id: item.produto_id,
        quantidade_bandejas: parseInt(item.quantidade_bandejas, 10)
      }));

      const { error: itensError } = await supabase
        .from('pedido_itens')
        .insert(itensToInsert);

      if (itensError) throw itensError;

      toast({
        title: 'Sucesso',
        description: 'Pedido criado com sucesso.',
      });

      return novoPedido;
    } catch (error) {
      console.error('Error creating pedido:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao criar pedido.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePedido = async (id, pedidoData, itensData) => {
    if (!empresaId || !id) return null;
    try {
      setIsLoading(true);
      
      if (!pedidoData.mercado_id) {
        throw new Error('O Mercado é obrigatório.');
      }

      // 1. Update Pedido
      const { error: pedidoError } = await supabase
        .from('pedidos')
        .update({
          mercado_id: pedidoData.mercado_id,
          data_entrega: pedidoData.data_entrega,
          observacao: pedidoData.observacao,
        })
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (pedidoError) throw pedidoError;

      // 2. Delete old items
      const { error: deleteError } = await supabase
        .from('pedido_itens')
        .delete()
        .eq('pedido_id', id);

      if (deleteError) throw deleteError;

      // 3. Insert new items
      const itensToInsert = itensData.map(item => ({
        pedido_id: id,
        produto_id: item.produto_id,
        quantidade_bandejas: parseInt(item.quantidade_bandejas, 10)
      }));

      const { error: insertError } = await supabase
        .from('pedido_itens')
        .insert(itensToInsert);

      if (insertError) throw insertError;

      toast({
        title: 'Sucesso',
        description: 'Pedido atualizado com sucesso.',
      });

      return true;
    } catch (error) {
      console.error('Error updating pedido:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao atualizar pedido.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    if (!empresaId || !id) return false;
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('pedidos')
        .update({ status: newStatus })
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) throw error;

      toast({
        title: 'Status Atualizado',
        description: `O status do pedido foi alterado para ${newStatus}.`,
      });

      return true;
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const deletePedido = async (id) => {
    if (!empresaId || !id) return false;
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('pedidos')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Pedido removido com sucesso.',
      });

      return true;
    } catch (error) {
      console.error('Error deleting pedido:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o pedido.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    createPedido,
    updatePedido,
    updateStatus,
    deletePedido,
    getPedidoById
  };
}