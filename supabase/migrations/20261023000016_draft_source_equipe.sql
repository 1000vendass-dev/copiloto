-- Rascunhos de WhatsApp passam a dizer QUEM da equipe comercial escreveu (empresa de agentes):
-- ia = chat (CSO), follow_up / sdr / pos_venda = rotinas da equipe. Só amplia a lista; nada muda nos existentes.
alter table public.whatsapp_drafts drop constraint if exists whatsapp_drafts_source_check;
alter table public.whatsapp_drafts add constraint whatsapp_drafts_source_check
  check (source in ('ia', 'manual', 'follow_up', 'sdr', 'pos_venda'));
