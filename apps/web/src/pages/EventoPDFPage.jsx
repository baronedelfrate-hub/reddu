import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, Loader2 } from 'lucide-react';

export default function EventoPDFPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresaId } = useAuth();
  const [evento, setEvento] = useState(null);
  const [itens, setItens] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [logoUrl, setLogoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return ''; return d.split('-').reverse().join('/'); };
  const formatTime = (t) => { if (!t) return ''; return t.slice(0, 5); };

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    const [{ data: ev }, { data: its }, { data: srvs }, { data: emp }] = await Promise.all([
      supabase.from('eventos').select('*').eq('id', id).single(),
      supabase.from('evento_itens').select('*').eq('evento_id', id).order('created_at'),
      supabase.from('evento_servicos').select('*').eq('evento_id', id).order('created_at'),
      empresaId ? supabase.from('empresas').select('logo_url').eq('id', empresaId).single() : Promise.resolve({ data: null }),
    ]);
    setEvento(ev);
    setItens(its || []);
    setServicos(srvs || []);
    if (emp?.logo_url) setLogoUrl(emp.logo_url);
    setIsLoading(false);
  };

  const gerarPDF = () => {
    if (!evento) return;

    const RED = '#b91c1c';
    const AMBER = '#f59e0b';
    const AMBER_TEXT = '#78350f';

    const servicoPrincipal = servicos.find(s =>
      s.descricao?.toLowerCase().includes('serviço') ||
      s.descricao?.toLowerCase().includes('preparo') ||
      s.descricao?.toLowerCase().includes('fritura')
    );
    const outrosServicos = servicos.filter(s => s !== servicoPrincipal);
    const categoriasUnicas = [...new Map(itens.map(i => [i.categoria, i])).values()];

    const logoTag = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:contain;padding:3px;" />`
      : `<span style="font-size:9px;font-weight:bold;color:${RED};text-align:center;line-height:1.3;">Tô<br/>Coxinha</span>`;

    const categoriasHtml = categoriasUnicas.map(item =>
      `<p style="font-size:12px;margin:0 0 2px;">${item.categoria} = ${fmt(item.preco_por_cento)} o cento</p>`
    ).join('');

    const itensHtml = itens.map(item =>
      `<li style="font-size:12px;margin-bottom:3px;">${item.quantidade} ${item.categoria}${item.descricao ? ' ' + item.descricao : ''} = ${fmt(item.subtotal)}</li>`
    ).join('');

    const servicoHtml = servicoPrincipal ? `
      <p style="font-size:12px;margin-bottom:4px;"><strong>Nosso serviço inclui:</strong> ${servicoPrincipal.descricao}</p>
      <p style="font-size:12px;margin-bottom:10px;"><strong>Valor do nosso serviço:</strong> ${fmt(servicoPrincipal.valor)}</p>
    ` : '';

    const outrosHtml = outrosServicos.map(sv =>
      `<p style="font-size:12px;margin-bottom:4px;"><strong>${sv.descricao}:</strong> ${fmt(sv.valor)}</p>`
    ).join('');

    const obsHtml = evento.observacoes
      ? `<p style="font-size:11px;font-style:italic;color:#555;margin-top:8px;">${evento.observacoes}</p>`
      : '';

    // Dados de aprovação (se já aprovado)
    const aprovacaoHtml = evento.aprovado_em ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin-top:16px;">
        <p style="font-size:11px;font-weight:bold;color:#15803d;margin-bottom:4px;">✅ ASSINADO ELETRONICAMENTE</p>
        <p style="font-size:11px;color:#166534;">Por: <strong>${evento.aprovado_nome}</strong>${evento.aprovado_cpf ? ` · CPF: ${evento.aprovado_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''}</p>
        <p style="font-size:11px;color:#166534;">Em: ${new Date(evento.aprovado_em).toLocaleString('pt-BR')} · IP: ${evento.aprovado_ip || '-'}</p>
        <p style="font-size:10px;color:#4ade80;margin-top:4px;">Assinatura com validade jurídica nos termos da MP nº 2.200-2/2001</p>
      </div>
    ` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento — ${evento.nome_cliente}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; font-family: Arial, sans-serif; color: #222; }
    .page { width: 210mm; background: #fff; margin: 0 auto; }
    .body { padding: 20px 32px; background: #fff; }
    .divider { border-top: 2px solid #222; border-bottom: 2px solid #222; padding: 8px 0; margin: 16px 0; }
    .footer { background: ${AMBER}; border-radius: 999px; margin: 12px 32px; padding: 7px 18px; display: flex; justify-content: space-between; font-size: 11px; color: ${AMBER_TEXT}; }
    .sig-line { flex: 1; border-top: 1px solid #999; padding-top: 6px; text-align: center; font-size: 11px; color: #666; }
    .page-break { page-break-before: always; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @media print {
      html, body { background: #fff !important; }
      .no-print { display: none !important; }
      .page { width: 100%; box-shadow: none !important; }
      @page { size: A4; margin: 8mm 12mm; }
    }
    @media screen {
      body { background: #e5e7eb; padding: 20px 0; }
      .page { box-shadow: 0 4px 24px rgba(0,0,0,.15); }
    }
  </style>
</head>
<body>

<div class="no-print" style="text-align:center;padding:16px;background:#fff;margin-bottom:0;">
  <button onclick="window.print()" style="background:${RED};color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;">
    🖨 Imprimir / Salvar como PDF
  </button>
</div>

<div class="page">

  <!-- HEADER -->
  <div style="background:${RED};padding:12px 24px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:52px;height:52px;border-radius:50%;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${logoTag}
      </div>
      <span style="color:#fff;font-weight:bold;font-size:16px;">Tô Coxinha</span>
    </div>
    <div style="color:#fff;font-size:10px;text-align:right;line-height:1.6;">
      <div>um novo jeito de saborear <strong>salgado quentinho</strong></div>
      <div>e <strong>gostoso</strong> sempre que der fome :)</div>
    </div>
  </div>

  <div class="body">

    <!-- TÍTULO -->
    <h1 style="font-size:22px;font-weight:bold;text-decoration:underline;margin-bottom:16px;margin-top:6px;">ORÇAMENTO</h1>

    <!-- DADOS DO EVENTO -->
    <p style="font-size:13px;font-weight:bold;margin-bottom:3px;">
      Evento ${formatDate(evento.data_evento)}${evento.horario_inicio ? ' – ' + formatTime(evento.horario_inicio) + 'h' : ''} – ${evento.nome_cliente.toUpperCase()}
    </p>
    ${evento.horario_chegada ? `<p style="font-size:12px;margin-bottom:2px;">Horário de chegada da equipe: ${formatTime(evento.horario_chegada)}h</p>` : ''}
    ${evento.local_evento ? `<p style="font-size:12px;margin-bottom:12px;">Local: ${evento.local_evento}</p>` : '<div style="margin-bottom:12px;"></div>'}

    ${categoriasUnicas.length > 0 ? `
    <div style="margin-bottom:12px;">
      <p style="font-size:13px;font-weight:bold;margin-bottom:4px;">Valores para ter o Tô Coxinha no seu Evento:</p>
      ${categoriasHtml}
    </div>` : ''}

    ${evento.num_convidados ? `<p style="font-size:13px;font-weight:bold;margin-bottom:2px;">Evento para ${evento.num_convidados} pessoas:</p>` : ''}
    ${evento.total_salgados > 0 ? `<p style="font-size:13px;font-weight:bold;margin-bottom:12px;">Total de Salgados = ${evento.total_salgados}</p>` : ''}

    ${itens.length > 0 ? `
    <div style="margin-bottom:14px;">
      <p style="font-size:13px;font-weight:bold;margin-bottom:4px;">SENDO:</p>
      <ul style="padding-left:18px;">${itensHtml}</ul>
    </div>` : ''}

    ${servicoHtml}
    ${outrosHtml}
    ${obsHtml}

    <div class="divider">
      <p style="font-size:14px;font-weight:bold;color:${RED};">
        Investimento para proporcionar esse momento especial: ${fmt(evento.valor_total)}
      </p>
    </div>

    <div style="margin-top:14px;">
      <h2 style="font-size:14px;font-weight:bold;text-decoration:underline;margin-bottom:12px;">Forma de Pagamento:</h2>
      <p style="font-size:13px;font-weight:bold;margin-bottom:8px;">Entrada ${evento.percentual_entrada}% = ${fmt(evento.valor_entrada)}</p>
      <p style="font-size:13px;font-weight:bold;margin-bottom:24px;">Restante do Valor ${evento.forma_pagamento_restante} = ${fmt(evento.valor_restante)}</p>
    </div>

    <!-- CLÁUSULA CONTRATUAL -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;margin-bottom:20px;">
      <p style="font-size:11px;color:#7f1d1d;line-height:1.7;">
        <strong>Nota contratual:</strong> A assinatura deste orçamento implica a aceitação integral do Contrato de Prestação de Serviços da FL Indústria de Produtos Congelados LTDA – Tô Coxinha, CNPJ nº 63.982.596/0001-92, cujos termos foram apresentados ao CONTRATANTE antes da assinatura, incluindo disposições sobre execução dos serviços, cancelamento, remarcação, equipamentos e imagens. A assinatura eletrônica possui validade jurídica nos termos da MP nº 2.200-2/2001.
      </p>
    </div>

    <!-- ASSINATURA -->
    <div style="display:flex;gap:32px;margin-top:8px;margin-bottom:8px;">
      <div class="sig-line">Assinatura do Cliente</div>
      <div class="sig-line">Tô Coxinha</div>
    </div>

    ${aprovacaoHtml}

  </div>

  <div class="footer">
    <span>📍 Rua Cerqueira César, 755 | Centro | Indaiatuba/SP</span>
    <span>📸 @tocoxinha</span>
  </div>

  <!-- PÁGINA 2: CONTRATO COMPLETO -->
  <div class="page-break"></div>

  <div style="background:${RED};padding:12px 24px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:52px;height:52px;border-radius:50%;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${logoTag}
      </div>
      <span style="color:#fff;font-weight:bold;font-size:16px;">Tô Coxinha</span>
    </div>
    <div style="color:#fff;font-size:10px;text-align:right;line-height:1.6;">
      <div>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</div>
    </div>
  </div>

  <div class="body">
    <h1 style="font-size:18px;font-weight:bold;text-decoration:underline;margin-bottom:16px;margin-top:10px;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

    <p style="font-size:12px;margin-bottom:6px;"><strong>CONTRATADO:</strong> FL INDÚSTRIA DE PRODUTOS CONGELADOS LTDA – TÔ COXINHA, CNPJ nº 63.982.596/0001-92.</p>
    <p style="font-size:12px;margin-bottom:14px;"><strong>CONTRATANTE:</strong> ${evento.nome_cliente.toUpperCase()} — conforme dados constantes no orçamento.</p>
    <p style="font-size:12px;margin-bottom:18px;font-style:italic;">A assinatura deste orçamento implica a aceitação integral deste Contrato de Prestação de Serviços.</p>

    ${[
        ['1. OBJETO', 'O CONTRATADO fornecerá os produtos e serviços descritos no orçamento, incluindo, quando contratado, o serviço de fritura no local do evento, com fornecimento de profissional, equipamentos, óleo e demais insumos necessários para a execução do serviço.'],
        ['2. EXECUÇÃO DOS SERVIÇOS', 'O CONTRATANTE deverá informar corretamente a data, horário e local do evento. O CONTRATADO executará os serviços observando padrões de qualidade, higiene e segurança. Por segurança, recomenda-se que convidados, especialmente crianças, permaneçam afastados da área de trabalho durante a operação dos equipamentos.'],
        ['3. PAGAMENTO', 'Os valores e condições de pagamento serão aqueles constantes no orçamento. A reserva da data somente será considerada confirmada após o pagamento acordado entre as partes.'],
        ['4. CANCELAMENTO E REMARCAÇÃO', 'Em caso de cancelamento pelo CONTRATANTE:<br/>• Mais de 30 dias antes do evento: devolução integral dos valores pagos, descontadas eventuais taxas financeiras não reembolsáveis;<br/>• Entre 30 e 15 dias antes do evento: retenção de 30% do valor contratado;<br/>• Entre 14 e 7 dias antes do evento: retenção de 50% do valor contratado;<br/>• Menos de 7 dias antes do evento: retenção de 100% do valor contratado.<br/><br/>Os percentuais acima consideram a reserva da data, organização da agenda, planejamento operacional e preparação da produção. Remarcações poderão ser realizadas sem multa, mediante solicitação com antecedência mínima de 15 dias e disponibilidade de agenda.'],
        ['5. EQUIPAMENTOS E IMAGENS', 'Os equipamentos utilizados pertencem ao CONTRATADO. Danos causados por uso indevido, intervenção de terceiros ou atos intencionais poderão ser cobrados do responsável pelos prejuízos comprovados.<br/><br/>O CONTRATANTE autoriza o CONTRATADO a realizar fotografias e vídeos dos produtos, equipamentos, estrutura montada e execução dos serviços para utilização em portfólio, redes sociais e materiais institucionais. As imagens terão como foco os produtos e a operação do CONTRATADO. Caso não concorde, o CONTRATANTE deverá informar sua decisão por escrito antes da realização do evento.'],
        ['6. DISPOSIÇÕES GERAIS', 'O CONTRATADO não responderá por atrasos ou impossibilidade de execução decorrentes de caso fortuito, força maior ou situações alheias ao seu controle, nos termos do artigo 393 do Código Civil. As partes comprometem-se a agir de acordo com os princípios da boa-fé e cooperação previstos nos artigos 421 e 422 do Código Civil.<br/><br/>A assinatura física ou eletrônica deste documento possui validade jurídica e produz todos os efeitos legais cabíveis, inclusive nos termos da Medida Provisória nº 2.200-2/2001.<br/><br/>Fica eleito o foro da comarca da sede do CONTRATADO para dirimir eventuais controvérsias decorrentes desta contratação.'],
      ].map(([titulo, texto]) => `
      <div style="margin-bottom:14px;">
        <p style="font-size:12px;font-weight:bold;margin-bottom:4px;">${titulo}</p>
        <p style="font-size:11.5px;line-height:1.8;color:#333;">${texto}</p>
      </div>
    `).join('')}

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:24px;">
      <p style="font-size:12px;font-weight:bold;margin-bottom:4px;">DECLARAÇÃO DE ACEITE</p>
      <p style="font-size:11.5px;line-height:1.7;color:#333;">Ao assinar eletronicamente o orçamento vinculado a este contrato, o CONTRATANTE declara que leu, compreendeu e concorda integralmente com todos os seus termos e condições.</p>
    </div>

    <div style="display:flex;gap:32px;margin-top:8px;margin-bottom:8px;">
      <div class="sig-line">Assinatura do Cliente</div>
      <div class="sig-line">FL Indústria de Produtos Congelados LTDA<br/>Tô Coxinha</div>
    </div>

    ${aprovacaoHtml}

  </div>

  <div class="footer">
    <span>📍 Rua Cerqueira César, 755 | Centro | Indaiatuba/SP</span>
    <span>📸 @tocoxinha · CNPJ 63.982.596/0001-92</span>
  </div>

</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto space-y-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-xl font-bold text-gray-900">Gerar PDF do Orçamento</h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto">
            <FileText className="h-8 w-8 text-rose-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{evento?.nome_cliente}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {evento?.data_evento?.split('-').reverse().join('/')} · {fmt(evento?.valor_total)}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            O PDF gerado tem <strong>2 páginas</strong>:<br />
            Página 1 — Orçamento completo com condições de pagamento<br />
            Página 2 — Contrato de Prestação de Serviços
          </p>
          <Button onClick={gerarPDF} className="gap-2 bg-rose-600 hover:bg-rose-700 h-12 px-8 text-base font-bold w-full">
            <FileText className="h-5 w-5" /> Abrir Orçamento + Contrato para Impressão
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}