import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Receipt, ArrowLeft, MapPin, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, Package, DollarSign, FileText, ClipboardList, Calendar, ChevronRight, Download, Trash2,
  Mail, Send,
} from 'lucide-react';
import CPFNaNotaInput from '@/components/fiscal/CPFNaNotaInput';
import NFCeStatusBadge from '@/components/fiscal/NFCeStatusBadge';
import { Input } from '@/components/ui/input';
import { validateNFcePayload } from '@/utils/validateNFcePayload';

// ─── Serviço de emissão de NF do Pedido Consignado ─────────────────────────
// Mesmo princípio já validado no Faturamento de Reabastecimento — só que
// aqui não tem conceito de dano/devolução (é venda mesmo), então o
// agrupamento por produto é mais simples: soma quantidade e valor_total
// já gravado (não recalcula qtd × preço do zero — foi um bug real lá no
// reabastecimento quando o valor gravado já vinha diferente do bruto).
const fiscalConsignadoService = {
  async obterConfiguracoesEmpresa(empresaId) {
    if (!empresaId) throw new Error('empresaId é obrigatório');
    const { data, error } = await supabase
      .from('configuracoes_fiscais')
      .select('*')
      .eq('empresa_id', empresaId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) throw new Error('Configurações fiscais não encontradas. Configure primeiro em Configurações Fiscais.');
    if (!data.url_api_focus) throw new Error('URL da API Focus não configurada nas configurações fiscais.');
    return data;
  },

  construirPayload(pedidoMercado, pedido, configuracoes, docCliente) {
    const docLimpo = (docCliente || '').replace(/\D/g, '');
    const ehCnpj = docLimpo.length === 14;
    const ehCpf = docLimpo.length === 11;

    let regimeEmitente = '1';
    if (configuracoes.regime_tributario === 'Lucro Presumido') regimeEmitente = '2';
    if (configuracoes.regime_tributario === 'Lucro Real') regimeEmitente = '3';

    const itensOrigem = pedidoMercado.pedidos_consignado_itens || [];

    // Agrupa por produto (uma venda pode ter gerado várias linhas do
    // mesmo produto ao longo do período) — confia direto no valor_total
    // já gravado de cada linha, soma tudo.
    const porProduto = new Map();
    itensOrigem.forEach((item) => {
      const chave = item.produto_id || item.produto_nome;
      if (!porProduto.has(chave)) {
        porProduto.set(chave, { produto_id: item.produto_id, nome: item.produto_nome || 'Produto', quantidade: 0, valorTotal: 0, valorUnitario: 0 });
      }
      const g = porProduto.get(chave);
      g.quantidade += parseFloat(item.quantidade) || 0;
      g.valorTotal += parseFloat(item.valor_total) || 0;
      g.valorUnitario = parseFloat(item.valor_unitario) || g.valorUnitario;
    });

    let valorTotalProdutos = 0;
    let numeroItem = 0;

    const itens = Array.from(porProduto.values()).map((g) => {
      numeroItem += 1;
      const valorBruto = Math.round(g.valorTotal * 100) / 100;
      // Preço efetivo derivado do valor bruto real — mantém a NF
      // matematicamente consistente (qtd × preço = bruto) mesmo se o
      // valor_unitario cru não bater mais exatamente com valorTotal/qtd.
      const precoEfetivo = g.quantidade > 0 ? valorBruto / g.quantidade : g.valorUnitario;

      valorTotalProdutos += valorBruto;

      return {
        numero_item: numeroItem.toString(),
        codigo_produto: (g.produto_id || '0').toString().substring(0, 10),
        codigo_barras_comercial: 'SEM GTIN',
        descricao: g.nome,
        codigo_ncm: '19059090',
        cfop: '5102',
        unidade_comercial: 'un',
        quantidade_comercial: g.quantidade.toFixed(4),
        valor_unitario_comercial: precoEfetivo.toFixed(10),
        valor_bruto: valorBruto.toFixed(2),
        codigo_barras_tributavel: 'SEM GTIN',
        unidade_tributavel: 'un',
        quantidade_tributavel: g.quantidade.toFixed(4),
        valor_unitario_tributavel: precoEfetivo.toFixed(10),
        inclui_no_total: '1',
        icms_percentual_partilha: '100.0000',
        icms_origem: '0',
        icms_situacao_tributaria: regimeEmitente === '1' ? '102' : '00',
        pis_situacao_tributaria: '99',
        pis_base_calculo: '0',
        pis_aliquota_porcentual: '0',
        pis_valor: '0',
        cofins_situacao_tributaria: '99',
        cofins_base_calculo: '0',
        cofins_aliquota_porcentual: '0',
        cofins_valor: '0',
      };
    });

    const totalNF = Math.round(valorTotalProdutos * 100) / 100;
    const nomeDestinatario = pedidoMercado.locais?.nome || 'CLIENTE';

    return {
      natureza_operacao: 'Venda',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      local_destino: '1',
      finalidade_emissao: '1',
      // Mesma conta Focus do PDV/Reabastecimento — só emite NFC-e, então
      // consumidor_final e presenca_comprador sempre "1" (SEFAZ exige,
      // sem meio-termo nesse modelo de documento).
      consumidor_final: '1',
      presenca_comprador: '1',
      indicador_intermediario: '0',

      cnpj_emitente: configuracoes.cnpj ? configuracoes.cnpj.replace(/\D/g, '') : '',
      nome_emitente: configuracoes.razao_social || '',
      nome_fantasia_emitente: configuracoes.nome_fantasia || '',
      logradouro_emitente: configuracoes.logradouro || '',
      numero_emitente: configuracoes.numero || '',
      complemento_emitente: configuracoes.complemento || '',
      bairro_emitente: configuracoes.bairro || '',
      municipio_emitente: configuracoes.municipio || '',
      uf_emitente: configuracoes.uf || '',
      cep_emitente: configuracoes.cep ? configuracoes.cep.replace(/\D/g, '') : '',
      telefone_emitente: configuracoes.telefone ? configuracoes.telefone.replace(/\D/g, '') : '',
      inscricao_estadual_emitente: configuracoes.inscricao_estadual || '',
      regime_tributario_emitente: regimeEmitente,

      cpf_destinatario: ehCpf ? docLimpo : null,
      cnpj_destinatario: ehCnpj ? docLimpo : null,
      nome_destinatario: nomeDestinatario,

      itens,

      icms_base_calculo: '0',
      icms_valor_total: '0',
      icms_valor_total_desonerado: '0',
      fcp_valor_total: '0',
      icms_base_calculo_st: '0',
      icms_valor_total_st: '0',
      fcp_valor_total_st: '0',
      fcp_valor_total_retido_st: '0',
      valor_produtos: valorTotalProdutos.toFixed(2),
      valor_frete: '0.00',
      valor_outras_despesas: '0',
      valor_seguro: '0',
      valor_desconto: '0.00',
      valor_total_ii: '0',
      valor_ipi: '0',
      valor_ipi_devolvido: '0',
      valor_pis: '0',
      valor_cofins: '0',
      valor_total: totalNF.toFixed(2),
      modalidade_frete: '9',

      // Forma de pagamento não é rastreada no pedido consignado (a baixa
      // é manual, sem meio de pagamento específico) — usa "Outros".
      formas_pagamento: [{ forma_pagamento: '99', valor_pagamento: totalNF.toFixed(2) }],

      informacoes_adicionais_contribuinte:
        configuracoes.informacoes_adicionais_contribuinte ||
        `Pedido consignado — período de ${pedido.data_inicio} a ${pedido.data_fim}.`,
      cnpj_responsavel_tecnico: null,
      contato_responsavel_tecnico: null,
      email_responsavel_tecnico: null,
      telefone_responsavel_tecnico: null,
    };
  },

  construirPayloadCombinado(mercados, pedido, configuracoes, docCliente) {
    const itensCombinados = mercados.flatMap((m) => m.pedidos_consignado_itens || []);
    const nomesLocais = mercados.map((m) => m.locais?.nome).filter(Boolean).join(' + ');
    const mercadoSintetico = {
      pedidos_consignado_itens: itensCombinados,
      locais: { nome: nomesLocais || 'CLIENTE' },
    };
    return this.construirPayload(mercadoSintetico, pedido, configuracoes, docCliente);
  },

  logEmissao(refId, status, detalhes) {
    console.log(`[NF Consignado] Ref: ${refId} | Status: ${status}`, detalhes);
  },

  async emitirNFCe(pedidoMercado, pedido, empresaId, docCliente) {
    const docLimpo = (docCliente || '').replace(/\D/g, '');
    if (docLimpo.length !== 11 && docLimpo.length !== 14) {
      return { success: false, erro: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
    }

    try {
      this.logEmissao(pedidoMercado.id, 'iniciando', { empresaId });

      const configuracoes = await this.obterConfiguracoesEmpresa(empresaId);

      if (!pedidoMercado.pedidos_consignado_itens || pedidoMercado.pedidos_consignado_itens.length === 0) {
        throw new Error('Este mercado não possui itens para emitir nota.');
      }

      const payload = this.construirPayload(pedidoMercado, pedido, configuracoes, docLimpo);

      const validation = validateNFcePayload(payload);
      if (!validation.valid) {
        throw new Error(`Falha na validação do Payload:\n${validation.errors.join('\n')}`);
      }

      const { data, error } = await supabase.functions.invoke('emit-nfce', {
        body: {
          venda_id: pedidoMercado.id,
          empresa_id: empresaId,
          payload,
          url_api: configuracoes.url_api_focus,
        },
      });

      if (error) throw new Error(error.message || 'Falha na comunicação com a Edge Function');

      const result = data || {};
      const statusFiscal = result.success ? 'emitido' : 'erro';
      const erroMensagem = result.success ? null : (result.erro || 'Erro desconhecido ao emitir nota.');

      await supabase
        .from('pedidos_consignado_mercados')
        .update({
          status_fiscal: statusFiscal,
          nfe_id: result.nfe_id || null,
          nfe_chave: result.nfe_chave || null,
          nfe_url_pdf: result.nfe_url_pdf || null,
          nfe_erro_mensagem: erroMensagem,
          cpf_cnpj_utilizado: docLimpo,
        })
        .eq('id', pedidoMercado.id);

      this.logEmissao(pedidoMercado.id, statusFiscal, result);
      return { ...result, cpf_cnpj_utilizado: docLimpo };
    } catch (err) {
      this.logEmissao(pedidoMercado.id, 'falha_interna', { erro: err.message });
      await supabase
        .from('pedidos_consignado_mercados')
        .update({ status_fiscal: 'erro', nfe_erro_mensagem: err.message })
        .eq('id', pedidoMercado.id);
      return { success: false, erro: err.message };
    }
  },

  async emitirNFCeCombinada(mercados, pedido, empresaId, docCliente) {
    const docLimpo = (docCliente || '').replace(/\D/g, '');
    if (docLimpo.length !== 11 && docLimpo.length !== 14) {
      return { success: false, erro: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
    }
    if (!mercados || mercados.length < 2) {
      return { success: false, erro: 'Selecione pelo menos 2 mercados para combinar numa nota só.' };
    }

    const idsMercados = mercados.map((m) => m.id);

    try {
      const configuracoes = await this.obterConfiguracoesEmpresa(empresaId);

      const temItens = mercados.some((m) => (m.pedidos_consignado_itens || []).length > 0);
      if (!temItens) throw new Error('Os mercados selecionados não possuem itens para emitir nota.');

      const payload = this.construirPayloadCombinado(mercados, pedido, configuracoes, docLimpo);

      const validation = validateNFcePayload(payload);
      if (!validation.valid) {
        throw new Error(`Falha na validação do Payload:\n${validation.errors.join('\n')}`);
      }

      const refCombinada = 'combo-' + idsMercados.map((id) => id.split('-')[0]).join('-');

      const { data, error } = await supabase.functions.invoke('emit-nfce', {
        body: {
          venda_id: refCombinada,
          empresa_id: empresaId,
          payload,
          url_api: configuracoes.url_api_focus,
        },
      });

      if (error) throw new Error(error.message || 'Falha na comunicação com a Edge Function');

      const result = data || {};
      const statusFiscal = result.success ? 'emitido' : 'erro';
      const erroMensagem = result.success ? null : (result.erro || 'Erro desconhecido ao emitir nota.');

      await supabase
        .from('pedidos_consignado_mercados')
        .update({
          status_fiscal: statusFiscal,
          nfe_id: result.nfe_id || null,
          nfe_chave: result.nfe_chave || null,
          nfe_url_pdf: result.nfe_url_pdf || null,
          nfe_erro_mensagem: erroMensagem,
          cpf_cnpj_utilizado: docLimpo,
        })
        .in('id', idsMercados);

      this.logEmissao(refCombinada, statusFiscal, result);
      return { ...result, cpf_cnpj_utilizado: docLimpo };
    } catch (err) {
      this.logEmissao('combo-erro', 'falha_interna', { erro: err.message });
      await supabase
        .from('pedidos_consignado_mercados')
        .update({ status_fiscal: 'erro', nfe_erro_mensagem: err.message })
        .in('id', idsMercados);
      return { success: false, erro: err.message };
    }
  },

  async enviarEmailNF(destinatario, pedidoMercado, pedido, fmt) {
    if (!destinatario) return { success: false, error: 'Nenhum e-mail informado.' };

    const linkNota = pedidoMercado.nfe_url_pdf
      ? `<p><a href="${pedidoMercado.nfe_url_pdf}" target="_blank" style="color:#2563eb;font-weight:bold;">Clique aqui para ver a Nota Fiscal</a></p>`
      : '<p>A nota fiscal foi emitida; caso o link não apareça aqui, entre em contato para receber o PDF.</p>';

    const itensHtml = (pedidoMercado.pedidos_consignado_itens || [])
      .map(
        (item) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #eee;">${item.produto_nome}</td>
          <td style="padding:6px 8px;border:1px solid #eee;text-align:center;">${item.quantidade}</td>
          <td style="padding:6px 8px;border:1px solid #eee;text-align:right;">${fmt(item.valor_total)}</td>
        </tr>`
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e293b;">Pedido Consignado</h2>
        <p style="color:#475569;">Segue o pedido referente ao período de ${pedido.data_inicio?.split('-').reverse().join('/')} a ${pedido.data_fim?.split('-').reverse().join('/')}, ${pedidoMercado.locais?.nome || ''}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:6px 8px;border:1px solid #eee;text-align:left;">Item</th>
              <th style="padding:6px 8px;border:1px solid #eee;">Qtd</th>
              <th style="padding:6px 8px;border:1px solid #eee;text-align:right;">Valor</th>
            </tr>
          </thead>
          <tbody>${itensHtml}</tbody>
        </table>
        <p style="font-weight:bold;color:#1e293b;">Total: ${fmt(pedidoMercado.valor_total)}</p>
        ${linkNota}
      </div>
    `;

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: destinatario,
        subject: `Pedido Consignado — ${pedidoMercado.locais?.nome || ''}`,
        html,
      },
    });

    if (error || data?.success === false) {
      const msg = data?.error || error?.message || 'Falha ao enviar e-mail.';
      return { success: false, error: msg };
    }

    await supabase
      .from('pedidos_consignado_mercados')
      .update({ email_enviado_para: destinatario, email_enviado_em: new Date().toISOString() })
      .eq('id', pedidoMercado.id);

    return { success: true };
  },

  async enviarEmailNFCombinado(destinatario, mercados, pedido, fmt) {
    if (!destinatario) return { success: false, error: 'Nenhum e-mail informado.' };

    const idsMercados = mercados.map((m) => m.id);
    const nomeMercados = mercados.map((m) => m.locais?.nome).filter(Boolean).join(', ');
    const nfeUrl = mercados.find((m) => m.nfe_url_pdf)?.nfe_url_pdf;
    const valorTotalCombinado = mercados.reduce((s, m) => s + (parseFloat(m.valor_total) || 0), 0);

    const linkNota = nfeUrl
      ? `<p><a href="${nfeUrl}" target="_blank" style="color:#2563eb;font-weight:bold;">Clique aqui para ver a Nota Fiscal</a></p>`
      : '<p>A nota fiscal foi emitida; caso o link não apareça aqui, entre em contato para receber o PDF.</p>';

    const itensHtml = mercados
      .flatMap((m) =>
        (m.pedidos_consignado_itens || []).map(
          (item) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #eee;">${item.produto_nome} <span style="color:#94a3b8;font-size:11px;">(${m.locais?.nome || ''})</span></td>
          <td style="padding:6px 8px;border:1px solid #eee;text-align:center;">${item.quantidade}</td>
          <td style="padding:6px 8px;border:1px solid #eee;text-align:right;">${fmt(item.valor_total)}</td>
        </tr>`
        )
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e293b;">Pedido Consignado</h2>
        <p style="color:#475569;">Segue o pedido referente ao período de ${pedido.data_inicio?.split('-').reverse().join('/')} a ${pedido.data_fim?.split('-').reverse().join('/')}, referente a: ${nomeMercados}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:6px 8px;border:1px solid #eee;text-align:left;">Item</th>
              <th style="padding:6px 8px;border:1px solid #eee;">Qtd</th>
              <th style="padding:6px 8px;border:1px solid #eee;text-align:right;">Valor</th>
            </tr>
          </thead>
          <tbody>${itensHtml}</tbody>
        </table>
        <p style="font-weight:bold;color:#1e293b;">Total: ${fmt(valorTotalCombinado)}</p>
        ${linkNota}
      </div>
    `;

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to: destinatario,
        subject: `Pedido Consignado — ${nomeMercados}`,
        html,
      },
    });

    if (error || data?.success === false) {
      const msg = data?.error || error?.message || 'Falha ao enviar e-mail.';
      return { success: false, error: msg };
    }

    await supabase
      .from('pedidos_consignado_mercados')
      .update({ email_enviado_para: destinatario, email_enviado_em: new Date().toISOString() })
      .in('id', idsMercados);

    return { success: true };
  },
};
// ────────────────────────────────────────────────────────────────────────

export default function FechamentoMercadoConsignadoPage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [aba, setAba] = useState('gerar'); // 'gerar' | 'pendentes' | 'historico'

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('-').reverse().join('/'); };
  const formatDateTime = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  // ─── Aba: Gerar Pedido ─────────────────────────────────────────────────
  const [mercados, setMercados] = useState([]);
  const [mercadosSelecionados, setMercadosSelecionados] = useState([]);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null); // { mercados: [{local, categorias, subtotal, vendaIds}], totalGeral }
  const [isGerandoPreview, setIsGerandoPreview] = useState(false);
  const [isSalvandoPedido, setIsSalvandoPedido] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'Mercado')
      .eq('modelo_negocio', 'consignado')
      .order('nome')
      .then(({ data }) => setMercados(data || []));
  }, [empresaId]);

  const toggleMercado = (id) => {
    setMercadosSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPreview(null);
  };

  const gerarPreview = useCallback(async () => {
    if (mercadosSelecionados.length === 0) return;
    setIsGerandoPreview(true);
    setPreview(null);
    try {
      const mercadosObjs = mercados.filter(m => mercadosSelecionados.includes(m.id));

      // Vendas já incluídas em QUALQUER pedido (gerado ou já baixado) não
      // podem entrar de novo — evita cobrar a mesma venda duas vezes.
      const { data: jaIncluidas } = await supabase.from('pedidos_consignado_vendas').select('venda_id');
      const vendaIdsJaUsadas = new Set((jaIncluidas || []).map(v => v.venda_id));

      const resultadoPorMercado = [];
      let totalGeralCalc = 0;

      for (const mercado of mercadosObjs) {
        const { data: movs, error } = await supabase
          .from('movimentacoes')
          .select('id, venda_id, produto_id, quantidade, valor_unitario, subtotal, total_final, produtos(nome, categoria)')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'venda_mercado')
          .eq('canal_venda', 'MERCADO')
          .eq('cliente_referencia', mercado.nome)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);

        if (error) throw error;

        const movsValidos = (movs || []).filter(m => !m.venda_id || !vendaIdsJaUsadas.has(m.venda_id));

        const porCategoria = {};
        movsValidos.forEach(m => {
          const cat = m.produtos?.categoria || 'Outros';
          const key = `${cat}__${m.produto_id}`;
          if (!porCategoria[cat]) porCategoria[cat] = {};
          if (!porCategoria[cat][key]) {
            porCategoria[cat][key] = { produto_id: m.produto_id, nome: m.produtos?.nome || 'Produto', quantidade: 0, valor: 0 };
          }
          porCategoria[cat][key].quantidade += Number(m.quantidade || 0);
          porCategoria[cat][key].valor += Number(m.total_final || m.subtotal || 0);
        });

        const categoriasArr = Object.entries(porCategoria).map(([categoria, itensMap]) => ({
          categoria,
          itens: Object.values(itensMap).map(i => ({
            ...i,
            valorUnitario: i.quantidade > 0 ? i.valor / i.quantidade : 0,
          })).sort((a, b) => a.nome.localeCompare(b.nome)),
        })).sort((a, b) => a.categoria.localeCompare(b.categoria));

        const subtotal = movsValidos.reduce((s, m) => s + Number(m.total_final || m.subtotal || 0), 0);
        const vendaIds = [...new Set(movsValidos.map(m => m.venda_id).filter(Boolean))];

        if (categoriasArr.length > 0) {
          resultadoPorMercado.push({ local: mercado, categorias: categoriasArr, subtotal, vendaIds });
          totalGeralCalc += subtotal;
        }
      }

      if (resultadoPorMercado.length === 0) {
        toast({ title: 'Nada pendente', description: 'Nenhum dos mercados selecionados tem vendas pendentes nesse período.' });
        setPreview(null);
      } else {
        setPreview({ mercados: resultadoPorMercado, totalGeral: totalGeralCalc });
      }
    } catch (err) {
      toast({ title: 'Erro ao gerar prévia', description: err.message, variant: 'destructive' });
    } finally {
      setIsGerandoPreview(false);
    }
  }, [mercadosSelecionados, mercados, dataInicio, dataFim, empresaId, toast]);

  const confirmarGerarPedido = async () => {
    if (!preview) return;
    setIsSalvandoPedido(true);
    try {
      const { data: pedido, error: erroPedido } = await supabase
        .from('pedidos_consignado')
        .insert({
          empresa_id: empresaId,
          data_inicio: dataInicio,
          data_fim: dataFim,
          status: 'gerado',
          valor_total: preview.totalGeral,
          gerado_por: currentUser?.id || null,
        })
        .select('id')
        .single();
      if (erroPedido) throw erroPedido;

      for (const m of preview.mercados) {
        const { data: pm, error: erroPm } = await supabase
          .from('pedidos_consignado_mercados')
          .insert({ pedido_id: pedido.id, local_id: m.local.id, valor_total: m.subtotal })
          .select('id')
          .single();
        if (erroPm) throw erroPm;

        const itensPara = [];
        m.categorias.forEach(cat => {
          cat.itens.forEach(item => {
            itensPara.push({
              pedido_mercado_id: pm.id,
              produto_id: item.produto_id,
              produto_nome: item.nome,
              categoria: cat.categoria,
              quantidade: item.quantidade,
              valor_unitario: item.valorUnitario,
              valor_total: item.valor,
            });
          });
        });
        if (itensPara.length > 0) {
          const { error: erroItens } = await supabase.from('pedidos_consignado_itens').insert(itensPara);
          if (erroItens) throw erroItens;
        }

        if (m.vendaIds.length > 0) {
          const vendasPara = m.vendaIds.map(vid => ({ pedido_id: pedido.id, venda_id: vid }));
          const { error: erroVendas } = await supabase.from('pedidos_consignado_vendas').insert(vendasPara);
          if (erroVendas) throw erroVendas;
        }
      }

      toast({
        title: 'Pedido gerado!',
        description: `${fmt(preview.totalGeral)} em ${preview.mercados.length} mercado(s). Envie pro cliente e dê baixa quando o pagamento cair.`,
        className: 'bg-emerald-600 text-white',
      });

      setPreview(null);
      setMercadosSelecionados([]);
      setAba('pendentes');
    } catch (err) {
      toast({ title: 'Erro ao gerar pedido', description: err.message, variant: 'destructive' });
    } finally {
      setIsSalvandoPedido(false);
    }
  };

  // ─── Abas: Pendentes de Baixa / Histórico ──────────────────────────────
  const [pedidos, setPedidos] = useState([]);
  const [isLoadingPedidos, setIsLoadingPedidos] = useState(false);
  const [pedidoAberto, setPedidoAberto] = useState(null);
  const [isDandoBaixa, setIsDandoBaixa] = useState(false);

  const carregarPedidos = useCallback(async (status) => {
    if (!empresaId) return;
    setIsLoadingPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_consignado')
        .select(`
          id, data_inicio, data_fim, status, valor_total, gerado_em, baixado_em,
          pedidos_consignado_mercados(id, valor_total, locais(nome))
        `)
        .eq('empresa_id', empresaId)
        .eq('status', status)
        .order('gerado_em', { ascending: false });
      if (error) throw error;
      setPedidos(data || []);
    } catch (err) {
      toast({ title: 'Erro ao carregar pedidos', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingPedidos(false);
    }
  }, [empresaId, toast]);

  useEffect(() => {
    if (aba === 'pendentes') carregarPedidos('gerado');
    if (aba === 'historico') carregarPedidos('baixado');
    setPedidoAberto(null);
  }, [aba, carregarPedidos]);

  const abrirDetalhePedido = async (pedidoResumo) => {
    setIsLoadingPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_consignado')
        .select(`
          id, data_inicio, data_fim, status, valor_total, gerado_em, baixado_em,
          pedidos_consignado_mercados(
            id, valor_total, locais(nome),
            status_fiscal, nfe_id, nfe_chave, nfe_url_pdf, nfe_erro_mensagem, cpf_cnpj_utilizado, email_enviado_para,
            pedidos_consignado_itens(produto_id, produto_nome, categoria, quantidade, valor_unitario, valor_total)
          )
        `)
        .eq('id', pedidoResumo.id)
        .single();
      if (error) throw error;
      setPedidoAberto(data);
    } catch (err) {
      toast({ title: 'Erro ao abrir pedido', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingPedidos(false);
    }
  };

  const [isGerandoPdf, setIsGerandoPdf] = useState(false);

  // ─── NF por mercado (Pedido Consignado) — mesmo padrão já validado no
  // Faturamento de Reabastecimento, individual + combinada. ────────────
  const [docPorMercado, setDocPorMercado] = useState({});
  const [emailPorMercado, setEmailPorMercado] = useState({});
  const [docValidoPorMercado, setDocValidoPorMercado] = useState({});
  const [emitindoNfId, setEmitindoNfId] = useState(null);
  const [enviandoEmailId, setEnviandoEmailId] = useState(null);
  const [baixandoNfId, setBaixandoNfId] = useState(null);

  const [mercadosParaCombinar, setMercadosParaCombinar] = useState(new Set());
  const [docCombinado, setDocCombinado] = useState('');
  const [emailCombinado, setEmailCombinado] = useState('');
  const [docCombinadoValido, setDocCombinadoValido] = useState(null);
  const [emitindoCombinado, setEmitindoCombinado] = useState(false);
  const [enviandoEmailCombinado, setEnviandoEmailCombinado] = useState(false);

  const toggleMercadoParaCombinar = (mercadoId) => {
    setMercadosParaCombinar((prev) => {
      const novo = new Set(prev);
      if (novo.has(mercadoId)) novo.delete(mercadoId);
      else novo.add(mercadoId);
      return novo;
    });
  };

  const atualizarMercadoNoPedidoAberto = (mercadoId, patch) => {
    setPedidoAberto((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pedidos_consignado_mercados: prev.pedidos_consignado_mercados.map((mm) =>
          mm.id === mercadoId ? { ...mm, ...patch } : mm
        ),
      };
    });
  };

  const atualizarVariosMercadosNoPedidoAberto = (mercadoIds, patch) => {
    setPedidoAberto((prev) => {
      if (!prev) return prev;
      const idsSet = new Set(mercadoIds);
      return {
        ...prev,
        pedidos_consignado_mercados: prev.pedidos_consignado_mercados.map((mm) =>
          idsSet.has(mm.id) ? { ...mm, ...patch } : mm
        ),
      };
    });
  };

  const handleEmitirNF = async (mercado) => {
    const doc = docPorMercado[mercado.id] || '';
    const digitos = doc.replace(/\D/g, '');
    if (digitos.length !== 11 && digitos.length !== 14) {
      toast({ title: 'CPF/CNPJ inválido', description: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.', variant: 'destructive' });
      return;
    }
    setEmitindoNfId(mercado.id);
    try {
      const resultado = await fiscalConsignadoService.emitirNFCe(mercado, pedidoAberto, empresaId, doc);
      if (resultado.success) {
        atualizarMercadoNoPedidoAberto(mercado.id, {
          status_fiscal: 'emitido',
          nfe_id: resultado.nfe_id,
          nfe_chave: resultado.nfe_chave,
          nfe_url_pdf: resultado.nfe_url_pdf,
          nfe_erro_mensagem: null,
          cpf_cnpj_utilizado: resultado.cpf_cnpj_utilizado,
        });
        toast({ title: 'NF emitida!', description: `Nota fiscal de ${mercado.locais?.nome} gerada com sucesso.`, className: 'bg-emerald-600 text-white' });
        if (resultado.nfe_url_pdf) window.open(resultado.nfe_url_pdf, '_blank');
      } else {
        atualizarMercadoNoPedidoAberto(mercado.id, { status_fiscal: 'erro', nfe_erro_mensagem: resultado.erro });
        toast({ title: 'Erro ao emitir NF', description: resultado.erro, variant: 'destructive' });
      }
    } finally {
      setEmitindoNfId(null);
    }
  };

  const handleBaixarNF = async (mercado) => {
    if (!mercado.nfe_url_pdf) return;
    setBaixandoNfId(mercado.id);
    try {
      const resposta = await fetch(mercado.nfe_url_pdf);
      if (!resposta.ok) throw new Error('Falha ao baixar o PDF.');
      const blob = await resposta.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const nomeArquivo = `NF_${mercado.locais?.nome || 'consignado'}.pdf`.replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlBlob);
    } catch (err) {
      window.open(mercado.nfe_url_pdf, '_blank');
    } finally {
      setBaixandoNfId(null);
    }
  };

  const handleEnviarEmail = async (mercado) => {
    const email = (emailPorMercado[mercado.id] || '').trim();
    if (!email) {
      toast({ title: 'Digite um e-mail', description: 'Informe o e-mail do cliente antes de enviar.', variant: 'destructive' });
      return;
    }
    setEnviandoEmailId(mercado.id);
    try {
      const resultado = await fiscalConsignadoService.enviarEmailNF(email, mercado, pedidoAberto, fmt);
      if (resultado.success) {
        atualizarMercadoNoPedidoAberto(mercado.id, { email_enviado_para: email });
        toast({ title: 'E-mail enviado!', description: `Enviado para ${email}.`, className: 'bg-emerald-600 text-white' });
      } else {
        toast({ title: 'Erro ao enviar e-mail', description: resultado.error, variant: 'destructive' });
      }
    } finally {
      setEnviandoEmailId(null);
    }
  };

  const mercadosSelecionadosParaCombinar = () =>
    (pedidoAberto?.pedidos_consignado_mercados || []).filter((m) => mercadosParaCombinar.has(m.id));

  const handleEmitirNFCombinada = async () => {
    const mercados = mercadosSelecionadosParaCombinar();
    if (mercados.length < 2) {
      toast({ title: 'Selecione ao menos 2 mercados', description: 'Marque pelo menos dois mercados pra unificar numa nota só.', variant: 'destructive' });
      return;
    }
    const digitos = docCombinado.replace(/\D/g, '');
    if (digitos.length !== 11 && digitos.length !== 14) {
      toast({ title: 'CPF/CNPJ inválido', description: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.', variant: 'destructive' });
      return;
    }
    setEmitindoCombinado(true);
    try {
      const resultado = await fiscalConsignadoService.emitirNFCeCombinada(mercados, pedidoAberto, empresaId, docCombinado);
      const idsMercados = mercados.map((m) => m.id);
      if (resultado.success) {
        atualizarVariosMercadosNoPedidoAberto(idsMercados, {
          status_fiscal: 'emitido',
          nfe_id: resultado.nfe_id,
          nfe_chave: resultado.nfe_chave,
          nfe_url_pdf: resultado.nfe_url_pdf,
          nfe_erro_mensagem: null,
          cpf_cnpj_utilizado: resultado.cpf_cnpj_utilizado,
        });
        toast({ title: 'NF combinada emitida!', description: `Nota única gerada para ${mercados.length} mercados.`, className: 'bg-emerald-600 text-white' });
        if (resultado.nfe_url_pdf) window.open(resultado.nfe_url_pdf, '_blank');
        setMercadosParaCombinar(new Set());
        setDocCombinado('');
      } else {
        atualizarVariosMercadosNoPedidoAberto(idsMercados, { status_fiscal: 'erro', nfe_erro_mensagem: resultado.erro });
        toast({ title: 'Erro ao emitir NF combinada', description: resultado.erro, variant: 'destructive' });
      }
    } finally {
      setEmitindoCombinado(false);
    }
  };

  const handleEnviarEmailCombinado = async () => {
    const mercados = mercadosSelecionadosParaCombinar();
    const email = emailCombinado.trim();
    if (mercados.length < 2) {
      toast({ title: 'Selecione ao menos 2 mercados', variant: 'destructive' });
      return;
    }
    if (!email) {
      toast({ title: 'Digite um e-mail', description: 'Informe o e-mail do cliente antes de enviar.', variant: 'destructive' });
      return;
    }
    setEnviandoEmailCombinado(true);
    try {
      const resultado = await fiscalConsignadoService.enviarEmailNFCombinado(email, mercados, pedidoAberto, fmt);
      if (resultado.success) {
        atualizarVariosMercadosNoPedidoAberto(mercados.map((m) => m.id), { email_enviado_para: email });
        toast({ title: 'E-mail enviado!', description: `Enviado para ${email}.`, className: 'bg-emerald-600 text-white' });
      } else {
        toast({ title: 'Erro ao enviar e-mail', description: resultado.error, variant: 'destructive' });
      }
    } finally {
      setEnviandoEmailCombinado(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────

  const baixarPdfPedido = async () => {
    if (!pedidoAberto) return;
    setIsGerandoPdf(true);
    try {
      const [{ data: emp }, { data: fiscal }] = await Promise.all([
        empresaId ? supabase.from('empresas').select('logo_url, nome').eq('id', empresaId).single() : Promise.resolve({ data: null }),
        empresaId ? supabase.from('configuracoes_fiscais').select('razao_social, cnpj').eq('empresa_id', empresaId).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      const RED = '#b91c1c';
      const logoTag = emp?.logo_url
        ? `<img src="${emp.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;padding:3px;" />`
        : `<span style="font-size:9px;font-weight:bold;color:${RED};text-align:center;line-height:1.3;">${(emp?.nome || 'Empresa').slice(0, 12)}</span>`;

      const cnpjFormatado = (fiscal?.cnpj || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

      const mercadosHtml = (pedidoAberto.pedidos_consignado_mercados || []).map(m => {
        const itensPorCategoria = {};
        (m.pedidos_consignado_itens || []).forEach(item => {
          if (!itensPorCategoria[item.categoria]) itensPorCategoria[item.categoria] = [];
          itensPorCategoria[item.categoria].push(item);
        });

        const linhasHtml = Object.entries(itensPorCategoria).map(([categoria, itens]) => {
          return itens.map((item, i) => `
            <tr>
              ${i === 0 ? `<td rowspan="${itens.length}" style="border:1px solid #ddd;padding:6px 8px;font-size:11px;vertical-align:middle;background:#fafafa;">${categoria}</td>` : ''}
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${item.produto_nome}</td>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:center;">${item.quantidade}</td>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(item.valor_unitario)}</td>
              <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(item.valor_total)}</td>
            </tr>
          `).join('');
        }).join('');

        return `
          <p style="font-size:14px;font-weight:bold;margin:18px 0 6px;">${m.locais?.nome || ''}</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
            <thead>
              <tr style="background:${RED};color:#fff;">
                <th style="padding:6px 8px;font-size:11px;text-align:left;">Categoria</th>
                <th style="padding:6px 8px;font-size:11px;text-align:left;">Item</th>
                <th style="padding:6px 8px;font-size:11px;text-align:center;">Vendas de ${formatDate(pedidoAberto.data_inicio)} a ${formatDate(pedidoAberto.data_fim)}</th>
                <th style="padding:6px 8px;font-size:11px;text-align:right;">Valor Un</th>
                <th style="padding:6px 8px;font-size:11px;text-align:right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>${linhasHtml}</tbody>
            <tfoot>
              <tr style="background:${RED};color:#fff;">
                <td colspan="4" style="padding:6px 8px;font-size:12px;font-weight:bold;text-align:right;">TOTAL</td>
                <td style="padding:6px 8px;font-size:12px;font-weight:bold;text-align:right;">${fmt(m.valor_total)}</td>
              </tr>
            </tfoot>
          </table>
        `;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pedido Consignado - ${formatDate(pedidoAberto.data_inicio)} a ${formatDate(pedidoAberto.data_fim)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; font-family: Arial, sans-serif; color: #222; }
    .page { width: 210mm; background: #fff; margin: 0 auto; }
    .body { padding: 20px 32px; background: #fff; }
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
    table { page-break-inside: avoid; }
  </style>
</head>
<body>

<div class="no-print" style="text-align:center;padding:16px;background:#fff;">
  <button onclick="window.print()" style="background:${RED};color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;">
    🖨 Imprimir / Salvar como PDF
  </button>
</div>

<div class="page">

  <!-- HEADER -->
  <div style="background:${RED};padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-radius:0 0 40px 40px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:56px;height:56px;border-radius:50%;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${logoTag}
      </div>
      <span style="color:#fff;font-weight:bold;font-size:16px;">${emp?.nome || ''}</span>
    </div>
  </div>

  <div class="body">
    <h1 style="font-size:20px;font-weight:bold;margin:16px 0 4px;">Pedido Consignado</h1>
    <p style="font-size:12px;color:#666;margin-bottom:16px;">Período: ${formatDate(pedidoAberto.data_inicio)} a ${formatDate(pedidoAberto.data_fim)}</p>

    ${mercadosHtml}

    <div style="margin-top:20px;display:flex;justify-content:flex-end;">
      <div style="text-align:right;">
        <p style="font-size:13px;color:#666;">Total do pedido</p>
        <p style="font-size:20px;font-weight:bold;color:${RED};">${fmt(pedidoAberto.valor_total)}</p>
      </div>
    </div>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #ddd;">
      <p style="font-size:12px;font-weight:bold;margin-bottom:4px;">Pagamento:</p>
      <p style="font-size:12px;">Via Pix: ${fiscal?.razao_social || emp?.nome || ''}</p>
      ${fiscal?.cnpj ? `<p style="font-size:12px;">Chave Pix CNPJ: ${cnpjFormatado}</p>` : ''}
    </div>
  </div>
</div>

</body>
</html>`;

      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
    } catch (err) {
      toast({ title: 'Erro ao gerar PDF', description: err.message, variant: 'destructive' });
    } finally {
      setIsGerandoPdf(false);
    }
  };

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [isExcluindo, setIsExcluindo] = useState(false);

  const excluirPedido = async () => {
    if (!pedidoAberto) return;
    setIsExcluindo(true);
    try {
      // A tabela de pedido é a "mãe" — excluir ela já remove mercados,
      // itens e o vínculo com as vendas (ON DELETE CASCADE), liberando
      // essas vendas pra entrar num pedido novo depois.
      const { error } = await supabase.from('pedidos_consignado').delete().eq('id', pedidoAberto.id);
      if (error) throw error;

      toast({ title: 'Pedido excluído', description: 'As vendas desse pedido estão livres pra entrar num pedido novo.' });
      setConfirmandoExclusao(false);
      setPedidoAberto(null);
      carregarPedidos('gerado');
    } catch (err) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    } finally {
      setIsExcluindo(false);
    }
  };

  const darBaixaPedido = async () => {
    if (!pedidoAberto) return;
    setIsDandoBaixa(true);
    try {
      const { data: vendasLigadas, error: erroBusca } = await supabase
        .from('pedidos_consignado_vendas').select('venda_id').eq('pedido_id', pedidoAberto.id);
      if (erroBusca) throw erroBusca;

      const vendaIds = (vendasLigadas || []).map(v => v.venda_id);
      if (vendaIds.length > 0) {
        const { error: erroUpdate } = await supabase.from('vendas').update({
          financeiro_baixado: true, data_baixa: new Date().toISOString(), status: 'CONCILIADO',
        }).in('id', vendaIds);
        if (erroUpdate) throw erroUpdate;
      }

      const { error: erroPedido } = await supabase.from('pedidos_consignado').update({
        status: 'baixado', baixado_em: new Date().toISOString(), baixado_por: currentUser?.id || null,
      }).eq('id', pedidoAberto.id);
      if (erroPedido) throw erroPedido;

      toast({ title: 'Baixa confirmada!', description: `${fmt(pedidoAberto.valor_total)} marcados como recebidos.`, className: 'bg-emerald-600 text-white' });
      setPedidoAberto(null);
      carregarPedidos('gerado');
    } catch (err) {
      toast({ title: 'Erro ao dar baixa', description: err.message, variant: 'destructive' });
    } finally {
      setIsDandoBaixa(false);
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setAba(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${aba === id ? 'bg-purple-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <>
      <Helmet><title>Pedido Consignado - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 text-purple-600 p-3 rounded-xl">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pedido Consignado</h1>
                <p className="text-gray-500 text-sm mt-0.5">Gere o pedido pra enviar, e dê baixa só depois que o pagamento cair.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <TabButton id="gerar" label="Gerar Pedido" icon={FileText} />
            <TabButton id="pendentes" label="Aguardando Pagamento" icon={ClipboardList} />
            <TabButton id="historico" label="Histórico" icon={CheckCircle2} />
          </div>

          {/* ─── ABA: GERAR PEDIDO ─────────────────────────────────────── */}
          {aba === 'gerar' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Mercados Consignados (pode escolher mais de um)</label>
                  {mercados.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Nenhum mercado marcado como "Consignado" ainda. Configure isso em Cadastros {'>'} Locais.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                      {mercados.map(m => (
                        <button
                          key={m.id}
                          onClick={() => toggleMercado(m.id)}
                          className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors ${mercadosSelecionados.includes(m.id) ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-purple-300'
                            }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${mercadosSelecionados.includes(m.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                            }`}>
                            {mercadosSelecionados.includes(m.id) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <span className="text-sm font-medium text-gray-800">{m.nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                    <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPreview(null); }}
                      className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" style={{ fontSize: '14px' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                    <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPreview(null); }}
                      className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" style={{ fontSize: '14px' }} />
                  </div>
                  <Button onClick={gerarPreview} disabled={mercadosSelecionados.length === 0 || isGerandoPreview} className="gap-2 bg-purple-600 hover:bg-purple-700 h-10">
                    {isGerandoPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar Prévia
                  </Button>
                </div>
              </div>

              {preview && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500">Prévia — vendas de {formatDate(dataInicio)} a {formatDate(dataFim)}</p>
                  </div>

                  {preview.mercados.map(m => (
                    <div key={m.local.id} className="p-5 space-y-4 border-b border-gray-100 last:border-b-0">
                      <p className="font-bold text-gray-900 flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-purple-500" /> {m.local.nome}
                      </p>
                      {m.categorias.map(cat => (
                        <div key={cat.categoria}>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" /> {cat.categoria}
                          </p>
                          <div className="border border-gray-100 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold">Item</th>
                                  <th className="text-right px-3 py-2 font-semibold">Vendas</th>
                                  <th className="text-right px-3 py-2 font-semibold">Valor Un</th>
                                  <th className="text-right px-3 py-2 font-semibold">Valor Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {cat.itens.map((item, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 text-gray-800">{item.nome}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.quantidade}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{fmt(item.valorUnitario)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(item.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <span className="text-sm font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-full">
                          Subtotal {m.local.nome}: {fmt(m.subtotal)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="px-5 py-4 border-t border-gray-100 bg-purple-50 flex items-center justify-between">
                    <p className="font-bold text-purple-800">Total do Pedido</p>
                    <p className="text-xl font-black text-purple-700">{fmt(preview.totalGeral)}</p>
                  </div>

                  <div className="p-5 border-t border-gray-100">
                    <Button
                      onClick={confirmarGerarPedido}
                      disabled={isSalvandoPedido}
                      className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl gap-2"
                    >
                      {isSalvandoPedido
                        ? <><Loader2 className="h-5 w-5 animate-spin" /> Gerando...</>
                        : <><FileText className="h-5 w-5" /> Confirmar e Gerar Pedido</>
                      }
                    </Button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Isso só cria o pedido — nada é marcado como pago ainda. A baixa é feita depois, na aba
                      "Aguardando Pagamento", quando o valor realmente cair.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── ABAS: PENDENTES / HISTÓRICO ───────────────────────────── */}
          {(aba === 'pendentes' || aba === 'historico') && !pedidoAberto && (
            <div className="space-y-3">
              {isLoadingPedidos ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>
              ) : pedidos.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  {aba === 'pendentes'
                    ? <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-300 mb-3" />
                    : <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  }
                  <p className="text-gray-500 font-medium">
                    {aba === 'pendentes' ? 'Nenhum pedido aguardando pagamento.' : 'Nenhum pedido baixado ainda.'}
                  </p>
                </div>
              ) : (
                pedidos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => abrirDetalhePedido(p)}
                    className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                          {(p.pedidos_consignado_mercados || []).map(m => m.locais?.nome).join(', ')}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" /> {formatDate(p.data_inicio)} a {formatDate(p.data_fim)} ·
                          {aba === 'pendentes' ? ` gerado em ${formatDateTime(p.gerado_em)}` : ` baixado em ${formatDateTime(p.baixado_em)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-lg font-black text-purple-600">{fmt(p.valor_total)}</p>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {pedidoAberto && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-bold text-gray-900">Detalhe do Pedido</p>
                  <p className="text-xs text-gray-500">{formatDate(pedidoAberto.data_inicio)} a {formatDate(pedidoAberto.data_fim)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={baixarPdfPedido} disabled={isGerandoPdf} size="sm" variant="outline" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50">
                    {isGerandoPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Baixar PDF
                  </Button>
                  {pedidoAberto.status === 'gerado' && (
                    <Button onClick={() => setConfirmandoExclusao(true)} size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  )}
                  <button onClick={() => setPedidoAberto(null)} className="text-sm text-gray-500 hover:text-gray-700">Fechar</button>
                </div>
              </div>

              {(pedidoAberto.pedidos_consignado_mercados || []).length > 1 && (
                <div className="px-5 py-3 bg-purple-50/60 border-b border-purple-100">
                  <p className="text-xs text-purple-700">
                    Mercados do mesmo dono? Marque a caixinha em cada um pra emitir <strong>uma nota só</strong> com todos os produtos juntos, mais abaixo.
                  </p>
                </div>
              )}

              {(pedidoAberto.pedidos_consignado_mercados || []).map(m => (
                <div key={m.id} className="p-5 space-y-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-gray-900 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-purple-500" /> {m.locais?.nome}
                    </p>
                    {(pedidoAberto.pedidos_consignado_mercados || []).length > 1 && m.status_fiscal !== 'emitido' && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mercadosParaCombinar.has(m.id)}
                          onChange={() => toggleMercadoParaCombinar(m.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-400"
                        />
                        Incluir na nota combinada
                      </label>
                    )}
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Categoria</th>
                          <th className="text-left px-3 py-2 font-semibold">Item</th>
                          <th className="text-right px-3 py-2 font-semibold">Qtd</th>
                          <th className="text-right px-3 py-2 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(m.pedidos_consignado_itens || []).map((item, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-500">{item.categoria}</td>
                            <td className="px-3 py-2 text-gray-800">{item.produto_nome}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{item.quantidade}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(item.valor_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-sm font-bold text-purple-700">Subtotal: {fmt(m.valor_total)}</span>
                  </div>

                  {/* Emissão de NF + envio por e-mail, por mercado */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" /> Nota Fiscal
                      </p>
                      {m.status_fiscal && (
                        <NFCeStatusBadge
                          status_fiscal={m.status_fiscal}
                          nfe_chave={m.nfe_chave}
                          nfe_erro_mensagem={m.nfe_erro_mensagem}
                          nfe_id={m.nfe_id}
                          onRetry={m.status_fiscal === 'erro' ? () => handleEmitirNF(m) : undefined}
                        />
                      )}
                    </div>

                    {m.status_fiscal === 'emitido' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.nfe_url_pdf && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => handleBaixarNF(m)}
                            disabled={baixandoNfId === m.id}
                          >
                            {baixandoNfId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            Baixar NF
                          </Button>
                        )}
                        <span className="text-xs text-gray-400">
                          {m.cpf_cnpj_utilizado?.length === 14 ? 'CNPJ' : 'CPF'} usado nessa nota: {m.cpf_cnpj_utilizado}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div className="flex-1">
                          <CPFNaNotaInput
                            value={docPorMercado[m.id] || ''}
                            onChange={(v) => setDocPorMercado((prev) => ({ ...prev, [m.id]: v }))}
                            onValidationChange={(valido) => setDocValidoPorMercado((prev) => ({ ...prev, [m.id]: valido }))}
                          />
                        </div>
                        <Button
                          onClick={() => handleEmitirNF(m)}
                          disabled={
                            emitindoNfId === m.id ||
                            !(docPorMercado[m.id] || '').replace(/\D/g, '') ||
                            docValidoPorMercado[m.id] === false
                          }
                          className="gap-2 bg-purple-600 hover:bg-purple-700 shrink-0"
                        >
                          {emitindoNfId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                          Emitir NF
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1 border-t border-gray-200/70">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> E-mail do cliente (opcional)
                        </label>
                        <Input
                          type="email"
                          placeholder="cliente@email.com"
                          value={emailPorMercado[m.id] || ''}
                          onChange={(e) => setEmailPorMercado((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          className="h-10 bg-white"
                        />
                      </div>
                      <Button
                        onClick={() => handleEnviarEmail(m)}
                        disabled={enviandoEmailId === m.id || !(emailPorMercado[m.id] || '').trim()}
                        variant="outline"
                        className="gap-2 shrink-0"
                      >
                        {enviandoEmailId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar por e-mail
                      </Button>
                    </div>
                    {m.email_enviado_para && (
                      <p className="text-[11px] text-gray-400">Último envio: {m.email_enviado_para}</p>
                    )}
                  </div>
                </div>
              ))}

              {mercadosParaCombinar.size >= 2 && (
                <div className="p-5 bg-indigo-50 border-b border-indigo-100 space-y-3">
                  <p className="text-xs font-semibold text-indigo-700 uppercase flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" /> Nota Fiscal combinada — {mercadosParaCombinar.size} mercados selecionados
                  </p>
                  <p className="text-xs text-indigo-600">
                    {mercadosSelecionadosParaCombinar().map((m) => m.locais?.nome).join(', ')}
                    {' — '}Total combinado: <strong>{fmt(mercadosSelecionadosParaCombinar().reduce((s, m) => s + (parseFloat(m.valor_total) || 0), 0))}</strong>
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                      <CPFNaNotaInput
                        value={docCombinado}
                        onChange={setDocCombinado}
                        onValidationChange={setDocCombinadoValido}
                      />
                    </div>
                    <Button
                      onClick={handleEmitirNFCombinada}
                      disabled={emitindoCombinado || !docCombinado.replace(/\D/g, '') || docCombinadoValido === false}
                      className="gap-2 bg-indigo-600 hover:bg-indigo-700 shrink-0"
                    >
                      {emitindoCombinado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                      Emitir NF combinada
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1 border-t border-indigo-200/60">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> E-mail do cliente (opcional)
                      </label>
                      <Input
                        type="email"
                        placeholder="cliente@email.com"
                        value={emailCombinado}
                        onChange={(e) => setEmailCombinado(e.target.value)}
                        className="h-10 bg-white"
                      />
                    </div>
                    <Button
                      onClick={handleEnviarEmailCombinado}
                      disabled={enviandoEmailCombinado || !emailCombinado.trim()}
                      variant="outline"
                      className="gap-2 shrink-0"
                    >
                      {enviandoEmailCombinado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Enviar por e-mail
                    </Button>
                  </div>
                </div>
              )}

              <div className="px-5 py-4 border-t border-gray-100 bg-purple-50 flex items-center justify-between">
                <p className="font-bold text-purple-800">Total do Pedido</p>
                <p className="text-xl font-black text-purple-700">{fmt(pedidoAberto.valor_total)}</p>
              </div>

              {aba === 'pendentes' && pedidoAberto.status === 'gerado' && (
                <div className="p-5 border-t border-gray-100 space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Só confirme depois que o pagamento realmente cair. Isso marca as vendas desse pedido como
                      pagas nos relatórios.
                    </p>
                  </div>
                  <Button
                    onClick={darBaixaPedido}
                    disabled={isDandoBaixa}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-2"
                  >
                    {isDandoBaixa
                      ? <><Loader2 className="h-5 w-5 animate-spin" /> Dando baixa...</>
                      : <><DollarSign className="h-5 w-5" /> Confirmar Recebimento e Dar Baixa</>
                    }
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <AlertDialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esse pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso apaga o pedido gerado ({fmt(pedidoAberto?.valor_total || 0)}). As vendas que faziam parte
                dele voltam a ficar disponíveis pra entrar num pedido novo. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isExcluindo}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={excluirPedido} disabled={isExcluindo} className="bg-red-600 hover:bg-red-700">
                {isExcluindo ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Excluindo...</> : 'Sim, excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}