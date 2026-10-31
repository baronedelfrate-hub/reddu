import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const CONTRATO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADO: FL INDÚSTRIA DE PRODUTOS CONGELADOS LTDA – TÔ COXINHA, CNPJ nº 63.982.596/0001-92.
CONTRATANTE: Conforme dados constantes no orçamento.

A assinatura deste orçamento implica a aceitação integral deste Contrato de Prestação de Serviços.

1. OBJETO
O CONTRATADO fornecerá os produtos e serviços descritos no orçamento, incluindo, quando contratado, o serviço de fritura no local do evento, com fornecimento de profissional, equipamentos, óleo e demais insumos necessários para a execução do serviço.

2. EXECUÇÃO DOS SERVIÇOS
O CONTRATANTE deverá informar corretamente a data, horário e local do evento. O CONTRATADO executará os serviços observando padrões de qualidade, higiene e segurança. Por segurança, recomenda-se que convidados, especialmente crianças, permaneçam afastados da área de trabalho durante a operação dos equipamentos.

3. PAGAMENTO
Os valores e condições de pagamento serão aqueles constantes no orçamento. A reserva da data somente será considerada confirmada após o pagamento acordado entre as partes.

4. CANCELAMENTO E REMARCAÇÃO
Em caso de cancelamento pelo CONTRATANTE:
• Mais de 30 dias antes do evento: devolução integral dos valores pagos, descontadas eventuais taxas financeiras não reembolsáveis;
• Entre 30 e 15 dias antes do evento: retenção de 30% do valor contratado;
• Entre 14 e 7 dias antes do evento: retenção de 50% do valor contratado;
• Menos de 7 dias antes do evento: retenção de 100% do valor contratado.

Os percentuais acima consideram a reserva da data, organização da agenda, planejamento operacional e preparação da produção. Remarcações poderão ser realizadas sem multa, mediante solicitação com antecedência mínima de 15 dias e disponibilidade de agenda.

5. EQUIPAMENTOS E IMAGENS
Os equipamentos utilizados pertencem ao CONTRATADO. Danos causados por uso indevido, intervenção de terceiros ou atos intencionais poderão ser cobrados do responsável pelos prejuízos comprovados.

O CONTRATANTE autoriza o CONTRATADO a realizar fotografias e vídeos dos produtos, equipamentos, estrutura montada e execução dos serviços para utilização em portfólio, redes sociais e materiais institucionais. As imagens terão como foco os produtos e a operação do CONTRATADO. Caso não concorde, o CONTRATANTE deverá informar sua decisão por escrito antes da realização do evento.

6. DISPOSIÇÕES GERAIS
O CONTRATADO não responderá por atrasos ou impossibilidade de execução decorrentes de caso fortuito, força maior ou situações alheias ao seu controle, nos termos do artigo 393 do Código Civil. As partes comprometem-se a agir de acordo com os princípios da boa-fé e cooperação previstos nos artigos 421 e 422 do Código Civil.

A assinatura física ou eletrônica deste documento possui validade jurídica e produz todos os efeitos legais cabíveis, inclusive nos termos da Medida Provisória nº 2.200-2/2001.

Fica eleito o foro da comarca da sede do CONTRATADO para dirimir eventuais controvérsias decorrentes desta contratação.

DECLARAÇÃO DE ACEITE
Ao assinar eletronicamente o orçamento vinculado a este contrato, o CONTRATANTE declara que leu, compreendeu e concorda integralmente com todos os seus termos e condições.`;

export default function OrcamentoAprovacaoPage() {
  const { token } = useParams();
  const [evento, setEvento] = useState(null);
  const [itens, setItens] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [logoUrl, setLogoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpfCliente, setCpfCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [emailErro, setEmailErro] = useState('');
  const [cpfErro, setCpfErro] = useState('');
  const [aceitouContrato, setAceitouContrato] = useState(false);
  const [isAprovando, setIsAprovando] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  const [erro, setErro] = useState('');

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return ''; return d.split('-').reverse().join('/'); };
  const formatTime = (t) => { if (!t) return ''; return t.slice(0, 5); };

  useEffect(() => { if (token) loadEvento(); }, [token]);

  const loadEvento = async () => {
    try {
      const { data: ev, error } = await supabase.from('eventos').select('*').eq('token_aprovacao', token).single();
      if (error || !ev) { setErro('Orçamento não encontrado.'); setIsLoading(false); return; }
      if (ev.status === 'cancelado') { setErro('Este orçamento foi cancelado.'); setIsLoading(false); return; }
      setEvento(ev);
      if (ev.aprovado_em) setAprovado(true);
      if (ev.aprovado_nome) setNomeCliente(ev.aprovado_nome);
      const [{ data: its }, { data: srvs }] = await Promise.all([
        supabase.from('evento_itens').select('*').eq('evento_id', ev.id).order('created_at'),
        supabase.from('evento_servicos').select('*').eq('evento_id', ev.id).order('created_at'),
      ]);
      setItens(its || []);
      setServicos(srvs || []);
      if (ev.empresa_id) {
        const { data: emp } = await supabase.from('empresas').select('logo_url').eq('id', ev.empresa_id).single();
        if (emp?.logo_url) setLogoUrl(emp.logo_url);
      }
    } catch { setErro('Erro ao carregar orçamento.'); }
    finally { setIsLoading(false); }
  };

  const formatCPF = (v) => {
    const nums = v.replace(/\D/g, '').slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 6) return nums.slice(0, 3) + '.' + nums.slice(3);
    if (nums.length <= 9) return nums.slice(0, 3) + '.' + nums.slice(3, 6) + '.' + nums.slice(6);
    return nums.slice(0, 3) + '.' + nums.slice(3, 6) + '.' + nums.slice(6, 9) + '-' + nums.slice(9);
  };

  const validarCPF = (cpf) => {
    const nums = cpf.replace(/\D/g, '');
    if (nums.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(nums)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i);
    let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(nums[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i);
    r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
    return r === parseInt(nums[10]);
  };

  const handleAprovar = async () => {
    if (!nomeCliente.trim()) { alert('Por favor, confirme seu nome antes de aprovar.'); return; }
    if (!cpfCliente.trim()) { setCpfErro('Informe seu CPF para confirmar.'); return; }
    if (!validarCPF(cpfCliente)) { setCpfErro('CPF inválido. Verifique e tente novamente.'); return; }
    setCpfErro('');
    if (!emailCliente.trim()) { setEmailErro('Informe seu e-mail para receber a confirmação.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente.trim())) { setEmailErro('E-mail inválido.'); return; }
    setEmailErro('');
    if (!aceitouContrato) { alert('Por favor, leia e aceite os termos do contrato.'); return; }
    setIsAprovando(true);
    try {
      let ip = 'desconhecido';
      try { const r = await fetch('https://api.ipify.org?format=json'); const d = await r.json(); ip = d.ip; } catch { }
      const agora = new Date().toISOString();
      const { error } = await supabase.from('eventos').update({
        status: 'confirmado',
        aprovado_em: agora,
        aprovado_ip: ip,
        aprovado_nome: nomeCliente.trim(),
        aprovado_cpf: cpfCliente.replace(/\D/g, ''),
        aprovado_email: emailCliente.trim().toLowerCase(),
        aprovado_user_agent: navigator.userAgent,
      }).eq('token_aprovacao', token);
      if (error) throw error;

      try {
        const { data: empresaData } = await supabase.from('empresas').select('email, nome_fantasia').eq('id', evento.empresa_id).single();
        const cpfFmt = cpfCliente.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        const dataFmt = new Date(agora).toLocaleString('pt-BR');

        if (emailCliente.trim()) {
          const htmlCliente = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
            + '<div style="background:#b91c1c;padding:20px;border-radius:12px 12px 0 0;text-align:center;">'
            + '<h1 style="color:#fff;margin:0;font-size:22px;">Evento Confirmado!</h1>'
            + '<p style="color:#fca5a5;margin:8px 0 0;font-size:14px;">Tô Coxinha</p></div>'
            + '<div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">'
            + '<p style="font-size:15px;color:#374151;margin-bottom:20px;">Olá, <strong>' + nomeCliente.trim() + '</strong>! Seu evento foi confirmado com sucesso!</p>'
            + '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;width:40%;">Evento</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:14px;color:#111;">' + evento.nome_cliente.toUpperCase() + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Data</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;color:#111;">' + (evento.data_evento || '').split('-').reverse().join('/') + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Valor Total</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:14px;font-weight:bold;color:#b91c1c;">R$ ' + Number(evento.valor_total || 0).toFixed(2).replace('.', ',') + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Entrada (' + evento.percentual_entrada + '%)</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;color:#111;">R$ ' + Number(evento.valor_entrada || 0).toFixed(2).replace('.', ',') + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Restante</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:14px;color:#111;">R$ ' + Number(evento.valor_restante || 0).toFixed(2).replace('.', ',') + ' ' + (evento.forma_pagamento_restante || '') + '</td></tr>'
            + '</table>'
            + '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-bottom:16px;"><p style="font-size:13px;color:#991b1b;margin:0;">Para confirmar o evento, realize o pagamento da entrada de <strong>R$ ' + Number(evento.valor_entrada || 0).toFixed(2).replace('.', ',') + '</strong> e entre em contato pelo WhatsApp.</p></div>'
            + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Rua Cerqueira César, 755 | Centro | Indaiatuba/SP · @tocoxinha</p>'
            + '</div></div>';
          await supabase.functions.invoke('send-email', { body: { to: emailCliente.trim(), subject: 'Evento confirmado — ' + evento.nome_cliente, html: htmlCliente } });
        }

        if (empresaData?.email) {
          const htmlEmpresa = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">'
            + '<div style="background:#b91c1c;padding:20px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:#fff;margin:0;font-size:22px;">Evento Confirmado!</h1></div>'
            + '<div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">'
            + '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;width:40%;">Evento</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + evento.nome_cliente.toUpperCase() + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Data</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + (evento.data_evento || '').split('-').reverse().join('/') + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Valor Total</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:13px;font-weight:bold;color:#b91c1c;">R$ ' + Number(evento.valor_total || 0).toFixed(2).replace('.', ',') + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Aprovado por</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + nomeCliente.trim() + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">CPF</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + cpfFmt + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">E-mail</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + emailCliente.trim() + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">Data/Hora</td><td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + dataFmt + '</td></tr>'
            + '<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:bold;color:#6b7280;font-size:13px;">IP</td><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#111;">' + ip + '</td></tr>'
            + '</table>'
            + '<p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">Este e-mail foi gerado automaticamente pelo Estoque 360.</p>'
            + '</div></div>';
          await supabase.functions.invoke('send-email', { body: { to: empresaData.email, subject: 'Evento confirmado — ' + evento.nome_cliente, html: htmlEmpresa } });
        }
      } catch (emailErr) { console.error('Erro ao enviar email:', emailErr); }

      setAprovado(true);
      setEvento(prev => ({ ...prev, status: 'confirmado', aprovado_em: agora }));
    } catch { alert('Erro ao aprovar. Tente novamente.'); }
    finally { setIsAprovando(false); }
  };

  const servicoPrincipal = servicos.find(s => s.descricao?.toLowerCase().includes('serviço') || s.descricao?.toLowerCase().includes('preparo') || s.descricao?.toLowerCase().includes('fritura'));
  const outrosServicos = servicos.filter(s => s !== servicoPrincipal);
  const canAprovar = nomeCliente.trim() && cpfCliente.length >= 14 && emailCliente.includes('@') && aceitouContrato;

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial' }}>
      <Loader2 style={{ width: 36, height: 36, color: '#b91c1c', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (erro) return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial', flexDirection: 'column', gap: 16 }}>
      <XCircle style={{ width: 48, height: 48, color: '#dc2626' }} />
      <p style={{ fontSize: 18, color: '#374151', fontWeight: 'bold' }}>{erro}</p>
    </div>
  );

  const s = { inp: { width: '100%', padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none' } };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'Arial, sans-serif', padding: '0 0 40px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: '#b91c1c', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {logoUrl ? <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} /> : <span style={{ fontSize: 9, fontWeight: 'bold', color: '#b91c1c', textAlign: 'center', lineHeight: 1.3 }}>Tô<br />Coxinha</span>}
          </div>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>Tô Coxinha</span>
        </div>
        <div style={{ color: '#fff', fontSize: 10, textAlign: 'right', lineHeight: 1.6 }}>
          <div>um novo jeito de saborear <strong>salgado quentinho</strong></div>
          <div>e <strong>gostoso</strong> sempre que der fome :)</div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '24px auto', padding: '0 16px' }}>

        {aprovado && (
          <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, padding: '20px 24px', marginBottom: 20, textAlign: 'center' }}>
            <CheckCircle2 style={{ width: 48, height: 48, color: '#16a34a', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 18, fontWeight: 'bold', color: '#15803d' }}>Evento Confirmado!</p>
            <p style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>Aprovado por <strong>{evento.aprovado_nome}</strong> em {new Date(evento.aprovado_em).toLocaleString('pt-BR')}</p>
            {evento.aprovado_cpf && <p style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>CPF: {evento.aprovado_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>}
            <p style={{ fontSize: 12, color: '#4ade80', marginTop: 4 }}>Em breve entraremos em contato para confirmar os detalhes.</p>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.08)', marginBottom: 16 }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ fontSize: 11, fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>ORÇAMENTO DE EVENTO</p>
            <h1 style={{ fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 12 }}>{evento.nome_cliente}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#555' }}>📅 {formatDate(evento.data_evento)}</span>
              {evento.horario_inicio && <span style={{ fontSize: 13, color: '#555' }}>🕐 {formatTime(evento.horario_inicio)}h</span>}
              {evento.num_convidados && <span style={{ fontSize: 13, color: '#555' }}>👥 {evento.num_convidados} convidados</span>}
              {evento.local_evento && <span style={{ fontSize: 13, color: '#555' }}>📍 {evento.local_evento}</span>}
            </div>
          </div>

          {itens.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <p style={{ fontSize: 12, fontWeight: 'bold', color: '#666', textTransform: 'uppercase', marginBottom: 10 }}>Salgados — {evento.total_salgados} unidades</p>
              {itens.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < itens.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 'bold', color: '#222' }}>{item.quantidade} {item.categoria}{item.descricao ? ' (' + item.descricao + ')' : ''}</p>
                    <p style={{ fontSize: 11, color: '#888' }}>{fmt(item.preco_por_cento)} o cento</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 'bold', color: '#b91c1c' }}>{fmt(item.subtotal)}</p>
                </div>
              ))}
            </div>
          )}

          {servicos.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <p style={{ fontSize: 12, fontWeight: 'bold', color: '#666', textTransform: 'uppercase', marginBottom: 10 }}>Serviços</p>
              {servicoPrincipal && (
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>{servicoPrincipal.descricao}</p>
                  <p style={{ fontSize: 13, fontWeight: 'bold', color: '#b91c1c', marginTop: 6 }}>{fmt(servicoPrincipal.valor)}</p>
                </div>
              )}
              {outrosServicos.map((sv, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <p style={{ fontSize: 13, color: '#444' }}>{sv.descricao}</p>
                  <p style={{ fontSize: 13, fontWeight: 'bold', color: '#b91c1c' }}>{fmt(sv.valor)}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '16px 24px', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 'bold', color: '#7f1d1d' }}>Investimento Total</p>
              <p style={{ fontSize: 24, fontWeight: '900', color: '#b91c1c' }}>{fmt(evento.valor_total)}</p>
            </div>
          </div>

          <div style={{ padding: '16px 24px' }}>
            <p style={{ fontSize: 12, fontWeight: 'bold', color: '#666', textTransform: 'uppercase', marginBottom: 10 }}>Forma de Pagamento</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#166534', marginBottom: 4 }}>Entrada ({evento.percentual_entrada}%)</p>
                <p style={{ fontSize: 18, fontWeight: 'bold', color: '#15803d' }}>{fmt(evento.valor_entrada)}</p>
              </div>
              <div style={{ flex: 1, background: '#eff6ff', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#1e40af', marginBottom: 4 }}>Restante</p>
                <p style={{ fontSize: 18, fontWeight: 'bold', color: '#1d4ed8' }}>{fmt(evento.valor_restante)}</p>
                <p style={{ fontSize: 10, color: '#93c5fd' }}>{evento.forma_pagamento_restante}</p>
              </div>
            </div>
          </div>
        </div>

        {evento.observacoes && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: '#92400e' }}>{evento.observacoes}</p>
          </div>
        )}

        {!aprovado && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,.08)', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 'bold', color: '#111', marginBottom: 4 }}>📄 Contrato de Prestação de Serviços</p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Ao aprovar este orçamento, você estará assinando e concordando com os termos abaixo.</p>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', height: 220, overflowY: 'auto', marginBottom: 14, fontSize: 11.5, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
              {CONTRATO}
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={aceitouContrato} onChange={e => setAceitouContrato(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#b91c1c', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                <strong>Li e concordo</strong> com os termos do Contrato de Prestação de Serviços acima. Estou ciente de que a assinatura eletrônica possui validade jurídica.
              </span>
            </label>
          </div>
        )}

        {!aprovado && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
            <p style={{ fontSize: 14, fontWeight: 'bold', color: '#111', marginBottom: 4 }}>Assinar e Aprovar Orçamento</p>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Preencha seus dados para confirmar a assinatura eletrônica.</p>
            <input type="text" value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome completo" style={s.inp} />
            <input type="text" value={cpfCliente} onChange={e => { setCpfCliente(formatCPF(e.target.value)); setCpfErro(''); }} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" style={{ ...s.inp, border: cpfErro ? '1px solid #ef4444' : '1px solid #d1d5db', marginBottom: cpfErro ? 4 : 12 }} />
            {cpfErro && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{cpfErro}</p>}
            <input type="email" value={emailCliente} onChange={e => { setEmailCliente(e.target.value); setEmailErro(''); }} placeholder="seu@email.com" style={{ ...s.inp, border: emailErro ? '1px solid #ef4444' : '1px solid #d1d5db', marginBottom: emailErro ? 4 : 16 }} />
            {emailErro && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{emailErro}</p>}
            {!aceitouContrato && nomeCliente.trim() && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#854d0e' }}>
                ⚠️ Role para cima, leia e aceite os termos do contrato para continuar.
              </div>
            )}
            <button onClick={handleAprovar} disabled={isAprovando || !canAprovar} style={{ width: '100%', padding: '14px', background: canAprovar ? '#16a34a' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 'bold', cursor: canAprovar ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isAprovando ? 'Aprovando...' : '✅ Assinar e Aprovar Orçamento'}
            </button>
            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>🔒 Assinatura eletrônica com validade jurídica (MP nº 2.200-2/2001)</p>
          </div>
        )}

        <div style={{ background: '#f59e0b', borderRadius: 999, padding: '8px 20px', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#78350f', marginTop: 20 }}>
          <span>📍 Rua Cerqueira César, 755 | Centro | Indaiatuba/SP</span>
          <span>📸 @tocoxinha</span>
        </div>
      </div>
    </div>
  );
}