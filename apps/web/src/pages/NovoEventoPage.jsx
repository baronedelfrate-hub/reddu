import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar, ArrowLeft, Plus, Trash2, Save, FileText,
  Users, Clock, MapPin, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, DollarSign, Package
} from 'lucide-react';

export default function NovoEventoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [precosCatalogo, setPrecosCatalogo] = useState([]);

  // Dados básicos
  const [form, setForm] = useState({
    nome_cliente: '',
    data_evento: '',
    horario_inicio: '',
    horario_chegada: '',
    num_convidados: '',
    local_evento: '',
    observacoes: '',
    status: 'orcamento',
    percentual_entrada: '40',
    forma_pagamento_restante: 'no dia do evento',
  });

  // Itens de salgados
  const [itens, setItens] = useState([]);
  // Serviços
  const [servicos, setServicos] = useState([
    { id: Date.now(), descricao: 'Serviço completo de preparo e fritura no local com equipe especializada, incluindo transporte, equipamentos e utensílios próprios.', valor: '' }
  ]);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  // Load preços catálogo
  useEffect(() => {
    if (!empresaId) return;
    supabase.from('evento_precos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('ordem')
      .then(({ data }) => setPrecosCatalogo(data || []));
    if (isEdit) loadEvento();
  }, [empresaId]);

  const loadEvento = async () => {
    setIsLoading(true);
    const [{ data: ev }, { data: its }, { data: srvs }] = await Promise.all([
      supabase.from('eventos').select('*').eq('id', id).single(),
      supabase.from('evento_itens').select('*').eq('evento_id', id).order('created_at'),
      supabase.from('evento_servicos').select('*').eq('evento_id', id).order('created_at'),
    ]);
    if (ev) {
      setForm({
        nome_cliente: ev.nome_cliente || '',
        data_evento: ev.data_evento || '',
        horario_inicio: ev.horario_inicio?.slice(0,5) || '',
        horario_chegada: ev.horario_chegada?.slice(0,5) || '',
        num_convidados: ev.num_convidados?.toString() || '',
        local_evento: ev.local_evento || '',
        observacoes: ev.observacoes || '',
        status: ev.status || 'orcamento',
        percentual_entrada: ev.percentual_entrada?.toString() || '40',
        forma_pagamento_restante: ev.forma_pagamento_restante || 'no dia do evento',
      });
    }
    setItens((its || []).map(i => ({ ...i, preco_por_cento: i.preco_por_cento?.toString(), quantidade: i.quantidade?.toString() })));
    setServicos((srvs || []).map(s => ({ ...s, valor: s.valor?.toString() })));
    setIsLoading(false);
  };

  const addItem = (cat) => {
    const preco = precosCatalogo.find(p => p.categoria === cat);
    setItens(prev => [...prev, {
      id: `new_${Date.now()}`,
      categoria: cat || '',
      descricao: '',
      quantidade: '',
      preco_por_cento: preco?.preco_por_cento?.toString() || '',
    }]);
  };

  const updateItem = (idx, field, value) => setItens(prev => prev.map((it, i) => i !== idx ? it : { ...it, [field]: value }));
  const removeItem = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

  const addServico = () => setServicos(prev => [...prev, { id: `new_${Date.now()}`, descricao: '', valor: '' }]);
  const updateServico = (idx, field, value) => setServicos(prev => prev.map((s, i) => i !== idx ? s : { ...s, [field]: value }));
  const removeServico = (idx) => setServicos(prev => prev.filter((_, i) => i !== idx));

  // Cálculos
  const subtotalSalgados = itens.reduce((s, i) => {
    const qtd = Number(i.quantidade) || 0;
    const preco = Number(i.preco_por_cento) || 0;
    return s + (qtd / 100) * preco;
  }, 0);
  const subtotalServicos = servicos.reduce((s, sv) => s + (Number(sv.valor) || 0), 0);
  const totalGeral = subtotalSalgados + subtotalServicos;
  const pctEntrada = Number(form.percentual_entrada) || 0;
  const valorEntrada = Math.round((totalGeral * pctEntrada / 100) * 100) / 100;
  const valorRestante = Math.round((totalGeral - valorEntrada) * 100) / 100;
  const totalSalgados = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  const handleSave = async (andPdf = false) => {
    if (!form.nome_cliente || !form.data_evento) {
      toast({ title: 'Preencha o nome do cliente e a data', variant: 'destructive' }); return;
    }
    setIsSaving(true);
    try {
      const eventoData = {
        empresa_id: empresaId,
        nome_cliente: form.nome_cliente,
        data_evento: form.data_evento,
        horario_inicio: form.horario_inicio || null,
        horario_chegada: form.horario_chegada || null,
        num_convidados: form.num_convidados ? Number(form.num_convidados) : null,
        local_evento: form.local_evento || null,
        observacoes: form.observacoes || null,
        status: form.status,
        total_salgados: totalSalgados,
        valor_total: totalGeral,
        valor_entrada: valorEntrada,
        valor_restante: valorRestante,
        percentual_entrada: pctEntrada,
        forma_pagamento_restante: form.forma_pagamento_restante,
        updated_at: new Date().toISOString(),
      };

      let eventoId = id;
      if (isEdit) {
        await supabase.from('eventos').update(eventoData).eq('id', id);
        await supabase.from('evento_itens').delete().eq('evento_id', id);
        await supabase.from('evento_servicos').delete().eq('evento_id', id);
      } else {
        const { data: ev } = await supabase.from('eventos').insert(eventoData).select().single();
        eventoId = ev.id;
      }

      if (itens.length > 0) {
        await supabase.from('evento_itens').insert(itens.filter(i => i.quantidade).map(i => ({
          evento_id: eventoId,
          categoria: i.categoria,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          preco_por_cento: Number(i.preco_por_cento),
          subtotal: (Number(i.quantidade) / 100) * Number(i.preco_por_cento),
        })));
      }
      if (servicos.length > 0) {
        await supabase.from('evento_servicos').insert(servicos.filter(s => s.valor).map(s => ({
          evento_id: eventoId,
          descricao: s.descricao,
          valor: Number(s.valor),
        })));
      }

      toast({ title: isEdit ? 'Evento atualizado!' : 'Evento criado!', className: 'bg-green-600 text-white border-none' });
      if (andPdf) navigate(`/dashboard/eventos/${eventoId}/pdf`);
      else navigate(`/dashboard/eventos/${eventoId}`);
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const input = "w-full h-10 px-3 border border-gray-200 rounded-xl focus:border-rose-400 focus:outline-none text-sm";

  if (isLoading) return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rose-500" /></div></DashboardLayout>;

  return (
    <>
      <Helmet><title>{isEdit ? 'Editar Evento' : 'Novo Evento'} - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Editar Evento' : 'Novo Evento'}</h1>
                <p className="text-gray-500 text-sm mt-0.5">Monte o orçamento completo para o cliente.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          {/* Dados do evento */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-rose-500" /> Dados do Evento
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-semibold text-gray-700">Nome do Cliente *</label>
                <input type="text" value={form.nome_cliente} onChange={e => setForm(p => ({...p, nome_cliente: e.target.value}))}
                  placeholder="Ex: Luciana Talavera" className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Data do Evento *</label>
                <input type="date" value={form.data_evento} onChange={e => setForm(p => ({...p, data_evento: e.target.value}))}
                  className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Nº de Convidados</label>
                <input type="number" value={form.num_convidados} onChange={e => setForm(p => ({...p, num_convidados: e.target.value}))}
                  placeholder="Ex: 150" className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Horário de Início</label>
                <input type="time" value={form.horario_inicio} onChange={e => setForm(p => ({...p, horario_inicio: e.target.value}))}
                  className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Horário de Chegada da Equipe</label>
                <input type="time" value={form.horario_chegada} onChange={e => setForm(p => ({...p, horario_chegada: e.target.value}))}
                  className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-semibold text-gray-700">Local do Evento</label>
                <input type="text" value={form.local_evento} onChange={e => setForm(p => ({...p, local_evento: e.target.value}))}
                  placeholder="Endereço ou nome do salão" className={input} style={{ fontSize: '16px' }} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-semibold text-gray-700">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}
                  className={input} style={{ fontSize: '16px' }}>
                  <option value="orcamento">Orçamento</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="realizado">Realizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-semibold text-gray-700">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(p => ({...p, observacoes: e.target.value}))}
                  placeholder="Informações adicionais..." rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:border-rose-400 focus:outline-none text-sm resize-none"
                  style={{ fontSize: '16px' }} />
              </div>
            </div>
          </div>

          {/* Itens de salgados */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-rose-500" /> Salgados
              </h2>
              <div className="flex gap-2 flex-wrap justify-end">
                {precosCatalogo.length > 0 ? (
                  precosCatalogo.map(cat => (
                    <button key={cat.id} onClick={() => addItem(cat.categoria)}
                      className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl font-semibold transition-all">
                      + {cat.categoria}
                    </button>
                  ))
                ) : (
                  <button onClick={() => addItem('')}
                    className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl font-semibold">
                    <Plus className="h-3 w-3 inline mr-1" />Adicionar item
                  </button>
                )}
              </div>
            </div>

            {itens.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-xl">
                <Package className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Clique nos botões acima para adicionar salgados.</p>
                {precosCatalogo.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Configure os preços em <strong>Configurações → Preços de Eventos</strong> primeiro.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-bold text-gray-500 uppercase">
                  <div className="col-span-3">Categoria</div>
                  <div className="col-span-4">Descrição</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-2 text-right">Preço/cento</div>
                  <div className="col-span-1"></div>
                </div>
                {itens.map((item, idx) => {
                  const sub = ((Number(item.quantidade) || 0) / 100) * (Number(item.preco_por_cento) || 0);
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2">
                      <div className="col-span-3">
                        <input type="text" value={item.categoria} onChange={e => updateItem(idx, 'categoria', e.target.value)}
                          placeholder="Categoria" className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:border-rose-400 focus:outline-none"
                          style={{ fontSize: '13px' }} />
                      </div>
                      <div className="col-span-4">
                        <input type="text" value={item.descricao} onChange={e => updateItem(idx, 'descricao', e.target.value)}
                          placeholder="Ex: mistos" className="w-full h-8 px-2 border border-gray-200 rounded-lg text-xs focus:border-rose-400 focus:outline-none"
                          style={{ fontSize: '13px' }} />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.quantidade} onChange={e => updateItem(idx, 'quantidade', e.target.value)}
                          placeholder="0" className="w-full h-8 px-2 text-center border border-gray-200 rounded-lg text-xs font-bold focus:border-rose-400 focus:outline-none"
                          style={{ fontSize: '13px' }} />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.preco_por_cento} onChange={e => updateItem(idx, 'preco_por_cento', e.target.value)}
                          placeholder="0.00" className="w-full h-8 px-2 text-right border border-gray-200 rounded-lg text-xs font-bold focus:border-rose-400 focus:outline-none"
                          style={{ fontSize: '13px' }} />
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {sub > 0 && (
                        <div className="col-span-12 text-right text-xs font-semibold text-rose-600 pr-6">
                          = {fmt(sub)}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <p className="text-sm font-bold text-gray-700">Subtotal salgados: <span className="text-rose-600">{fmt(subtotalSalgados)}</span></p>
                </div>
              </div>
            )}
          </div>

          {/* Serviços */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-rose-500" /> Serviços Adicionais
              </h2>
              <button onClick={addServico}
                className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl font-semibold">
                <Plus className="h-3 w-3 inline mr-1" />Adicionar serviço
              </button>
            </div>
            <div className="space-y-2">
              {servicos.map((sv, idx) => (
                <div key={sv.id} className="flex gap-2 items-start bg-gray-50 rounded-xl p-3">
                  <textarea value={sv.descricao} onChange={e => updateServico(idx, 'descricao', e.target.value)}
                    placeholder="Descrição do serviço..." rows={2}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-rose-400 focus:outline-none resize-none"
                    style={{ fontSize: '14px' }} />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm text-gray-500">R$</span>
                    <input type="number" value={sv.valor} onChange={e => updateServico(idx, 'valor', e.target.value)}
                      placeholder="0,00" className="w-24 h-8 px-2 text-right border border-gray-200 rounded-lg text-sm font-bold focus:border-rose-400 focus:outline-none"
                      style={{ fontSize: '14px' }} />
                    <button onClick={() => removeServico(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {servicos.length > 0 && (
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <p className="text-sm font-bold text-gray-700">Subtotal serviços: <span className="text-rose-600">{fmt(subtotalServicos)}</span></p>
                </div>
              )}
            </div>
          </div>

          {/* Resumo financeiro */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-rose-500" /> Resumo Financeiro
            </h2>
            <div className="bg-rose-50 rounded-2xl p-5 border border-rose-100 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Salgados ({totalSalgados} un.)</span>
                <span className="font-semibold text-gray-900">{fmt(subtotalSalgados)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Serviços</span>
                <span className="font-semibold text-gray-900">{fmt(subtotalServicos)}</span>
              </div>
              <div className="border-t border-rose-200 pt-3 flex justify-between items-center">
                <span className="font-bold text-gray-900">Total do Orçamento</span>
                <span className="text-2xl font-black text-rose-600">{fmt(totalGeral)}</span>
              </div>
            </div>

            {/* Condições de pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Entrada (%)</label>
                <input type="number" value={form.percentual_entrada}
                  onChange={e => setForm(p => ({...p, percentual_entrada: e.target.value}))}
                  min={0} max={100} className={input} style={{ fontSize: '16px' }} />
                <p className="text-xs text-gray-500">= {fmt(valorEntrada)}</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Restante ({fmt(valorRestante)})</label>
                <input type="text" value={form.forma_pagamento_restante}
                  onChange={e => setForm(p => ({...p, forma_pagamento_restante: e.target.value}))}
                  placeholder="Ex: no dia do evento" className={input} style={{ fontSize: '16px' }} />
              </div>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pb-6">
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={() => handleSave(false)} disabled={isSaving}
              className="flex-1 gap-2 bg-rose-600 hover:bg-rose-700 h-12 font-bold">
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Salvar Evento
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isSaving}
              variant="outline" className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 h-12 font-bold">
              <FileText className="h-5 w-5" /> Salvar e Gerar PDF
            </Button>
          </div>

        </div>
      </DashboardLayout>
    </>
  );
}