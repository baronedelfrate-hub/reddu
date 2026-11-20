// Cálculos do Relatório de Eventos: junta os itens digitados à mão (categoria e sabor em
// texto livre, com maiúsculas e espaços diferentes) em grupos comparáveis.

// "Fritos ", "FRITOS" e " - Fritos" viram o mesmo grupo; o rótulo exibido é o 1º escrito
// mais comum, em formato "Fritos".
export const normalizarTexto = (s) => String(s ?? '')
  .replace(/^[\s\-–—•*]+/, '')
  .replace(/\s+/g, ' ')
  .trim();

export const chaveTexto = (s) => normalizarTexto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const formatoTitulo = (s) => {
  const t = normalizarTexto(s);
  if (!t) return '(sem nome)';
  // só reformata o que veio todo em maiúsculas
  if (t === t.toUpperCase() && t !== t.toLowerCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
};

const somar = (mapa, texto, qtd, valor) => {
  const k = chaveTexto(texto) || '(sem nome)';
  const g = mapa.get(k) || { rotulo: formatoTitulo(texto), qtd: 0, valor: 0, eventos: new Set() };
  g.qtd += qtd;
  g.valor += valor;
  return { k, g };
};

// eventos: linhas de `eventos`; itens: linhas de `evento_itens` (com evento_id)
export function agregarEventos(eventos, itens) {
  const porEvento = new Map();
  (itens || []).forEach((i) => {
    if (!porEvento.has(i.evento_id)) porEvento.set(i.evento_id, []);
    porEvento.get(i.evento_id).push(i);
  });

  const categorias = new Map();
  const sabores = new Map();
  let salgados = 0;
  let faturamento = 0;
  let entrada = 0;
  let restante = 0;
  let convidados = 0;

  const linhas = (eventos || []).map((e) => {
    const its = porEvento.get(e.id) || [];
    const qtdItens = its.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    const totalSalgados = qtdItens > 0 ? qtdItens : Number(e.total_salgados) || 0;
    salgados += totalSalgados;
    faturamento += Number(e.valor_total) || 0;
    entrada += Number(e.valor_entrada) || 0;
    restante += Number(e.valor_restante) || 0;
    convidados += Number(e.num_convidados) || 0;

    its.forEach((i) => {
      const qtd = Number(i.quantidade) || 0;
      const valor = Number(i.subtotal) || 0;
      const c = somar(categorias, i.categoria, qtd, valor);
      c.g.eventos.add(e.id); categorias.set(c.k, c.g);
      const s = somar(sabores, i.descricao || i.categoria, qtd, valor);
      s.g.eventos.add(e.id); sabores.set(s.k, s.g);
    });

    return { ...e, itens: its, salgados: totalSalgados };
  });

  const lista = (mapa) => [...mapa.values()]
    .map((g) => ({ rotulo: g.rotulo, qtd: g.qtd, valor: g.valor, eventos: g.eventos.size }))
    .sort((a, b) => b.qtd - a.qtd);

  return {
    linhas,
    categorias: lista(categorias),
    sabores: lista(sabores),
    resumo: { eventos: linhas.length, salgados, faturamento, entrada, restante, convidados },
  };
}
