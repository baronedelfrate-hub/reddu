-- Rotina mensal de envio dos XMLs ao escritório contábil.
alter table public.configuracoes_fiscais
  add column if not exists envio_escritorio_ativo boolean not null default false,
  add column if not exists envio_escritorio_dia smallint not null default 5,
  add column if not exists envio_escritorio_ultimo_resultado text;

alter table public.configuracoes_fiscais
  drop constraint if exists configuracoes_fiscais_envio_escritorio_dia_check;
alter table public.configuracoes_fiscais
  add constraint configuracoes_fiscais_envio_escritorio_dia_check check (envio_escritorio_dia between 1 and 28);

alter table public.notas_fiscais_envios_escritorio
  add column if not exists origem text not null default 'manual';

-- Todo dia às 09:00 (Brasília) = 12:00 UTC. A função só age no dia configurado de cada empresa.
select cron.unschedule('notas-fiscais-envio-automatico')
  where exists (select 1 from cron.job where jobname = 'notas-fiscais-envio-automatico');
select cron.schedule(
  'notas-fiscais-envio-automatico',
  '0 12 * * *',
  $$ select net.http_post(
       url := 'https://daptthtsvqjspavvvhax.supabase.co/functions/v1/notas-fiscais-envio-automatico',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) as request_id; $$
);

-- Para desfazer: select cron.unschedule('notas-fiscais-envio-automatico');
--   e drop das colunas envio_escritorio_* / notas_fiscais_envios_escritorio.origem.
