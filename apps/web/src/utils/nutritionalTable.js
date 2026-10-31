/**
 * Utilitários para a Tabela de Informação Nutricional (TIN)
 * Baseado na RDC nº 429/2020 e Instrução Normativa nº 75/2020 da ANVISA.
 *
 * IMPORTANTE — Este módulo calcula o %VD (percentual de valores diários)
 * a partir dos valores por porção informados no cadastro do produto, usando
 * os Valores Diários de Referência (VDR) padrão para uma dieta de 2.000 kcal,
 * definidos no Anexo da IN 75/2020.
 *
 * A ANVISA também define regras específicas de ARREDONDAMENTO dos valores
 * declarados (ex.: sódio abaixo de 5mg pode ser declarado como "0mg", gorduras
 * trans abaixo de 0,2g como "0g" etc. — Anexo II da IN 75/2020). Este módulo
 * faz um arredondamento simples (2 casas decimais / inteiro para %VD) e NÃO
 * substitui a validação de um responsável técnico/nutricionista antes de
 * usar a etiqueta em produtos comercializados.
 */

// Valores Diários de Referência (dieta de 2.000 kcal) — IN 75/2020, Anexo
export const VALORES_DIARIOS_REFERENCIA = {
  valor_energetico_kcal: 2000,
  carboidratos_g: 300,
  proteinas_g: 50,
  gorduras_totais_g: 65,
  gorduras_saturadas_g: 20,
  fibra_alimentar_g: 25,
  sodio_mg: 2000,
};

// Campos que possuem %VD estabelecido pela legislação.
// Açúcares totais, açúcares adicionados e gorduras trans NÃO têm %VD definido.
const CAMPOS_COM_VD = Object.keys(VALORES_DIARIOS_REFERENCIA);

export const CAMPOS_NUTRICIONAIS = [
  { key: 'valor_energetico_kcal', label: 'Valor energético', unidade: 'kcal', temVD: true },
  { key: 'carboidratos_g', label: 'Carboidratos', unidade: 'g', temVD: true },
  { key: 'acucares_totais_g', label: 'Açúcares totais', unidade: 'g', temVD: false },
  { key: 'acucares_adicionados_g', label: 'Açúcares adicionados', unidade: 'g', temVD: false },
  { key: 'proteinas_g', label: 'Proteínas', unidade: 'g', temVD: true },
  { key: 'gorduras_totais_g', label: 'Gorduras totais', unidade: 'g', temVD: true },
  { key: 'gorduras_saturadas_g', label: 'Gorduras saturadas', unidade: 'g', temVD: true },
  { key: 'gorduras_trans_g', label: 'Gorduras trans', unidade: 'g', temVD: false },
  { key: 'fibra_alimentar_g', label: 'Fibra alimentar', unidade: 'g', temVD: true },
  { key: 'sodio_mg', label: 'Sódio', unidade: 'mg', temVD: true },
];

export function formatNumeroBR(valor, casasDecimais = 1) {
  if (valor === null || valor === undefined || valor === '') return '0';
  const num = Number(valor);
  if (Number.isNaN(num)) return '0';
  // Remove zeros decimais desnecessários (ex: 10.0 -> 10) mas mantém até `casasDecimais`
  const fixed = num.toFixed(casasDecimais);
  const trimmed = parseFloat(fixed).toString();
  return trimmed.replace('.', ',');
}

/**
 * Calcula o %VD de um campo com base no valor por porção informado.
 * Arredondado para o inteiro mais próximo, como exibido na etiqueta oficial.
 */
export function calcularPercentualVD(campoKey, valorPorcao) {
  if (!CAMPOS_COM_VD.includes(campoKey)) return null;
  const referencia = VALORES_DIARIOS_REFERENCIA[campoKey];
  const valor = Number(valorPorcao);
  if (!referencia || Number.isNaN(valor)) return 0;
  return Math.round((valor / referencia) * 100);
}

/**
 * Monta as linhas prontas para renderização da tabela, já com valor
 * formatado e %VD calculado, a partir do objeto `produto` (linha da tabela
 * `produtos`, com os campos de nutricional preenchidos).
 */
export function montarLinhasTabelaNutricional(produto = {}) {
  return CAMPOS_NUTRICIONAIS.map((campo) => {
    const valorBruto = produto[campo.key];
    return {
      ...campo,
      valorBruto,
      valorFormatado: formatNumeroBR(valorBruto, campo.unidade === 'mg' ? 0 : 1),
      percentualVD: campo.temVD ? calcularPercentualVD(campo.key, valorBruto) : null,
    };
  });
}

export function produtoTemTabelaNutricional(produto) {
  return Boolean(produto?.possui_tabela_nutricional);
}

/**
 * Verifica se o produto possui ao menos um valor nutricional preenchido,
 * indicando que há dados suficientes para exibir/imprimir a etiqueta.
 */
export function hasDadosNutricionais(produto) {
  if (!produto) return false;
  if (produto.possui_tabela_nutricional) return true;
  return CAMPOS_NUTRICIONAIS.some((campo) => {
    const valor = produto[campo.key];
    return valor !== null && valor !== undefined && valor !== '' && !Number.isNaN(Number(valor));
  });
}