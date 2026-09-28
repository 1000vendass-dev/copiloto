-- =====================================================================
-- Ficha do veículo compartilhável com o cliente (preço personalizado, link público)
-- O cliente acessa SEM login via /v/{token}. Nunca expõe preço de compra, placa ou dados internos.
-- =====================================================================
create table public.vehicle_shares (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  team_id       uuid not null references public.teams(id) on delete cascade,
  owner_id      uuid references auth.users(id) on delete set null default auth.uid(),
  vehicle_id    uuid not null,
  lead_id       uuid,
  price         numeric(12,2) check (price >= 0),   -- preço mostrado ao cliente (com a "gordura")
  base_price    numeric(12,2),                      -- preço de estoque no momento (referência interna)
  show_price    boolean not null default true,
  message       text,                               -- recado personalizado ao cliente
  expires_at    timestamptz not null default now() + interval '15 days',
  revoked       boolean not null default false,
  views         int not null default 0,
  last_viewed_at timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (vehicle_id, team_id) references public.vehicles(id, team_id) on delete cascade,
  foreign key (lead_id, team_id) references public.leads(id, team_id) on delete set null (lead_id)
);
create index vehicle_shares_vehicle_idx on public.vehicle_shares(vehicle_id, team_id);
create index vehicle_shares_lead_idx on public.vehicle_shares(lead_id, team_id);
create index vehicle_shares_owner_idx on public.vehicle_shares(owner_id);

alter table public.vehicle_shares enable row level security;
create policy "shares: membros leem" on public.vehicle_shares for select to authenticated using ((select private.is_team_member(team_id)));
create policy "shares: membros criam" on public.vehicle_shares for insert to authenticated
  with check ((select private.is_team_member(team_id)) and (owner_id = (select auth.uid()) or (select private.is_team_admin(team_id))));
create policy "shares: membros editam" on public.vehicle_shares for update to authenticated
  using ((select private.is_team_member(team_id))) with check ((select private.is_team_member(team_id)));
create policy "shares: dono ou admin exclui" on public.vehicle_shares for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_team_admin(team_id)));

-- Atividade na timeline do lead quando a ficha é enviada
create or replace function public.trg_share_timeline()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lead_id is not null then
    insert into public.activities (team_id, owner_id, lead_id, vehicle_id, type, title, metadata)
    select new.team_id, coalesce(auth.uid(), new.owner_id), new.lead_id, new.vehicle_id, 'proposta',
           'Ficha enviada: ' || v.brand || ' ' || v.model || coalesce(' ' || v.year_model, '') ||
           case when new.show_price and new.price is not null then ' por R$ ' || replace(to_char(new.price, 'FM999,999,990'), ',', '.') else '' end,
           jsonb_build_object('share_id', new.id, 'price', new.price)
    from public.vehicles v where v.id = new.vehicle_id;
  end if;
  return new;
end $$;
revoke execute on function public.trg_share_timeline() from public, anon, authenticated;
create trigger trg_share_timeline after insert on public.vehicle_shares for each row execute function public.trg_share_timeline();

-- Leitura pública da ficha: só campos seguros; conta visualização; avisa o vendedor na timeline (1ª abertura e depois de 6h)
create or replace function public.get_shared_vehicle(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s public.vehicle_shares; v public.vehicles; seller jsonb; result jsonb;
begin
  select * into s from public.vehicle_shares where token = p_token;
  if not found or s.revoked or s.expires_at < now() then return null; end if;
  select * into v from public.vehicles where id = s.vehicle_id;
  if not found then return null; end if;

  if s.lead_id is not null and (s.last_viewed_at is null or s.last_viewed_at < now() - interval '6 hours') then
    insert into public.activities (team_id, owner_id, lead_id, vehicle_id, type, title)
    values (s.team_id, s.owner_id, s.lead_id, s.vehicle_id, 'sistema', 'Cliente abriu a ficha do ' || v.brand || ' ' || v.model);
  end if;
  update public.vehicle_shares set views = views + 1, last_viewed_at = now() where id = s.id;

  select jsonb_build_object('name', p.full_name, 'phone', p.phone, 'team', t.name) into seller
  from public.profiles p join public.teams t on t.id = s.team_id where p.id = s.owner_id;

  result := jsonb_build_object(
    'vehicle', jsonb_build_object(
      'id', v.id, 'brand', v.brand, 'model', v.model, 'version', v.version, 'year_manufacture', v.year_manufacture,
      'year_model', v.year_model, 'km', v.km, 'color', v.color, 'fuel', v.fuel, 'transmission', v.transmission,
      'engine', v.engine, 'doors', v.doors, 'body_type', v.body_type, 'store', v.store, 'description', v.description,
      'status', v.status, 'team_id', v.team_id),
    'price', case when s.show_price then s.price else null end,
    'message', s.message,
    'expires_at', s.expires_at,
    'seller', seller,
    'features', coalesce((select jsonb_agg(name order by name) from public.vehicle_features where vehicle_id = v.id), '[]'),
    'images', coalesce((select jsonb_agg(storage_path order by is_primary desc, position) from public.vehicle_images where vehicle_id = v.id), '[]')
  );
  return result;
end $$;
revoke execute on function public.get_shared_vehicle(text) from public;
grant execute on function public.get_shared_vehicle(text) to anon, authenticated;

-- Fotos: visitante anônimo pode gerar link assinado só das fotos de veículo com ficha ativa
create or replace function private.is_shared_vehicle_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_vehicle uuid;
begin
  begin
    v_vehicle := (string_to_array(p_name, '/'))[2]::uuid;
  exception when others then return false;
  end;
  return exists (select 1 from public.vehicle_shares where vehicle_id = v_vehicle and not revoked and expires_at > now());
end $$;
revoke execute on function private.is_shared_vehicle_path(text) from public;
grant usage on schema private to anon;
grant execute on function private.is_shared_vehicle_path(text) to anon, authenticated;

create policy "storage: fotos de fichas compartilhadas" on storage.objects
  for select to anon using (bucket_id = 'vehicle-images' and (select private.is_shared_vehicle_path(name)));
