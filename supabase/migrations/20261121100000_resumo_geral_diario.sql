-- Resumo geral do dia por WhatsApp (dono/gestor): controle de envio 1x por dia + agendamento.
alter table public.empresas add column if not exists resumo_geral_ultimo_em date;

-- A cada 15 minutos; a função só envia a partir do horário configurado e uma vez por dia.
select cron.unschedule('resumo-geral-diario')
  where exists (select 1 from cron.job where jobname = 'resumo-geral-diario');
select cron.schedule(
  'resumo-geral-diario',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://daptthtsvqjspavvvhax.supabase.co/functions/v1/resumo-geral-diario',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) as request_id; $$
);

-- Para desfazer: select cron.unschedule('resumo-geral-diario'); alter table public.empresas drop column resumo_geral_ultimo_em;
