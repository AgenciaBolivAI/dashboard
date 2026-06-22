-- =====================================================================
-- BolivAI — Step 53: platform activity tracking (DAU / WAU / MAU).
-- One row per (user, UTC day). The dashboard layout upserts it on every
-- navigation (last_seen_at bumped, hits left intact). Drives the admin
-- overview's "Platform activity" section. Platform-internal admin metric:
-- RLS on, anon/authenticated revoked, service_role only (the admin pages
-- read it via the service client behind requireBolivAIAdmin).
-- =====================================================================
create table if not exists public.user_activity (
  user_id      uuid not null,
  tenant_id    uuid references public.tenants(id) on delete set null,
  day          date not null,
  last_seen_at timestamptz not null default now(),
  hits         integer not null default 1,
  primary key (user_id, day)
);

create index if not exists user_activity_day_idx on public.user_activity (day);
create index if not exists user_activity_tenant_day_idx on public.user_activity (tenant_id, day);

alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;
grant all on public.user_activity to service_role;
