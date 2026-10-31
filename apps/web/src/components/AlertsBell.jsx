import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Bell, AlertTriangle, Clock, PackageX, DollarSign, Truck, CheckCircle2, PartyPopper } from 'lucide-react';

// Sininho de alertas — fica quieto quando não tem nada pra ver. Só muda de
// cor e mostra a quantidade quando existe algo que realmente precisa de
// atenção. Ao clicar, abre um resumo curto por categoria, sem popup
// automático, sem barulho — exceto o aviso de evento chegando, que é um
// toast suave (não bloqueia a tela, some sozinho) mostrado no máximo uma
// vez por dia.
export default function AlertsBell({ empresaId }) {
  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchAlertas = useCallback(async () => {
    if (!empresaId) return;
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const em5Dias = new Date(hoje);
      em5Dias.setDate(em5Dias.getDate() + 5);
      const hojeStr = hoje.toISOString().slice(0, 10);
      const em5DiasStr = em5Dias.toISOString().slice(0, 10);

      const [lotesRes, produtosRes, financeiroRes, carregamentoRes, eventosRes] = await Promise.all([
        supabase.from('lotes')
          .select('id, produto_id, quantidade, data_validade')
          .eq('empresa_id', empresaId).eq('ativo', true).eq('lote_devolvido', false)
          .gt('quantidade', 0).not('data_validade', 'is', null),
        supabase.from('produtos')
          .select('id, estoque_minimo')
          .eq('empresa_id', empresaId).gt('estoque_minimo', 0),
        supabase.from('vendas')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId).eq('financeiro_baixado', false),
        supabase.from('carregamentos_pendentes')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId).eq('status', 'pendente'),
        supabase.from('eventos')
          .select('id, nome_cliente, data_evento, status')
          .eq('empresa_id', empresaId)
          .gte('data_evento', hojeStr).lte('data_evento', em5DiasStr)
          .not('status', 'in', '(realizado,cancelado)')
          .order('data_evento'),
      ]);

      let vencidos = 0, vencendo = 0;
      const estoquePorProduto = {};
      (lotesRes.data || []).forEach(l => {
        const [ano, mes, dia] = l.data_validade.split('-').map(Number);
        const validade = new Date(ano, mes - 1, dia);
        const diffDias = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias < 0) vencidos++;
        else if (diffDias <= 7) vencendo++;
        estoquePorProduto[l.produto_id] = (estoquePorProduto[l.produto_id] || 0) + Number(l.quantidade || 0);
      });

      let estoqueBaixo = 0;
      (produtosRes.data || []).forEach(p => {
        const atual = estoquePorProduto[p.id] || 0;
        if (atual <= p.estoque_minimo) estoqueBaixo++;
      });

      const eventosProximos = eventosRes.data || [];

      const lista = [
        {
          id: 'vencidos', label: 'Produto vencido', qtd: vencidos,
          icon: AlertTriangle, cor: 'text-red-600', bg: 'bg-red-50',
          rota: '/dashboard/alertas',
        },
        {
          id: 'vencendo', label: 'Vencendo em 7 dias', qtd: vencendo,
          icon: Clock, cor: 'text-amber-600', bg: 'bg-amber-50',
          rota: '/dashboard/alertas',
        },
        {
          id: 'estoque', label: 'Estoque acabando', qtd: estoqueBaixo,
          icon: PackageX, cor: 'text-orange-600', bg: 'bg-orange-50',
          rota: '/dashboard/alertas',
        },
        {
          id: 'carregamento', label: 'Conferência de carga pendente', qtd: carregamentoRes.count || 0,
          icon: Truck, cor: 'text-blue-600', bg: 'bg-blue-50',
          rota: '/dashboard/conferencia-carregamento',
        },
        {
          id: 'financeiro', label: 'Pagamento pendente de baixa', qtd: financeiroRes.count || 0,
          icon: DollarSign, cor: 'text-purple-600', bg: 'bg-purple-50',
          rota: '/dashboard/relatorio-vendas-pendentes',
        },
        {
          id: 'eventos',
          label: eventosProximos.length === 1
            ? `Evento em breve: ${eventosProximos[0].nome_cliente}`
            : 'Eventos nos próximos 5 dias',
          qtd: eventosProximos.length,
          icon: PartyPopper, cor: 'text-pink-600', bg: 'bg-pink-50',
          rota: eventosProximos.length === 1 ? `/dashboard/eventos/${eventosProximos[0].id}` : '/dashboard/eventos',
        },
      ];

      setAlertas(lista);

      // Aviso suave (toast, não bloqueia nada) só na primeira vez que a
      // pessoa abre o sistema no dia — não repete a cada 3 minutos.
      if (eventosProximos.length > 0) {
        const chaveHoje = `reddu_toast_eventos_${empresaId}_${hojeStr}`;
        if (!localStorage.getItem(chaveHoje)) {
          localStorage.setItem(chaveHoje, '1');
          eventosProximos.forEach(ev => {
            const [ano, mes, dia] = ev.data_evento.split('-').map(Number);
            const dataEv = new Date(ano, mes - 1, dia);
            const diffDias = Math.round((dataEv.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            const quando = diffDias <= 0 ? 'é hoje' : diffDias === 1 ? 'começa amanhã' : `começa em ${diffDias} dias`;
            toast({
              title: '🎉 Evento chegando',
              description: `${ev.nome_cliente} ${quando}.`,
            });
          });
        }
      }
    } catch (err) {
      console.error('[AlertsBell] Erro ao buscar alertas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => {
    fetchAlertas();
    // Atualiza a cada 3 minutos — não precisa ser em tempo real, é só um
    // indicador, não um painel de monitoramento.
    const interval = setInterval(fetchAlertas, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlertas]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalAlertas = alertas.reduce((s, a) => s + a.qtd, 0);
  const temAlertas = totalAlertas > 0;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2.5 rounded-full transition-colors ${
          temAlertas ? 'text-red-600 hover:bg-red-50' : 'text-gray-400 hover:bg-gray-100'
        }`}
        aria-label="Alertas"
      >
        <Bell className="h-7 w-7" />
        {temAlertas && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center border-2 border-white">
            {totalAlertas > 9 ? '9+' : totalAlertas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">Alertas</p>
            {!isLoading && (
              <span className="text-xs text-gray-400">
                {temAlertas ? `${totalAlertas} no total` : 'tudo certo'}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Carregando...</div>
          ) : !temAlertas ? (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <p className="text-xs text-gray-500">Nenhum alerta pendente no momento.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {alertas.filter(a => a.qtd > 0).map(a => (
                <button
                  key={a.id}
                  onClick={() => { setOpen(false); navigate(a.rota); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.bg}`}>
                    <a.icon className={`h-4 w-4 ${a.cor}`} />
                  </div>
                  <span className="flex-1 text-sm text-gray-700">{a.label}</span>
                  <span className={`text-sm font-bold ${a.cor}`}>{a.qtd}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}