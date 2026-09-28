-- Rótulos corretos na timeline para compromissos ("Visita agendada", "Test-drive agendado"...)
create or replace function public.trg_appointments_timeline()
returns trigger language plpgsql set search_path = '' as $$
declare v_label text;
begin
  if new.lead_id is null and new.customer_id is null then return new; end if;
  v_label := case new.type
    when 'visita' then 'Visita agendada' when 'test_drive' then 'Test-drive agendado'
    when 'ligacao' then 'Ligação agendada' when 'reuniao' then 'Reunião agendada'
    when 'entrega' then 'Entrega agendada' else 'Compromisso agendado' end;
  insert into public.activities (team_id, owner_id, lead_id, customer_id, vehicle_id, type, title, metadata)
  values (new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.customer_id, new.vehicle_id,
          'compromisso_criado', v_label || ': ' || new.title,
          jsonb_build_object('appointment_id', new.id, 'starts_at', new.starts_at));
  return new;
end $$;
revoke execute on function public.trg_appointments_timeline() from public, anon, authenticated;
