-- Atualização automática do app (Supabase Realtime). O navegador recebe o aviso de mudança e recarrega
-- os dados; o RLS continua valendo (cada usuário só recebe eventos das linhas que pode ler).
alter publication supabase_realtime add table
  public.whatsapp_conversations,
  public.whatsapp_messages,
  public.whatsapp_drafts,
  public.leads,
  public.tasks,
  public.appointments;

-- Aparelhos que ativaram notificação (Web Push). Cada usuário vê e gerencia só os seus;
-- o envio é feito pelo servidor com a chave secreta (ignora RLS).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_team_idx on public.push_subscriptions(team_id);

alter table public.push_subscriptions enable row level security;
create policy "push: dono lê" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push: dono cria" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_team_member(team_id)));
create policy "push: dono atualiza" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push: dono apaga" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
