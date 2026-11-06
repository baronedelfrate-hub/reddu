// Telefone no formato do WhatsApp (5519988992192@s.whatsapp.net) -> +55 19 98899-2192
export function formatarTelefone(valor) {
  const digitos = String(valor || '').split('@')[0].replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const resto = digitos.slice(4);
    const corte = resto.length === 9 ? 5 : 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${digitos}`;
}

// Aceita DDD+número (10 ou 11 dígitos) ou já com 55. Devolve '' se não for um número válido.
export function normalizarNumeroBR(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos;
  return '';
}

// Nome que aparece na lista: cliente cadastrado > nome do WhatsApp > telefone formatado.
export function nomeConversa(conversa) {
  return conversa.whatsapp_clientes?.nome
    || conversa.nome_exibicao
    || formatarTelefone(conversa.telefone_jid)
    || 'Contato';
}

const inicioDoDia = (data) => new Date(data.getFullYear(), data.getMonth(), data.getDate());

// Separador de data entre mensagens: Hoje, Ontem, dia da semana (últimos 6 dias) ou dd/mm/aaaa.
export function rotuloDia(dataIso, agora = new Date()) {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '';
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) {
    const nome = data.toLocaleDateString('pt-BR', { weekday: 'long' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }
  return data.toLocaleDateString('pt-BR');
}

// Hora dentro do balão (o dia já aparece no separador entre as mensagens).
export function formatarSoHora(dataIso) {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
