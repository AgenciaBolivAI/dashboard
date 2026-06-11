-- =====================================================================
-- BolivAI — Services schema addition
-- =====================================================================
-- Apply AFTER schema.sql + schema-dashboard.sql.
--
-- Adds:
--   - services            (structured catalogue: name, price, duration)
--   - reservations.service_id  (link a booking to the service that was booked)
--   - list_services()     RPC the n8n agent calls
-- =====================================================================


create table if not exists services (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  description     text,
  price_amount    numeric(10,2),
  price_currency  text not null default 'BOB',  -- 'BOB' | 'USD' | ...
  duration_min    int not null default 30,
  category        text,
  active          boolean not null default true,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_services_tenant_active
  on services (tenant_id, active);

create index if not exists idx_services_category
  on services (tenant_id, category) where active = true;

drop trigger if exists trg_services_updated on services;
create trigger trg_services_updated
  before update on services
  for each row execute function set_updated_at();


-- ─── RLS ─────────────────────────────────────────────────────────────
alter table services enable row level security;

drop policy if exists "services_member_select" on services;
create policy "services_member_select" on services for select
  using (is_member_of(tenant_id));

drop policy if exists "services_member_write" on services;
create policy "services_member_write" on services for all
  using (is_bolivai_admin() or exists (
    select 1 from dashboard_users du
    where du.user_id = auth.uid()
      and du.tenant_id = services.tenant_id
      and du.role in ('owner','admin','operator')
  ))
  with check (is_bolivai_admin() or exists (
    select 1 from dashboard_users du
    where du.user_id = auth.uid()
      and du.tenant_id = services.tenant_id
      and du.role in ('owner','admin','operator')
  ));


-- ─── Link reservations to services ───────────────────────────────────
alter table reservations
  add column if not exists service_id uuid references services(id) on delete set null;

create index if not exists idx_reservations_service
  on reservations (service_id);


-- ─── RPC: list_services (called by n8n's `list_services` tool) ───────
create or replace function list_services (
  p_tenant_id  uuid,
  p_category   text default null
) returns table (
  id              uuid,
  name            text,
  description     text,
  price_amount    numeric,
  price_currency  text,
  duration_min    int,
  category        text
) language sql stable as $$
  select s.id, s.name, s.description, s.price_amount, s.price_currency,
         s.duration_min, s.category
  from services s
  where s.tenant_id = p_tenant_id
    and s.active = true
    and (p_category is null or s.category = p_category)
  order by s.category nulls last, s.name;
$$;


-- ─── Optional: seed example services for the Cervantes demo ──────────
-- (uncomment after the cervantes tenant SEED block from schema.sql is applied)
-- insert into services (tenant_id, name, description, price_amount, price_currency, duration_min, category)
-- select t.id, v.name, v.desc, v.price, 'EUR', v.dur, v.cat
-- from tenants t
-- cross join (values
--   ('Sesión 30 min',         'Sesión estándar de fisioterapia',   45.00, 30, 'Fisioterapia'),
--   ('Sesión 60 min',         'Sesión extendida de fisioterapia',  80.00, 60, 'Fisioterapia'),
--   ('Punción seca',          'Tratamiento de puntos gatillo',     50.00, 45, 'Especializado'),
--   ('Masaje deportivo',      'Recuperación post-entreno',         55.00, 45, 'Masajes'),
--   ('Primera consulta',      'Evaluación inicial + tratamiento',  60.00, 60, 'Fisioterapia')
-- ) as v(name, desc, price, dur, cat)
-- where t.slug = 'cervantes';
