import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const validateCPF = (cpf) => {
  if (!cpf) return true;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum += parseInt(clean[i-1]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(clean[9])) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(clean[i-1]) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(clean[10]);
};

export const validateCNPJ = (cnpj) => {
  if (!cnpj) return true;
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  const calc = (c, len) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(c[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(clean, 12) === parseInt(clean[12]) && calc(clean, 13) === parseInt(clean[13]);
};

export const cpfMask = (v) => v.replace(/\D/g, '')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})/, '$1-$2')
  .replace(/(-\d{2})\d+?$/, '$1');

export const cnpjMask = (v) => v.replace(/\D/g, '')
  .replace(/(\d{2})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1/$2')
  .replace(/(\d{4})(\d{1,2})/, '$1-$2')
  .replace(/(-\d{2})\d+?$/, '$1');

export const getDocType = (value) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length <= 11) return 'cpf';
  return 'cnpj';
};

export default function CPFNaNotaInput({ value, onChange, onValidationChange }) {
  const [isValid, setIsValid] = useState(true);
  const digits = (value || '').replace(/\D/g, '');
  const docType = digits.length <= 11 ? 'cpf' : 'cnpj';

  useEffect(() => {
    let valid = true;
    if (value) {
      valid = docType === 'cpf' ? validateCPF(value) : validateCNPJ(value);
    }
    setIsValid(valid);
    if (onValidationChange) onValidationChange(valid);
  }, [value, docType, onValidationChange]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const masked = raw.length <= 11 ? cpfMask(raw) : cnpjMask(raw);
    if (onChange) onChange(masked);
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between">
        <Label htmlFor="doc-nota" className="text-sm font-semibold text-slate-700">
          CPF / CNPJ na Nota (Opcional)
        </Label>
        {value && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${docType === 'cnpj' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {docType.toUpperCase()}
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          id="doc-nota"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)"
          maxLength={18}
          className={`h-10 text-base font-medium transition-colors ${
            !value
              ? 'border-slate-200 focus-visible:ring-slate-400 text-slate-900 bg-white'
              : isValid
                ? 'border-emerald-500 focus-visible:ring-emerald-500 text-emerald-900 bg-emerald-50/30'
                : 'border-rose-500 focus-visible:ring-rose-500 text-rose-900 bg-rose-50/30'
          }`}
        />
      </div>
      {value && !isValid && (
        <span className="text-[10px] font-bold text-rose-500 block">
          {docType === 'cpf' ? 'CPF inválido. Verifique os dígitos.' : 'CNPJ inválido. Verifique os dígitos.'}
        </span>
      )}
    </div>
  );
}