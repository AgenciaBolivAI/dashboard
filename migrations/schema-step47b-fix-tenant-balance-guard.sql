-- =====================================================================
-- BolivAI — Step 47b: correct the tenant_balance guard from step47.
-- step47 used `auth.uid() is null` to allow the service client, but the ANON
-- role also has a null uid, so anon could still read any tenant's balance.
-- Gate on the JWT *role* = 'service_role' instead, and revoke anon entirely.
-- =====================================================================
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
    and ((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
         or public.is_member_of(p_tenant_id)
         or public.is_bolivai_admin());
$tb$;

revoke all on function public.tenant_balance from public, anon;
grant execute on function public.tenant_balance to authenticated, service_role;
