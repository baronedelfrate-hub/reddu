import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatUnit } from '@/utils/currencyFormatter';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Bike, Store, Loader2, Search, MapPin, Calculator, Clock, CalendarClock } from 'lucide-react';

// Mesma extração de erro de edge function usada no CardapioPublicoPage —
// duplicada aqui pra não precisar tocar naquele arquivo.
async function extrairErroFuncao(error, fallback = 'Tente novamente em instantes.') {
  if (!error) return fallback;
  try {
    if (error.context && typeof error.context.json === 'function') {
      const corpo = await error.context.clone().json();
      if (corpo?.error) return corpo.error;
    }
  } catch (e) { /* corpo não era JSON ou já foi consumido - segue pro fallback */ }
  return error.message || fallback;
}

const FORM_VAZIO = {
  nome: '',
  telefone: '',
  enderecoRua: '',
  enderecoNumero: '',
  enderecoComplemento: '',
  observacao: '',
  consumoLocal: false,
};

// Formata um Date pro formato que o <input type="datetime-local"> espera
// (YYYY-MM-DDTHH:mm), em horário local.
function paraDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Modal "Forma de entrega" do PDV Pedidos Balcão — inspirado nas telas do
// Anota AI que o Roberto trouxe como referência: escolher Entrega/Retirada,
// buscar ou cadastrar cliente por telefone, endereço + taxa quando for
// entrega. A tabela pedidos_cardapio só aceita 'retirada' ou 'entrega' (regra
// já existente na rpc_criar_pedido_cardapio), então "Consumir no local" vira
// um checkbox dentro de Retirada, registrado na observação do pedido.
export default function FormaEntregaModal({ isOpen, onClose, empresaId, total, onConfirm, isSubmitting }) {
  const { toast } = useToast();
  const [tipoEntrega, setTipoEntrega] = useState('retirada');
  const [form, setForm] = useState(FORM_VAZIO);

  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [showSugestoesCliente, setShowSugestoesCliente] = useState(false);

  const [taxaEntrega, setTaxaEntrega] = useState(0);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);

  const [quando, setQuando] = useState('agora');
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [antecedenciaHoras, setAntecedenciaHoras] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setTipoEntrega('retirada');
    setForm(FORM_VAZIO);
    setTaxaEntrega(0);
    setQuando('agora');
    setDataAgendamento('');

    if (!empresaId) return;
    setLoadingClientes(true);
    supabase
      .from('cardapio_clientes')
      .select('id, nome, telefone')
      .eq('empresa_id', empresaId)
      .then(({ data, error }) => {
        if (!error) setClientes(data || []);
        setLoadingClientes(false);
      });

    // Antecedência mínima configurada no cardápio digital (mesma regra que a
    // rpc_criar_pedido_cardapio aplica) — só pra sugerir um horário mínimo
    // válido no campo de agendamento; a validação de verdade é sempre feita
    // pela RPC no servidor.
    supabase
      .from('empresas')
      .select('cardapio_config')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data }) => {
        setAntecedenciaHoras(Number(data?.cardapio_config?.antecedencia_minima_horas) || 0);
      });
  }, [isOpen, empresaId]);

  const minDataAgendamento = useMemo(() => {
    const min = new Date(Date.now() + antecedenciaHoras * 60 * 60 * 1000);
    return paraDatetimeLocal(min);
  }, [antecedenciaHoras]);

  const sugestoesCliente = useMemo(() => {
    const termo = form.telefone.replace(/\D/g, '');
    if (termo.length < 3) return [];
    return clientes.filter((c) => c.telefone.replace(/\D/g, '').includes(termo)).slice(0, 6);
  }, [clientes, form.telefone]);

  const selecionarCliente = (cliente) => {
    setForm((f) => ({ ...f, nome: cliente.nome, telefone: cliente.telefone }));
    setShowSugestoesCliente(false);
  };

  const enderecoCompleto = form.enderecoRua.trim()
    ? `${form.enderecoRua.trim()}, ${form.enderecoNumero.trim()}${form.enderecoComplemento.trim() ? ` - ${form.enderecoComplemento.trim()}` : ''}`
    : '';

  const handleCalcularTaxa = useCallback(async () => {
    if (!form.enderecoRua.trim() || !form.enderecoNumero.trim()) {
      toast({ title: 'Informe rua e número primeiro', variant: 'destructive' });
      return;
    }
    setCalculandoTaxa(true);
    try {
      const { data, error } = await supabase.functions.invoke('calcular-taxa-entrega', {
        body: { empresa_id: empresaId, endereco_destino: enderecoCompleto },
      });
      if (error) {
        toast({ title: 'Não foi possível calcular a taxa', description: await extrairErroFuncao(error), variant: 'destructive' });
        return;
      }
      if (!data?.success) {
        toast({ title: 'Não foi possível calcular a taxa', description: data?.error, variant: 'destructive' });
        return;
      }
      if (!data.dentro_da_area) {
        toast({ title: 'Fora da área de entrega', description: `Distância: ${data.distancia_km}km. Ajuste a taxa manualmente se ainda assim for entregar.`, variant: 'destructive' });
      }
      setTaxaEntrega(Number(data.taxa || 0));
    } catch (error) {
      toast({ title: 'Erro ao calcular taxa de entrega', description: error.message, variant: 'destructive' });
    } finally {
      setCalculandoTaxa(false);
    }
  }, [empresaId, enderecoCompleto, form.enderecoRua, form.enderecoNumero, toast]);

  const totalComTaxa = total + (tipoEntrega === 'entrega' ? Number(taxaEntrega || 0) : 0);

  const handleConfirmar = () => {
    if (!form.nome.trim() || !form.telefone.trim()) {
      toast({ title: 'Informe nome e telefone do cliente', variant: 'destructive' });
      return;
    }
    if (tipoEntrega === 'entrega' && (!form.enderecoRua.trim() || !form.enderecoNumero.trim())) {
      toast({ title: 'Informe rua e número de entrega', variant: 'destructive' });
      return;
    }
    if (quando === 'agendar' && !dataAgendamento) {
      toast({ title: 'Escolha a data e hora do agendamento', variant: 'destructive' });
      return;
    }

    const observacaoFinal = [
      form.observacao.trim() || null,
      tipoEntrega === 'retirada' && form.consumoLocal ? 'Cliente vai consumir no local.' : null,
    ].filter(Boolean).join(' | ') || null;

    onConfirm({
      cliente: { nome: form.nome.trim(), telefone: form.telefone.trim() },
      tipoEntrega,
      endereco: tipoEntrega === 'entrega' ? enderecoCompleto : null,
      taxaEntrega: tipoEntrega === 'entrega' ? Number(taxaEntrega || 0) : 0,
      observacao: observacaoFinal,
      dataAgendamento: quando === 'agendar' ? new Date(dataAgendamento).toISOString() : null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Forma de entrega</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTipoEntrega('entrega')}
            className={`h-11 font-bold gap-2 ${tipoEntrega === 'entrega' ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] hover:text-white' : ''}`}
          >
            <Bike className="w-4 h-4" /> Entrega
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTipoEntrega('retirada')}
            className={`h-11 font-bold gap-2 ${tipoEntrega === 'retirada' ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] hover:text-white' : ''}`}
          >
            <Store className="w-4 h-4" /> Retirar / Consumir no local
          </Button>
        </div>

        {tipoEntrega === 'retirada' && (
          <label className="flex items-center gap-2 text-sm text-gray-600 mt-1 px-1">
            <input
              type="checkbox"
              checked={form.consumoLocal}
              onChange={(e) => setForm((f) => ({ ...f, consumoLocal: e.target.checked }))}
              className="rounded border-gray-300"
            />
            Cliente vai consumir no local (fica registrado na observação)
          </label>
        )}

        <div className="grid grid-cols-2 gap-2 mt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => setQuando('agora')}
            className={`h-10 font-bold gap-2 ${quando === 'agora' ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800 hover:text-white' : ''}`}
          >
            <Clock className="w-4 h-4" /> Pra agora
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setQuando('agendar')}
            className={`h-10 font-bold gap-2 ${quando === 'agendar' ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800 hover:text-white' : ''}`}
          >
            <CalendarClock className="w-4 h-4" /> Agendar
          </Button>
        </div>

        {quando === 'agendar' && (
          <div className="space-y-1">
            <Label>Data e hora {tipoEntrega === 'entrega' ? 'da entrega' : 'da retirada'}</Label>
            <Input
              type="datetime-local"
              min={minDataAgendamento}
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
            />
            {antecedenciaHoras > 0 && (
              <p className="text-[11px] text-gray-400">Antecedência mínima configurada no cardápio: {antecedenciaHoras}h.</p>
            )}
            <p className="text-[11px] text-gray-400">O dia/horário também precisa estar dentro do funcionamento configurado no cardápio digital — se não estiver, o sistema avisa ao confirmar.</p>
          </div>
        )}

        <div className="space-y-1 mt-2 relative">
          <Label>Telefone do cliente</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={(e) => {
                setForm((f) => ({ ...f, telefone: e.target.value }));
                setShowSugestoesCliente(true);
              }}
              onFocus={() => setShowSugestoesCliente(true)}
            />
            {loadingClientes && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
          </div>
          {showSugestoesCliente && sugestoesCliente.length > 0 && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {sugestoesCliente.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  onClick={() => selecionarCliente(c)}
                >
                  <span className="font-semibold text-gray-800">{c.nome}</span>{' '}
                  <span className="text-gray-400">— {c.telefone}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">Cliente já cadastrado aparece na lista acima. Se não achar, preencha o nome que ele é cadastrado automaticamente.</p>
        </div>

        <div className="space-y-1">
          <Label>Nome do cliente</Label>
          <Input
            placeholder="Nome completo"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          />
        </div>

        {tipoEntrega === 'entrega' && (
          <div className="space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <div className="flex items-center gap-1 text-sm font-bold text-gray-700">
              <MapPin className="w-4 h-4" /> Endereço de entrega
            </div>
            <Input
              placeholder="Rua / Av."
              value={form.enderecoRua}
              onChange={(e) => setForm((f) => ({ ...f, enderecoRua: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Número"
                value={form.enderecoNumero}
                onChange={(e) => setForm((f) => ({ ...f, enderecoNumero: e.target.value }))}
              />
              <Input
                placeholder="Complemento (opcional)"
                value={form.enderecoComplemento}
                onChange={(e) => setForm((f) => ({ ...f, enderecoComplemento: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleCalcularTaxa} disabled={calculandoTaxa} className="gap-1">
                {calculandoTaxa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                Calcular taxa
              </Button>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">Taxa:</span>
                <Input
                  type="number"
                  step="0.01"
                  className="w-24 h-8 text-right font-bold"
                  value={taxaEntrega}
                  onChange={(e) => setTaxaEntrega(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label>Observação (opcional)</Label>
          <Textarea
            placeholder="Sem cebola, troco para R$ 50, etc."
            value={form.observacao}
            onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-2">
          <span className="font-bold text-gray-700 text-sm">Total do pedido</span>
          <span className="font-black text-gray-900 text-lg">{formatUnit(totalComTaxa)}</span>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={isSubmitting}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar pedido para a cozinha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
