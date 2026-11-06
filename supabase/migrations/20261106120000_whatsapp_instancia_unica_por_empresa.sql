-- A empresa de teste compartilhava a instância 'REDDU' com a Tô Coxinha, o que fazia o
-- webhook (busca por instance_name com maybeSingle) descartar todos os eventos.
update public.whatsapp_configuracoes
set instance_name = 'REDDU-TESTE', updated_at = now()
where empresa_id = '00a3a287-30ff-4b07-ba81-70eba068b8f1'
  and instance_name = 'REDDU';

-- Cada instância pertence a uma única empresa.
create unique index if not exists whatsapp_configuracoes_instance_unique
  on public.whatsapp_configuracoes (instance_name);

-- Para desfazer:
--   drop index if exists public.whatsapp_configuracoes_instance_unique;
--   update public.whatsapp_configuracoes set instance_name = 'REDDU'
--     where empresa_id = '00a3a287-30ff-4b07-ba81-70eba068b8f1';  -- só se a Tô Coxinha deixar de usar 'REDDU'
