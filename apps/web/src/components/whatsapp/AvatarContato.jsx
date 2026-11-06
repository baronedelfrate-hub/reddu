import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

const CORES = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-600', 'bg-teal-600',
  'bg-sky-600', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500',
];

// Iniciais só quando o nome tem letras (telefone puro mostra o ícone de pessoa).
export function iniciaisDe(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (partes.length === 0) return '';
  const primeira = partes[0].match(/\p{L}/u)?.[0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1].match(/\p{L}/u)?.[0] || '' : '';
  return `${primeira}${ultima}`.toUpperCase();
}

function corPara(chave) {
  let hash = 0;
  for (const ch of String(chave || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES[hash % CORES.length];
}

// Foto de perfil do contato; se não houver (ou falhar ao carregar), círculo colorido com iniciais.
export default function AvatarContato({ nome, fotoUrl, chave, tamanho = 40, className = '' }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [fotoUrl]);

  const estilo = { width: tamanho, height: tamanho };

  if (fotoUrl && !falhou) {
    return (
      <img
        src={fotoUrl}
        alt=""
        loading="lazy"
        onError={() => setFalhou(true)}
        style={estilo}
        className={`rounded-full object-cover flex-shrink-0 bg-gray-200 ${className}`}
      />
    );
  }

  const iniciais = iniciaisDe(nome);
  return (
    <div
      style={estilo}
      className={`rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold select-none ${corPara(chave || nome)} ${className}`}
    >
      {iniciais
        ? <span style={{ fontSize: tamanho * 0.38 }}>{iniciais}</span>
        : <User style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />}
    </div>
  );
}
