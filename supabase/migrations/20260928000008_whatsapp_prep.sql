-- =====================================================================
-- COPILOTO — Preparação WhatsApp (somente estrutura; nenhuma integração ativa)
-- Fluxo futuro: Webhook → normalização → estas tabelas → CRM (lead/cliente) → Copiloto (sugestões)
-- Primeira versão: SOMENTE leitura/contexto/sugestão. Nada responde automaticamente.
-- =====================================================================

create table public.whatsapp_accounts (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  owner_id        uuid references auth.users(id) on delete set null default auth.uid(),
  provider        text not null default 'cloud_api' check (provider in ('cloud_api','evolution','zapi','outro')),
  display_name    text,
  phone_number    text not null,
  external_id     text,                      -- phone_number_id / instância no provedor
  status          text not null default 'desconectado' check (status in ('desconectado','conectado','erro')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, team_id),
  unique (team_id, phone_number)
);

create table public.whatsapp_contacts (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  account_id   uuid not null,
  wa_id        text not null,                -- número no formato do WhatsApp (ex.: 5511999990000)
  profile_name text,
  lead_id      uuid,
  customer_id  uuid,
  created_at   timestamptz not null default now(),
  unique (id, team_id),
  unique (account_id, wa_id),
  foreign key (account_id, team_id)  references public.whatsapp_accounts(id, team_id) on delete cascade,
  foreign key (lead_id, team_id)     references public.leads(id, team_id)     on delete set null (lead_id),
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete set null (customer_id)
);

create table public.whatsapp_conversations (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  account_id       uuid not null,
  contact_id       uuid not null,
  last_message_at  timestamptz,
  unread_count     int not null default 0,
  status           text not null default 'aberta' check (status in ('aberta','arquivada')),
  ai_summary       text,                     -- resumo gerado pelo Copiloto (sugestão, nunca envio)
  created_at       timestamptz not null default now(),
  unique (id, team_id),
  unique (account_id, contact_id),
  foreign key (account_id, team_id) references public.whatsapp_accounts(id, team_id) on delete cascade,
  foreign key (contact_id, team_id) references public.whatsapp_contacts(id, team_id) on delete cascade
);

create table public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  conversation_id  uuid not null,
  external_id      text,                     -- id da mensagem no provedor (idempotência do webhook)
  direction        text not null check (direction in ('entrada','saida')),
  type             text not null default 'texto' check (type in ('texto','imagem','audio','video','documento','localizacao','outro')),
  body             text,
  media_path       text,                     -- caminho no Storage (bucket documents), se houver mídia
  sent_at          timestamptz not null,
  created_at       timestamptz not null default now(),
  foreign key (conversation_id, team_id) references public.whatsapp_conversations(id, team_id) on delete cascade
);
create unique index whatsapp_messages_external_uq on public.whatsapp_messages(team_id, external_id) where external_id is not null;
create index whatsapp_messages_conv_idx on public.whatsapp_messages(conversation_id, team_id, sent_at desc);
create index whatsapp_contacts_lead_idx on public.whatsapp_contacts(lead_id, team_id);
create index whatsapp_contacts_customer_idx on public.whatsapp_contacts(customer_id, team_id);
create index whatsapp_contacts_account_idx on public.whatsapp_contacts(account_id, team_id);
create index whatsapp_conv_account_idx on public.whatsapp_conversations(account_id, team_id);
create index whatsapp_conv_contact_idx on public.whatsapp_conversations(contact_id, team_id);
create index whatsapp_accounts_owner_idx on public.whatsapp_accounts(owner_id);

create trigger trg_whatsapp_accounts_updated before update on public.whatsapp_accounts
  for each row execute function public.set_updated_at();

-- RLS: membros da equipe leem; só admins configuram contas.
-- Escrita de mensagens virá do webhook (servidor, com credencial própria) — usuários não inserem mensagens.
alter table public.whatsapp_accounts enable row level security;
create policy "wa_accounts: membros leem" on public.whatsapp_accounts for select to authenticated using ((select private.is_team_member(team_id)));
create policy "wa_accounts: admins gerenciam" on public.whatsapp_accounts for all to authenticated
  using ((select private.is_team_admin(team_id))) with check ((select private.is_team_admin(team_id)));

alter table public.whatsapp_contacts enable row level security;
create policy "wa_contacts: membros leem" on public.whatsapp_contacts for select to authenticated using ((select private.is_team_member(team_id)));
create policy "wa_contacts: membros vinculam ao CRM" on public.whatsapp_contacts for update to authenticated
  using ((select private.is_team_member(team_id))) with check ((select private.is_team_member(team_id)));

alter table public.whatsapp_conversations enable row level security;
create policy "wa_conv: membros leem" on public.whatsapp_conversations for select to authenticated using ((select private.is_team_member(team_id)));
create policy "wa_conv: membros atualizam status" on public.whatsapp_conversations for update to authenticated
  using ((select private.is_team_member(team_id))) with check ((select private.is_team_member(team_id)));

alter table public.whatsapp_messages enable row level security;
create policy "wa_msgs: membros leem" on public.whatsapp_messages for select to authenticated using ((select private.is_team_member(team_id)));
