// CPF/CNPJ: só dígitos, formatação e validação pelos dígitos verificadores.
export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export const formatarDocumento = (v) => {
  const d = soDigitos(v);
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d;
};

export const cpfValido = (v) => {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (base, peso) => {
    let s = 0;
    for (let i = 0; i < base; i += 1) s += Number(d[i]) * (peso - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9, 10) === Number(d[9]) && dig(10, 11) === Number(d[10]);
};

export const cnpjValido = (v) => {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dig = (base) => {
    const pesos = base === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < base; i += 1) s += Number(d[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(12) === Number(d[12]) && dig(13) === Number(d[13]);
};

export const documentoValido = (v) => {
  const d = soDigitos(v);
  return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false;
};
