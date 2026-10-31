import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Users, Plus, Pencil, Loader2, Search, MessageCircle, Cake } from 'lucide-react';

const CLIENTE_VAZIO = { nome: '', telefone: '', cpf: '', data_nascimento: '', observacoes: '' };

export default function ClientesCardapioPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('TODOS');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(CLIENTE_VAZIO);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cardapio_clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('ultimo_pedido_em', { ascending: false, nullsFirst: false });
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => { setEditando(null); setForm(CLIENTE_VAZIO); setDialogOpen(true); };
  const openEdit = (cliente) => {
    setEditando(cliente);
    setForm({
      nome: cliente.nome, telefone: cliente.telefone, cpf: cliente.cpf || '',
      data_nascimento: cliente.data_nascimento || '', observacoes: cliente.observacoes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.telefone.trim()) {
      toast({ title: 'Preencha nome e telefone', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaId,
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        cpf: form.cpf.trim() || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (editando) {
        const { error } = await supabase.from('cardapio_clientes').update(payload).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cardapio_clientes').insert(payload);
        if (error) throw error;
      }
      toast({ title: 'Cliente salvo!' });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      const msg = error.code === '23505' ? 'Já existe um cliente com esse telefone.' : error.message;
      toast({ title: 'Erro ao salvar cliente', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatPreco = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const diasSemComprar = (cliente) => {
    if (!cliente.ultimo_pedido_em) return null;
    const dias = Math.floor((Date.now() - new Date(cliente.ultimo_pedido_em).getTime()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  const clientesFiltrados = clientes
    .filter((c) => {
      const termo = busca.trim().toLowerCase();
      if (!termo) return true;
      return c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo);
    })
    .filter((c) => {
      if (filtro === 'TODOS') return true;
      const dias = diasSemComprar(c);
      if (filtro === 'ATIVOS') return dias !== null && dias <= 30;
      if (filtro === 'INATIVOS') return dias === null || dias > 30;
      return true;
    });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet><title>Clientes - Cardápio Digital</title></Helmet>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6" /> Clientes
            </h1>
            <p className="text-gray-500 text-sm">Alimentado automaticamente pelos pedidos do cardápio.</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Cadastrar cliente</Button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input placeholder="Buscar por nome ou telefone" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {['TODOS', 'ATIVOS', 'INATIVOS'].map((f) => (
            <button
              key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {f === 'TODOS' ? 'Todos' : f === 'ATIVOS' ? 'Ativos (30d)' : 'Inativos'}
            </button>
          ))}
        </div>

        {clientesFiltrados.length === 0 ? (
          <div className="text-center text-gray-400 py-16 bg-white rounded-xl border">Nenhum cliente encontrado.</div>
        ) : (
          <div className="bg-white rounded-xl border divide-y">
            {clientesFiltrados.map((cliente) => {
              const dias = diasSemComprar(cliente);
              return (
                <div key={cliente.id} className="flex items-center gap-3 p-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{cliente.nome}</span>
                      {dias !== null && dias <= 30 && <Badge variant="outline" className="text-emerald-600 border-emerald-300">Ativo</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{cliente.telefone}</p>
                    <p className="text-xs text-gray-400">
                      {cliente.total_pedidos} pedido{cliente.total_pedidos !== 1 ? 's' : ''} · {formatPreco(cliente.total_gasto)}
                      {dias !== null && ` · ${dias === 0 ? 'comprou hoje' : `${dias}d sem comprar`}`}
                      {cliente.data_nascimento && (
                        <> · <Cake className="h-3 w-3 inline" /> {new Date(cliente.data_nascimento + 'T00:00').toLocaleDateString('pt-BR')}</>
                      )}
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/${cliente.telefone.replace(/\D/g, '')}`}
                    target="_blank" rel="noreferrer"
                    className="h-8 w-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cliente)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar cliente' : 'Cadastrar cliente'}</DialogTitle>
            {editando && (
              <DialogDescription>
                {editando.total_pedidos} pedido{editando.total_pedidos !== 1 ? 's' : ''} · {formatPreco(editando.total_gasto)} gastos no total
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cli-nome" className="text-gray-900">Nome</Label>
              <Input id="cli-nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cli-telefone" className="text-gray-900">Telefone</Label>
              <Input id="cli-telefone" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(19) 99999-9999" />
              {editando && <p className="text-xs text-gray-400 mt-1">Mudar aqui não altera pedidos já feitos, só o cadastro daqui pra frente.</p>}
            </div>
            <div>
              <Label htmlFor="cli-cpf" className="text-gray-900">CPF (opcional)</Label>
              <Input id="cli-cpf" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cli-nascimento" className="text-gray-900">Data de nascimento (opcional)</Label>
              <Input id="cli-nascimento" type="date" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cli-obs" className="text-gray-900">Observações (opcional)</Label>
              <Textarea id="cli-obs" rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}