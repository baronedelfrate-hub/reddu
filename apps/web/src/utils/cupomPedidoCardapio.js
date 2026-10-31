// Cupom (80mm) do pedido do Cardápio Digital — usado pelo aviso global de
// pedidos agendados e pela tela Pedidos Agendados. Mesmo layout do cupom da
// tela de Pedidos do Cardápio (itens, taxa, desconto, pagamento, troco).

const formatPreco = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatHora = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const rotuloFormaPagamento = (f) => {
  const mapa = {
    dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito',
    cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  };
  const chave = String(f || '').toLowerCase();
  return mapa[chave] || (f ? String(f) : '');
};

// Agrupa linhas de combo (cabeçalho + sabores) e mantém itens simples.
export const agruparItensPedido = (pedido) => {
  const grupos = {};
  const linhas = [];
  (pedido.pedidos_cardapio_itens || []).forEach((item) => {
    if (item.combo_grupo_id) {
      grupos[item.combo_grupo_id] = grupos[item.combo_grupo_id] || { header: null, sabores: [] };
      if (item.produto_id === null) grupos[item.combo_grupo_id].header = item;
      else grupos[item.combo_grupo_id].sabores.push(item);
    } else {
      linhas.push({ tipo: 'simples', item });
    }
  });
  Object.values(grupos).forEach((g) => {
    if (g.header) linhas.push({ tipo: 'combo', header: g.header, sabores: g.sabores });
  });
  return linhas;
};

const montarPagamentoHtml = (pedido) => {
  const online = pedido.forma_pagamento_online;
  if (online) {
    const pago = pedido.status_pagamento === 'pago';
    return `<div class="info">Forma de pagamento: ${esc(rotuloFormaPagamento(online))} (online)</div>`
      + `<div class="info bold">${pago ? '* PAGO - nao cobrar *' : '* PAGAMENTO ONLINE PENDENTE *'}</div>`;
  }
  const tipoEntrega = pedido.pagamento_entrega_tipo;
  const forma = tipoEntrega === 'cartao' ? 'Cartão (maquininha)'
    : tipoEntrega === 'dinheiro' ? 'Dinheiro'
      : rotuloFormaPagamento(pedido.vendas?.forma_pagamento);
  const quando = pedido.tipo_entrega === 'entrega' ? 'na entrega' : 'na retirada';
  let html = `<div class="info">Forma de pagamento: ${forma && forma !== 'A combinar' ? `${forma} (${quando})` : `Pagar ${quando}`}</div>`;
  if (tipoEntrega === 'dinheiro') {
    const trocoPara = Number(pedido.troco_para || 0);
    html += trocoPara > 0
      ? `<div class="info">Troco para: ${formatPreco(trocoPara)} (troco ${formatPreco(Math.max(0, trocoPara - Number(pedido.total || 0)))})</div>`
      : `<div class="info">Troco: Nao precisa</div>`;
  }
  if (tipoEntrega === 'cartao' && pedido.taxa_retorno_aplicada) {
    html += `<div class="info">Taxa de entrega inclui retorno da maquininha</div>`;
  }
  return html + `<div class="info bold">* Cobrar do cliente *</div>`;
};

// Retorna true se abriu a janela de impressão, false se o navegador bloqueou o popup.
export function imprimirCupomPedido(pedido, empresaNome) {
  try {
    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) return false;

    const linhas = agruparItensPedido(pedido);
    const taxaCupom = Number(pedido.taxa_entrega || 0);
    const descontoCupom = Number(pedido.desconto_aplicado || 0);
    const subtotalCupom = Math.max(0, Number(pedido.total || 0) - taxaCupom + descontoCupom);
    const itensHtml = linhas.map((linha) => {
      if (linha.tipo === 'simples') {
        return `<div class="linha"><span>${linha.item.quantidade}x ${esc(linha.item.nome_item)}</span><span>${formatPreco(linha.item.subtotal)}</span></div>`;
      }
      const saboresHtml = linha.sabores.map((s) => `<div class="sabor">${s.quantidade}x ${esc(s.nome_item)} — ${formatPreco(s.subtotal)}</div>`).join('');
      const totalGrupo = Number(linha.header.subtotal || 0) + linha.sabores.reduce((s, x) => s + Number(x.subtotal || 0), 0);
      return `<div class="linha bold"><span>${linha.header.quantidade}x ${esc(linha.header.nome_item)}</span><span>${formatPreco(totalGrupo)}</span></div>${saboresHtml}`;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Pedido #${pedido.numero_pedido}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; width: 80mm; padding: 3mm; }
            @page { size: 80mm auto; margin: 0mm; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .titulo { font-size: 16px; font-weight: bold; }
            .divisor { border-top: 1px dashed #000; margin: 2mm 0; }
            .linha { display: flex; justify-content: space-between; margin-top: 1mm; }
            .sabor { padding-left: 3mm; font-size: 11px; }
            .info { margin-top: 1mm; }
            .total { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 2mm; }
          </style>
        </head>
        <body>
          <div class="center titulo">${esc(empresaNome || 'Cardápio Digital')}</div>
          <div class="center bold" style="font-size:14px;margin-top:1mm;">PEDIDO #${pedido.numero_pedido}</div>
          <div class="divisor"></div>
          <div class="info bold">${esc(pedido.cliente_nome)}</div>
          <div class="info">Tel: ${esc(pedido.cliente_telefone)}</div>
          <div class="info">${pedido.tipo_entrega === 'entrega' ? `Entrega: ${esc(pedido.endereco_entrega || '')}` : 'Retirada no local'}</div>
          ${pedido.data_agendamento ? `<div class="info bold">Agendado para: ${formatHora(pedido.data_agendamento)}</div>` : ''}
          <div class="divisor"></div>
          ${itensHtml}
          <div class="divisor"></div>
          ${pedido.observacao ? `<div class="info">Obs: ${esc(pedido.observacao)}</div><div class="divisor"></div>` : ''}
          <div class="linha"><span>Subtotal</span><span>${formatPreco(subtotalCupom)}</span></div>
          ${taxaCupom > 0 ? `<div class="linha"><span>Taxa de entrega</span><span>${formatPreco(taxaCupom)}</span></div>` : (pedido.tipo_entrega === 'entrega' ? `<div class="linha"><span>Taxa de entrega</span><span>Gratis</span></div>` : '')}
          ${descontoCupom > 0 ? `<div class="linha"><span>Desconto${pedido.cupom_codigo ? ` (${esc(pedido.cupom_codigo)})` : ''}</span><span>-${formatPreco(descontoCupom)}</span></div>` : ''}
          <div class="total"><span>TOTAL</span><span>${formatPreco(pedido.total)}</span></div>
          <div class="divisor"></div>
          <div class="bold">Pagamento</div>
          ${montarPagamentoHtml(pedido)}
          <div class="center info" style="margin-top:2mm;">${formatHora(pedido.created_at)}</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    const executarPrint = () => {
      try { printWindow.focus(); printWindow.print(); printWindow.close(); } catch (e) { /* ignore */ }
    };
    printWindow.onload = () => setTimeout(executarPrint, 400);
    setTimeout(() => { if (!printWindow.closed) executarPrint(); }, 1200);
    return true;
  } catch (error) {
    console.error('Erro ao imprimir pedido:', error);
    return false;
  }
}

export const formatarDataHoraAgendamento = formatHora;
export const formatarPreco = formatPreco;