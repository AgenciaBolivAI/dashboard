-- =====================================================================
-- BolivAI dashboard — schema additions
-- =====================================================================
-- Run this AFTER schema.sql. It adds:
--   - dashboard_users  (membership + role per tenant)
--   - bolivai_admins   (cross-tenant BolivAI staff)
--   - invitations      (invite flow)
--   - subscriptions    (Stripe-backed billing)
--   - usage_metrics    (conversation/message counters per month)
--   - white-label columns on tenants
--   - helper functions for RLS
--   - RLS policies on every domain table
-- =====================================================================


-- ─── White-label columns on tenants ──────────────────────────────────
alter table tenants add column if not exists logo_url        text;
alter table tenants add column if not exists primary_color   text default '#00e5a0';
alter table tenants add column if not exists accent_color    text default '#00b87d';
alter table tenants add column if not exists custom_domain   text unique;
alter table tenants add column if not exists support_email   text;
alter table tenants add column if not exists support_whatsapp text;


-- ─── Dashboard users (auth.users ↔ tenants membership) ───────────────
create table if not exists dashboard_users (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','operator','viewer','member')),
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists idx_dashboard_users_user on dashboard_users (user_id);
create index if not exists idx_dashboard_users_tenant on dashboard_users (tenant_id);


-- ─── BolivAI internal staff (cross-tenant access) ────────────────────
create table if not exists bolivai_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin','superadmin')),
  created_at  timestamptz not null default now()
);


-- ─── Invitations ─────────────────────────────────────────────────────
create table if not exists invitations (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  email        text not null,
  role         text not null default 'member' check (role in ('owner','admin','operator','viewer','member')),
  token        text not null unique default replace(uuid_generate_v4()::text, '-', ''),
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_invitations_token on invitations (token) where accepted_at is null;
create index if not exists idx_invitations_email on invitations (email) where accepted_at is null;


-- ─── Subscriptions (Stripe-backed) ───────────────────────────────────
create table if not exists subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null unique references tenants(id) on delete cascade,
  stripe_customer_id       text unique,
  stripe_subscription_id   text unique,
  stripe_price_id          text,
  plan                     text not null default 'starter' check (plan in ('starter','pro','business','enterprise','whitelabel')),
  status                   text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','unpaid','incomplete')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  trial_ends_at            timestamptz,
  metadata                 jsonb not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated on subscriptions;
create trigger trg_subscriptions_updated
  before update on subscriptions
  for each row execute function set_updated_at();


-- ─── Usage metrics (per tenant, per calendar month) ──────────────────
create table if not exists usage_metrics (
  tenant_id            uuid not null references tenants(id) on delete cascade,
  period_start         date not null,
  conversations_count  int  not null default 0,
  messages_count       int  not null default 0,
  primary key (tenant_id, period_start)
);

-- Auto-increment usage when a chat_history row is inserted
create or replace function bump_usage_metrics () returns trigger language plpgsql as $$
declare
  v_period date := date_trunc('month', new.created_at)::date;
begin
  insert into usage_metrics (tenant_id, period_start, messages_count)
  values (new.tenant_id, v_period, 1)
  on conflict (tenant_id, period_start)
  do update set messages_count = usage_metrics.messages_count + 1;
  return new;
end;
$$;

drop trigger if exists trg_chat_history_usage on chat_history;
create trigger trg_chat_history_usage
  after insert on chat_history
  for each row execute function bump_usage_metrics();


-- =====================================================================
-- RLS helper functions
-- =====================================================================
-- All four are SECURITY DEFINER so reads inside them bypass RLS. This
-- prevents infinite recursion when a function reads dashboard_users
-- from inside a policy on dashboard_users.

-- True if the current auth.uid() is a BolivAI admin
create or replace function is_bolivai_admin () returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bolivai_admins where user_id = auth.uid());
$$;

-- True if the current auth.uid() is a member of the given tenant
create or replace function is_member_of (p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_bolivai_admin() or exists (
    select 1 from dashboard_users
    where user_id = auth.uid() and tenant_id = p_tenant_id
  );
$$;

-- True if the current auth.uid() is owner/admin on the tenant (or BolivAI staff)
create or replace function is_admin_of (p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_bolivai_admin() or exists (
    select 1 from dashboard_users
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and role in ('owner','admin')
  );
$$;

-- Returns the role the current user has on the given tenant
-- ('bolivai_admin' if global staff, else dashboard_users.role, else null)
create or replace function role_on_tenant (p_tenant_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when is_bolivai_admin() then 'bolivai_admin'
    else (select role from dashboard_users where user_id = auth.uid() and tenant_id = p_tenant_id)
  end;
$$;


-- =====================================================================
-- RLS policies
-- =====================================================================
-- Pattern: every domain table has SELECT/INSERT/UPDATE/DELETE policies
-- gated on is_member_of(tenant_id). Service role (n8n) bypasses all of
-- this; only the dashboard's user-scoped queries hit RLS.
-- =====================================================================

-- tenants
drop policy if exists "tenants_select" on tenants;
create policy "tenants_select" on tenants for select
  using (is_bolivai_admin() or exists (
    select 1 from dashboard_users where user_id = auth.uid() and tenant_id = tenants.id
  ));

drop policy if exists "tenants_update" on tenants;
create policy "tenants_update" on tenants for update
  using (is_bolivai_admin() or exists (
    select 1 from dashboard_users du
    where du.user_id = auth.uid() and du.tenant_id = tenants.id and du.role in ('owner','admin')
  ));

-- (only bolivai_admins can insert/delete tenants directly)
drop policy if exists "tenants_admin_all" on tenants;
create policy "tenants_admin_all" on tenants for all
  using (is_bolivai_admin())
  with check (is_bolivai_admin());


-- dashboard_users
alter table dashboard_users enable row level security;
drop policy if exists "dashboard_users_select_self" on dashboard_users;
create policy "dashboard_users_select_self" on dashboard_users for select
  using (user_id = auth.uid() or is_bolivai_admin() or is_member_of(tenant_id));

drop policy if exists "dashboard_users_admin_manage" on dashboard_users;
create policy "dashboard_users_admin_manage" on dashboard_users for all
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));


-- bolivai_admins
alter table bolivai_admins enable row level security;
drop policy if exists "bolivai_admins_self_read" on bolivai_admins;
create policy "bolivai_admins_self_read" on bolivai_admins for select
  using (user_id = auth.uid() or is_bolivai_admin());


-- invitations
alter table invitations enable row level security;
drop policy if exists "invitations_tenant_admin" on invitations;
create policy "invitations_tenant_admin" on invitations for all
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));


-- subscriptions
alter table subscriptions enable row level security;
drop policy if exists "subscriptions_tenant_read" on subscriptions;
create policy "subscriptions_tenant_read" on subscriptions for select
  using (is_member_of(tenant_id));

drop policy if exists "subscriptions_admin_write" on subscriptions;
create policy "subscriptions_admin_write" on subscriptions for all
  using (is_bolivai_admin())
  with check (is_bolivai_admin());


-- usage_metrics
alter table usage_metrics enable row level security;
drop policy if exists "usage_metrics_tenant_read" on usage_metrics;
create policy "usage_metrics_tenant_read" on usage_metrics for select
  using (is_member_of(tenant_id));


-- Generic tenant-scoped policy macro for the rest:
-- users, conversations, chat_history, staff, calendar_slots,
-- staff_daily_load, reservations, leads, documents, pain, record_manager
do $$
declare
  t text;
  tables text[] := array[
    'users', 'conversations', 'chat_history', 'staff',
    'calendar_slots', 'staff_daily_load', 'reservations',
    'leads', 'documents', 'pain', 'record_manager'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%I_member_select" on %I', t, t);
    execute format('create policy "%I_member_select" on %I for select using (is_member_of(tenant_id))', t, t);

    execute format('drop policy if exists "%I_member_write" on %I', t, t);
    execute format($pol$
      create policy "%I_member_write" on %I for all
      using (is_bolivai_admin() or exists (
        select 1 from dashboard_users du
        where du.user_id = auth.uid()
          and du.tenant_id = %I.tenant_id
          and du.role in ('owner','admin','operator')
      ))
      with check (is_bolivai_admin() or exists (
        select 1 from dashboard_users du
        where du.user_id = auth.uid()
          and du.tenant_id = %I.tenant_id
          and du.role in ('owner','admin','operator')
      ))
    $pol$, t, t, t, t);
  end loop;
end$$;


-- =====================================================================
-- Bootstrap helper: claim the first tenant
-- =====================================================================
-- After you sign up your first user via Supabase Auth, run this to
-- grant yourself bolivai_admin status:
--
--   insert into bolivai_admins (user_id, role)
--   values ('<your-auth.users.id>', 'superadmin');
-- =====================================================================
