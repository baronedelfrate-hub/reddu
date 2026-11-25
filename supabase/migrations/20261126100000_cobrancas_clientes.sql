-- Cobranças a clientes empresa (boletos): cadastro de clientes + controle das cobranças.
-- Primeira versão manual (boleto emitido no internet banking). As colunas provedor/provedor_id
-- ficam prontas para a integração com a Sicredi.

create table if not exists public.clientes_cobranca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  razao_social text not null,
  nome_fantasia text,
  documento text not null check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  email text,
  telefone text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, documento)
);

create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity, -- nº sequencial da cobrança (vira o "seu número" do boleto)
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes_cobranca(id) on delete restrict,
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  pago_em date,
  valor_pago numeric(12,2),
  forma_recebimento text,
  numero_documento text,
  linha_digitavel text,
  pix_copia_cola text,
  url_boleto text check (url_boleto is null or url_boleto ~* '^https://'),
  pedido_ref text,
  nota_fiscal_ref text,
  observacao text,
  provedor text,
  provedor_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_cobranca_empresa_idx on public.clientes_cobranca (empresa_id, razao_social);
create index if not exists cobrancas_empresa_venc_idx on public.cobrancas (empresa_id, status, vencimento);
create index if not exists cobrancas_cliente_idx on public.cobrancas (cliente_id);

alter table public.clientes_cobranca enable row level security;
alter table public.cobrancas enable row level security;

drop policy if exists clientes_cobranca_empresa on public.clientes_cobranca;
create policy clientes_cobranca_empresa on public.clientes_cobranca
  for all to authenticated
  using (empresa_id = public.get_user_empresa_id())
  with check (empresa_id = public.get_user_empresa_id());

drop policy if exists cobrancas_empresa on public.cobrancas;
create policy cobrancas_empresa on public.cobrancas
  for all to authenticated
  using (empresa_id = public.get_user_empresa_id())
  with check (
    empresa_id = public.get_user_empresa_id()
    and exists (select 1 from public.clientes_cobranca c where c.id = cliente_id and c.empresa_id = cobrancas.empresa_id)
  );

revoke all on public.clientes_cobranca, public.cobrancas from anon;
grant select, insert, update, delete on public.clientes_cobranca, public.cobrancas to authenticated;

-- Para desfazer: drop table public.cobrancas; drop table public.clientes_cobranca;
