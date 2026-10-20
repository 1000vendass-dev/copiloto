-- Próxima ação do lead sempre coerente com as tarefas e compromissos. Antes, a data da tarefa já concluída ficava
-- no lead e o card mostrava "Atrasado" para sempre. Fonte da verdade: tarefas pendentes e compromissos futuros.
--
-- Regras:
--  - candidata = a mais próxima entre tarefas pendentes (com data) e compromissos agendados/confirmados futuros;
--  - se o lead já tem uma ação FUTURA mais cedo (escrita à mão no formulário), ela é mantida;
--  - sem candidata: só limpa a ação se estiver vencida (a que mostraria "Atrasado");
--  - se a tarefa/compromisso que saiu (concluída, cancelada, excluída ou alterada) era exatamente a próxima ação
--    do lead, ele é recalculado sem a regra de "manter" (senão concluir antes do horário deixava a data velha).

drop function if exists private.recompute_lead_next_action(uuid);

create or replace function private.recompute_lead_next_action(p_lead uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_at timestamptz;
  c_title text;
  c_at timestamptz;
begin
  if p_lead is null then return; end if;
  select next_action_at into cur_at from public.leads where id = p_lead;
  if not found then return; end if;

  select x.title, x.at into c_title, c_at
  from (
    select t.title as title, t.due_at as at
      from public.tasks t
     where t.lead_id = p_lead and t.status = 'pendente' and t.due_at is not null
    union all
    select a.title, a.starts_at
      from public.appointments a
     where a.lead_id = p_lead and a.status in ('agendado', 'confirmado') and a.starts_at >= now()
  ) x
  order by x.at
  limit 1;

  if c_at is not null then
    if not p_force and cur_at is not null and cur_at > now() and cur_at < c_at then return; end if;
    update public.leads set next_action = c_title, next_action_at = c_at
     where id = p_lead and (next_action is distinct from c_title or next_action_at is distinct from c_at);
  elsif p_force or (cur_at is not null and cur_at < now()) then
    update public.leads set next_action = null, next_action_at = null
     where id = p_lead and (next_action is not null or next_action_at is not null);
  end if;
end;
$$;

create or replace function private.trg_sync_next_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_at timestamptz;
  was_current boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_at := case tg_table_name
      when 'tasks' then (to_jsonb(old) ->> 'due_at')::timestamptz
      else (to_jsonb(old) ->> 'starts_at')::timestamptz
    end;
    select (l.next_action is not distinct from old.title and l.next_action_at is not distinct from old_at)
      into was_current from public.leads l where l.id = old.lead_id;
    if coalesce(was_current, false) then
      perform private.recompute_lead_next_action(old.lead_id, true);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.recompute_lead_next_action(new.lead_id);
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_sync_next_action on public.tasks;
create trigger tasks_sync_next_action
  after insert or delete or update of status, due_at, title, lead_id on public.tasks
  for each row execute function private.trg_sync_next_action();

drop trigger if exists appointments_sync_next_action on public.appointments;
create trigger appointments_sync_next_action
  after insert or delete or update of status, starts_at, title, lead_id on public.appointments
  for each row execute function private.trg_sync_next_action();

-- corrige quem já ficou com data velha
select private.recompute_lead_next_action(id) from public.leads;
