-- =====================================================================
-- COPILOTO — 0001 Fundação: extensões, usuários, equipes, helpers de RLS
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------- helper: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  default_team_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- teams ----------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_default_team_fk foreign key (default_team_id)
  references public.teams(id) on delete set null;

-- ---------- team_members ----------
create table public.team_members (
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);

-- ---------- helpers de autorização (security definer evita recursão de RLS) ----------
create or replace function public.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_team_admin(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid())
      and role in ('owner','admin')
  );
$$;

-- versão para Storage: primeiro segmento do caminho = team_id
create or replace function public.can_access_team_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_team uuid;
begin
  begin
    v_team := (string_to_array(p_name, '/'))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.is_team_member(v_team);
end $$;

revoke execute on function public.is_team_member(uuid)        from anon, public;
revoke execute on function public.is_team_admin(uuid)         from anon, public;
revoke execute on function public.can_access_team_path(text)  from anon, public;
grant  execute on function public.is_team_member(uuid)        to authenticated;
grant  execute on function public.is_team_admin(uuid)         to authenticated;
grant  execute on function public.can_access_team_path(text)  to authenticated;

-- ---------- RLS: profiles ----------
alter table public.profiles enable row level security;

create policy "profiles: ver o próprio e colegas" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1 from public.team_members a
      join public.team_members b on a.team_id = b.team_id
      where a.user_id = (select auth.uid()) and b.user_id = profiles.id
    )
  );
create policy "profiles: editar o próprio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- RLS: teams ----------
alter table public.teams enable row level security;

create policy "teams: membros veem" on public.teams
  for select to authenticated using ((select public.is_team_member(id)));
create policy "teams: admins editam" on public.teams
  for update to authenticated
  using ((select public.is_team_admin(id))) with check ((select public.is_team_admin(id)));
-- criação de equipe acontece via trigger de signup / função create_team (security definer)

-- ---------- RLS: team_members ----------
alter table public.team_members enable row level security;

create policy "team_members: membros veem a equipe" on public.team_members
  for select to authenticated using ((select public.is_team_member(team_id)));
create policy "team_members: admins adicionam" on public.team_members
  for insert to authenticated with check (
    (select public.is_team_admin(team_id)) and role <> 'owner'
  );
create policy "team_members: admins alteram papel" on public.team_members
  for update to authenticated
  using ((select public.is_team_admin(team_id)) and role <> 'owner')
  with check ((select public.is_team_admin(team_id)) and role <> 'owner');
create policy "team_members: admins removem (ou sair)" on public.team_members
  for delete to authenticated using (
    role <> 'owner' and (
      (select public.is_team_admin(team_id)) or user_id = (select auth.uid())
    )
  );

-- ---------- signup: cria profile + equipe pessoal + associação ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_name text;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
  insert into public.teams (name, created_by) values ('Equipe de ' || v_name, new.id)
    returning id into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team, new.id, 'owner');
  insert into public.profiles (id, full_name, default_team_id) values (new.id, v_name, v_team);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
