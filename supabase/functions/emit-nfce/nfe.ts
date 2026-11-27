// NF-e (modelo 55) para destinatário CNPJ.
// Desde 05/01/2026 (Ajuste SINIEF 11/2025) a NFC-e não pode mais ser emitida para CNPJ.
// O front continua montando o payload no formato NFC-e; aqui ele é convertido para NF-e.

export interface ClienteDestinatario {
  razao_social?: string | null;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

export function ehDestinatarioCnpj(payload: any): boolean {
  const d = String(payload?.cnpj_destinatario ?? '').replace(/\D/g, '');
  return d.length === 14;
}

// ".../v2/nfce" -> ".../v2/nfe" (mantém homologação/produção configurada)
export function urlNFe(urlApiNfce: string): string {
  const base = String(urlApiNfce).replace(/\/+$/, '');
  return /\/nfce$/i.test(base) ? base.replace(/\/nfce$/i, '/nfe') : `${base.replace(/\/v2\/.*$/i, '')}/v2/nfe`;
}

export function converterParaNFe(payload: any, cliente?: ClienteDestinatario | null): any {
  const cnpj = String(payload.cnpj_destinatario).replace(/\D/g, '');
  const nomeInformado = String(payload.nome_destinatario ?? '').trim();
  const nome = (cliente?.razao_social || nomeInformado || '').trim();
  if (!nome) {
    throw new Error('Para emitir NF-e para CNPJ é preciso informar o nome/razão social do cliente.');
  }

  const nfe: any = { ...payload };
  delete nfe.cpf_destinatario;
  delete nfe.cnpj_responsavel_tecnico;
  delete nfe.contato_responsavel_tecnico;
  delete nfe.email_responsavel_tecnico;
  delete nfe.telefone_responsavel_tecnico;

  nfe.tipo_documento = '1'; // 1 = saída
  nfe.data_entrada_saida = payload.data_emissao;
  nfe.cnpj_destinatario = cnpj;
  nfe.nome_destinatario = nome;
  // 9 = não contribuinte. Se o cliente for contribuinte de ICMS a SEFAZ rejeita e a mensagem aparece na tela.
  nfe.indicador_inscricao_estadual_destinatario = '9';
  nfe.consumidor_final = '1';
  nfe.presenca_comprador = payload.presenca_comprador ?? '1';

  if (cliente) {
    const cep = String(cliente.cep ?? '').replace(/\D/g, '');
    if (cliente.logradouro && cliente.numero && cliente.bairro && cliente.municipio && cliente.uf) {
      nfe.logradouro_destinatario = cliente.logradouro;
      nfe.numero_destinatario = cliente.numero;
      if (cliente.complemento) nfe.complemento_destinatario = cliente.complemento;
      nfe.bairro_destinatario = cliente.bairro;
      nfe.municipio_destinatario = cliente.municipio;
      nfe.uf_destinatario = cliente.uf;
      if (cep.length === 8) nfe.cep_destinatario = cep;
      nfe.pais_destinatario = 'Brasil';
    }
    if (cliente.email) nfe.email_destinatario = cliente.email;
  }
  return nfe;
}

const STATUS_REJEITADA = ['erro_autorizacao', 'denegado', 'cancelado'];

export type ResultadoNFe =
  | { tipo: 'autorizado'; ref: string; chave: string | null; danfe: string | null }
  | { tipo: 'processando' }
  | { tipo: 'erro'; mensagem: string };

export function interpretarRespostaNFe(status: number, r: any, origin: string, ref: string): ResultadoNFe {
  const st = r?.status;
  if (st === 'autorizado') {
    const caminho = r.caminho_danfe || null;
    return {
      tipo: 'autorizado',
      ref: r.ref || ref,
      chave: r.chave_nfe || null,
      danfe: caminho ? (/^https?:/i.test(caminho) ? caminho : `${origin}${caminho}`) : null,
    };
  }
  if (st === 'processando_autorizacao') return { tipo: 'processando' };
  if (STATUS_REJEITADA.includes(st) || status >= 400 || r?.erros || r?.codigo) {
    const msg = r?.mensagem_sefaz
      ? `Rejeição SEFAZ${r.status_sefaz ? ` ${r.status_sefaz}` : ''}: ${r.mensagem_sefaz}`
      : (r?.mensagem || JSON.stringify(r?.erros || r || 'Erro na API Focus NFe'));
    return { tipo: 'erro', mensagem: msg };
  }
  return { tipo: 'processando' };
}

// Emite (ou retoma) a NF-e de forma idempotente pela referência:
// consulta antes; só reenvia se não existe ou se foi rejeitada.
export async function emitirNFe(opts: {
  urlApiNfce: string;
  token: string;
  ref: string;
  payload: any;
  fetchFn?: typeof fetch;
  espera?: (ms: number) => Promise<void>;
  tentativas?: number;
}): Promise<ResultadoNFe> {
  const f = opts.fetchFn ?? fetch;
  const espera = opts.espera ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = urlNFe(opts.urlApiNfce);
  const origin = new URL(base).origin;
  const headers = { Authorization: `Basic ${btoa(`${opts.token}:`)}` };
  const ref = encodeURIComponent(opts.ref);

  const consultar = async (): Promise<ResultadoNFe | null> => {
    const resp = await f(`${base}/${ref}`, { headers });
    if (resp.status === 404) return null;
    const j = await resp.json().catch(() => ({}));
    if (j?.codigo === 'nao_encontrado') return null;
    return interpretarRespostaNFe(resp.status, j, origin, opts.ref);
  };

  let atual = await consultar();
  if (!atual || atual.tipo === 'erro') {
    const resp = await f(`${base}?ref=${ref}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.payload),
    });
    const j = await resp.json().catch(() => ({}));
    atual = interpretarRespostaNFe(resp.status, j, origin, opts.ref);
  }

  const max = opts.tentativas ?? 8;
  for (let i = 0; i < max && atual.tipo === 'processando'; i++) {
    await espera(2500);
    const c = await consultar();
    if (c) atual = c;
  }
  return atual;
}
