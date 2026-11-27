export const soDigitosCep = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 8);

export const formatarCep = (v) => {
  const d = soDigitosCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// Busca o endereço pelo CEP (ViaCEP). Devolve null se o CEP não existe ou o serviço não respondeu.
export async function buscarCep(cep, fetchFn = fetch) {
  const d = soDigitosCep(cep);
  if (d.length !== 8) return null;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
    const resp = await fetchFn(`https://viacep.com.br/ws/${d}/json/`, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!j || j.erro) return null;
    return { logradouro: j.logradouro || '', bairro: j.bairro || '', municipio: j.localidade || '', uf: (j.uf || '').toUpperCase() };
  } catch {
    return null;
  }
}
