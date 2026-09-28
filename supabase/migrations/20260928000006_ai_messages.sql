-- Histórico da conversa com o Copiloto (por usuário). A memória de negócio continua
-- nas tabelas estruturadas + ai_memory; isto só permite retomar a conversa em outro dispositivo.
create table public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_user_idx on public.ai_messages(user_id, created_at desc);
create index ai_messages_team_idx on public.ai_messages(team_id);

alter table public.ai_messages enable row level security;
create policy "ai_messages: dono lê" on public.ai_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_messages: dono grava" on public.ai_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and (select private.is_team_member(team_id)));
create policy "ai_messages: dono apaga" on public.ai_messages
  for delete to authenticated using (user_id = (select auth.uid()));
