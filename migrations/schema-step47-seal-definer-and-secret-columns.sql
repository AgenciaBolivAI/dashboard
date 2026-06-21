-- =====================================================================
-- BolivAI — Step 47: SECURITY AUDIT remediation
--   (a) seal SECURITY DEFINER functions that were never revoked from
--       anon/authenticated (cross-tenant credit + P&L exposure),
--   (b) guard tenant_balance (has a live authenticated caller),
--   (c) lock secret columns that RLS (row-level) can't hide.
-- =====================================================================
-- Found by a platform-wide security audit. These predate the step30/32 pattern
-- of `revoke ... from public, anon, authenticated; grant execute to service_role`
-- and were left PUBLIC-executable, so any authenticated user could call them.
-- Idempotent. No `$$`-mangling: the one function body uses a $tb$ tag.

-- ── (a) Credit RPCs — service-role only (all app callers use the service
-- client: lib/billing/credits.ts, lib/actions/admin.ts, the Stripe webhook). ──
revoke all on function public.credit_topup    from public, anon, authenticated;
revoke all on function public.debit_credits   from public, anon, authenticated;
revoke all on function public.reserve_credits from public, anon, authenticated;
revoke all on function public.release_credits from public, anon, authenticated;
grant execute on function public.credit_topup    to service_role;
grant execute on function public.debit_credits   to service_role;
grant execute on function public.reserve_credits to service_role;
grant execute on function public.release_credits to service_role;

-- Platform / tenant P&L — founder-only (only the /admin pages read them, via
-- the service client in lib/queries/admin-pnl.ts).
revoke all on function public.platform_pnl                from public, anon, authenticated;
revoke all on function public.platform_action_breakdown   from public, anon, authenticated;
revoke all on function public.tenant_pnl_summary          from public, anon, authenticated;
revoke all on function public.platform_daily_timeseries   from public, anon, authenticated;
grant execute on function public.platform_pnl                to service_role;
grant execute on function public.platform_action_breakdown   to service_role;
grant execute on function public.tenant_pnl_summary          to service_role;
grant execute on function public.platform_daily_timeseries   to service_role;

-- Company brain (internal BolivAI knowledge, admin-only tables) — the DEFINER
-- functions bypass the brain RLS, so they must not be PUBLIC-callable.
revoke all on function brain.search_company from public, anon, authenticated;
revoke all on function brain.knowledge_stats from public, anon, authenticated;
revoke all on function brain.get_graph from public, anon, authenticated;
revoke all on function brain.get_entity_full from public, anon, authenticated;
grant execute on function brain.search_company to service_role;
grant execute on function brain.knowledge_stats to service_role;
grant execute on function brain.get_graph to service_role;
grant execute on function brain.get_entity_full to service_role;

-- ── (b) tenant_balance keeps its authenticated grant (getBalance() calls it
-- under the user session) but now RETURNS ROWS ONLY for a tenant the caller is
-- a member of. The service client has no auth.uid() (null) → still allowed, so
-- getBalanceWithService keeps working. An authed user can no longer read an
-- arbitrary tenant's balance. ──
create or replace function public.tenant_balance(p_tenant_id uuid)
returns table (
  balance_credits          bigint,
  reserved_credits         bigint,
  available_credits        bigint,
  lifetime_topped_up_cents bigint,
  lifetime_spent_credits   bigint,
  low_balance_threshold    bigint,
  out_of_credits_at        timestamptz,
  is_low                   boolean,
  is_zero                  boolean
)
language sql
security definer
set search_path = public
as $tb$
  select
    a.balance_credits,
    a.reserved_credits,
    (a.balance_credits - a.reserved_credits) as available_credits,
    a.lifetime_topped_up_cents,
    a.lifetime_spent_credits,
    a.low_balance_threshold,
    a.out_of_credits_at,
    (a.balance_credits - a.reserved_credits) <= a.low_balance_threshold as is_low,
    (a.balance_credits - a.reserved_credits) <= 0 as is_zero
  from public.credit_accounts a
  where a.tenant_id = p_tenant_id
    and (auth.uid() is null
         or public.is_member_of(p_tenant_id)
         or public.is_bolivai_admin());
$tb$;

-- ── (c) Secret columns: RLS is row-level, not column-level, so a member (even
-- a viewer) could `select` these provider credentials. Neither has an
-- authenticated reader (config is read via the service client; the Twilio auth
-- token is never selected by getTenantBySlug). Revoke the column from members. ──
revoke select (voice_phone_auth_token) on public.tenants from anon, authenticated;
revoke select (config) on public.tenant_channels from anon, authenticated;
