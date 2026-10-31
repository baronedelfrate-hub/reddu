import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  BarChart3,
  Send,
  Inbox,
  CheckCheck,
  Eye,
  AlertCircle,
  Megaphone,
  Download,
} from 'lucide-react';

const STATUS_CAMPANHA_LABEL = {
  rascunho: 'Rascunho',
  em_andamento: 'Em andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const STATUS_DISPARO_LABEL = {
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviado',
  erro: 'Erro',
  cancelado: 'Cancelado',
};

const STATUS_MENSAGEM_LABEL = {
  pendente: 'Pendente',
  enviado: 'Enviado (sem confirmação ainda)',
  entregue: 'Entregue',
  lido: 'Lido',
  erro: 'Erro no WhatsApp',
};

function formatarDataLabel(dataIso) {
  const [, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}`;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasAtrasISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export default function WhatsAppRelatorioPage() {
  const { empresaId } = useAuth();

  const [dataInicio, setDataInicio] = useState(diasAtrasISO(29));
  const [dataFim, setDataFim] = useState(hojeISO());
  const [loading, setLoading] = useState(true);

  const [mensagens, setMensagens] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [statusPorEvolutionId, setStatusPorEvolutionId] = useState({});
  const [destinatariosPorCampanha, setDestinatariosPorCampanha] = useState({});
  const [destinatariosCompletos, setDestinatariosCompletos] = useState([]);

  const fetchRelatorio = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const inicioISO = `${dataInicio}T00:00:00.000Z`;
      const fimISO = `${dataFim}T23:59:59.999Z`;

      const { data: mensagensData, error: mensagensError } = await supabase
        .from('whatsapp_mensagens')
        .select('id, from_me, status, timestamp_mensagem')
        .eq('empresa_id', empresaId)
        .gte('timestamp_mensagem', inicioISO)
        .lte('timestamp_mensagem', fimISO);

      if (mensagensError) throw mensagensError;
      setMensagens(mensagensData || []);

      const { data: campanhasData, error: campanhasError } = await supabase
        .from('whatsapp_campanhas')
        .select('*')
        .eq('empresa_id', empresaId)
        .gte('created_at', inicioISO)
        .lte('created_at', fimISO)
        .order('created_at', { ascending: false });

      if (campanhasError) throw campanhasError;
      setCampanhas(campanhasData || []);

      const campanhaIds = (campanhasData || []).map((c) => c.id);
      if (campanhaIds.length > 0) {
        const { data: destData } = await supabase
          .from('whatsapp_campanha_destinatarios')
          .select('*, whatsapp_campanhas(nome)')
          .in('campanha_id', campanhaIds)
          .order('created_at', { ascending: true });

        setDestinatariosCompletos(destData || []);

        const agrupado = {};
        const todosIds = [];
        (destData || []).forEach((d) => {
          if (d.status !== 'enviado' || !d.evolution_message_id) return;
          if (!agrupado[d.campanha_id]) agrupado[d.campanha_id] = [];
          agrupado[d.campanha_id].push(d.evolution_message_id);
          todosIds.push(d.evolution_message_id);
        });
        setDestinatariosPorCampanha(agrupado);

        if (todosIds.length > 0) {
          const { data: msgStatusData } = await supabase
            .from('whatsapp_mensagens')
            .select('evolution_message_id, status')
            .eq('empresa_id', empresaId)
            .in('evolution_message_id', todosIds);

          const mapa = {};
          (msgStatusData || []).forEach((m) => {
            mapa[m.evolution_message_id] = m.status;
          });
          setStatusPorEvolutionId(mapa);
        } else {
          setStatusPorEvolutionId({});
        }
      } else {
        setDestinatariosCompletos([]);
        setDestinatariosPorCampanha({});
        setStatusPorEvolutionId({});
      }
    } catch (error) {
      console.error('Erro ao carregar relatório do WhatsApp:', error);
    } finally {
      setLoading(false);
    }
  }, [empresaId, dataInicio, dataFim]);

  useEffect(() => {
    fetchRelatorio();
  }, [fetchRelatorio]);

  const kpis = useMemo(() => {
    const enviadas = mensagens.filter((m) => m.from_me);
    const recebidas = mensagens.filter((m) => !m.from_me);
    const entreguesOuLidas = enviadas.filter((m) => m.status === 'entregue' || m.status === 'lido').length;
    const lidas = enviadas.filter((m) => m.status === 'lido').length;
    const erros = enviadas.filter((m) => m.status === 'erro').length;

    return {
      totalEnviadas: enviadas.length,
      totalRecebidas: recebidas.length,
      taxaEntrega: enviadas.length ? Math.round((entreguesOuLidas / enviadas.length) * 100) : 0,
      taxaLeitura: enviadas.length ? Math.round((lidas / enviadas.length) * 100) : 0,
      erros,
    };
  }, [mensagens]);

  const statusBreakdown = useMemo(() => {
    const enviadas = mensagens.filter((m) => m.from_me);
    const total = enviadas.length || 1;
    const contagem = { enviado: 0, entregue: 0, lido: 0, erro: 0, pendente: 0 };
    enviadas.forEach((m) => {
      if (contagem[m.status] !== undefined) contagem[m.status]++;
    });
    return [
      { label: 'Enviado', valor: contagem.enviado, cor: 'bg-gray-400', pct: Math.round((contagem.enviado / total) * 100) },
      { label: 'Entregue', valor: contagem.entregue, cor: 'bg-blue-500', pct: Math.round((contagem.entregue / total) * 100) },
      { label: 'Lido', valor: contagem.lido, cor: 'bg-emerald-500', pct: Math.round((contagem.lido / total) * 100) },
      { label: 'Erro', valor: contagem.erro, cor: 'bg-red-500', pct: Math.round((contagem.erro / total) * 100) },
    ];
  }, [mensagens]);

  const dadosPorDia = useMemo(() => {
    const mapa = {};
    mensagens.forEach((m) => {
      const dia = m.timestamp_mensagem?.slice(0, 10);
      if (!dia) return;
      if (!mapa[dia]) mapa[dia] = { data: dia, Enviadas: 0, Recebidas: 0 };
      if (m.from_me) mapa[dia].Enviadas++;
      else mapa[dia].Recebidas++;
    });
    return Object.values(mapa)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ ...d, label: formatarDataLabel(d.data) }));
  }, [mensagens]);

  const campanhasComTaxas = useMemo(() => {
    return campanhas.map((c) => {
      const ids = destinatariosPorCampanha[c.id] || [];
      let entregues = 0;
      let lidas = 0;
      ids.forEach((evoId) => {
        const status = statusPorEvolutionId[evoId];
        if (status === 'entregue' || status === 'lido') entregues++;
        if (status === 'lido') lidas++;
      });
      const base = c.total_enviados || 0;
      return {
        ...c,
        taxaEntrega: base ? Math.round((entregues / base) * 100) : 0,
        taxaLeitura: base ? Math.round((lidas / base) * 100) : 0,
      };
    });
  }, [campanhas, destinatariosPorCampanha, statusPorEvolutionId]);

  const handleExportarExcel = () => {
    const linhas = destinatariosCompletos.map((d) => {
      const statusMensagem = d.evolution_message_id ? statusPorEvolutionId[d.evolution_message_id] : null;
      return {
        Campanha: d.whatsapp_campanhas?.nome || '-',
        Contato: d.nome || '-',
        Telefone: d.telefone,
        'Status do Disparo': STATUS_DISPARO_LABEL[d.status] || d.status,
        'Status da Mensagem': statusMensagem
          ? STATUS_MENSAGEM_LABEL[statusMensagem] || statusMensagem
          : d.status === 'enviado'
          ? 'Enviado (sem confirmação ainda)'
          : '-',
        'Mensagem Enviada': d.mensagem_enviada || '-',
        'Enviado em': d.enviado_em ? new Date(d.enviado_em).toLocaleString('pt-BR') : '-',
        Erro: d.erro_detalhe || '-',
      };
    });

    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [
      { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
      { wch: 26 }, { wch: 40 }, { wch: 18 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disparos');
    XLSX.writeFile(wb, `disparos_whatsapp_${dataInicio}_a_${dataFim}.xlsx`);
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>WhatsApp - Relatório - Estoque 360</title>
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-primary" />
                Relatório de Disparo
              </h1>
              <p className="text-gray-600 mt-1">Volume de mensagens, taxa de entrega/leitura e desempenho das campanhas.</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">De</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="bg-white text-gray-900 border-gray-300"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Até</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="bg-white text-gray-900 border-gray-300"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center flex flex-col items-center bg-white rounded-lg shadow border border-gray-200">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent mb-4"></div>
              <p className="text-gray-600">Carregando relatório...</p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-emerald-100 text-emerald-700 rounded-lg p-2.5">
                      <Send className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{kpis.totalEnviadas}</p>
                      <p className="text-xs text-gray-500">Mensagens enviadas</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-700 rounded-lg p-2.5">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{kpis.totalRecebidas}</p>
                      <p className="text-xs text-gray-500">Mensagens recebidas</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-sky-100 text-sky-700 rounded-lg p-2.5">
                      <CheckCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{kpis.taxaEntrega}%</p>
                      <p className="text-xs text-gray-500">Taxa de entrega</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className="bg-purple-100 text-purple-700 rounded-lg p-2.5">
                      <Eye className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{kpis.taxaLeitura}%</p>
                      <p className="text-xs text-gray-500">Taxa de leitura</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Gráfico por dia */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">Enviadas x Recebidas por dia</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dadosPorDia.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-12">Sem mensagens no período selecionado.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dadosPorDia} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Enviadas" fill="#059669" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Recebidas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Status das mensagens enviadas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Status das enviadas</CardTitle>
                    <CardDescription>{kpis.totalEnviadas} mensagens no período</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {statusBreakdown.map((s) => (
                      <div key={s.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{s.label}</span>
                          <span className="text-gray-500">
                            {s.valor} ({s.pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${s.cor}`} style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Campanhas */}
              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Megaphone className="h-5 w-5 text-muted-foreground" /> Desempenho das campanhas
                    </CardTitle>
                    <CardDescription>Campanhas de disparo em massa criadas no período selecionado.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportarExcel}
                    disabled={destinatariosCompletos.length === 0}
                    className="gap-2 flex-shrink-0"
                  >
                    <Download className="h-4 w-4" /> Exportar Excel
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {campanhasComTaxas.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Nenhuma campanha criada nesse período.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Campanha</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Contatos</TableHead>
                            <TableHead className="text-center">Enviados</TableHead>
                            <TableHead className="text-center">Erros</TableHead>
                            <TableHead className="text-center">Taxa de entrega</TableHead>
                            <TableHead className="text-center">Taxa de leitura</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campanhasComTaxas.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium text-gray-900">{c.nome}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{STATUS_CAMPANHA_LABEL[c.status] || c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-center text-gray-600">{c.total_contatos}</TableCell>
                              <TableCell className="text-center text-gray-600">{c.total_enviados}</TableCell>
                              <TableCell className="text-center text-gray-600">
                                {c.total_erros > 0 ? (
                                  <span className="text-red-600 font-medium">{c.total_erros}</span>
                                ) : (
                                  c.total_erros
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500"
                                      style={{ width: `${c.taxaEntrega}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-9">{c.taxaEntrega}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500"
                                      style={{ width: `${c.taxaLeitura}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-9">{c.taxaLeitura}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}