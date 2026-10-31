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
  Truck, ArrowLeft, MapPin, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, Package, DollarSign, FileText, ClipboardList, Calendar, ChevronRight, Download, Trash2,
  Receipt, Mail, Send,
} from 'lucide-react';
import CPFNaNotaInput from '@/components/fiscal/CPFNaNotaInput';
import NFCeStatusBadge from '@/components/fiscal/NFCeStatusBadge';
import { Input } from '@/components/ui/input';
import { validateNFcePayload } from '@/utils/validateNFcePayload';
import { recordMarketplaceSale } from '@/services/salesService';

// ─── Serviço de emissão de NF do Faturamento de Reabastecimento ───────────
// Está aqui dentro (em vez de um arquivo separado em /services) só porque
// o Horizons não estava conseguindo criar arquivo novo do zero. Se no
// futuro isso for resolvido, pode extrair pra um arquivo próprio sem
// problema — é só copiar este bloco inteiro.
const fiscalReabastecimentoService = {
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

  /**
   * Monta o payload da NF a partir de um "mercado" dentro de um pedido de
   * reabastecimento (pedidos_reabastecimento_mercados, já com seus itens).
   */
  construirPayload(pedidoMercado, pedido, configuracoes, docCliente) {
    const docLimpo = (docCliente || '').replace(/\D/g, '');
    const ehCnpj = docLimpo.length === 14;
    const ehCpf = docLimpo.length === 11;

    let regimeEmitente = '1';
    if (configuracoes.regime_tributario === 'Lucro Presumido') regimeEmitente = '2';
    if (configuracoes.regime_tributario === 'Lucro Real') regimeEmitente = '3';

    const itensOrigem = pedidoMercado.pedidos_reabastecimento_itens || [];

    // Agrupa por produto: as linhas "(−) Danificado: X" / "(−) Devolvido: X"
    // vêm como linhas SEPARADAS na origem (mesmo produto_id da linha de
    // entrega). A Focus não aceita item com valor negativo, então aqui
    // elas viram DESCONTO do item principal — mas o produto continua
    // aparecendo na nota (mesmo que zere), pra dar pra bater a
    // informação com o que foi entregue/danificado/devolvido.
    const porProduto = new Map();
    // Crédito de troca por produto de menor valor (produto_id null, linha
    // negativa sem produto próprio) não é dedução de UM produto — é um
    // desconto geral do pedido. A Focus não aceita item negativo, então não
    // dá pra mandar essa linha direto: ela é distribuída proporcionalmente
    // entre os itens de verdade logo abaixo, depois de montado o valor
    // líquido de cada um.
    let creditoGeralNF = 0;
    itensOrigem.forEach((item) => {
      const valorTotalLinhaBruta = parseFloat(item.valor_total) || 0;
      if (!item.produto_id && valorTotalLinhaBruta < 0) {
        creditoGeralNF += Math.abs(valorTotalLinhaBruta);
        return;
      }
      const chave = item.produto_id || item.produto_nome;
      if (!porProduto.has(chave)) {
        porProduto.set(chave, {
          produto_id: item.produto_id,
          nome: (item.produto_nome || 'Produto').replace(/^\(\s*[−-]\s*\)\s*(Danificado|Devolvido):\s*/i, ''),
          quantidadeEntregue: 0,
          valorPositivo: 0,
          valorUnitario: 0,
          deducao: 0,
        });
      }
      const grupo = porProduto.get(chave);
      const qtde = parseFloat(item.quantidade) || 0;
      const valorTotalLinha = valorTotalLinhaBruta;

      if (valorTotalLinha >= 0) {
        // Linha de entrega — CONFIA no valor_total já gravado em vez de
        // recalcular qtd × preço. Isso importa porque hoje a geração do
        // pedido já pode vir com o desconto de dano/devolução embutido
        // direto nessa mesma linha (uma linha só por produto); recalcular
        // do zero ignorava esse desconto e inflava o valor (foi o bug da
        // Esfiha de Carne). Formato antigo (linha positiva sempre bruta +
        // linha negativa separada) continua funcionando igual, porque aí
        // a soma das positivas já é o bruto mesmo.
        grupo.quantidadeEntregue += qtde;
        grupo.valorPositivo += valorTotalLinha;
        grupo.valorUnitario = parseFloat(item.valor_unitario) || grupo.valorUnitario;
      } else {
        // Linha de dano/devolução separada (formato antigo) — vira
        // desconto do produto.
        grupo.deducao += Math.abs(valorTotalLinha);
      }
    });

    let valorTotalProdutos = 0;
    let valorDescontoTotal = 0;
    let numeroItem = 0;

    // Todos os produtos entram na nota — mesmo os que zeram de tão
    // deduzidos (dano/devolução total). O desconto nunca passa do valor
    // bruto do item (a Focus não aceita item negativo): se a dedução
    // registrada for maior que o entregue (ex: mesma unidade contada
    // como dano E devolução), o item fica travado em R$ 0,00, não
    // negativo — isso é limite da SEFAZ, não de como montamos o payload.
    const gruposComLiquido = Array.from(porProduto.values()).map((g) => {
      const valorBruto = Math.round(g.valorPositivo * 100) / 100;
      const descontoDanoDevolucao = Math.min(valorBruto, Math.round(g.deducao * 100) / 100);
      return { ...g, valorBruto, descontoDanoDevolucao, liquidoAposDanoDevolucao: Math.round((valorBruto - descontoDanoDevolucao) * 100) / 100 };
    });

    // Distribui o crédito de troca proporcionalmente sobre o que sobrou de
    // líquido em cada item (nunca passa do total disponível, senão algum
    // item ficaria negativo) — mesmo princípio do desconto pro-rata usado
    // nas vendas normais (fiscalService.js).
    const totalLiquidoDisponivel = gruposComLiquido.reduce((s, g) => s + g.liquidoAposDanoDevolucao, 0);
    const creditoAplicavel = Math.min(creditoGeralNF, Math.round(totalLiquidoDisponivel * 100) / 100);
    let creditoDistribuido = 0;
    const gruposFinais = gruposComLiquido.map((g, idx) => {
      if (creditoAplicavel <= 0 || totalLiquidoDisponivel <= 0) return { ...g, descontoTotal: g.descontoDanoDevolucao };
      const ultimoItem = idx === gruposComLiquido.length - 1;
      const parteCredito = ultimoItem
        ? Math.round((creditoAplicavel - creditoDistribuido) * 100) / 100
        : Math.round((g.liquidoAposDanoDevolucao / totalLiquidoDisponivel) * creditoAplicavel * 100) / 100;
      creditoDistribuido += parteCredito;
      return { ...g, descontoTotal: Math.round((g.descontoDanoDevolucao + parteCredito) * 100) / 100 };
    });

    const itens = gruposFinais.map((g) => {
      numeroItem += 1;
      const valorBruto = g.valorBruto;
      const descontoItem = Math.min(valorBruto, g.descontoTotal);
      // Preço efetivo por unidade, derivado do valor bruto real — não do
      // valorUnitario cru, que pode não bater mais com valorBruto/qtd
      // quando o desconto já vem embutido na linha (evita a NF ficar
      // matematicamente inconsistente: qtd × preço tem que dar o bruto).
      const precoEfetivo = g.quantidadeEntregue > 0 ? valorBruto / g.quantidadeEntregue : g.valorUnitario;

      valorTotalProdutos += valorBruto;
      valorDescontoTotal += descontoItem;

      return {
        numero_item: numeroItem.toString(),
        codigo_produto: (g.produto_id || '0').toString().substring(0, 10),
        codigo_barras_comercial: 'SEM GTIN',
        descricao: g.nome,
        codigo_ncm: '19059090',
        cfop: '5102',
        unidade_comercial: 'un',
        quantidade_comercial: g.quantidadeEntregue.toFixed(4),
        valor_unitario_comercial: precoEfetivo.toFixed(10),
        valor_bruto: valorBruto.toFixed(2),
        ...(descontoItem > 0 ? { valor_desconto: descontoItem.toFixed(2) } : {}),
        codigo_barras_tributavel: 'SEM GTIN',
        unidade_tributavel: 'un',
        quantidade_tributavel: g.quantidadeEntregue.toFixed(4),
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


    const totalNF = Math.round((valorTotalProdutos - valorDescontoTotal) * 100) / 100;
    const totalRegistradoNoPedido = Math.round(parseFloat(pedidoMercado.valor_total || 0) * 100) / 100;
    // Normalmente bate certinho com o subtotal exibido na tela. Só diverge
    // no caso raro de um mesmo produto ter sido contado como dano E
    // devolução ao mesmo tempo (dedução dobrada) — aí a NF usa o valor
    // "chão em zero" por item (nunca negativo), que pode ficar um pouco
    // maior que o subtotal financeiro mostrado no pedido.
    const divergeDoSubtotal = Math.abs(totalNF - totalRegistradoNoPedido) > 0.01;

    const nomeDestinatario = pedidoMercado.locais?.nome || 'CLIENTE';

    if (divergeDoSubtotal) {
      console.warn(
        `[NF Reabastecimento] Total da NF (${totalNF.toFixed(2)}) diverge do subtotal do pedido (${totalRegistradoNoPedido.toFixed(2)}) — provavelmente produto com dano E devolução contados juntos.`
      );
    }

    return {
      natureza_operacao: 'Venda',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      local_destino: '1',
      finalidade_emissao: '1',
      // A conta Focus configurada aqui só emite NFC-e (mod. 65), e a
      // SEFAZ exige, sempre, consumidor_final="1" (rejeição 716 se não)
      // e presenca_comprador="1" ou "4" (rejeição 717 se não) — não tem
      // meio-termo pra B2B nesse modelo de documento. Segue exatamente o
      // mesmo valor já usado (e já funcionando) no PDV Rápido.
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
      valor_desconto: valorDescontoTotal > 0 ? valorDescontoTotal.toFixed(2) : '0.00',
      valor_total_ii: '0',
      valor_ipi: '0',
      valor_ipi_devolvido: '0',
      valor_pis: '0',
      valor_cofins: '0',
      valor_total: totalNF.toFixed(2),
      modalidade_frete: '9',

      // Forma de pagamento não é rastreada no faturamento de reabastecimento
      // (a baixa é manual, sem meio de pagamento específico) — usa "Outros".
      formas_pagamento: [{ forma_pagamento: '99', valor_pagamento: totalNF.toFixed(2) }],

      informacoes_adicionais_contribuinte:
        configuracoes.informacoes_adicionais_contribuinte ||
        `Faturamento de reabastecimento — período de ${pedido.data_inicio} a ${pedido.data_fim}.`,
      cnpj_responsavel_tecnico: null,
      contato_responsavel_tecnico: null,
      email_responsavel_tecnico: null,
      telefone_responsavel_tecnico: null,
    };
  },

  logEmissao(refId, status, detalhes) {
    console.log(`[NF Reabastecimento] Ref: ${refId} | Status: ${status}`, detalhes);
  },

  /**
   * Emite a NF pro mercado dentro do pedido. docCliente é o CPF ou CNPJ
   * digitado na hora (não é salvo em nenhum cadastro, só usado nessa nota).
   */
  async emitirNFCe(pedidoMercado, pedido, empresaId, docCliente) {
    const docLimpo = (docCliente || '').replace(/\D/g, '');
    if (docLimpo.length !== 11 && docLimpo.length !== 14) {
      return { success: false, erro: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
    }

    try {
      this.logEmissao(pedidoMercado.id, 'iniciando', { empresaId });

      const configuracoes = await this.obterConfiguracoesEmpresa(empresaId);

      if (!pedidoMercado.pedidos_reabastecimento_itens || pedidoMercado.pedidos_reabastecimento_itens.length === 0) {
        throw new Error('Este mercado não possui itens para emitir nota.');
      }

      const payload = this.construirPayload(pedidoMercado, pedido, configuracoes, docLimpo);

      const validation = validateNFcePayload(payload);
      if (!validation.valid) {
        throw new Error(`Falha na validação do Payload:\n${validation.errors.join('\n')}`);
      }

      const { data, error } = await supabase.functions.invoke('emit-nfce', {
        body: {
          venda_id: pedidoMercado.id, // usado só como referência de idempotência na Focus
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
        .from('pedidos_reabastecimento_mercados')
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
        .from('pedidos_reabastecimento_mercados')
        .update({ status_fiscal: 'erro', nfe_erro_mensagem: err.message })
        .eq('id', pedidoMercado.id);
      return { success: false, erro: err.message };
    }
  },

  /**
   * Monta o payload combinando os itens de VÁRIOS mercados numa nota só
   * (mesmo dono, quer receber tudo junto). Reaproveita construirPayload
   * inteiro — só monta um "mercado sintético" com os itens de todos
   * juntos antes de passar pra ele.
   */
  construirPayloadCombinado(mercados, pedido, configuracoes, docCliente) {
    const itensCombinados = mercados.flatMap((m) => m.pedidos_reabastecimento_itens || []);
    const nomesLocais = mercados.map((m) => m.locais?.nome).filter(Boolean).join(' + ');
    const valorTotalCombinado = mercados.reduce((s, m) => s + (parseFloat(m.valor_total) || 0), 0);

    const mercadoSintetico = {
      pedidos_reabastecimento_itens: itensCombinados,
      locais: { nome: nomesLocais || 'CLIENTE' },
      valor_total: valorTotalCombinado,
    };
    return this.construirPayload(mercadoSintetico, pedido, configuracoes, docCliente);
  },

  /**
   * Emite UMA nota fiscal cobrindo vários mercados do mesmo dono. Grava
   * o mesmo resultado (status/chave/pdf) em todos os mercados
   * envolvidos, pra continuar aparecendo certo nos painéis individuais.
   */
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

      const temItens = mercados.some((m) => (m.pedidos_reabastecimento_itens || []).length > 0);
      if (!temItens) throw new Error('Os mercados selecionados não possuem itens para emitir nota.');

      const payload = this.construirPayloadCombinado(mercados, pedido, configuracoes, docLimpo);

      const validation = validateNFcePayload(payload);
      if (!validation.valid) {
        throw new Error(`Falha na validação do Payload:\n${validation.errors.join('\n')}`);
      }

      // Referência única pra Focus, combinando os mercados envolvidos.
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
        .from('pedidos_reabastecimento_mercados')
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
        .from('pedidos_reabastecimento_mercados')
        .update({ status_fiscal: 'erro', nfe_erro_mensagem: err.message })
        .in('id', idsMercados);
      return { success: false, erro: err.message };
    }
  },

  /**
   * Envia por e-mail, de uma vez só, o link da nota fiscal combinada +
   * resumo com os itens de todos os mercados envolvidos.
   */
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
        (m.pedidos_reabastecimento_itens || []).map(
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
        <h2 style="color:#1e293b;">Faturamento de Reabastecimento</h2>
        <p style="color:#475569;">Segue o faturamento referente ao período de ${pedido.data_inicio?.split('-').reverse().join('/')} a ${pedido.data_fim?.split('-').reverse().join('/')}, referente a: ${nomeMercados}.</p>
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
        subject: `Faturamento de Reabastecimento — ${nomeMercados}`,
        html,
      },
    });

    if (error || data?.success === false) {
      const msg = data?.error || error?.message || 'Falha ao enviar e-mail.';
      return { success: false, error: msg };
    }

    await supabase
      .from('pedidos_reabastecimento_mercados')
      .update({ email_enviado_para: destinatario, email_enviado_em: new Date().toISOString() })
      .in('id', idsMercados);

    return { success: true };
  },

  /**
   * Envia por e-mail o link da NF (e um resumo do faturamento) pro
   * cliente, via a Edge Function send-email já existente (Resend).
   */
  async enviarEmailNF(destinatario, pedidoMercado, pedido, empresaNome, fmt) {
    if (!destinatario) return { success: false, error: 'Nenhum e-mail informado.' };

    const linkNota = pedidoMercado.nfe_url_pdf
      ? `<p><a href="${pedidoMercado.nfe_url_pdf}" target="_blank" style="color:#2563eb;font-weight:bold;">Clique aqui para ver a Nota Fiscal</a></p>`
      : '<p>A nota fiscal foi emitida; caso o link não apareça aqui, entre em contato para receber o PDF.</p>';

    const itensHtml = (pedidoMercado.pedidos_reabastecimento_itens || [])
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
        <h2 style="color:#1e293b;">Faturamento de Reabastecimento</h2>
        <p style="color:#475569;">Segue o faturamento referente ao período de ${pedido.data_inicio?.split('-').reverse().join('/')} a ${pedido.data_fim?.split('-').reverse().join('/')}, ${empresaNome || ''}.</p>
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
        subject: `Faturamento de Reabastecimento — ${pedidoMercado.locais?.nome || ''}`,
        html,
      },
    });

    if (error || data?.success === false) {
      const msg = data?.error || error?.message || 'Falha ao enviar e-mail.';
      return { success: false, error: msg };
    }

    await supabase
      .from('pedidos_reabastecimento_mercados')
      .update({ email_enviado_para: destinatario, email_enviado_em: new Date().toISOString() })
      .eq('id', pedidoMercado.id);

    return { success: true };
  },
};

// ────────────────────────────────────────────────────────────────────────

export default function PedidoReabastecimentoPage() {
  const { empresaId, currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [aba, setAba] = useState('gerar'); // 'gerar' | 'pendentes' | 'historico'

  // Ordem de cadastro dos produtos (produto_id -> posição, pela data de
  // criação em `produtos`) — pedido do Fernando: os itens do pedido devem
  // aparecer na mesma ordem em que os produtos foram cadastrados, não em
  // ordem alfabética. Carregado uma vez só (não muda durante a sessão) e
  // reaproveitado tanto pra montar a prévia quanto pra reordenar pedidos
  // JÁ SALVOS (incluindo os antigos) na hora de exibir.
  const [ordemProdutoMap, setOrdemProdutoMap] = useState({});
  useEffect(() => {
    if (!empresaId) return;
    supabase.from('produtos').select('id, created_at').eq('empresa_id', empresaId)
      .then(({ data }) => {
        const mapa = {};
        [...(data || [])]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .forEach((p, idx) => { mapa[p.id] = idx; });
        setOrdemProdutoMap(mapa);
      });
  }, [empresaId]);

  // Reordena os itens de um pedido (mercado) pra exibição: primeiro os
  // itens normais (entrega + dano/devolução, na ordem de cadastro do
  // produto), e SÓ DEPOIS, centralizadas no final, todas as linhas de
  // troca/substituição (inclusive o crédito geral de troca, que não tem
  // produto_id). Isso resolve o feedback do Fernando ("centralizar tudo
  // que for troca na parte de baixo") sem precisar mexer no banco — se
  // aplica igual em pedido novo e em pedido antigo já salvo, porque só
  // olha pro texto/produto de cada linha na hora de mostrar, não muda o
  // que está gravado.
  const ehLinhaDeTroca = (item) => /troca|substitui/i.test(item?.produto_nome || '');
  // Pedido do Fernando (mercado com mais de uma visita no período): agrupa
  // primeiro por visita (`visita_em`, na ordem em que aconteceram), e só
  // dentro de cada visita aplica a regra de sempre (troca centralizada no
  // final + ordem de cadastro nos demais). Pedido antigo, salvo antes dessa
  // coluna existir, tem `visita_em` nulo em TODAS as linhas — cai tudo no
  // mesmo grupo "sem data" e o resultado não muda em nada.
  const ordenarItensPedido = (itens) => {
    return [...(itens || [])]
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const visA = a.item.visita_em || '';
        const visB = b.item.visita_em || '';
        if (visA !== visB) return visA < visB ? -1 : 1;
        const aTroca = ehLinhaDeTroca(a.item);
        const bTroca = ehLinhaDeTroca(b.item);
        if (aTroca !== bTroca) return aTroca ? 1 : -1;
        const ordA = ordemProdutoMap[a.item.produto_id] ?? 99999;
        const ordB = ordemProdutoMap[b.item.produto_id] ?? 99999;
        if (ordA !== ordB) return ordA - ordB;
        return a.idx - b.idx;
      })
      .map(x => x.item);
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => { if (!d) return '-'; return d.split('-').reverse().join('/'); };
  const formatDateTime = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  // Recalcula o total que a NF teria (mesma lógica de agrupamento por
  // produto do fiscalReabastecimentoService.construirPayload — só que
  // aqui é só pra exibição, não gera payload nenhum). Serve pra avisar
  // na tela quando esse total diverge do subtotal financeiro do mercado
  // (acontece quando um produto é contado como dano E devolução juntos).
  const calcularTotalLiquidoNF = (mercado) => {
    const porProduto = new Map();
    // Crédito de troca por produto de menor valor (produto_id null) não é
    // dedução de uma linha específica — é um desconto geral do pedido, sem
    // "valor bruto" próprio pra clampar contra. Se entrasse no agrupamento
    // por produto normal abaixo, ficaria com valorPositivo=0 e o desconto
    // seria zerado (min(0, credito) = 0) — o crédito sumia da NF de novo.
    let creditosGerais = 0;
    (mercado.pedidos_reabastecimento_itens || []).forEach((item) => {
      const valorTotalLinha = parseFloat(item.valor_total) || 0;
      if (!item.produto_id && valorTotalLinha < 0) {
        creditosGerais += Math.abs(valorTotalLinha);
        return;
      }
      const chave = item.produto_id || item.produto_nome;
      if (!porProduto.has(chave)) {
        porProduto.set(chave, { valorPositivo: 0, deducao: 0 });
      }
      const grupo = porProduto.get(chave);
      if (valorTotalLinha >= 0) {
        grupo.valorPositivo += valorTotalLinha;
      } else {
        grupo.deducao += Math.abs(valorTotalLinha);
      }
    });
    let total = 0;
    porProduto.forEach((g) => {
      const valorBruto = Math.round(g.valorPositivo * 100) / 100;
      const desconto = Math.min(valorBruto, Math.round(g.deducao * 100) / 100);
      total += valorBruto - desconto;
    });
    return Math.round((total - creditosGerais) * 100) / 100;
  };

  // ─── Aba: Gerar Pedido ─────────────────────────────────────────────────
  const [mercados, setMercados] = useState([]);
  const [mercadosSelecionados, setMercadosSelecionados] = useState([]);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState(null);
  const [isGerandoPreview, setIsGerandoPreview] = useState(false);
  const [isSalvandoPedido, setIsSalvandoPedido] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from('locais')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'Mercado')
      .eq('modelo_negocio', 'venda_direta')
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

      const { data: jaFaturadas } = await supabase.from('pedidos_reabastecimento_movimentacoes').select('movimentacao_id');
      const movIdsJaUsadas = new Set((jaFaturadas || []).map(v => v.movimentacao_id));

      const resultadoPorMercado = [];
      let totalGeralCalc = 0;

      for (const mercado of mercadosObjs) {
        const { data: movs, error } = await supabase
          .from('movimentacoes')
          // produto_substituido_id NÃO tem foreign key formal (removida de
          // propósito — ver migration) porque ter duas FKs de movimentacoes
          // pra produtos (produto_id e produto_substituido_id) deixava
          // ambíguo qualquer "produtos(...)" simples em QUALQUER outra tela
          // do sistema (Dashboard, Relatório de Vendas, Comparativo de
          // Mercados, Assistente IA, etc.), quebrando todas elas. Por isso
          // buscamos o nome do produto substituído com uma consulta à parte
          // logo abaixo, em vez de embed.
          .select('id, produto_id, quantidade, valor_desconto_substituicao, quantidade_desconto_substituicao, produto_substituido_id, data_movimentacao, produtos(nome, preco_bandeja_mercado, preco_bandeja)')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'transferencia')
          .eq('local_destino_id', mercado.id)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);

        if (error) throw error;

        const movsValidos = (movs || []).filter(m => !movIdsJaUsadas.has(m.id));

        // Busca à parte (sem FK/embed — ver comentário acima) o nome de cada
        // produto que foi substituído nessas movimentações, só pra exibir
        // na Auditoria de Mercado / conferência interna.
        const idsProdutosSubstituidos = [...new Set(movsValidos.map(m => m.produto_substituido_id).filter(Boolean))];
        const nomesProdutosSubstituidos = {};
        if (idsProdutosSubstituidos.length > 0) {
          const { data: produtosSubstituidos } = await supabase
            .from('produtos')
            .select('id, nome')
            .in('id', idsProdutosSubstituidos);
          (produtosSubstituidos || []).forEach(p => { nomesProdutosSubstituidos[p.id] = p.nome; });
        }

        // Regra (Fernando, 02/10): em mercado de Venda Direta o estoque já
        // está pago — então TODA retirada de produto do mercado desconta do
        // faturamento, qualquer que seja o motivo (vencido, dano, baixa
        // venda, troca de lote por validade etc.), e todo reabastecimento
        // cobra normal. Não precisa mais distinguir "foi pra Estoque
        // Devolução" de "foi pra outro estoque qualquer" — QUALQUER
        // transferência que SAI do mercado conta como retirada.
        // `data_movimentacao` entra na busca pra poder agrupar por visita
        // logo abaixo (dano/retirada reportados numa auditoria saem com o
        // MESMO timestamp exato da entrega daquela visita — ver comentário
        // mais abaixo).
        const { data: danos } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, data_movimentacao')
          .eq('empresa_id', empresaId)
          .in('tipo', ['devolucao', 'descarte'])
          .eq('motivo_devolucao', 'danificado')
          .eq('local_origem_id', mercado.id)
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);

        // IMPORTANTE: exclui as transferências que já são a "perna de saída"
        // de uma Substituição de produto (produto A que saiu na troca) —
        // essas já vão virar crédito pelo valor_desconto_substituicao
        // gravado no produto B que entrou, mais abaixo. Sem excluir aqui, a
        // mesma troca creditaria duas vezes: uma como retirada genérica,
        // outra como substituição.
        const { data: devolvidosData } = await supabase
          .from('movimentacoes')
          .select('produto_id, quantidade, data_movimentacao')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'transferencia')
          .eq('local_origem_id', mercado.id)
          .or('motivo_devolucao.is.null,motivo_devolucao.neq.substituicao_produto')
          .gte('data_movimentacao', `${dataInicio}T00:00:00`)
          .lte('data_movimentacao', `${dataFim}T23:59:59`);
        const devolvidos = devolvidosData || [];

        // Pedido do Fernando: quando o período pego pra faturar tem MAIS DE
        // UMA visita do mesmo mercado (ex.: juntou vários mercados e esse
        // aqui foi auditado 2x na janela), as visitas precisam aparecer
        // separadas, não tudo somado numa linha só por produto (senão fica
        // parecendo "apareceu produto a mais do nada"). Cada visita
        // completa (contagem + reabastecimento + danos + devoluções +
        // trocas) é salva pela Auditoria de Mercado de uma vez só, com o
        // MESMO timestamp exato em `data_movimentacao` — então agrupar por
        // esse valor agrupa exatamente por visita, incluindo dano/devolução
        // (por isso buscamos `data_movimentacao` neles também agora).
        const visitasMap = new Map();
        const getVisita = (chave) => {
          if (!visitasMap.has(chave)) visitasMap.set(chave, { movs: [], danos: [], devolvidos: [] });
          return visitasMap.get(chave);
        };
        movsValidos.forEach(m => getVisita(m.data_movimentacao).movs.push(m));
        (danos || []).forEach(d => getVisita(d.data_movimentacao).danos.push(d));
        devolvidos.forEach(d => getVisita(d.data_movimentacao).devolvidos.push(d));

        const visitasOrdenadas = [...visitasMap.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));

        const visitas = [];
        visitasOrdenadas.forEach(([dataVisita, dadosVisita]) => {
          // Daqui pra baixo é EXATAMENTE a mesma matemática de sempre (soma
          // bruta, dedução de dano/devolução clampada, crédito de troca com
          // as 2 passadas) — só que agora rodando com os dados JÁ FILTRADOS
          // para uma única visita, em vez do período inteiro de uma vez.
          // Quando o mercado só tem 1 visita no período (o caso de sempre),
          // dá exatamente no mesmo resultado de antes.
          const porProduto = {};
          dadosVisita.movs.forEach(m => {
            const preco = Number(m.produtos?.preco_bandeja_mercado || m.produtos?.preco_bandeja || 0);
            if (!porProduto[m.produto_id]) {
              porProduto[m.produto_id] = { produto_id: m.produto_id, nome: m.produtos?.nome || 'Produto', quantidade: 0, valorUnitario: preco, valor: 0, deducoes: {} };
            }
            porProduto[m.produto_id].quantidade += Number(m.quantidade || 0);
            porProduto[m.produto_id].valor += Number(m.quantidade || 0) * preco;
          });

          const deducoesPorProdutoEMotivo = {};
          const somarDeducao = (produtoId, rotulo, qtd) => {
            if (!deducoesPorProdutoEMotivo[produtoId]) deducoesPorProdutoEMotivo[produtoId] = {};
            deducoesPorProdutoEMotivo[produtoId][rotulo] = (deducoesPorProdutoEMotivo[produtoId][rotulo] || 0) + Number(qtd || 0);
          };
          dadosVisita.danos.forEach(d => somarDeducao(d.produto_id, 'Danificado', d.quantidade));
          dadosVisita.devolvidos.forEach(d => somarDeducao(d.produto_id, 'Retirado do mercado', d.quantidade));

          Object.entries(deducoesPorProdutoEMotivo).forEach(([produtoId, porMotivo]) => {
            const p = porProduto[produtoId];
            if (!p) return;
            const qtdTotalSolicitada = Object.values(porMotivo).reduce((s, q) => s + q, 0);
            const valorSolicitado = qtdTotalSolicitada * p.valorUnitario;
            const valorClampado = Math.min(p.valor, valorSolicitado);
            const fator = valorSolicitado > 0 ? valorClampado / valorSolicitado : 0;

            p.deducoes = Object.fromEntries(
              Object.entries(porMotivo).map(([motivo, qtd]) => [
                motivo,
                { quantidade: qtd, valor: Math.round(qtd * p.valorUnitario * fator * 100) / 100 },
              ])
            );
            p.valor -= valorClampado;
          });

          // Valor bruto entregue de cada produto NESSA visita (antes de
          // qualquer dedução) — é o "espaço" que essa mesma visita tem
          // disponível pra absorver o crédito de troca.
          const brutoPorProdutoNaVisita = {};
          dadosVisita.movs.forEach(m => {
            const preco = Number(m.produtos?.preco_bandeja_mercado || m.produtos?.preco_bandeja || 0);
            brutoPorProdutoNaVisita[m.produto_id] = (brutoPorProdutoNaVisita[m.produto_id] || 0) + Number(m.quantidade || 0) * preco;
          });
          // Produtos que entraram por troca nesta visita (têm valor_desconto_substituicao
          // próprio) — a sobra de uma troca só pode abater OUTRO produto que também
          // veio de troca, nunca um item de reabastecimento normal (isso é o que
          // fazia aparecer "Troca de produto" na Coxinha de Frango, Enroladinho etc.,
          // que não tiveram nada trocado).
          const produtosTrocadosNaVisita = new Set(
            dadosVisita.movs.filter(m => Number(m.valor_desconto_substituicao || 0) > 0).map(m => m.produto_id)
          );

          // Passada 1: abate cada troca só na SUA PRÓPRIA linha (o produto que
          // entrou), usando o valor cheio de cada produto antes de qualquer
          // outra troca mexer nele. Feita ANTES de qualquer rateio pra sobra
          // de uma troca nunca "roubar" espaço que na verdade pertence à
          // própria dedução de outro produto trocado (o que antes fazia uma
          // troca aparecer partida em 2 linhas com valores estranhos).
          const sobras = [];
          dadosVisita.movs.forEach(m => {
            const valorDesconto = Number(m.valor_desconto_substituicao || 0);
            if (valorDesconto <= 0) return;
            const p = porProduto[m.produto_id];
            if (!p) return;

            const nomeOrigem = nomesProdutosSubstituidos[m.produto_substituido_id] || 'produto anterior';
            const qtdOrigem = Number(m.quantidade_desconto_substituicao || 0);
            const nomeDestino = m.produtos?.nome || 'Produto';
            const qtdDestino = Number(m.quantidade || 0);
            // Mesmo formato usado na Auditoria de Mercado ("Substituição: 6
            // esfiha de frango por 8 pão de batata calabresa") — antes
            // mostrava só "(era produto)" e ficava confuso se aquele valor
            // estava sendo somado ou descontado.
            const rotulo = `Substituição: ${qtdOrigem} ${nomeOrigem} por ${qtdDestino} ${nomeDestino}`;

            const naPropriaLinha = Math.round(Math.min(Math.max(p.valor, 0), valorDesconto) * 100) / 100;
            if (naPropriaLinha > 0) {
              p.deducoes[rotulo] = { quantidade: qtdOrigem, valor: Math.round(((p.deducoes[rotulo]?.valor || 0) + naPropriaLinha) * 100) / 100 };
              p.valor = Math.round((p.valor - naPropriaLinha) * 100) / 100;
            }
            brutoPorProdutoNaVisita[m.produto_id] = Math.max(0, (brutoPorProdutoNaVisita[m.produto_id] || 0) - naPropriaLinha);

            const restante = Math.round((valorDesconto - naPropriaLinha) * 100) / 100;
            if (restante > 0.01) sobras.push({ produtoId: m.produto_id, rotulo, qtdOrigem, restante });
          });

          // Passada 2: só agora distribui a sobra (troca por produto de menor
          // valor) — e SÓ entre outros produtos que também vieram de troca
          // nesta mesma visita, nunca num item de reabastecimento normal
          // (Coxinha de Frango, Enroladinho etc. não devem mostrar "Troca de
          // produto" se nada foi trocado neles).
          let creditoTrocaNaoAplicadoVisita = 0;
          sobras.forEach(({ produtoId, rotulo, qtdOrigem, restante: restanteOriginal }) => {
            let restante = restanteOriginal;
            if (restante > 0.01) {
              const espacos = Object.keys(brutoPorProdutoNaVisita)
                .filter(pid => pid !== produtoId && produtosTrocadosNaVisita.has(pid) && porProduto[pid] && porProduto[pid].valor > 0)
                .map(pid => ({ pid, espaco: Math.min(brutoPorProdutoNaVisita[pid] || 0, porProduto[pid].valor) }))
                .filter(e => e.espaco > 0.01);
              const totalEspaco = espacos.reduce((s, e) => s + e.espaco, 0);
              if (totalEspaco > 0) {
                const aplicavel = Math.min(restante, totalEspaco);
                let distribuido = 0;
                espacos.forEach((e, idx) => {
                  const ultimo = idx === espacos.length - 1;
                  const parte = ultimo
                    ? Math.round((aplicavel - distribuido) * 100) / 100
                    : Math.round((e.espaco / totalEspaco) * aplicavel * 100) / 100;
                  distribuido += parte;
                  const pOutro = porProduto[e.pid];
                  const rotuloRateio = `${rotulo} (rateado nesta visita)`;
                  pOutro.deducoes[rotuloRateio] = { quantidade: qtdOrigem, valor: Math.round(((pOutro.deducoes[rotuloRateio]?.valor || 0) + parte) * 100) / 100 };
                  pOutro.valor = Math.round((pOutro.valor - parte) * 100) / 100;
                  brutoPorProdutoNaVisita[e.pid] = Math.max(0, (brutoPorProdutoNaVisita[e.pid] || 0) - parte);
                });
                restante = Math.round((restante - aplicavel) * 100) / 100;
              }
            }

            // 3) Se mesmo assim sobrar (visita só tinha esse produto, sem
            // mais nada pra abater), essa parte não é aplicada em outra
            // visita — vira uma linha de crédito geral dessa visita (rara).
            if (restante > 0.01) creditoTrocaNaoAplicadoVisita += restante;
          });

          // Pedido do Fernando: ordem de cadastro dos produtos, não alfabética
          // (localeCompare por nome não tem nenhuma relação com a ordem que
          // ele está acostumado a ver nos outros cadastros/telas). Produto sem
          // entrada no mapa (caso raríssimo, ex.: mapa ainda carregando) cai
          // no fim, mantendo pelo menos ordem alfabética entre eles como
          // desempate — nunca quebra a tela por falta do mapa.
          const itensVisita = Object.values(porProduto).sort((a, b) => {
            const ordA = ordemProdutoMap[a.produto_id] ?? 99999;
            const ordB = ordemProdutoMap[b.produto_id] ?? 99999;
            if (ordA !== ordB) return ordA - ordB;
            return a.nome.localeCompare(b.nome);
          });

          // Sobra da troca por produto de menor valor: o mercadinho já pagou
          // mais do que o produto novo vale, então isso desconta do subtotal
          // dessa visita (não só de uma linha de produto específica) — entra
          // como item próprio, mesmo formato usado nas outras deduções, pra
          // aparecer certinho no pedido, no PDF e na NF.
          if (creditoTrocaNaoAplicadoVisita > 0.01) {
            itensVisita.push({
              produto_id: null,
              nome: 'Crédito de troca (produto substituído por um de menor valor)',
              quantidade: 1,
              valorUnitario: -creditoTrocaNaoAplicadoVisita,
              valor: -Math.round(creditoTrocaNaoAplicadoVisita * 100) / 100,
              deducoes: {},
            });
          }

          if (itensVisita.length > 0) {
            visitas.push({ dataVisita, itens: itensVisita, subtotal: itensVisita.reduce((s, i) => s + i.valor, 0) });
          }
        });

        const subtotal = visitas.reduce((s, v) => s + v.subtotal, 0);
        const movIds = movsValidos.map(m => m.id);

        if (visitas.length > 0) {
          resultadoPorMercado.push({ local: mercado, visitas, subtotal, movIds });
          totalGeralCalc += subtotal;
        }
      }

      if (resultadoPorMercado.length === 0) {
        toast({ title: 'Nada pendente', description: 'Nenhum dos mercados selecionados teve reabastecimento nesse período (ou já foi tudo faturado).' });
        setPreview(null);
      } else {
        setPreview({ mercados: resultadoPorMercado, totalGeral: totalGeralCalc });
      }
    } catch (err) {
      toast({ title: 'Erro ao gerar prévia', description: err.message, variant: 'destructive' });
    } finally {
      setIsGerandoPreview(false);
    }
  }, [mercadosSelecionados, mercados, dataInicio, dataFim, empresaId, toast, ordemProdutoMap]);

  const confirmarGerarPedido = async () => {
    if (!preview) return;
    setIsSalvandoPedido(true);
    try {
      const { data: pedido, error: erroPedido } = await supabase
        .from('pedidos_reabastecimento')
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
          .from('pedidos_reabastecimento_mercados')
          .insert({ pedido_id: pedido.id, local_id: m.local.id, valor_total: m.subtotal })
          .select('id')
          .single();
        if (erroPm) throw erroPm;

        // Cria a venda PENDENTE que representa esse reabastecimento — só
        // vira faturamento de verdade quando o pedido for baixado
        // (pagamento confirmado). É isso que faz o mercado de Venda
        // Direta aparecer no Relatório de Vendas de verdade, no dia
        // certo (o dia da baixa, não o dia da entrega).
        const { venda_id } = await recordMarketplaceSale(
          empresaId, m.local.id, m.local.nome,
          { total_final: m.subtotal },
          { forma_pagamento: 'nao_informado' },
          { status: 'PENDENTE', financeiro_baixado: false, data_venda: new Date().toISOString() }
        );

        const { error: erroVendaId } = await supabase
          .from('pedidos_reabastecimento_mercados')
          .update({ venda_id })
          .eq('id', pm.id);
        if (erroVendaId) throw erroVendaId;

        // Linhas da venda (pra aparecer certinho no Relatório de Vendas,
        // cupom, Excel) — usa o valor líquido por produto (já com
        // dano/devolução descontado). Sem RPC nenhuma: não mexe em
        // estoque aqui, o estoque já foi descontado quando o produto foi
        // entregue de fato — descontar de novo seria dobrar a baixa.
        const movimentacoesVenda = m.visitas
          .flatMap(v => v.itens)
          .filter(item => item.valor > 0)
          .map(item => ({
            empresa_id: empresaId,
            tipo: 'reabastecimento_faturado',
            produto_id: item.produto_id,
            local_origem_id: m.local.id,
            quantidade: item.quantidade,
            valor_unitario: item.valorUnitario,
            subtotal: item.valor,
            total_final: item.valor,
            venda_id,
            canal_venda: 'MERCADO',
            cliente_referencia: m.local.nome,
            tipo_item: 'NORMAL',
            forma_pagamento: 'nao_informado',
            data_movimentacao: new Date().toISOString(),
            observacao: `Faturamento de Reabastecimento — período de ${formatDate(dataInicio)} a ${formatDate(dataFim)}`,
          }));
        if (movimentacoesVenda.length > 0) {
          const { error: erroMovVenda } = await supabase.from('movimentacoes').insert(movimentacoesVenda);
          if (erroMovVenda) throw erroMovVenda;
        }

        // Salva a entrega bruta + uma linha separada por motivo de perda
        // (dano, troca, vencido, etc.) — isso preserva a justificativa
        // visível depois, tanto na tela quanto no PDF e na NF (que já
        // sabe tratar essas linhas negativas como desconto do item).
        const itensPara = [];
        // Cada visita gera seu próprio bloco de linhas (entrega + dano/
        // devolução + troca), marcado com `visita_em` (pedido do Fernando:
        // quando o mercado teve mais de uma visita no período, elas
        // precisam aparecer separadas — ver `ordenarItensPedido`, que na
        // leitura agrupa por essa mesma coluna). Dentro de cada visita, as
        // linhas de troca continuam centralizadas no final dela (não do
        // pedido inteiro) — mesmo raciocínio de sempre, só que por visita.
        m.visitas.forEach(visita => {
          const itensTrocaPara = [];
          visita.itens.forEach(item => {
            const valorBrutoItem = Math.round(item.quantidade * item.valorUnitario * 100) / 100;
            itensPara.push({
              pedido_mercado_id: pm.id,
              produto_id: item.produto_id,
              produto_nome: item.nome,
              quantidade: item.quantidade,
              valor_unitario: item.valorUnitario,
              valor_total: valorBrutoItem,
              visita_em: visita.dataVisita,
            });
            // Pedido do Fernando (mais recente): mostrar de novo o nome dos
            // produtos substituídos (antes/depois) na linha de troca do
            // pedido do cliente — reverte a decisão anterior de esconder
            // ("Troca de produto" genérico), porque sem o nome ele não
            // conseguia entender a linha. O detalhe completo (quem trocou por
            // quem) sempre existiu na Auditoria de Mercado; agora aparece
            // também aqui.
            // Quando o mesmo produto tem MAIS DE UMA troca na visita (ex.: a
            // sobra de uma troca sendo rateada em cima dele também), isso
            // antes gerava uma linha "(−) Troca de produto" para CADA uma —
            // ficava parecendo duplicado/errado. Continua somando tudo numa
            // linha só, só que agora listando os produtos de cada troca.
            let totalTrocaItem = 0;
            let qtdTrocaItem = 0;
            const descricoesTroca = [];
            Object.entries(item.deducoes || {}).forEach(([motivo, d]) => {
              if (d.valor <= 0) return;
              if (motivo.startsWith('Substituição:')) {
                totalTrocaItem = Math.round((totalTrocaItem + d.valor) * 100) / 100;
                qtdTrocaItem += Number(d.quantidade || 0);
                descricoesTroca.push(
                  motivo.replace(/^Substituição:\s*/, '').replace(/\s*\(rateado nesta visita\)$/, '')
                );
                return;
              }
              itensPara.push({
                pedido_mercado_id: pm.id,
                produto_id: item.produto_id,
                produto_nome: `(−) ${motivo}: ${item.nome}`,
                quantidade: d.quantidade,
                valor_unitario: -item.valorUnitario,
                valor_total: -d.valor,
                visita_em: visita.dataVisita,
              });
            });
            if (totalTrocaItem > 0) {
              itensTrocaPara.push({
                pedido_mercado_id: pm.id,
                produto_id: item.produto_id,
                produto_nome: `(−) Troca: ${descricoesTroca.join('; ')}`,
                quantidade: qtdTrocaItem,
                valor_unitario: -item.valorUnitario,
                valor_total: -totalTrocaItem,
                visita_em: visita.dataVisita,
              });
            }
          });
          // Só agora, depois de todos os itens normais DESSA visita, entram
          // as linhas de troca dela — centralizadas no final da visita (ver
          // comentário acima).
          itensPara.push(...itensTrocaPara);
        });
        if (itensPara.length > 0) {
          const { error: erroItens } = await supabase.from('pedidos_reabastecimento_itens').insert(itensPara);
          if (erroItens) throw erroItens;
        }

        if (m.movIds.length > 0) {
          const movsPara = m.movIds.map(mid => ({ pedido_id: pedido.id, movimentacao_id: mid }));
          const { error: erroMovs } = await supabase.from('pedidos_reabastecimento_movimentacoes').insert(movsPara);
          if (erroMovs) throw erroMovs;
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
  const [isGerandoPdf, setIsGerandoPdf] = useState(false);

  const carregarPedidos = useCallback(async (status) => {
    if (!empresaId) return;
    setIsLoadingPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_reabastecimento')
        .select(`
          id, data_inicio, data_fim, status, valor_total, gerado_em, baixado_em,
          pedidos_reabastecimento_mercados(id, valor_total, locais(nome))
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
        .from('pedidos_reabastecimento')
        .select(`
          id, data_inicio, data_fim, status, valor_total, gerado_em, baixado_em,
          pedidos_reabastecimento_mercados(
            id, valor_total, locais(nome),
            status_fiscal, nfe_id, nfe_chave, nfe_url_pdf, nfe_erro_mensagem, cpf_cnpj_utilizado, email_enviado_para,
            pedidos_reabastecimento_itens(produto_id, produto_nome, quantidade, valor_unitario, valor_total, visita_em)
          )
        `)
        .eq('id', pedidoResumo.id)
        .single();
      if (error) throw error;
      // Reordena a exibição (troca centralizada no final + ordem de
      // cadastro nos demais) sem tocar no que está gravado — vale tanto
      // pra pedido novo quanto pra qualquer pedido antigo já salvo.
      const dataReordenada = {
        ...data,
        pedidos_reabastecimento_mercados: (data.pedidos_reabastecimento_mercados || []).map(m => ({
          ...m,
          pedidos_reabastecimento_itens: ordenarItensPedido(m.pedidos_reabastecimento_itens),
        })),
      };
      setPedidoAberto(dataReordenada);
    } catch (err) {
      toast({ title: 'Erro ao abrir pedido', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingPedidos(false);
    }
  };

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [isExcluindo, setIsExcluindo] = useState(false);

  // ─── NF por mercado (Faturamento de Reabastecimento) ───────────────────
  // Estado por mercado.id — o CPF/CNPJ e o e-mail são digitados na hora,
  // não ficam salvos em lugar nenhum além do que já foi usado na emissão.
  const [docPorMercado, setDocPorMercado] = useState({});
  const [emailPorMercado, setEmailPorMercado] = useState({});
  const [docValidoPorMercado, setDocValidoPorMercado] = useState({});
  const [emitindoNfId, setEmitindoNfId] = useState(null);
  const [enviandoEmailId, setEnviandoEmailId] = useState(null);

  // ─── Nota combinada (vários mercados do mesmo dono numa nota só) ───────
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

  const atualizarVariosMercadosNoPedidoAberto = (mercadoIds, patch) => {
    setPedidoAberto((prev) => {
      if (!prev) return prev;
      const idsSet = new Set(mercadoIds);
      return {
        ...prev,
        pedidos_reabastecimento_mercados: prev.pedidos_reabastecimento_mercados.map((mm) =>
          idsSet.has(mm.id) ? { ...mm, ...patch } : mm
        ),
      };
    });
  };

  const atualizarMercadoNoPedidoAberto = (mercadoId, patch) => {
    setPedidoAberto((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pedidos_reabastecimento_mercados: prev.pedidos_reabastecimento_mercados.map((mm) =>
          mm.id === mercadoId ? { ...mm, ...patch } : mm
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
      const resultado = await fiscalReabastecimentoService.emitirNFCe(mercado, pedidoAberto, empresaId, doc);
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

  const [baixandoNfId, setBaixandoNfId] = useState(null);

  const handleBaixarNF = async (mercado) => {
    if (!mercado.nfe_url_pdf) return;
    setBaixandoNfId(mercado.id);
    try {
      const resposta = await fetch(mercado.nfe_url_pdf);
      if (!resposta.ok) throw new Error('Falha ao baixar o PDF.');
      const blob = await resposta.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const nomeArquivo = `NF_${mercado.locais?.nome || 'reabastecimento'}.pdf`.replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlBlob);
    } catch (err) {
      // Bloqueio de CORS ou outra falha — ainda dá pra salvar manualmente
      // abrindo o PDF numa nova aba (usando o "Salvar como" do navegador).
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
      const resultado = await fiscalReabastecimentoService.enviarEmailNF(email, mercado, pedidoAberto, undefined, fmt);
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
    (pedidoAberto?.pedidos_reabastecimento_mercados || []).filter((m) => mercadosParaCombinar.has(m.id));

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
      const resultado = await fiscalReabastecimentoService.emitirNFCeCombinada(mercados, pedidoAberto, empresaId, docCombinado);
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
      const resultado = await fiscalReabastecimentoService.enviarEmailNFCombinado(email, mercados, pedidoAberto, fmt);
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

  const excluirPedido = async () => {
    if (!pedidoAberto) return;
    setIsExcluindo(true);
    try {
      // A venda criada junto com esse pedido só existe por causa dele —
      // exclui as movimentações dela primeiro (senão a venda não pode ser
      // apagada, tem vínculo) e depois a venda em si, antes de apagar o
      // pedido. Só mexe nisso se o pedido ainda não foi baixado (uma vez
      // pago, exclusão fica bloqueada mais abaixo mesmo antes de chegar aqui).
      const { data: mercadosDoPedido } = await supabase
        .from('pedidos_reabastecimento_mercados')
        .select('venda_id')
        .eq('pedido_id', pedidoAberto.id);
      const vendaIds = (mercadosDoPedido || []).map(m => m.venda_id).filter(Boolean);
      if (vendaIds.length > 0) {
        await supabase.from('movimentacoes').delete().in('venda_id', vendaIds);
        await supabase.from('vendas').delete().in('id', vendaIds);
      }

      const { error } = await supabase.from('pedidos_reabastecimento').delete().eq('id', pedidoAberto.id);
      if (error) throw error;

      toast({ title: 'Pedido excluído', description: 'As entregas desse pedido estão livres pra entrar num pedido novo.' });
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
      // Concilia as vendas vinculadas a esse pedido — é isso que faz o
      // valor entrar no Relatório de Vendas na data de hoje (a data da
      // baixa), do jeito que o cliente pediu: só conta como faturamento
      // quando o pagamento é confirmado de verdade, não na entrega.
      const { data: mercadosDoPedido } = await supabase
        .from('pedidos_reabastecimento_mercados')
        .select('venda_id')
        .eq('pedido_id', pedidoAberto.id);
      const vendaIds = (mercadosDoPedido || []).map(m => m.venda_id).filter(Boolean);
      if (vendaIds.length > 0) {
        const { error: erroVendas } = await supabase.from('vendas').update({
          status: 'CONCILIADO', financeiro_baixado: true, data_baixa: new Date().toISOString(),
        }).in('id', vendaIds);
        if (erroVendas) throw erroVendas;
      }

      const { error: erroPedido } = await supabase.from('pedidos_reabastecimento').update({
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

      const mercadosHtml = (pedidoAberto.pedidos_reabastecimento_mercados || []).map(m => {
        // Itens já vêm reordenados (ver `ordenarItensPedido` em
        // abrirDetalhePedido): normais primeiro, trocas centralizadas no
        // final. Aqui só marca visualmente onde começa a seção de trocas
        // (pedido do Fernando: "um campo que seja só isso aí" no final).
        const itensOrdenados = m.pedidos_reabastecimento_itens || [];
        const temMaisDeUmaVisita = new Set(itensOrdenados.map(i => i.visita_em || '')).size > 1;
        const linhasHtml = itensOrdenados.map((item, i) => `
          ${temMaisDeUmaVisita && item.visita_em !== (itensOrdenados[i - 1]?.visita_em) ? `
          <tr>
            <td colspan="4" style="padding:5px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:#1d4ed8;background:#eff6ff;">Visita de ${formatDateTime(item.visita_em)}</td>
          </tr>` : ''}
          ${ehLinhaDeTroca(item) && !ehLinhaDeTroca(itensOrdenados[i - 1]) ? `
          <tr>
            <td colspan="4" style="padding:5px 8px;font-size:10px;font-weight:bold;text-transform:uppercase;color:#888;background:#f5f5f5;">Trocas / Substituições</td>
          </tr>` : ''}
          <tr>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${item.produto_nome}</td>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:center;">${item.quantidade}</td>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(item.valor_unitario)}</td>
            <td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:right;">${fmt(item.valor_total)}</td>
          </tr>
        `).join('');

        return `
          <p style="font-size:14px;font-weight:bold;margin:18px 0 6px;">${m.locais?.nome || ''}</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
            <thead>
              <tr style="background:${RED};color:#fff;">
                <th style="padding:6px 8px;font-size:11px;text-align:left;">Item</th>
                <th style="padding:6px 8px;font-size:11px;text-align:center;">Reabastecido de ${formatDate(pedidoAberto.data_inicio)} a ${formatDate(pedidoAberto.data_fim)}</th>
                <th style="padding:6px 8px;font-size:11px;text-align:right;">Valor Un</th>
                <th style="padding:6px 8px;font-size:11px;text-align:right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>${linhasHtml}</tbody>
            <tfoot>
              <tr style="background:${RED};color:#fff;">
                <td colspan="3" style="padding:6px 8px;font-size:12px;font-weight:bold;text-align:right;">TOTAL</td>
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
  <title>Faturamento de Reabastecimento - ${formatDate(pedidoAberto.data_inicio)} a ${formatDate(pedidoAberto.data_fim)}</title>
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
  <div style="background:${RED};padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-radius:0 0 40px 40px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:56px;height:56px;border-radius:50%;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${logoTag}
      </div>
      <span style="color:#fff;font-weight:bold;font-size:16px;">${emp?.nome || ''}</span>
    </div>
  </div>

  <div class="body">
    <h1 style="font-size:20px;font-weight:bold;margin:16px 0 4px;">Faturamento de Reabastecimento</h1>
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

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setAba(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${aba === id ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <>
      <Helmet><title>Faturamento de Reabastecimento - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 text-blue-600 p-3 rounded-xl">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Faturamento de Reabastecimento</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  Mercados de Venda Direta — cobrado pelo que foi entregue, não pelo que vendeu.
                </p>
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

          {aba === 'gerar' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Mercados de Venda Direta (pode escolher mais de um)</label>
                  {mercados.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Nenhum mercado marcado como "Venda Direta" ainda. Configure isso em Cadastros {'>'} Locais.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                      {mercados.map(m => (
                        <button
                          key={m.id}
                          onClick={() => toggleMercado(m.id)}
                          className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors ${mercadosSelecionados.includes(m.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-300'
                            }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${mercadosSelecionados.includes(m.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
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
                      className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none" style={{ fontSize: '14px' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                    <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPreview(null); }}
                      className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:border-blue-400 focus:outline-none" style={{ fontSize: '14px' }} />
                  </div>
                  <Button onClick={gerarPreview} disabled={mercadosSelecionados.length === 0 || isGerandoPreview} className="gap-2 bg-blue-600 hover:bg-blue-700 h-10">
                    {isGerandoPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar Prévia
                  </Button>
                </div>
              </div>

              {preview && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500">Prévia — reabastecido de {formatDate(dataInicio)} a {formatDate(dataFim)}</p>
                  </div>

                  {preview.mercados.map(m => (
                    <div key={m.local.id} className="p-5 space-y-3 border-b border-gray-100 last:border-b-0">
                      <p className="font-bold text-gray-900 flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-blue-500" /> {m.local.nome}
                      </p>
                      {/* Mais de uma visita do mesmo mercado no período
                          selecionado (pedido do Fernando) — mostra cada uma
                          em sua própria tabelinha, com a data, em vez de
                          somar tudo junto (o que fazia parecer que "surgiu"
                          produto do nada). Com 1 visita só (o caso de
                          sempre), fica exatamente igual a antes. */}
                      {m.visitas.map((visita, vi) => (
                        <div key={vi} className="space-y-2">
                          {m.visitas.length > 1 && (
                            <p className="text-xs font-semibold text-gray-500">
                              Visita de {formatDateTime(visita.dataVisita)}
                            </p>
                          )}
                          <div className="border border-gray-100 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold">Item</th>
                                  <th className="text-right px-3 py-2 font-semibold">Qtd</th>
                                  <th className="text-right px-3 py-2 font-semibold">Valor Un</th>
                                  <th className="text-right px-3 py-2 font-semibold">Valor Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {visita.itens.map((item, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 text-gray-800">
                                      {item.nome}
                                      {Object.entries(item.deducoes || {}).map(([motivo, d]) => (
                                        d.quantidade > 0 && (
                                          <span
                                            key={motivo}
                                            title={motivo.startsWith('Substituição:') ? motivo : undefined}
                                            className="ml-1.5 text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">
                                            {/* Label curto igual ao que vai pro relatório do cliente — o
                                                detalhe completo (quem trocou por quem) fica só no title
                                                (passe o mouse), pra quem está gerando o pedido conferir. */}
                                            {motivo.startsWith('Substituição:') ? 'troca de produto' : `-${d.quantidade} ${motivo.toLowerCase()}`}
                                          </span>
                                        )
                                      ))}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.quantidade}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{fmt(item.valorUnitario)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(item.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {m.visitas.length > 1 && (
                            <div className="flex justify-end">
                              <span className="text-xs font-semibold text-gray-500">Subtotal da visita: {fmt(visita.subtotal)}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {m.visitas.some(v => v.itens.some(i => Object.values(i.deducoes || {}).some(d => d.valor > 0))) && (
                        <p className="text-xs text-red-600">
                          Desconto por perdas: -{fmt(m.visitas.reduce((s, v) => s + v.itens.reduce((s2, i) => s2 + Object.values(i.deducoes || {}).reduce((s3, d) => s3 + d.valor, 0), 0), 0))} (já aplicado nos valores acima)
                        </p>
                      )}
                      <div className="flex justify-end">
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                          Subtotal {m.local.nome}: {fmt(m.subtotal)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="px-5 py-4 border-t border-gray-100 bg-blue-50 flex items-center justify-between">
                    <p className="font-bold text-blue-800">Total do Pedido</p>
                    <p className="text-xl font-black text-blue-700">{fmt(preview.totalGeral)}</p>
                  </div>

                  <div className="p-5 border-t border-gray-100">
                    <Button
                      onClick={confirmarGerarPedido}
                      disabled={isSalvandoPedido}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl gap-2"
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

          {(aba === 'pendentes' || aba === 'historico') && !pedidoAberto && (
            <div className="space-y-3">
              {isLoadingPedidos ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
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
                          {(p.pedidos_reabastecimento_mercados || []).map(m => m.locais?.nome).join(', ')}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" /> {formatDate(p.data_inicio)} a {formatDate(p.data_fim)} ·
                          {aba === 'pendentes' ? ` gerado em ${formatDateTime(p.gerado_em)}` : ` baixado em ${formatDateTime(p.baixado_em)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-lg font-black text-blue-600">{fmt(p.valor_total)}</p>
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
                  <Button onClick={baixarPdfPedido} disabled={isGerandoPdf} size="sm" variant="outline" className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50">
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

              {(pedidoAberto.pedidos_reabastecimento_mercados || []).length > 1 && (
                <div className="px-5 py-3 bg-blue-50/60 border-b border-blue-100">
                  <p className="text-xs text-blue-700">
                    Mercados do mesmo dono? Marque a caixinha em cada um pra emitir <strong>uma nota só</strong> com todos os produtos juntos, mais abaixo.
                  </p>
                </div>
              )}

              {(pedidoAberto.pedidos_reabastecimento_mercados || []).map(m => (
                <div key={m.id} className="p-5 space-y-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-gray-900 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-blue-500" /> {m.locais?.nome}
                    </p>
                    {(pedidoAberto.pedidos_reabastecimento_mercados || []).length > 1 && m.status_fiscal !== 'emitido' && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mercadosParaCombinar.has(m.id)}
                          onChange={() => toggleMercadoParaCombinar(m.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                        />
                        Incluir na nota combinada
                      </label>
                    )}
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Item</th>
                          <th className="text-right px-3 py-2 font-semibold">Qtd</th>
                          <th className="text-right px-3 py-2 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(() => {
                          const itensOrdenados = m.pedidos_reabastecimento_itens || [];
                          const temMaisDeUmaVisita = new Set(itensOrdenados.map(i => i.visita_em || '')).size > 1;
                          return itensOrdenados.map((item, i, arr) => (
                            <React.Fragment key={i}>
                              {temMaisDeUmaVisita && item.visita_em !== arr[i - 1]?.visita_em && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-1.5 text-[10px] font-bold text-blue-500 uppercase bg-blue-50/60">
                                    Visita de {formatDateTime(item.visita_em)}
                                  </td>
                                </tr>
                              )}
                              {ehLinhaDeTroca(item) && !ehLinhaDeTroca(arr[i - 1]) && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase bg-gray-50/80">
                                    Trocas / Substituições
                                  </td>
                                </tr>
                              )}
                              <tr>
                                <td className="px-3 py-2 text-gray-800">{item.produto_nome}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{item.quantidade}</td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(item.valor_total)}</td>
                              </tr>
                            </React.Fragment>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-sm font-bold text-blue-700">Subtotal: {fmt(m.valor_total)}</span>
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
                      <div className="space-y-2">
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
                        {Math.abs(calcularTotalLiquidoNF(m) - (parseFloat(m.valor_total) || 0)) > 0.01 && (
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700">
                              A NF saiu em <strong>{fmt(calcularTotalLiquidoNF(m))}</strong>, diferente do subtotal do
                              mercado (<strong>{fmt(m.valor_total)}</strong>). Provavelmente algum produto foi
                              contado como dano <em>e</em> devolução ao mesmo tempo — vale conferir na Auditoria de Mercado.
                            </p>
                          </div>
                        )}
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
                          className="gap-2 bg-blue-600 hover:bg-blue-700 shrink-0"
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

              <div className="px-5 py-4 border-t border-gray-100 bg-blue-50 flex items-center justify-between">
                <p className="font-bold text-blue-800">Total do Pedido</p>
                <p className="text-xl font-black text-blue-700">{fmt(pedidoAberto.valor_total)}</p>
              </div>

              {aba === 'pendentes' && pedidoAberto.status === 'gerado' && (
                <div className="p-5 border-t border-gray-100 space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Só confirme depois que o pagamento realmente cair.
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
                Isso apaga o pedido gerado ({fmt(pedidoAberto?.valor_total || 0)}). As entregas que faziam parte
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