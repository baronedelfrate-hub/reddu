import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Calendar, Plus, MapPin, Users, Clock, ChevronRight, Search, CheckCircle2, XCircle, FileText, Star } from 'lucide-react';

const STATUS_CONFIG = {
  orcamento:  { label: 'Orçamento',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  realizado:  { label: 'Realizado',  color: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600 border-red-200' },
};

export default function EventosPage() {
  const { empresaId } = useAuth();
  const navigate = useNavigate();
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [mesSelecionado, setMesSelecionado] = useState(new Date());

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('-').reverse().join('/'); };
  const formatTime = (t) => { if (!t) return ''; return t.slice(0, 5); };

  useEffect(() => {
    if (!empresaId) return;
    loadEventos();
  }, [empresaId, mesSelecionado]);

  const loadEventos = async () => {
    setIsLoading(true);
    const inicio = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth(), 1).toISOString().slice(0, 10);
    const fim = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 0).toISOString().slice(0, 10);
    const { data } = await supabase.from('eventos')
      .select('*').eq('empresa_id', empresaId)
      .gte('data_evento', inicio).lte('data_evento', fim)
      .order('data_evento');
    setEventos(data || []);
    setIsLoading(false);
  };

  const eventosFiltrados = eventos.filter(e => {
    const matchSearch = !search || e.nome_cliente.toLowerCase().includes(search.toLowerCase()) || e.local_evento?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  // Agrupa por dia para o mini calendário
  const eventosPorDia = {};
  eventos.forEach(e => {
    const dia = e.data_evento;
    if (!eventosPorDia[dia]) eventosPorDia[dia] = [];
    eventosPorDia[dia].push(e);
  });

  const diasNoMes = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 0).getDate();
  const primeiroDia = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth(), 1).getDay();
  const nomeMes = mesSelecionado.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const proximosEventos = [...eventos].filter(e => e.status !== 'cancelado')
    .sort((a, b) => a.data_evento.localeCompare(b.data_evento)).slice(0, 3);

  return (
    <>
      <Helmet><title>Eventos - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Eventos</h1>
                <p className="text-gray-500 text-sm mt-0.5">Orçamentos e agenda de festas e eventos.</p>
              </div>
            </div>
            <Button onClick={() => navigate('/dashboard/eventos/novo')} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <Plus className="h-4 w-4" /> Novo Evento
            </Button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Este mês', value: eventos.length, sub: 'eventos', color: 'text-gray-900' },
              { label: 'Confirmados', value: eventos.filter(e => e.status === 'confirmado').length, sub: 'eventos', color: 'text-blue-600' },
              { label: 'Em orçamento', value: eventos.filter(e => e.status === 'orcamento').length, sub: 'aguardando', color: 'text-amber-600' },
              { label: 'Receita prevista', value: fmt(eventos.filter(e => e.status !== 'cancelado').reduce((s, e) => s + Number(e.valor_total || 0), 0)), sub: 'confirmados+orcamentos', color: 'text-rose-600', isValue: true },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">{k.label}</p>
                <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Calendário */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setMesSelecionado(new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() - 1, 1))}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
                <h3 className="font-bold text-gray-900 text-sm capitalize">{nomeMes}</h3>
                <button onClick={() => setMesSelecionado(new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1))}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['D','S','T','Q','Q','S','S'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-gray-400">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(primeiroDia).fill(null).map((_, i) => <div key={`e${i}`} />)}
                {Array(diasNoMes).fill(null).map((_, i) => {
                  const dia = i + 1;
                  const key = `${mesSelecionado.getFullYear()}-${String(mesSelecionado.getMonth()+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                  const evs = eventosPorDia[key] || [];
                  const hoje = new Date().toISOString().slice(0,10) === key;
                  return (
                    <div key={dia} className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative cursor-pointer
                      ${hoje ? 'bg-rose-600 text-white font-bold' : evs.length > 0 ? 'bg-rose-50 text-rose-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {dia}
                      {evs.length > 0 && !hoje && (
                        <div className="absolute bottom-0.5 flex gap-0.5">
                          {evs.slice(0,3).map((_, j) => <div key={j} className="w-1 h-1 rounded-full bg-rose-500" />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Próximos */}
              {proximosEventos.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase">Próximos</p>
                  {proximosEventos.map(e => (
                    <button key={e.id} onClick={() => navigate(`/dashboard/eventos/${e.id}`)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-left">
                      <div className="w-8 h-8 bg-rose-50 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-xs font-black text-rose-600 leading-none">{e.data_evento.split('-')[2]}</span>
                        <span className="text-xs text-rose-400 leading-none">{e.data_evento.split('-')[1]}/{e.data_evento.split('-')[0].slice(2)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{e.nome_cliente}</p>
                        <p className="text-xs text-gray-400">{fmt(e.valor_total)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista */}
            <div className="lg:col-span-2 space-y-4">
              {/* Filtros */}
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Buscar cliente ou local..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none"
                    style={{ fontSize: '16px' }} />
                </div>
                <div className="flex gap-1">
                  {[['todos','Todos'],['orcamento','Orçamento'],['confirmado','Confirmado'],['realizado','Realizado']].map(([v,l]) => (
                    <button key={v} onClick={() => setFiltroStatus(v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filtroStatus === v ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" /></div>
              ) : eventosFiltrados.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                  <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhum evento encontrado.</p>
                  <Button onClick={() => navigate('/dashboard/eventos/novo')} className="mt-4 gap-2 bg-rose-600 hover:bg-rose-700">
                    <Plus className="h-4 w-4" /> Criar primeiro evento
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {eventosFiltrados.map(e => {
                    const st = STATUS_CONFIG[e.status] || STATUS_CONFIG.orcamento;
                    return (
                      <button key={e.id} onClick={() => navigate(`/dashboard/eventos/${e.id}`)}
                        className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-rose-200 hover:shadow-md transition-all text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 bg-rose-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-rose-100">
                              <span className="text-base font-black text-rose-600 leading-none">{e.data_evento.split('-')[2]}</span>
                              <span className="text-xs text-rose-400">{['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][parseInt(e.data_evento.split('-')[1])-1]}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="font-bold text-gray-900">{e.nome_cliente}</p>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                {e.horario_inicio && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(e.horario_inicio)}</span>}
                                {e.num_convidados && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{e.num_convidados} pessoas</span>}
                                {e.local_evento && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.local_evento}</span>}
                                {e.total_salgados > 0 && <span className="flex items-center gap-1"><Star className="h-3 w-3" />{e.total_salgados} salgados</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-black text-rose-600">{fmt(e.valor_total)}</p>
                            {e.valor_entrada > 0 && <p className="text-xs text-gray-400">Entrada: {fmt(e.valor_entrada)}</p>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}