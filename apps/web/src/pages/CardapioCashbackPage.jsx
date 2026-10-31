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
import { Loader2, Coins } from 'lucide-react';

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const VALIDADES = [15, 30, 45, 60];

const formatTel = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
};

// Cashback do cardápio: a loja liga/desliga, define o percentual, a validade
// e se vale só para pagamento online. O crédito é gerado pelo banco quando o
// pedido vira ENTREGUE (trigger trg_cashback_status) e o resgate é feito pelo
// cardápio público antes do Pix (rpc_cashback_resgatar). Aqui só se configura
// (empresas.cardapio_config.cashback) e se acompanha o saldo dos clientes.
export default function CardapioCashbackPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [empresa, setEmpresa] = useState(null);

  const [ativo, setAtivo] = useState(false);
  const [percentual, setPercentual] = useState('5');
  const [validadeDias, setValidadeDias] = useState(30);
  const [soOnline, setSoOnline] = useState(true);

  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('empresas').select('id, cardapio_config').eq('id', empresaId).single();
      if (error) throw error;
      const cb = data?.cardapio_config?.cashback || {};
      setEmpresa(data);
      setAtivo(!!cb.ativo);
      setPercentual(cb.percentual != null ? String(cb.percentual) : '5');
      setValidadeDias(cb.validade_dias != null ? Number(cb.validade_dias) : 30);
      setSoOnline(cb.so_online !== false);

      const { data: lista, error: errLista } = await supabase.rpc('rpc_cashback_clientes', { p_empresa_id: empresaId });
      if (errLista) throw errLista;
      setClientes(Array.isArray(lista) ? lista : []);
    } catch (error) {
      console.error('Erro ao carregar cashback:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvar = async (ativoOverride) => {
    const pct = parseFloat(String(percentual).replace(',', '.'));
    if (isNaN(pct) || pct <= 0 || pct > 50) {
      toast({ title: 'Informe um percentual entre 0,1 e 50', variant: 'destructive' });
      return;
    }
    const novoAtivo = typeof ativoOverride === 'boolean' ? ativoOverride : ativo;
    setSaving(true);
    try {
      const novoConfig = {
        ...(empresa?.cardapio_config || {}),
        cashback: { ativo: novoAtivo, percentual: pct, validade_dias: validadeDias, so_online: soOnline },
      };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      setAtivo(novoAtivo);
      toast({ title: novoAtivo ? 'Cashback salvo e ativo!' : 'Cashback salvo (desativado)' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const termo = busca.trim().toLowerCase();
  const termoDig = busca.replace(/\D/g, '');
  const filtrados = clientes.filter((c) => {
    if (!termo) return true;
    return (c.nome || '').toLowerCase().includes(termo) || (termoDig && String(c.telefone).includes(termoDig));
  });
  const totalSaldo = clientes.reduce((s, c) => s + Number(c.saldo || 0), 0);
  const totalCreditado = clientes.reduce((s, c) => s + Number(c.total_creditado || 0), 0);
  const totalResgatado = clientes.reduce((s, c) => s + Number(c.total_resgatado || 0), 0);

  return (
    <DashboardLayout>
      <Helmet><title>Cashback - Cardápio Digital</title></Helmet>
      <div className="max-w-3xl mx-auto space-y-6 p-4">
        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">Cashback</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <div className="bg-white rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-gray-900 font-medium">Cashback ativo</Label>
                  <p className="text-sm text-gray-500">O cliente ganha parte do valor de volta para usar nos próximos pedidos.</p>
                </div>
                <Switch checked={ativo} onCheckedChange={(v) => salvar(v)} disabled={saving} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pct" className="text-gray-900">Percentual de cashback (%)</Label>
                  <Input id="pct" type="number" min="0.1" max="50" step="0.5" value={percentual}
                    onChange={(e) => setPercentual(e.target.value)} className="mt-1" />
                  <p className="text-xs text-gray-400 mt-1">Calculado sobre os itens, sem a taxa de entrega.</p>
                </div>
                <div>
                  <Label className="text-gray-900">Validade do saldo</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {VALIDADES.map((d) => (
                      <button key={d} type="button" onClick={() => setValidadeDias(d)}
                        className={`px-3 py-1.5 rounded-md border text-sm ${validadeDias === d ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                        {d} dias
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Cada crédito vence a partir da data da entrega.</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label className="text-gray-900 font-medium">Acumular só em pagamento online</Label>
                  <p className="text-sm text-gray-500">Pedidos de balcão ou pagos na entrega não geram cashback.</p>
                </div>
                <Switch checked={soOnline} onCheckedChange={setSoOnline} />
              </div>

              <Button onClick={() => salvar()} disabled={saving} className="bg-red-600 hover:bg-red-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar configurações'}
              </Button>
              <p className="text-xs text-gray-400">
                O crédito entra quando o pedido é marcado como entregue. Pedidos feitos antes de ativar não geram saldo.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xs text-gray-500">Saldo em aberto</p>
                <p className="text-lg font-bold text-gray-900">{moeda(totalSaldo)}</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xs text-gray-500">Total creditado</p>
                <p className="text-lg font-bold text-gray-900">{moeda(totalCreditado)}</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xs text-gray-500">Total usado</p>
                <p className="text-lg font-bold text-gray-900">{moeda(totalResgatado)}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-gray-900 font-medium">Clientes com cashback</Label>
                <Input placeholder="Buscar por nome ou telefone" value={busca}
                  onChange={(e) => setBusca(e.target.value)} className="h-8 w-full sm:w-64 text-sm" />
              </div>
              {filtrados.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  {clientes.length === 0 ? 'Nenhum cliente com cashback ainda.' : 'Nenhum cliente encontrado.'}
                </p>
              ) : (
                <div className="divide-y">
                  {filtrados.map((c) => (
                    <div key={c.telefone} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.nome || 'Sem nome'}</p>
                        <p className="text-xs text-gray-500">{formatTel(c.telefone)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-red-600">{moeda(c.saldo)}</p>
                        <p className="text-xs text-gray-400">
                          ganhou {moeda(c.total_creditado)} · usou {moeda(c.total_resgatado)}
                          {Number(c.total_expirado) > 0 ? ` · venceu ${moeda(c.total_expirado)}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}