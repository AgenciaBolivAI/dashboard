-- =====================================================================
-- BolivAI — Step 35: Founding Member lifetime access ($30 one-time)
-- =====================================================================
-- New revenue model: a one-time $30 payment unlocks LIFETIME platform access
-- (no monthly fees). Usage is still pay-as-you-go credits on top. The price is
-- a "Founding Member" launch offer for the first 5,000 members.
--
-- This migration:
--   * adds lifetime-access columns to tenants
--   * GRANDFATHERS every existing tenant as a founding member (so current
--     users are never locked out), numbered by signup order
--   * adds grant_lifetime_access(...) — idempotent, assigns the next number
-- Idempotent.
-- =====================================================================

alter table public.tenants
  add column if not exists lifetime_access        boolean not null default false,
  add column if not exists lifetime_access_at     timestamptz,
  add column if not exists founding_member_number int,
  add column if not exists lifetime_paid_cents     int,
  add column if not exists lifetime_stripe_pi      text;

create unique index if not exists ux_tenants_founding_number
  on public.tenants (founding_member_number) where founding_member_number is not null;

-- Grandfather existing tenants (numbered by created_at order, comp'd at $0).
with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.tenants
  where lifetime_access = false
)
update public.tenants t
   set lifetime_access     = true,
       lifetime_access_at  = coalesce(t.lifetime_access_at, now()),
       founding_member_number = coalesce(t.founding_member_number, r.rn),
       lifetime_paid_cents = coalesce(t.lifetime_paid_cents, 0)
  from ranked r
 where t.id = r.id;

-- RPC: grant lifetime access + assign the next founding-member number.
-- Idempotent (returns the existing number if already granted). An advisory
-- lock serializes numbering so two concurrent payments never collide.
create or replace function public.grant_lifetime_access(
  p_tenant_id  uuid,
  p_paid_cents int default 3000,
  p_stripe_pi  text default null
) returns table (ok boolean, founding_number int, was_already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_num    int;
  v_next   int;
begin
  select lifetime_access, founding_member_number into v_active, v_num
  from public.tenants where id = p_tenant_id for update;
  if not found then
    return query select false, null::int, false;
    return;
  end if;
  if v_active then
    return query select true, v_num, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('bolivai_founding_member_number'));
  select coalesce(max(founding_member_number), 0) + 1 into v_next from public.tenants;

  update public.tenants
     set lifetime_access        = true,
         lifetime_access_at     = now(),
         founding_member_number = v_next,
         lifetime_paid_cents    = p_paid_cents,
         lifetime_stripe_pi     = p_stripe_pi
   where id = p_tenant_id;

  return query select true, v_next, false;
end;
$$;

revoke all on function public.grant_lifetime_access(uuid, int, text) from public, anon, authenticated;
grant execute on function public.grant_lifetime_access(uuid, int, text) to service_role;
