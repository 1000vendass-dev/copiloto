-- =====================================================================
-- COPILOTO — 0004 Endurecimento (advisors do Supabase)
-- 1) funções security definer saem do schema exposto pela API
-- 2) funções de trigger não podem ser chamadas via RPC
-- 3) índices cobrindo as FKs compostas (x_id, team_id)
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_team_member(uuid)       set schema private;
alter function public.is_team_admin(uuid)        set schema private;
alter function public.can_access_team_path(text) set schema private;
alter function public.handle_new_user()          set schema private;
alter function public.handle_new_team()          set schema private;

-- can_access_team_path chama is_team_member: corrigir referência
create or replace function private.can_access_team_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_team uuid;
begin
  begin
    v_team := (string_to_array(p_name, '/'))[1]::uuid;
  exception when others then
    return false;
  end;
  return private.is_team_member(v_team);
end $$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.handle_new_team() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['trg_leads_timeline','trg_leads_close','trg_customers_timeline','trg_tasks_status',
    'trg_tasks_timeline','trg_appointments_timeline','trg_proposals_timeline','trg_activity_touch_lead','set_updated_at']
  loop
    execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
  end loop;
end $$;

-- índices compostos (substituem os de coluna única)
do $$
declare r record;
begin
  for r in select * from (values
    ('activities','lead_id'),('activities','customer_id'),('activities','vehicle_id'),
    ('ai_memory','lead_id'),('ai_memory','customer_id'),('ai_memory','vehicle_id'),
    ('appointments','lead_id'),('appointments','customer_id'),('appointments','vehicle_id'),
    ('notes','lead_id'),('notes','customer_id'),('notes','vehicle_id'),
    ('proposals','lead_id'),('proposals','customer_id'),('proposals','vehicle_id'),
    ('tasks','lead_id'),('tasks','customer_id'),('tasks','vehicle_id'),
    ('leads','customer_id'),('leads','vehicle_id'),
    ('vehicles','reserved_lead_id'),('vehicles','sold_lead_id'),
    ('vehicle_features','vehicle_id'),('vehicle_images','vehicle_id'),
    ('lead_tags','tag_id'),('customer_tags','tag_id'),
    ('lead_tags','lead_id'),('customer_tags','customer_id')
  ) as t(tbl, col)
  loop
    execute format('create index if not exists %1$s_%2$s_team_idx on public.%1$I (%2$I, team_id)', r.tbl, r.col);
  end loop;
end $$;

drop index if exists public.activities_vehicle_idx, public.notes_lead_idx, public.notes_customer_idx,
  public.notes_vehicle_idx, public.tasks_lead_idx, public.tasks_customer_idx, public.tasks_vehicle_idx,
  public.appointments_lead_idx, public.appointments_customer_idx, public.appointments_vehicle_idx,
  public.proposals_lead_idx, public.proposals_customer_idx, public.proposals_vehicle_idx,
  public.leads_customer_idx, public.leads_vehicle_idx, public.vehicles_reserved_idx, public.vehicles_sold_idx,
  public.lead_tags_tag_idx, public.customer_tags_tag_idx,
  public.ai_memory_lead_idx, public.ai_memory_customer_idx, public.ai_memory_vehicle_idx;

create index if not exists profiles_default_team_idx on public.profiles(default_team_id);
create index if not exists teams_created_by_idx      on public.teams(created_by);
create index if not exists vehicles_owner_idx        on public.vehicles(owner_id);
