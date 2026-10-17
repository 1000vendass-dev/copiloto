-- =====================================================================
-- COPILOTO — WhatsApp via WAHA (leitura + envio manual com confirmação)
-- 1) aceita provider 'waha'
-- 2) rascunhos de mensagem: a IA NUNCA envia; ela cria um rascunho no card do lead
--    e o vendedor revisa e toca em "Enviar".
-- =====================================================================

alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_provider_check;
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_check
  check (provider in ('cloud_api','evolution','zapi','waha','outro'));

create table public.whatsapp_drafts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  lead_id     uuid not null,
  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  source      text not null default 'ia' check (source in ('ia','manual')),
  status      text not null default 'pendente' check (status in ('pendente','enviado','descartado')),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (lead_id, team_id) references public.leads(id, team_id) on delete cascade
);
create index whatsapp_drafts_lead_idx on public.whatsapp_drafts(lead_id, team_id, status);

alter table public.whatsapp_drafts enable row level security;
create policy "wa_drafts: membros leem" on public.whatsapp_drafts for select to authenticated
  using ((select private.is_team_member(team_id)));
create policy "wa_drafts: membros criam" on public.whatsapp_drafts for insert to authenticated
  with check ((select private.is_team_member(team_id)) and status = 'pendente');
create policy "wa_drafts: membros atualizam" on public.whatsapp_drafts for update to authenticated
  using ((select private.is_team_member(team_id))) with check ((select private.is_team_member(team_id)));
