import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, PackageSearch, RefreshCw, AlertTriangle, ShoppingCart, ChevronDown, ChevronRight } from 'lucide-react';

// Painel "Estoque do Cardápio": só os itens do cardápio digital, com o estoque REAL de cada um
// (a mesma regra usada pra aceitar o pedido), quantas vezes um cliente foi barrado por falta
// de estoque nos últimos 7 dias, e o limite mínimo que define "últimas unidades" (aviso no
// cardápio) e o alerta de estoque baixo pro gestor. O cliente nunca vê números — só aqui.
const ROTULO = { ok: 'OK', baixo: 'Baixo', zerado: 'Esgotado', sem_vinculo: 'Sem vínculo' };
const COR = {
  ok: 'bg-emerald-100 text-emerald-700',
  baixo: 'bg-amber-100 text-amber-700',
  zerado: 'bg-red-100 text-red-700',
  sem_vinculo: 'bg-gray-100 text-gray-500',
};
const ORDEM_STATUS = { zerado: 0, baixo: 1, ok: 2, sem_vinculo: 3 };

const formatarQuando = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

export default function CardapioEstoquePage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [dados, setDados] = useState({ limite: 5, itens: [] });
  const [empresaConfig, setEmpresaConfig] = useState({});
  const [filtro, setFiltro] = useState('atencao'); // atencao | todos | zerado | baixo | bloqueios
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState({});

  const [limiteInput, setLimiteInput] = useState('5');
  const [avisoUltimas, setAvisoUltimas] = useState(true);
  const [esgotadoAuto, setEsgotadoAuto] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!empresaId) { setLoading(false); return; }
    if (!silencioso) setLoading(true); else setAtualizando(true);
    try {
      const [{ data: painel, error }, { data: emp }] = await Promise.all([
        supabase.rpc('rpc_estoque_cardapio_painel'),
        supabase.from('empresas').select('cardapio_config').eq('id', empresaId).maybeSingle(),
      ]);
      if (error) throw error;
      setDados(painel || { limite: 5, itens: [] });
      const cfg = emp?.cardapio_config || {};
      setEmpresaConfig(cfg);
      setLimiteInput(String(cfg.estoque_limite_minimo ?? painel?.limite ?? 5));
      setAvisoUltimas(cfg.estoque_aviso_ultimas_ativo !== false);
      setEsgotadoAuto(cfg.estoque_esgotado_auto_ativo !== false);
    } catch (e) {
      console.error('Erro ao carregar estoque do cardápio:', e);
      toast({ title: 'Erro ao carregar o estoque', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = setInterval(() => carregar(true), 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const salvarConfig = async () => {
    const limite = Math.max(1, parseInt(limiteInput, 10) || 5);
    setSalvando(true);
    try {
      const novo = { ...empresaConfig, estoque_limite_minimo: limite, estoque_aviso_ultimas_ativo: avisoUltimas, estoque_esgotado_auto_ativo: esgotadoAuto };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novo }).eq('id', empresaId);
      if (error) throw error;
      setEmpresaConfig(novo);
      setLimiteInput(String(limite));
      toast({ title: 'Configuração de estoque salva!' });
      carregar(true);
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  // Itens desativados manualmente ficam fora dos alertas e do aviso; aqui só marcamos.
  const itens = useMemo(() => dados.itens || [], [dados.itens]);
  const resumo = useMemo(() => {
    const ativos = itens.filter((i) => i.ativo);
    return {
      zerados: ativos.filter((i) => i.status === 'zerado').length,
      baixos: ativos.filter((i) => i.status === 'baixo').length,
      bloqueios: itens.reduce((s, i) => s + (Number(i.bloqueios_7d) || 0), 0),
    };
  }, [itens]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .filter((i) => {
        if (termo && !`${i.nome} ${i.categoria}`.toLowerCase().includes(termo)) return false;
        if (filtro === 'atencao') return i.ativo && (i.status === 'zerado' || i.status === 'baixo');
        if (filtro === 'zerado') return i.status === 'zerado';
        if (filtro === 'baixo') return i.status === 'baixo';
        if (filtro === 'bloqueios') return Number(i.bloqueios_7d) > 0;
        return true;
      })
      .sort((a, b) => {
        if (filtro === 'bloqueios') return Number(b.bloqueios_7d) - Number(a.bloqueios_7d);
        const d = (ORDEM_STATUS[a.status] ?? 9) - (ORDEM_STATUS[b.status] ?? 9);
        return d !== 0 ? d : String(a.nome).localeCompare(String(b.nome));
      });
  }, [itens, filtro, busca]);

  const Cartao = ({ titulo, valor, destaque, icone: Icone, texto }) => (
    <div className={`rounded-xl border p-4 ${destaque || 'bg-white border-gray-200'}`}>
      <p className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1.5"><Icone className="h-3.5 w-3.5" /> {titulo}</p>
      <p className="text-3xl font-black text-gray-900 mt-1">{valor}</p>
      <p className="text-xs text-gray-500 mt-0.5">{texto}</p>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      </DashboardLayout>
    );
  }

  const FILTROS = [
    ['atencao', 'Precisam de atenção'],
    ['zerado', 'Esgotados'],
    ['baixo', 'Estoque baixo'],
    ['bloqueios', 'Vendas barradas'],
    ['todos', 'Todos'],
  ];

  return (
    <DashboardLayout>
      <Helmet><title>Estoque do Cardápio - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-6" data-testid="painel-estoque-cardapio">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <PackageSearch className="h-6 w-6" /> Estoque do Cardápio
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Só os itens do cardápio digital. Atualiza sozinho a cada minuto. Os clientes não veem estas quantidades.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => carregar(true)} disabled={atualizando} className="gap-1.5">
            {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Cartao titulo="Esgotados" valor={resumo.zerados} icone={AlertTriangle}
            destaque={resumo.zerados > 0 ? 'bg-red-50 border-red-200' : undefined} texto="itens ativos sem estoque" />
          <Cartao titulo="Estoque baixo" valor={resumo.baixos} icone={AlertTriangle}
            destaque={resumo.baixos > 0 ? 'bg-amber-50 border-amber-200' : undefined} texto={`até ${dados.limite} unidades`} />
          <Cartao titulo="Vendas barradas (7 dias)" valor={resumo.bloqueios} icone={ShoppingCart}
            destaque={resumo.bloqueios > 0 ? 'bg-red-50 border-red-200' : undefined} texto="vezes que um cliente esbarrou na falta de estoque" />
        </div>

        <div className="border rounded-xl p-4 bg-white space-y-3">
          <p className="text-sm font-semibold text-gray-900">Limite mínimo e aviso</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="limite-minimo" className="text-gray-900">Estoque mínimo (unidades)</Label>
              <Input id="limite-minimo" type="number" min="1" step="1" value={limiteInput} onChange={(e) => setLimiteInput(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">
                Item com estoque até esse valor aparece como "Baixo" aqui, gera alerta para o gestor (se ligado em WhatsApp & Notificações) e mostra "Últimas unidades" no cardápio.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <Label className="text-gray-900">Mostrar "Últimas unidades" no cardápio</Label>
                  <p className="text-xs text-gray-400">O cliente vê o aviso, nunca a quantidade.</p>
                </div>
                <Switch checked={avisoUltimas} onCheckedChange={setAvisoUltimas} />
              </div>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <Label className="text-gray-900">"Esgotado" automático no cardápio</Label>
                  <p className="text-xs text-gray-400">Item que zera no estoque principal e na reserva aparece como esgotado (ou some, conforme a opção da loja) e volta sozinho quando repor.</p>
                </div>
                <Switch checked={esgotadoAuto} onCheckedChange={setEsgotadoAuto} />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={salvarConfig} disabled={salvando} size="sm">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTROS.map(([id, nome]) => (
              <button
                key={id} type="button" onClick={() => setFiltro(id)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${filtro === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                {nome}
              </button>
            ))}
            <Input className="max-w-xs ml-auto" placeholder="Buscar item..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            {lista.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                {filtro === 'atencao' ? 'Nenhum item esgotado ou com estoque baixo. 🎉' : 'Nenhum item neste filtro.'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Item</th>
                    <th className="text-center px-3 py-2 font-semibold">Situação</th>
                    <th className="text-right px-3 py-2 font-semibold">Estoque</th>
                    <th className="text-right px-3 py-2 font-semibold">Vendas barradas (7d)</th>
                    <th className="text-right px-3 py-2 font-semibold hidden md:table-cell">Maior pedido barrado</th>
                    <th className="text-right px-3 py-2 font-semibold hidden md:table-cell">Última vez</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lista.map((i) => {
                    const ehCombo = i.tipo === 'combo';
                    const aberto = !!abertos[i.id];
                    return (
                      <React.Fragment key={i.id}>
                        <tr className={i.ativo ? '' : 'opacity-50'} data-testid="linha-estoque">
                          <td className="px-3 py-2 text-gray-900">
                            <div className="flex items-center gap-1.5">
                              {ehCombo && (
                                <button type="button" aria-label="Ver sabores" onClick={() => setAbertos((p) => ({ ...p, [i.id]: !p[i.id] }))} className="text-gray-400 hover:text-gray-700">
                                  {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              )}
                              <span className="font-medium">{i.nome}</span>
                              {!i.ativo && <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded-full">desativado</span>}
                            </div>
                            <p className="text-xs text-gray-400">{i.categoria}{ehCombo ? ' · combo (estoque por sabor)' : ''}</p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COR[i.status] || COR.ok}`}>{ROTULO[i.status] || i.status}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {ehCombo || i.estoque == null ? '—' : i.estoque}
                            {!ehCombo && i.reserva_nome && i.estoque_principal != null && (
                              <p className="text-[11px] font-normal text-gray-400" data-testid="detalhe-reserva">
                                {i.estoque_principal} principal + {i.estoque_reserva ?? 0} {String(i.reserva_nome).replace(/^ESTOQUE\s+/i, '').toLowerCase()}
                              </p>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${Number(i.bloqueios_7d) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{Number(i.bloqueios_7d) || 0}</td>
                          <td className="px-3 py-2 text-right text-gray-600 hidden md:table-cell">{i.qtd_max_pedida != null ? i.qtd_max_pedida : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-500 hidden md:table-cell">{formatarQuando(i.ultimo_bloqueio_em)}</td>
                        </tr>
                        {ehCombo && aberto && (i.opcoes || []).map((o) => (
                          <tr key={o.id} className="bg-gray-50/60" data-testid="linha-sabor">
                            <td className="px-3 py-1.5 pl-10 text-gray-700 text-xs">{o.nome}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${COR[o.status] || COR.ok}`}>{ROTULO[o.status] || o.status}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-900">{o.estoque}</td>
                            <td colSpan={3} />
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-gray-400">
            "Vendas barradas" conta as vezes em que a conferência de estoque do cardápio recusou o pedido. É uma estimativa da demanda que ficou sem atender (o mesmo cliente tentando de novo conta de novo).
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
