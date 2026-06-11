-- =====================================================================
-- BolivAI — Fix RLS infinite recursion in dashboard_users / tenants
-- =====================================================================
-- The is_*() helpers were SECURITY INVOKER (SQL default), so queries
-- against dashboard_users from inside a dashboard_users policy
-- recursively re-triggered the same policy → 42P17 error.
--
-- Fix: declare them SECURITY DEFINER so the inner reads run as the
-- function owner and skip RLS, breaking the recursion.
--
-- Also replaces the inline-subquery on dashboard_users_admin_manage
-- with a definer-function call (same recursion pattern).
--
-- Apply once. Idempotent — safe to re-run.
-- =====================================================================

-- ─── Helpers (SECURITY DEFINER) ──────────────────────────────────────
create or replace function is_bolivai_admin () returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bolivai_admins where user_id = auth.uid());
$$;

create or replace function is_member_of (p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_bolivai_admin() or exists (
    select 1 from dashboard_users
    where user_id = auth.uid() and tenant_id = p_tenant_id
  );
$$;

create or replace function role_on_tenant (p_tenant_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when is_bolivai_admin() then 'bolivai_admin'
    else (select role from dashboard_users
          where user_id = auth.uid() and tenant_id = p_tenant_id)
  end;
$$;

create or replace function is_admin_of (p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_bolivai_admin() or exists (
    select 1 from dashboard_users
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and role in ('owner','admin')
  );
$$;

-- ─── Replace recursion-prone policy ──────────────────────────────────
drop policy if exists "dashboard_users_admin_manage" on dashboard_users;
create policy "dashboard_users_admin_manage" on dashboard_users for all
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));

-- ─── Tighten invitations + subscriptions write policies the same way ─
drop policy if exists "invitations_tenant_admin" on invitations;
create policy "invitations_tenant_admin" on invitations for all
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));
