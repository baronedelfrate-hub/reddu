-- E-mail do escritório contábil + histórico dos envios mensais de XMLs.
alter table public.configuracoes_fiscais
  add column if not exists email_escritorio_contabil text;

create table if not exists public.notas_fiscais_envios_escritorio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes text not null,
  email text not null,
  quantidade integer not null,
  falhas integer not null default 0,
  enviado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists notas_fiscais_envios_escritorio_empresa_idx
  on public.notas_fiscais_envios_escritorio (empresa_id, created_at desc);

alter table public.notas_fiscais_envios_escritorio enable row level security;

-- Só leitura pela empresa; quem grava é a função do servidor (service role).
drop policy if exists envios_escritorio_select on public.notas_fiscais_envios_escritorio;
create policy envios_escritorio_select on public.notas_fiscais_envios_escritorio
  for select to authenticated using (empresa_id = public.get_user_empresa_id());

revoke all on public.notas_fiscais_envios_escritorio from anon, authenticated;
grant select on public.notas_fiscais_envios_escritorio to authenticated;

-- Para desfazer: drop table public.notas_fiscais_envios_escritorio; alter table public.configuracoes_fiscais drop column email_escritorio_contabil;
