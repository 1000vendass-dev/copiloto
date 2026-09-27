-- =====================================================================
-- COPILOTO — 0002 Tabelas de negócio
-- Convenção: todo registro comercial tem team_id + owner_id.
-- FKs compostas (x_id, team_id) garantem que nada referencie outra equipe.
-- =====================================================================

-- ---------- customers ----------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null default auth.uid(),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  email       text,
  document    text,           -- CPF/CNPJ (opcional)
  city        text,
  birth_date  date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, team_id)
);
create index customers_team_idx  on public.customers(team_id);
create index customers_owner_idx on public.customers(owner_id);
create index customers_name_trgm on public.customers using gin (lower(name) extensions.gin_trgm_ops);
create index customers_phone_idx on public.customers(team_id, phone);

-- ---------- vehicles ----------
create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  owner_id       uuid references auth.users(id) on delete set null default auth.uid(),
  stock_code     text,                       -- código interno (ex.: V001)
  category       text not null default 'carro' check (category in ('carro','moto','utilitario','caminhao','outro')),
  brand          text not null,
  model          text not null,
  version        text,
  year_manufacture int check (year_manufacture between 1900 and 2100),
  year_model     int check (year_model between 1900 and 2100),
  km             int check (km >= 0),
  color          text,
  fuel           text,
  transmission   text,                       -- 'manual' | 'automatico' | 'cvt' | 'automatizado'
  engine         text,
  doors          int,
  body_type      text,                       -- hatch, sedan, suv, picape...
  plate          text,
  purchase_price numeric(12,2) check (purchase_price >= 0),
  sale_price     numeric(12,2) check (sale_price >= 0),
  status         text not null default 'disponivel' check (status in ('disponivel','reservado','vendido','inativo')),
  store          text,
  description    text,
  entry_date     date default current_date,
  reserved_lead_id uuid,
  sold_lead_id   uuid,
  sold_at        date,
  sold_price     numeric(12,2),
  search_text    text generated always as (
    lower(coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' || coalesce(version,'') || ' ' ||
          coalesce(color,'') || ' ' || coalesce(body_type,'') || ' ' || coalesce(transmission,'') || ' ' ||
          coalesce(fuel,'') || ' ' || coalesce(plate,'') || ' ' || coalesce(stock_code,''))
  ) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, team_id)
);
create index vehicles_team_status_idx on public.vehicles(team_id, status);
create index vehicles_price_idx       on public.vehicles(team_id, sale_price);
create index vehicles_year_idx        on public.vehicles(team_id, year_model);
create index vehicles_search_trgm     on public.vehicles using gin (search_text extensions.gin_trgm_ops);
create unique index vehicles_stock_code_uq on public.vehicles(team_id, stock_code) where stock_code is not null;

create table public.vehicle_images (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  vehicle_id   uuid not null,
  storage_path text not null,
  position     int not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  foreign key (vehicle_id, team_id) references public.vehicles(id, team_id) on delete cascade
);
create index vehicle_images_vehicle_idx on public.vehicle_images(vehicle_id, position);
create unique index vehicle_images_one_primary on public.vehicle_images(vehicle_id) where is_primary;

create table public.vehicle_features (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null,
  vehicle_id uuid not null,
  name       text not null,
  foreign key (vehicle_id, team_id) references public.vehicles(id, team_id) on delete cascade,
  unique (vehicle_id, name)
);
create index vehicle_features_name_idx on public.vehicle_features(team_id, lower(name));

-- ---------- leads ----------
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  owner_id        uuid references auth.users(id) on delete set null default auth.uid(),
  customer_id     uuid,
  vehicle_id      uuid,                       -- veículo de interesse (opcional)
  name            text not null check (length(trim(name)) > 0),
  phone           text,
  email           text,
  source          text,                       -- whatsapp, instagram, olx, loja, indicação...
  stage           text not null default 'novo' check (stage in
                   ('novo','primeiro_contato','atendimento','qualificado','visita','proposta',
                    'negociacao','venda','sem_resposta','perdido')),
  temperature     text check (temperature in ('frio','morno','quente')),
  interest        text,                       -- texto livre: "Onix automático"
  budget_max      numeric(12,2) check (budget_max >= 0),
  payment_method  text,                       -- à vista, financiamento, consórcio...
  trade_in        text,                       -- veículo na troca
  purchase_timeframe text,                    -- "outubro", "30 dias"...
  next_action     text,
  next_action_at  timestamptz,
  last_contact_at timestamptz,
  lost_reason     text,
  closed_value    numeric(12,2),
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, team_id),
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete set null (customer_id),
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete set null (vehicle_id)
);
create index leads_team_stage_idx  on public.leads(team_id, stage);
create index leads_next_action_idx on public.leads(team_id, next_action_at);
create index leads_owner_idx       on public.leads(owner_id);
create index leads_customer_idx    on public.leads(customer_id);
create index leads_vehicle_idx     on public.leads(vehicle_id);
create index leads_name_trgm       on public.leads using gin (lower(name) extensions.gin_trgm_ops);

alter table public.vehicles
  add foreign key (reserved_lead_id, team_id) references public.leads(id, team_id) on delete set null (reserved_lead_id),
  add foreign key (sold_lead_id,     team_id) references public.leads(id, team_id) on delete set null (sold_lead_id);
create index vehicles_reserved_idx on public.vehicles(reserved_lead_id);
create index vehicles_sold_idx     on public.vehicles(sold_lead_id);

-- ---------- activities (timeline) ----------
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null default auth.uid(),
  lead_id     uuid,
  customer_id uuid,
  vehicle_id  uuid,
  type        text not null check (type in
               ('ligacao','whatsapp','email','visita','test_drive','proposta','follow_up',
                'mudanca_etapa','lead_criado','cliente_criado','tarefa_criada','tarefa_concluida',
                'compromisso_criado','nota','venda','perda','sistema','ia')),
  title       text not null,
  description text,
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete set null (vehicle_id)
);
create index activities_lead_idx     on public.activities(lead_id, occurred_at desc);
create index activities_customer_idx on public.activities(customer_id, occurred_at desc);
create index activities_vehicle_idx  on public.activities(vehicle_id);
create index activities_team_idx     on public.activities(team_id, occurred_at desc);
create index activities_owner_idx    on public.activities(owner_id);

-- ---------- notes ----------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null default auth.uid(),
  lead_id     uuid,
  customer_id uuid,
  vehicle_id  uuid,
  content     text not null check (length(trim(content)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete cascade
);
create index notes_lead_idx     on public.notes(lead_id);
create index notes_customer_idx on public.notes(customer_id);
create index notes_vehicle_idx  on public.notes(vehicle_id);
create index notes_team_idx     on public.notes(team_id);
create index notes_owner_idx    on public.notes(owner_id);
create index notes_content_trgm on public.notes using gin (lower(content) extensions.gin_trgm_ops);

-- ---------- tasks ----------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  owner_id     uuid references auth.users(id) on delete set null default auth.uid(),
  lead_id      uuid,
  customer_id  uuid,
  vehicle_id   uuid,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  due_at       timestamptz,
  priority     text not null default 'media' check (priority in ('baixa','media','alta')),
  status       text not null default 'pendente' check (status in ('pendente','concluida','cancelada')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete set null (vehicle_id)
);
create index tasks_due_idx      on public.tasks(team_id, status, due_at);
create index tasks_owner_idx    on public.tasks(owner_id, status, due_at);
create index tasks_lead_idx     on public.tasks(lead_id);
create index tasks_customer_idx on public.tasks(customer_id);
create index tasks_vehicle_idx  on public.tasks(vehicle_id);

-- ---------- appointments ----------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null default auth.uid(),
  lead_id     uuid,
  customer_id uuid,
  vehicle_id  uuid,
  title       text not null check (length(trim(title)) > 0),
  type        text not null default 'visita' check (type in ('visita','test_drive','ligacao','reuniao','entrega','outro')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  status      text not null default 'agendado' check (status in ('agendado','confirmado','realizado','cancelado','nao_compareceu')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete set null (vehicle_id)
);
create index appointments_starts_idx   on public.appointments(team_id, starts_at);
create index appointments_owner_idx    on public.appointments(owner_id, starts_at);
create index appointments_lead_idx     on public.appointments(lead_id);
create index appointments_customer_idx on public.appointments(customer_id);
create index appointments_vehicle_idx  on public.appointments(vehicle_id);

-- ---------- proposals ----------
create table public.proposals (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  owner_id          uuid references auth.users(id) on delete set null default auth.uid(),
  lead_id           uuid,
  customer_id       uuid,
  vehicle_id        uuid,
  vehicle_price     numeric(12,2) check (vehicle_price >= 0),
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  down_payment      numeric(12,2) not null default 0 check (down_payment >= 0),
  trade_in_description text,
  trade_in_value    numeric(12,2) not null default 0 check (trade_in_value >= 0),
  financed_amount   numeric(12,2) not null default 0 check (financed_amount >= 0),
  installments      int check (installments > 0),
  installment_value numeric(12,2),
  total             numeric(12,2) generated always as (coalesce(vehicle_price,0) - discount) stored,
  status            text not null default 'rascunho' check (status in ('rascunho','enviada','aceita','recusada','expirada')),
  valid_until       date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete set null (vehicle_id)
);
create index proposals_team_idx     on public.proposals(team_id, status);
create index proposals_owner_idx    on public.proposals(owner_id);
create index proposals_lead_idx     on public.proposals(lead_id);
create index proposals_customer_idx on public.proposals(customer_id);
create index proposals_vehicle_idx  on public.proposals(vehicle_id);

-- ---------- tags ----------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  color      text,
  created_at timestamptz not null default now(),
  unique (id, team_id)
);
create unique index tags_name_uq on public.tags(team_id, lower(name));

create table public.lead_tags (
  team_id uuid not null,
  lead_id uuid not null,
  tag_id  uuid not null,
  primary key (lead_id, tag_id),
  foreign key (lead_id, team_id) references public.leads(id, team_id) on delete cascade,
  foreign key (tag_id,  team_id) references public.tags(id,  team_id) on delete cascade
);
create index lead_tags_tag_idx on public.lead_tags(tag_id);

create table public.customer_tags (
  team_id     uuid not null,
  customer_id uuid not null,
  tag_id      uuid not null,
  primary key (customer_id, tag_id),
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (tag_id,      team_id) references public.tags(id,      team_id) on delete cascade
);
create index customer_tags_tag_idx on public.customer_tags(tag_id);

-- ---------- IA ----------
create table public.ai_memory (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null default auth.uid(),
  scope       text not null default 'geral' check (scope in ('geral','lead','cliente','veiculo','preferencia')),
  lead_id     uuid,
  customer_id uuid,
  vehicle_id  uuid,
  content     text not null check (length(trim(content)) > 0),
  importance  int not null default 1 check (importance between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (lead_id,     team_id) references public.leads(id,     team_id) on delete cascade,
  foreign key (customer_id, team_id) references public.customers(id, team_id) on delete cascade,
  foreign key (vehicle_id,  team_id) references public.vehicles(id,  team_id) on delete cascade
);
create index ai_memory_team_idx     on public.ai_memory(team_id, scope);
create index ai_memory_owner_idx    on public.ai_memory(owner_id);
create index ai_memory_lead_idx     on public.ai_memory(lead_id);
create index ai_memory_customer_idx on public.ai_memory(customer_id);
create index ai_memory_vehicle_idx  on public.ai_memory(vehicle_id);

create table public.ai_action_logs (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null default auth.uid(),
  command    text not null,
  tool       text,
  input      jsonb not null default '{}'::jsonb,
  result     jsonb not null default '{}'::jsonb,
  status     text not null default 'sucesso' check (status in ('sucesso','erro','pendente_confirmacao','cancelado')),
  created_at timestamptz not null default now()
);
create index ai_action_logs_team_idx on public.ai_action_logs(team_id, created_at desc);
create index ai_action_logs_user_idx on public.ai_action_logs(user_id);

-- ---------- settings (por equipe) ----------
create table public.settings (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','leads','notes','tasks','appointments','proposals','ai_memory','settings']
  loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
