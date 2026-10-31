import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Bike, MapPin } from 'lucide-react';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Segunda das 5 páginas que nasceram da antiga CardapioPage.jsx. Cuida de:
// taxa de entrega por distância, previsão de tempo, agendamento de pedidos e
// horário de atendimento. O endereço da loja (usado pra calcular a taxa) é
// editado na página "Loja & Publicação" — aqui ele só é mostrado, com um
// link pra lá, exatamente pra não duplicar o mesmo campo em duas telas.
export default function CardapioEntregaPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [endereco, setEndereco] = useState('');

  const [tabelaTaxaEntrega, setTabelaTaxaEntrega] = useState([]);
  const [distanciaMaximaKm, setDistanciaMaximaKm] = useState('');
  const [valorMinimoEntrega, setValorMinimoEntrega] = useState('');
  const [savingTaxaEntrega, setSavingTaxaEntrega] = useState(false);

  const [tempoRetiradaMin, setTempoRetiradaMin] = useState('');
  const [tempoRetiradaMax, setTempoRetiradaMax] = useState('');
  const [tempoEntregaMin, setTempoEntregaMin] = useState('');
  const [tempoEntregaMax, setTempoEntregaMax] = useState('');
  const [savingTempoPreparo, setSavingTempoPreparo] = useState(false);

  const [agendamentoAtivo, setAgendamentoAtivo] = useState(false);
  const [antecedenciaHoras, setAntecedenciaHoras] = useState('24');
  const [savingAgendamento, setSavingAgendamento] = useState(false);

  const [horarios, setHorarios] = useState(
    DIAS_SEMANA.map((_, i) => ({ dia: i, ativo: i !== 0, abertura: '08:00', fechamento: '18:00' }))
  );
  const [savingHorarios, setSavingHorarios] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('empresas').select('id, cardapio_config').eq('id', empresaId).single();
      if (error) throw error;

      const config = data?.cardapio_config || {};
      setEmpresa(data);
      setEndereco(config.endereco || '');
      setTabelaTaxaEntrega(config.taxa_entrega?.tabela || []);
      setDistanciaMaximaKm(config.taxa_entrega?.distancia_maxima_km != null ? String(config.taxa_entrega.distancia_maxima_km) : '');
      setValorMinimoEntrega(config.valor_minimo_entrega != null ? String(config.valor_minimo_entrega) : '');
      const tempoPreparo = config.tempo_preparo || {};
      setTempoRetiradaMin(tempoPreparo.retirada_min != null ? String(tempoPreparo.retirada_min) : '');
      setTempoRetiradaMax(tempoPreparo.retirada_max != null ? String(tempoPreparo.retirada_max) : '');
      setTempoEntregaMin(tempoPreparo.entrega_min != null ? String(tempoPreparo.entrega_min) : '');
      setTempoEntregaMax(tempoPreparo.entrega_max != null ? String(tempoPreparo.entrega_max) : '');
      setAgendamentoAtivo(!!config.agendamento_ativo);
      setAntecedenciaHoras(String(config.antecedencia_minima_horas ?? 24));
      const horariosConfig = config.horarios;
      if (horariosConfig) {
        setHorarios(DIAS_SEMANA.map((_, i) => ({
          dia: i,
          ativo: horariosConfig[i]?.ativo ?? (i !== 0),
          abertura: horariosConfig[i]?.abertura || '08:00',
          fechamento: horariosConfig[i]?.fechamento || '18:00',
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar entrega/horários do cardápio:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const addFaixaTaxa = () => setTabelaTaxaEntrega((prev) => [...prev, { ate_km: '', valor: '' }]);
  const updateFaixaTaxa = (idx, patch) => setTabelaTaxaEntrega((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeFaixaTaxa = (idx) => setTabelaTaxaEntrega((prev) => prev.filter((_, i) => i !== idx));

  const handleSaveTaxaEntrega = async () => {
    const tabelaValida = tabelaTaxaEntrega
      .map((f) => ({ ate_km: parseFloat(String(f.ate_km).replace(',', '.')), valor: parseFloat(String(f.valor).replace(',', '.')) }))
      .filter((f) => !isNaN(f.ate_km) && f.ate_km > 0 && !isNaN(f.valor) && f.valor >= 0);
    if (tabelaValida.length !== tabelaTaxaEntrega.length) {
      toast({ title: 'Preencha km e valor válidos em todas as faixas', variant: 'destructive' });
      return;
    }
    if (!endereco.trim() && tabelaValida.length > 0) {
      toast({ title: 'Preencha o endereço da loja em "Loja & Publicação" antes de configurar a taxa', variant: 'destructive' });
      return;
    }
    setSavingTaxaEntrega(true);
    try {
      const novoConfig = {
        ...(empresa?.cardapio_config || {}),
        valor_minimo_entrega: valorMinimoEntrega ? parseFloat(valorMinimoEntrega.replace(',', '.')) : null,
        taxa_entrega: {
          tabela: tabelaValida.sort((a, b) => a.ate_km - b.ate_km),
          distancia_maxima_km: distanciaMaximaKm ? parseFloat(distanciaMaximaKm.replace(',', '.')) : null,
        },
      };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      toast({ title: 'Taxa de entrega salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingTaxaEntrega(false);
    }
  };

  const handleSaveTempoPreparo = async () => {
    const vals = { retirada_min: tempoRetiradaMin, retirada_max: tempoRetiradaMax, entrega_min: tempoEntregaMin, entrega_max: tempoEntregaMax };
    const parsed = {};
    for (const [k, v] of Object.entries(vals)) {
      if (!v.trim()) { parsed[k] = null; continue; }
      const n = parseInt(v, 10);
      if (isNaN(n) || n <= 0) {
        toast({ title: 'Preencha só números válidos (minutos) ou deixe em branco', variant: 'destructive' });
        return;
      }
      parsed[k] = n;
    }
    setSavingTempoPreparo(true);
    try {
      const novoConfig = { ...(empresa?.cardapio_config || {}), tempo_preparo: parsed };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      toast({ title: 'Tempo de preparo salvo!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingTempoPreparo(false);
    }
  };

  const handleSaveAgendamento = async (novoAtivo) => {
    const horas = parseFloat(antecedenciaHoras);
    if (novoAtivo && (isNaN(horas) || horas < 0)) {
      toast({ title: 'Informe uma antecedência mínima válida', variant: 'destructive' });
      return;
    }
    setSavingAgendamento(true);
    try {
      const novoConfig = { ...(empresa?.cardapio_config || {}), agendamento_ativo: novoAtivo, antecedencia_minima_horas: horas };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      setAgendamentoAtivo(novoAtivo);
      toast({ title: 'Configuração de agendamento salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingAgendamento(false);
    }
  };

  const handleSaveHorarios = async () => {
    setSavingHorarios(true);
    try {
      const horariosObj = {};
      horarios.forEach((h) => { horariosObj[h.dia] = { ativo: h.ativo, abertura: h.abertura, fechamento: h.fechamento }; });
      const novoConfig = { ...(empresa?.cardapio_config || {}), horarios: horariosObj };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      toast({ title: 'Horários salvos!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar horários', description: error.message, variant: 'destructive' });
    } finally {
      setSavingHorarios(false);
    }
  };

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
      <Helmet><title>Entrega & Horários - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bike className="h-6 w-6" /> Entrega & Horários
          </h1>
          <p className="text-gray-500 text-sm">Taxa por distância, previsão de tempo, agendamento e horário de atendimento.</p>
        </div>

        {/* Config: taxa de entrega por distância */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900 font-medium">Taxa de entrega por distância</Label>
            <p className="text-sm text-gray-500">Calculada automaticamente da loja até o endereço do cliente (arredondando pra cima).</p>
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1 bg-gray-50 border rounded-lg px-2 py-1.5 w-fit">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {endereco ? <>Endereço da loja: <strong>{endereco}</strong></> : 'Endereço da loja ainda não configurado.'}{' '}
              <Link to="/dashboard/cardapio" className="text-blue-600 underline whitespace-nowrap">editar em Loja & Publicação</Link>
            </p>
          </div>

          <div className="space-y-2">
            {tabelaTaxaEntrega.length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma faixa configurada ainda — sem isso a entrega não calcula taxa.</p>
            )}
            {tabelaTaxaEntrega.map((faixa, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-sm text-gray-500 shrink-0">Até</span>
                <Input
                  type="number" min="0.1" step="0.1" className="w-20"
                  value={faixa.ate_km}
                  onChange={(e) => updateFaixaTaxa(idx, { ate_km: e.target.value })}
                  placeholder="km"
                />
                <span className="text-sm text-gray-500 shrink-0">km →</span>
                <span className="text-sm text-gray-500 shrink-0">R$</span>
                <Input
                  inputMode="decimal" className="w-24"
                  value={faixa.valor}
                  onChange={(e) => updateFaixaTaxa(idx, { valor: e.target.value })}
                  placeholder="0,00"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => removeFaixaTaxa(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addFaixaTaxa}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar faixa
            </Button>
          </div>

          <div>
            <Label htmlFor="valor-min-entrega" className="text-gray-900">Valor mínimo do pedido pra entrega (opcional)</Label>
            <Input
              id="valor-min-entrega" inputMode="decimal"
              value={valorMinimoEntrega}
              onChange={(e) => setValorMinimoEntrega(e.target.value)}
              placeholder="Ex: 30,00"
            />
            <p className="text-xs text-gray-400 mt-1">Cliente só consegue escolher "Entrega" se o pedido bater esse valor (não vale pra retirada).</p>
          </div>

          <div>
            <Label htmlFor="dist-maxima" className="text-gray-900">Distância máxima de entrega (opcional)</Label>
            <Input
              id="dist-maxima" type="number" min="0.1" step="0.1"
              value={distanciaMaximaKm}
              onChange={(e) => setDistanciaMaximaKm(e.target.value)}
              placeholder="Ex: 10 (km)"
            />
            <p className="text-xs text-gray-400 mt-1">Além dessa distância, avisamos o cliente que está fora da área.</p>
          </div>

          <Button onClick={handleSaveTaxaEntrega} disabled={savingTaxaEntrega}>
            {savingTaxaEntrega ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar taxa de entrega'}
          </Button>
        </div>

        {/* Config: previsão de tempo (preparo/entrega) */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900 font-medium">Previsão de tempo</Label>
            <p className="text-sm text-gray-500">Mostra "Previsão: entre X e Y minutos" pro cliente no checkout. Deixe em branco pra não mostrar.</p>
          </div>

          <div>
            <Label className="text-gray-900">Retirada (minutos)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" className="w-20" value={tempoRetiradaMin} onChange={(e) => setTempoRetiradaMin(e.target.value)} placeholder="min" />
              <span className="text-sm text-gray-500">até</span>
              <Input type="number" min="1" className="w-20" value={tempoRetiradaMax} onChange={(e) => setTempoRetiradaMax(e.target.value)} placeholder="máx" />
            </div>
          </div>

          <div>
            <Label className="text-gray-900">Entrega (minutos)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" className="w-20" value={tempoEntregaMin} onChange={(e) => setTempoEntregaMin(e.target.value)} placeholder="min" />
              <span className="text-sm text-gray-500">até</span>
              <Input type="number" min="1" className="w-20" value={tempoEntregaMax} onChange={(e) => setTempoEntregaMax(e.target.value)} placeholder="máx" />
            </div>
          </div>

          <Button onClick={handleSaveTempoPreparo} disabled={savingTempoPreparo}>
            {savingTempoPreparo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar previsão de tempo'}
          </Button>
        </div>

        {/* Config: agendamento de pedidos */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-900 font-medium">Aceitar pedidos agendados</Label>
              <p className="text-sm text-gray-500">Cliente pode escolher receber mais tarde (ex: encomenda de aniversário).</p>
            </div>
            <Switch checked={agendamentoAtivo} onCheckedChange={(v) => handleSaveAgendamento(v)} disabled={savingAgendamento} />
          </div>

          {agendamentoAtivo && (
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
              <div className="flex-1 w-full">
                <Label htmlFor="antecedencia" className="text-gray-900">Antecedência mínima (horas)</Label>
                <Input
                  id="antecedencia" type="number" min="0" step="1"
                  value={antecedenciaHoras}
                  onChange={(e) => setAntecedenciaHoras(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">Ex: 24 = cliente só consegue agendar pra daqui a 1 dia ou mais.</p>
              </div>
              <Button onClick={() => handleSaveAgendamento(true)} disabled={savingAgendamento}>
                {savingAgendamento ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          )}
        </div>

        {/* Config: horário de atendimento */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div>
            <Label className="text-gray-900 font-medium">Horário de atendimento</Label>
            <p className="text-sm text-gray-500">Usado pra saber quando aceitar pedidos agendados.</p>
          </div>
          {horarios.map((h, idx) => (
            <div key={h.dia} className="flex items-center gap-2 flex-wrap">
              <Switch
                checked={h.ativo}
                onCheckedChange={(v) => setHorarios((prev) => prev.map((x, i) => (i === idx ? { ...x, ativo: v } : x)))}
              />
              <span className="w-20 text-sm text-gray-700 shrink-0">{DIAS_SEMANA[h.dia]}</span>
              {h.ativo ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time" className="h-8 text-sm w-28"
                    value={h.abertura}
                    onChange={(e) => setHorarios((prev) => prev.map((x, i) => (i === idx ? { ...x, abertura: e.target.value } : x)))}
                  />
                  <span className="text-gray-400 text-sm">até</span>
                  <Input
                    type="time" className="h-8 text-sm w-28"
                    value={h.fechamento}
                    onChange={(e) => setHorarios((prev) => prev.map((x, i) => (i === idx ? { ...x, fechamento: e.target.value } : x)))}
                  />
                </div>
              ) : (
                <span className="text-xs text-gray-400">Fechado</span>
              )}
            </div>
          ))}
          <Button size="sm" onClick={handleSaveHorarios} disabled={savingHorarios}>
            {savingHorarios ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar horários'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
