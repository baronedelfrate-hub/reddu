// Consulta pública de CNPJ (BrasilAPI, dados da Receita Federal). Devolve { ok, dados } ou { ok:false, motivo }.
export async function consultarCnpj(cnpj, fetchFn = fetch) {
  const d = String(cnpj ?? '').replace(/\D/g, '');
  if (d.length !== 14) return { ok: false, motivo: 'invalido' };
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    const resp = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${d}`, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (resp.status === 404) return { ok: false, motivo: 'nao_encontrado' };
    if (!resp.ok) return { ok: false, motivo: 'indisponivel' };
    const j = await resp.json();
    const num = String(j.numero ?? '').trim();
    const tel = String(j.ddd_telefone_1 ?? '').replace(/\D/g, '');
    return {
      ok: true,
      dados: {
        razao_social: String(j.razao_social ?? '').trim(),
        nome_fantasia: String(j.nome_fantasia ?? '').trim(),
        email: String(j.email ?? '').trim().toLowerCase(),
        telefone: tel.length >= 10 ? tel : '',
        cep: String(j.cep ?? '').replace(/\D/g, '').slice(0, 8),
        logradouro: String(j.logradouro ?? '').trim(),
        numero: /^(sn|s\/n)$/i.test(num) ? 'S/N' : num,
        complemento: String(j.complemento ?? '').trim().slice(0, 60),
        bairro: String(j.bairro ?? '').trim(),
        municipio: String(j.municipio ?? '').trim(),
        uf: String(j.uf ?? '').trim().toUpperCase().slice(0, 2),
      },
      situacao: String(j.descricao_situacao_cadastral ?? '').trim(),
    };
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
}
