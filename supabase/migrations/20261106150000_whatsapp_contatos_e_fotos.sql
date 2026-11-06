-- Fase 2 do WhatsApp: contatos importados da Evolution e foto de perfil nas conversas.
-- Mudança aditiva: não altera nem remove nada existente.

create table if not exists public.whatsapp_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  telefone_jid varchar not null,
  telefone varchar,
  nome varchar,
  push_name varchar,
  foto_url text,
  foto_atualizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_contatos_empresa_jid_unique unique (empresa_id, telefone_jid)
);

create index if not exists idx_whatsapp_contatos_empresa_nome
  on public.whatsapp_contatos (empresa_id, nome);

-- Foto copiada para a lista de conversas (evita buscar em outra tabela a cada linha).
alter table public.whatsapp_conversas add column if not exists foto_url text;

-- Cada empresa lê só os próprios contatos. A escrita é feita pela função de servidor
-- (service role), que ignora a RLS; o navegador não grava nesta tabela.
alter table public.whatsapp_contatos enable row level security;

create policy whatsapp_contatos_select_policy on public.whatsapp_contatos
  for select using (empresa_id = get_user_empresa_id());

-- Para desfazer:
--   drop table if exists public.whatsapp_contatos;
--   alter table public.whatsapp_conversas drop column if exists foto_url;
