-- Tipo do contato do WhatsApp (criada no SQL Editor em 18/10/2026; registrada aqui para o histórico).
alter table public.whatsapp_contacts
  add column if not exists categoria text not null default 'cliente'
  check (categoria in ('cliente', 'proprio', 'loja', 'parceiro', 'spam'));
