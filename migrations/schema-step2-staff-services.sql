-- =====================================================================
-- BolivAI — Step 2: staff ↔ services many-to-many
-- =====================================================================
-- Apply AFTER schema.sql, schema-services.sql, and schema-step1-rpc-fix.sql.
--
-- Adds:
--   - staff_services            (join table)
--   - search_slots_day(...)     (now accepts optional p_service_id and
--                                filters slots to staff who provide it)
--   - list_services_with_staff  (helper RPC the agent can call to learn
--                                which staff offer each service)
-- =====================================================================


-- ─── Join table ──────────────────────────────────────────────────────
create table if not exists staff_services (
  staff_id    uuid not null references staff(id)    on delete cascade,
  service_id  uuid not null references services(id) on delete cascade,
  tenant_id   uuid not null references tenants(id)  on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (staff_id, service_id)
);

create index if not exists idx_staff_services_service
  on staff_services (service_id);

create index if not exists idx_staff_services_tenant
  on staff_services (tenant_id);


-- ─── RLS ─────────────────────────────────────────────────────────────
alter table staff_services enable row level security;

drop policy if exists "staff_services_member_select" on staff_services;
create policy "staff_services_member_select" on staff_services for select
  using (is_member_of(tenant_id));

drop policy if exists "staff_services_member_write" on staff_services;
create policy "staff_services_member_write" on staff_services for all
  using (is_bolivai_admin() or exists (
    select 1 from dashboard_users du
    where du.user_id = auth.uid()
      and du.tenant_id = staff_services.tenant_id
      and du.role in ('owner','admin','operator')
  ))
  with check (is_bolivai_admin() or exists (
    select 1 from dashboard_users du
    where du.user_id = auth.uid()
      and du.tenant_id = staff_services.tenant_id
      and du.role in ('owner','admin','operator')
  ));


-- ─── search_slots_day: now filters by service_id when supplied ───────
drop function if exists search_slots_day(uuid, date, integer);
drop function if exists search_slots_day(uuid, date, integer, uuid);

create or replace function search_slots_day (
  p_tenant_id    uuid,
  p_date         date,
  p_duration_min int default 30,
  p_service_id   uuid default null
) returns table (
  slot_id     uuid,
  staff_id    uuid,
  staff_name  text,
  start_at    timestamptz,
  end_at      timestamptz
) language sql stable as $$
  select
    s.id        as slot_id,
    s.staff_id,
    st.name     as staff_name,
    s.start_at,
    s.end_at
  from calendar_slots s
  join staff   st on st.id = s.staff_id
  join tenants t  on t.id  = s.tenant_id
  where s.tenant_id = p_tenant_id
    and (s.start_at at time zone coalesce(t.timezone, 'America/La_Paz'))::date = p_date
    and s.is_available = true
    and (s.end_at - s.start_at) >= make_interval(mins => p_duration_min)
    and (
      p_service_id is null
      or exists (
        select 1 from staff_services ss
        where ss.staff_id = s.staff_id
          and ss.service_id = p_service_id
          and ss.tenant_id = p_tenant_id
      )
    )
  order by s.start_at;
$$;


-- ─── list_services_with_staff: agent can call this to see catalog +
--     which staff provide each service ─────────────────────────────
create or replace function list_services_with_staff (
  p_tenant_id  uuid
) returns table (
  service_id      uuid,
  service_name    text,
  description     text,
  duration_min    int,
  price_amount    numeric,
  price_currency  text,
  category        text,
  staff           jsonb
) language sql stable as $$
  select
    s.id,
    s.name,
    s.description,
    s.duration_min,
    s.price_amount,
    s.price_currency,
    s.category,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.name)
       from staff_services ss
       join staff st on st.id = ss.staff_id and st.active = true
       where ss.service_id = s.id and ss.tenant_id = s.tenant_id),
      '[]'::jsonb
    ) as staff
  from services s
  where s.tenant_id = p_tenant_id
    and s.active = true
  order by s.category nulls last, s.name;
$$;
