-- =====================================================================
-- BolivAI — Step 43: RBAC — custom roles with per-feature permissions
-- =====================================================================
-- Phase 4a of the platform upgrade. Lets a tenant define CUSTOM roles beyond
-- the built-in tiers (viewer/member/operator/admin/owner), each a map of
-- FEATURE → LEVEL (none/read/edit/admin), and assign them per member.
--
-- Design (zero-migration-risk): the built-in tiers stay VIRTUAL — they map to
-- presets in code (lib/permissions LEGACY_ROLE_PERMISSIONS), so nothing needs
-- seeding. This table holds only CUSTOM roles. dashboard_users.role_id points
-- to a custom role when one is assigned; when null, the legacy `role` tier (and
-- its preset) applies. So an un-migrated tenant behaves exactly as before.
--
-- Enforcement: lib/auth getEffectivePermissions resolves role_id → permissions,
-- else legacy tier → preset. Pages/actions gate via requirePermission; the
-- sidebar hides features the role can't read. RLS remains the DB backstop.
-- Idempotent.
-- =====================================================================

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  is_system   boolean not null default false,
  -- { "leads": "edit", "invoices": "read", ... } — omitted features = "none".
  permissions jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, name)
);
create index if not exists idx_roles_tenant on public.roles (tenant_id);

drop trigger if exists trg_roles_updated on public.roles;
create trigger trg_roles_updated before update on public.roles
  for each row execute function set_updated_at();

-- Optional custom-role assignment. The legacy `role` text column is kept as the
-- fallback tier (and is what the built-in presets key off of).
alter table public.dashboard_users
  add column if not exists role_id uuid references public.roles(id) on delete set null;

-- =====================================================================
-- RLS — members read their tenant's roles; only admins/owners manage them
-- (through server actions on the service role).
-- =====================================================================
alter table public.roles enable row level security;

drop policy if exists "roles_member_select" on public.roles;
create policy "roles_member_select" on public.roles
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "roles_admin_manage" on public.roles;
create policy "roles_admin_manage" on public.roles
  for all to authenticated
  using (public.is_admin_of(tenant_id))
  with check (public.is_admin_of(tenant_id));

revoke insert, update, delete, truncate on public.roles from anon, authenticated;
grant select on public.roles to authenticated;
grant all on public.roles to service_role;
