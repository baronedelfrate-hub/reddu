import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Loader2, Tag } from 'lucide-react';

const CUPOM_VAZIO = {
  codigo: '', tipo_desconto: 'fixo', valor_desconto: '', valor_pedido_minimo: '0',
  validade_inicio: '', validade_fim: '', limite_uso_total: '', limite_uso_por_cliente: '1', ativo: true,
};

export default function CuponsCardapioPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [cupons, setCupons] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(CUPOM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cardapio_cupons').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
      if (error) throw error;
      setCupons(data || []);
    } catch (error) {
      toast({ title: 'Erro ao carregar cupons', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => { setEditando(null); setForm(CUPOM_VAZIO); setDialogOpen(true); };
  const openEdit = (cupom) => {
    setEditando(cupom);
    setForm({
      codigo: cupom.codigo, tipo_desconto: cupom.tipo_desconto, valor_desconto: String(cupom.valor_desconto),
      valor_pedido_minimo: String(cupom.valor_pedido_minimo),
      validade_inicio: cupom.validade_inicio ? cupom.validade_inicio.slice(0, 10) : '',
      validade_fim: cupom.validade_fim ? cupom.validade_fim.slice(0, 10) : '',
      limite_uso_total: cupom.limite_uso_total != null ? String(cupom.limite_uso_total) : '',
      limite_uso_por_cliente: String(cupom.limite_uso_por_cliente),
      ativo: cupom.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const valorNum = parseFloat(String(form.valor_desconto).replace(',', '.'));
    const minimoNum = parseFloat(String(form.valor_pedido_minimo).replace(',', '.')) || 0;
    if (!form.codigo.trim() || isNaN(valorNum) || valorNum <= 0) {
      toast({ title: 'Preencha código e um valor de desconto válido', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaId,
        codigo: form.codigo.trim().toUpperCase(),
        tipo_desconto: form.tipo_desconto,
        valor_desconto: valorNum,
        valor_pedido_minimo: minimoNum,
        validade_inicio: form.validade_inicio || null,
        validade_fim: form.validade_fim || null,
        limite_uso_total: form.limite_uso_total ? parseInt(form.limite_uso_total, 10) : null,
        limite_uso_por_cliente: parseInt(form.limite_uso_por_cliente, 10) || 1,
        ativo: form.ativo,
      };
      if (editando) {
        const { error } = await supabase.from('cardapio_cupons').update(payload).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cardapio_cupons').insert(payload);
        if (error) throw error;
      }
      toast({ title: 'Cupom salvo!' });
      setDialogOpen(false);
      loadData();
    } catch (error) {
      const msg = error.code === '23505' ? 'Já existe um cupom com esse código.' : error.message;
      toast({ title: 'Erro ao salvar cupom', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (cupom) => {
    try {
      const { error } = await supabase.from('cardapio_cupons').update({ ativo: !cupom.ativo }).eq('id', cupom.id);
      if (error) throw error;
      setCupons((prev) => prev.map((c) => (c.id === cupom.id ? { ...c, ativo: !c.ativo } : c)));
    } catch (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('cardapio_cupons').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Cupom removido.' });
      setDeleteTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Erro ao remover cupom', description: error.message, variant: 'destructive' });
    }
  };

  const formatPreco = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDesconto = (c) => c.tipo_desconto === 'percentual' ? `${c.valor_desconto}%` : formatPreco(c.valor_desconto);

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
      <Helmet><title>Cupons - Cardápio Digital</title></Helmet>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Tag className="h-6 w-6" /> Cupons de Desconto
            </h1>
            <p className="text-gray-500 text-sm">Cupons pro cardápio digital.</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo cupom</Button>
        </div>

        {cupons.length === 0 ? (
          <div className="text-center text-gray-400 py-16 bg-white rounded-xl border">Nenhum cupom cadastrado ainda.</div>
        ) : (
          <div className="bg-white rounded-xl border divide-y">
            {cupons.map((cupom) => (
              <div key={cupom.id} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">{cupom.codigo}</span>
                    {!cupom.ativo && <Badge variant="outline" className="text-gray-400">Inativo</Badge>}
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatDesconto(cupom)} de desconto
                    {cupom.valor_pedido_minimo > 0 && ` · mínimo ${formatPreco(cupom.valor_pedido_minimo)}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    Usado {cupom.usos_count}x{cupom.limite_uso_total ? ` de ${cupom.limite_uso_total}` : ''}
                    {' · '}até {cupom.limite_uso_por_cliente}x por cliente
                    {cupom.validade_fim && ` · válido até ${new Date(cupom.validade_fim).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <Switch checked={cupom.ativo} onCheckedChange={() => handleToggleAtivo(cupom)} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cupom)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget(cupom)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar cupom' : 'Novo cupom'}</DialogTitle>
            <DialogDescription>Ex: PRIMEIRACOMPRA, FRETE7OFF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cupom-codigo" className="text-gray-900">Código</Label>
              <Input id="cupom-codigo" value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="EX10OFF" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-gray-900">Tipo</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" size="sm" variant={form.tipo_desconto === 'fixo' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm((f) => ({ ...f, tipo_desconto: 'fixo' }))}>R$ fixo</Button>
                  <Button type="button" size="sm" variant={form.tipo_desconto === 'percentual' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm((f) => ({ ...f, tipo_desconto: 'percentual' }))}>%</Button>
                </div>
              </div>
              <div className="flex-1">
                <Label htmlFor="cupom-valor" className="text-gray-900">Valor</Label>
                <Input id="cupom-valor" inputMode="decimal" value={form.valor_desconto} onChange={(e) => setForm((f) => ({ ...f, valor_desconto: e.target.value }))} placeholder={form.tipo_desconto === 'percentual' ? '10' : '10,00'} />
              </div>
            </div>
            <div>
              <Label htmlFor="cupom-minimo" className="text-gray-900">Pedido mínimo (R$)</Label>
              <Input id="cupom-minimo" inputMode="decimal" value={form.valor_pedido_minimo} onChange={(e) => setForm((f) => ({ ...f, valor_pedido_minimo: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="cupom-inicio" className="text-gray-900">Válido de (opcional)</Label>
                <Input id="cupom-inicio" type="date" value={form.validade_inicio} onChange={(e) => setForm((f) => ({ ...f, validade_inicio: e.target.value }))} />
              </div>
              <div className="flex-1">
                <Label htmlFor="cupom-fim" className="text-gray-900">Até (opcional)</Label>
                <Input id="cupom-fim" type="date" value={form.validade_fim} onChange={(e) => setForm((f) => ({ ...f, validade_fim: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="cupom-limite-total" className="text-gray-900">Limite total de usos (opcional)</Label>
                <Input id="cupom-limite-total" type="number" min="1" value={form.limite_uso_total} onChange={(e) => setForm((f) => ({ ...f, limite_uso_total: e.target.value }))} placeholder="Sem limite" />
              </div>
              <div className="flex-1">
                <Label htmlFor="cupom-limite-cliente" className="text-gray-900">Usos por cliente</Label>
                <Input id="cupom-limite-cliente" type="number" min="1" value={form.limite_uso_por_cliente} onChange={(e) => setForm((f) => ({ ...f, limite_uso_por_cliente: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2">
              <Label className="text-gray-900">Ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cupom "{deleteTarget?.codigo}"?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}