import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Calendar, ArrowLeft, Edit2, FileText, Trash2, Users, Clock, MapPin, DollarSign, Package, CheckCircle2, Loader2, Share2, Copy } from 'lucide-react';

const STATUS_CONFIG = {
  orcamento:  { label: 'Orçamento',  color: 'bg-amber-100 text-amber-700' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700' },
  realizado:  { label: 'Realizado',  color: 'bg-green-100 text-green-700' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
};

export default function EventoDetalhePage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const [evento, setEvento] = useState(null);
  const [itens, setItens] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('-').reverse().join('/'); };
  const formatTime = (t) => { if (!t) return ''; return t.slice(0,5); };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const load = async () => {
    setIsLoading(true);
    const [{ data: ev }, { data: its }, { data: srvs }] = await Promise.all([
      supabase.from('eventos').select('*').eq('id', id).single(),
      supabase.from('evento_itens').select('*').eq('evento_id', id).order('created_at'),
      supabase.from('evento_servicos').select('*').eq('evento_id', id).order('created_at'),
    ]);
    setEvento(ev);
    setItens(its || []);
    setServicos(srvs || []);
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm('Excluir este evento?')) return;
    await supabase.from('eventos').delete().eq('id', id);
    toast({ title: 'Evento excluído.' });
    navigate('/dashboard/eventos');
  };

  const handleStatusChange = async (status) => {
    await supabase.from('eventos').update({ status }).eq('id', id);
    setEvento(p => ({ ...p, status }));
    toast({ title: 'Status atualizado!', className: 'bg-green-600 text-white border-none' });
  };

  if (isLoading) return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rose-500" /></div></DashboardLayout>;
  if (!evento) return <DashboardLayout><div className="text-center py-20 text-gray-500">Evento não encontrado.</div></DashboardLayout>;

  const st = STATUS_CONFIG[evento.status] || STATUS_CONFIG.orcamento;

  return (
    <>
      <Helmet><title>{evento.nome_cliente} - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => navigate('/dashboard/eventos')} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${st.color}`}>{st.label}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/dashboard/eventos/${id}/pdf`)} className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50">
                <FileText className="h-4 w-4" /> Gerar PDF
              </Button>
              <Button variant="outline" onClick={() => {
                const link = `${window.location.origin}/orcamento/${evento?.token_aprovacao}`;
                navigator.clipboard.writeText(link);
                toast({ title: 'Link copiado!', description: 'Envie para o cliente aprovar.', className: 'bg-green-600 text-white border-none' });
              }} className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
                <Share2 className="h-4 w-4" /> Enviar ao Cliente
              </Button>
              <Button variant="outline" onClick={() => navigate(`/dashboard/eventos/${id}/editar`)} className="gap-2">
                <Edit2 className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" onClick={handleDelete} className="gap-2 text-red-500 border-red-200 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Header do evento */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border border-rose-100">
                <span className="text-2xl font-black text-rose-600 leading-none">{evento.data_evento.split('-')[2]}</span>
                <span className="text-sm text-rose-400">{['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][parseInt(evento.data_evento.split('-')[1])-1]}/{evento.data_evento.split('-')[0].slice(2)}</span>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">{evento.nome_cliente}</h1>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                  {evento.horario_inicio && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />Início: {formatTime(evento.horario_inicio)}</span>}
                  {evento.horario_chegada && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />Chegada equipe: {formatTime(evento.horario_chegada)}</span>}
                  {evento.num_convidados && <span className="flex items-center gap-1"><Users className="h-4 w-4" />{evento.num_convidados} convidados</span>}
                  {evento.local_evento && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{evento.local_evento}</span>}
                </div>
                {evento.observacoes && <p className="text-sm text-gray-500 mt-2 italic">{evento.observacoes}</p>}
              </div>
            </div>

            {/* Alterar status */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-600 self-center">Status:</span>
              {['orcamento','confirmado','realizado','cancelado'].map(s => (
                <button key={s} onClick={() => handleStatusChange(s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${evento.status === s ? STATUS_CONFIG[s].color + ' border-current' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>

            {/* Link de aprovação */}
            {evento.token_aprovacao && !evento.aprovado_em && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Link para aprovação do cliente:</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-600 flex-1 truncate font-mono">
                    {window.location.origin}/orcamento/{evento.token_aprovacao}
                  </p>
                  <button onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/orcamento/${evento.token_aprovacao}`);
                    toast({ title: 'Link copiado!', className: 'bg-green-600 text-white border-none' });
                  }} className="text-xs text-green-600 hover:text-green-700 font-semibold flex-shrink-0 flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Copiar
                  </button>
                </div>
              </div>
            )}
            {evento.aprovado_em && (
              <div className="mt-3 pt-3 border-t border-gray-100 bg-green-50 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Aprovado por {evento.aprovado_nome}
                  {evento.aprovado_cpf && (
                    <span className="font-normal text-xs text-green-600">
                      · CPF: {evento.aprovado_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {new Date(evento.aprovado_em).toLocaleString('pt-BR')} · IP: {evento.aprovado_ip}
                </p>
              </div>
            )}
          </div>

          {/* Salgados */}
          {itens.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-rose-500" /> Salgados
              </h2>
              <div className="space-y-2">
                {itens.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{item.quantidade} {item.categoria} {item.descricao && `(${item.descricao})`}</p>
                      <p className="text-xs text-gray-500">{fmt(item.preco_por_cento)} o cento</p>
                    </div>
                    <span className="font-bold text-rose-600">{fmt(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-600">Total: {evento.total_salgados} salgados</span>
                  <span className="font-bold text-gray-900">{fmt(itens.reduce((s,i) => s + Number(i.subtotal||0), 0))}</span>
                </div>
              </div>
            </div>
          )}

          {/* Serviços */}
          {servicos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-rose-500" /> Serviços
              </h2>
              <div className="space-y-2">
                {servicos.map(sv => (
                  <div key={sv.id} className="flex items-start justify-between gap-4 bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-700 flex-1">{sv.descricao}</p>
                    <span className="font-bold text-rose-600 flex-shrink-0">{fmt(sv.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financeiro */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-rose-500" /> Financeiro
            </h2>
            <div className="bg-rose-50 rounded-2xl p-5 border border-rose-100 space-y-3">
              <div className="flex justify-between text-lg font-black">
                <span className="text-gray-900">Investimento Total</span>
                <span className="text-rose-600">{fmt(evento.valor_total)}</span>
              </div>
              <div className="border-t border-rose-200 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Entrada ({evento.percentual_entrada}%)</span>
                  <span className="font-bold text-gray-900">{fmt(evento.valor_entrada)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Restante ({evento.forma_pagamento_restante})</span>
                  <span className="font-bold text-gray-900">{fmt(evento.valor_restante)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-6">
            <Button onClick={() => navigate(`/dashboard/eventos/${id}/pdf`)} className="w-full gap-2 bg-rose-600 hover:bg-rose-700 h-12 font-bold">
              <FileText className="h-5 w-5" /> Gerar PDF do Orçamento
            </Button>
          </div>

        </div>
      </DashboardLayout>
    </>
  );
}