-- =====================================================================
-- COPILOTO — 0003 RLS das tabelas de negócio, timeline automática, Storage
-- =====================================================================

-- ---------- RLS padrão para tabelas com team_id + owner_id ----------
-- ler/criar/editar: membro da equipe
-- criar em nome de outro vendedor: só admin
-- excluir: dono do registro ou admin
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','leads','notes','tasks','appointments','proposals','ai_memory']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s: membros leem" on public.%1$I
      for select to authenticated using ((select public.is_team_member(team_id)))$p$, t);
    execute format($p$create policy "%1$s: membros criam" on public.%1$I
      for insert to authenticated with check (
        (select public.is_team_member(team_id))
        and (owner_id is null or owner_id = (select auth.uid()) or (select public.is_team_admin(team_id))))$p$, t);
    execute format($p$create policy "%1$s: membros editam" on public.%1$I
      for update to authenticated
      using ((select public.is_team_member(team_id)))
      with check ((select public.is_team_member(team_id)))$p$, t);
    execute format($p$create policy "%1$s: dono ou admin exclui" on public.%1$I
      for delete to authenticated using (
        (select public.is_team_member(team_id))
        and (owner_id = (select auth.uid()) or (select public.is_team_admin(team_id))))$p$, t);
  end loop;
end $$;

-- ---------- activities: timeline é append-only para usuários comuns ----------
alter table public.activities enable row level security;
create policy "activities: membros leem" on public.activities
  for select to authenticated using ((select public.is_team_member(team_id)));
create policy "activities: membros criam" on public.activities
  for insert to authenticated with check ((select public.is_team_member(team_id)));
create policy "activities: dono edita" on public.activities
  for update to authenticated
  using ((select public.is_team_member(team_id)) and owner_id = (select auth.uid()))
  with check ((select public.is_team_member(team_id)));
create policy "activities: admin exclui" on public.activities
  for delete to authenticated using ((select public.is_team_admin(team_id)));

-- ---------- tabelas auxiliares (sem owner) ----------
do $$
declare t text;
begin
  foreach t in array array['vehicle_images','vehicle_features','tags','lead_tags','customer_tags']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s: membros acessam" on public.%1$I
      for all to authenticated
      using ((select public.is_team_member(team_id)))
      with check ((select public.is_team_member(team_id)))$p$, t);
  end loop;
end $$;

-- ---------- settings ----------
alter table public.settings enable row level security;
create policy "settings: membros leem" on public.settings
  for select to authenticated using ((select public.is_team_member(team_id)));
create policy "settings: admins gravam" on public.settings
  for insert to authenticated with check ((select public.is_team_admin(team_id)));
create policy "settings: admins editam" on public.settings
  for update to authenticated
  using ((select public.is_team_admin(team_id))) with check ((select public.is_team_admin(team_id)));

-- ---------- ai_action_logs: auditoria, somente inserção e leitura ----------
alter table public.ai_action_logs enable row level security;
create policy "ai_logs: membros leem" on public.ai_action_logs
  for select to authenticated using ((select public.is_team_member(team_id)));
create policy "ai_logs: usuário registra" on public.ai_action_logs
  for insert to authenticated with check (
    (select public.is_team_member(team_id)) and user_id = (select auth.uid()));

-- ---------- settings criadas junto com a equipe ----------
create or replace function public.handle_new_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settings (team_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_team_created after insert on public.teams
  for each row execute function public.handle_new_team();

-- =====================================================================
-- TIMELINE AUTOMÁTICA
-- =====================================================================
create or replace function public.stage_label(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'novo' then 'Novo' when 'primeiro_contato' then 'Primeiro contato'
    when 'atendimento' then 'Atendimento' when 'qualificado' then 'Qualificado'
    when 'visita' then 'Visita' when 'proposta' then 'Proposta'
    when 'negociacao' then 'Negociação' when 'venda' then 'Venda'
    when 'sem_resposta' then 'Sem resposta' when 'perdido' then 'Perdido' else p end;
$$;

create or replace function public.trg_leads_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
    values (new.team_id, coalesce(auth.uid(), new.owner_id), new.id, new.customer_id, new.vehicle_id,
            'lead_criado', 'Lead criado', jsonb_build_object('stage', new.stage));
  elsif new.stage is distinct from old.stage then
    insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, description, metadata)
    values (new.team_id, coalesce(auth.uid(), new.owner_id), new.id, new.customer_id, new.vehicle_id,
            case new.stage when 'venda' then 'venda' when 'perdido' then 'perda' else 'mudanca_etapa' end,
            'Etapa: ' || public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage),
            case when new.stage = 'perdido' then new.lost_reason end,
            jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;
create trigger trg_leads_timeline after insert or update of stage on public.leads
  for each row execute function public.trg_leads_timeline();

-- fechar/perder preenche datas
create or replace function public.trg_leads_close()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage in ('venda','perdido') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.stage not in ('venda','perdido') then
    new.closed_at := null;
  end if;
  return new;
end $$;
create trigger trg_leads_close before insert or update of stage on public.leads
  for each row execute function public.trg_leads_close();

create or replace function public.trg_customers_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.activities (team_id, owner_id, customer_id, type, title)
  values (new.team_id, coalesce(auth.uid(), new.owner_id), new.id, 'cliente_criado', 'Cliente cadastrado');
  return new;
end $$;
create trigger trg_customers_timeline after insert on public.customers
  for each row execute function public.trg_customers_timeline();

create or replace function public.trg_tasks_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'concluida' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger trg_tasks_status before insert or update of status on public.tasks
  for each row execute function public.trg_tasks_status();

create or replace function public.trg_tasks_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is null and new.customer_id is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
    values (new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.customer_id, new.vehicle_id,
            'tarefa_criada', 'Tarefa: ' || new.title,
            jsonb_build_object('task_id', new.id, 'due_at', new.due_at));
  elsif new.status = 'concluida' and old.status is distinct from 'concluida' then
    insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
    values (new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.customer_id, new.vehicle_id,
            'tarefa_concluida', 'Concluída: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;
create trigger trg_tasks_timeline after insert or update of status on public.tasks
  for each row execute function public.trg_tasks_timeline();

create or replace function public.trg_appointments_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is null and new.customer_id is null then return new; end if;
  insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
  values (new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.customer_id, new.vehicle_id,
          'compromisso_criado', initcap(replace(new.type,'_',' ')) || ' agendado(a): ' || new.title,
          jsonb_build_object('appointment_id', new.id, 'starts_at', new.starts_at));
  return new;
end $$;
create trigger trg_appointments_timeline after insert on public.appointments
  for each row execute function public.trg_appointments_timeline();

create or replace function public.trg_proposals_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is null and new.customer_id is null then return new; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
    values (new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.customer_id, new.vehicle_id,
            'proposta',
            case when tg_op = 'INSERT' then 'Proposta criada' else 'Proposta ' || new.status end,
            jsonb_build_object('proposal_id', new.id, 'total', new.total, 'status', new.status));
  end if;
  return new;
end $$;
create trigger trg_proposals_timeline after insert or update of status on public.proposals
  for each row execute function public.trg_proposals_timeline();

-- contato registrado atualiza last_contact_at do lead
create or replace function public.trg_activity_touch_lead()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is not null and new.type in ('ligacao','whatsapp','email','visita','test_drive') then
    update public.leads set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
    where id = new.lead_id;
  end if;
  return new;
end $$;
create trigger trg_activity_touch_lead after insert on public.activities
  for each row execute function public.trg_activity_touch_lead();

-- =====================================================================
-- STORAGE — buckets privados, caminho: {team_id}/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-images', 'vehicle-images', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('customer-files', 'customer-files', false, 20971520, null),
  ('documents',      'documents',      false, 20971520, null)
on conflict (id) do nothing;

create policy "storage: membros leem arquivos da equipe" on storage.objects
  for select to authenticated using (
    bucket_id in ('vehicle-images','customer-files','documents')
    and (select public.can_access_team_path(name)));
create policy "storage: membros enviam para a equipe" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('vehicle-images','customer-files','documents')
    and (select public.can_access_team_path(name)));
create policy "storage: membros alteram arquivos da equipe" on storage.objects
  for update to authenticated using (
    bucket_id in ('vehicle-images','customer-files','documents')
    and (select public.can_access_team_path(name)));
create policy "storage: membros excluem arquivos da equipe" on storage.objects
  for delete to authenticated using (
    bucket_id in ('vehicle-images','customer-files','documents')
    and (select public.can_access_team_path(name)));
