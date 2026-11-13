-- Registro das respostas da IA no WhatsApp do cardápio: serve de auditoria e
-- de base para o limite de respostas por cliente. Só as Edge Functions
-- (service role) leem e gravam; nenhum acesso pelo navegador.
CREATE TABLE IF NOT EXISTS public.whatsapp_ia_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conversa_id uuid REFERENCES public.whatsapp_conversas(id) ON DELETE SET NULL,
  telefone_jid text NOT NULL,
  acao text NOT NULL,
  motivo text,
  tokens_entrada integer,
  tokens_saida integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ia_log_limite
  ON public.whatsapp_ia_log (empresa_id, telefone_jid, created_at DESC);

ALTER TABLE public.whatsapp_ia_log ENABLE ROW LEVEL SECURITY;
