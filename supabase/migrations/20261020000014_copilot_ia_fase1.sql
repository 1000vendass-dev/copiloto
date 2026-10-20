-- Copiloto IA, Fase 1: perfil configurável, execuções, resumos por dia, memória com status e tarefas da IA.
-- Escrita das rotinas é feita pelo servidor (chave secreta); o usuário só edita o próprio perfil.

create table if not exists public.ai_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  autonomy smallint not null default 1 check (autonomy between 0 and 2),
  config jsonb not null default '{}'::jsonb,   -- identidade, personalidade, rotinas, metas, instruções (validado no app)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_profiles enable row level security;
create policy "ai_profiles: dono lê" on public.ai_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_profiles: dono cria" on public.ai_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_team_member(team_id)));
create policy "ai_profiles: dono edita" on public.ai_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.copilot_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job text not null,
  period text not null,                        -- chave de idempotência (ex.: 2026-10-19)
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'parcial', 'erro')),
  trigger text not null default 'agenda' check (trigger in ('agenda', 'manual')),
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, job, period)
);
create index if not exists copilot_runs_user_idx on public.copilot_runs(user_id, started_at desc);
alter table public.copilot_runs enable row level security;
create policy "copilot_runs: dono lê" on public.copilot_runs for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.lead_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  day date not null,
  summary text not null,
  blockers jsonb not null default '[]'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  next_action text,
  created_at timestamptz not null default now(),
  unique (lead_id, day)
);
alter table public.lead_daily_summaries enable row level security;
create policy "resumos: equipe lê" on public.lead_daily_summaries for select to authenticated using ((select private.is_team_member(team_id)));

alter table public.leads
  add column if not exists ai_summary text,
  add column if not exists ai_summary_at timestamptz,
  add column if not exists ai_insights jsonb not null default '{}'::jsonb;

alter table public.ai_memory
  add column if not exists status text not null default 'ativa' check (status in ('ativa', 'sugerida', 'arquivada')),
  add column if not exists source text not null default 'chat' check (source in ('voce', 'rotina', 'chat')),
  add column if not exists confidence smallint not null default 3 check (confidence between 1 and 5),
  add column if not exists evidence text;
alter table public.ai_memory drop constraint if exists ai_memory_scope_check;
alter table public.ai_memory add constraint ai_memory_scope_check
  check (scope = any (array['geral', 'lead', 'cliente', 'veiculo', 'preferencia', 'loja', 'vendedor', 'padrao']));

alter table public.tasks
  add column if not exists source text not null default 'voce' check (source in ('voce', 'ia'));

alter publication supabase_realtime add table public.copilot_runs;
