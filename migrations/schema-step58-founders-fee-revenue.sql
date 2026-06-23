-- =====================================================================
-- BolivAI — Step 58: Founding Member (founders fee) revenue metric for the
-- admin dashboard. Aggregates the one-time $40 lifetime fee actually COLLECTED
-- (tenants.lifetime_paid_cents) within the selected window, keyed on the grant/
-- payment time (tenants.lifetime_access_at). Mirrors the exact window mapping
-- used by platform_pnl/tenant_pnl_summary so it lines up with the window
-- selector. Only counts real cash: waived / 100%-off grants have
-- lifetime_paid_cents = 0/NULL and are excluded.
-- Locked down like the other admin RPCs: service_role execute only.
-- =====================================================================
create or replace function public.founders_fee_revenue(p_window text default 'month')
returns table (
  paid_count     integer,   -- paying founders in the window
  paid_cents     bigint,    -- cash collected in the window
  all_time_count integer,   -- paying founders ever
  all_time_cents bigint     -- cash collected ever
)
language sql
security definer
set search_path = public
as $$
  with b as (
    select case p_window
      when 'today' then date_trunc('day',   now())
      when 'week'  then date_trunc('week',  now())
      when 'month' then date_trunc('month', now())
      when '24h'   then now() - interval '24 hours'
      when '7d'    then now() - interval '7 days'
      when '30d'   then now() - interval '30 days'
      when '90d'   then now() - interval '90 days'
      when 'all'   then 'epoch'::timestamptz
      else date_trunc('day', now())
    end as v_start
  )
  select
    count(*) filter (
      where t.lifetime_paid_cents > 0 and t.lifetime_access_at >= b.v_start
    )::int,
    coalesce(sum(t.lifetime_paid_cents) filter (
      where t.lifetime_paid_cents > 0 and t.lifetime_access_at >= b.v_start
    ), 0)::bigint,
    count(*) filter (where t.lifetime_paid_cents > 0)::int,
    coalesce(sum(t.lifetime_paid_cents) filter (where t.lifetime_paid_cents > 0), 0)::bigint
  from public.tenants t cross join b;
$$;

revoke all on function public.founders_fee_revenue(text) from public, anon, authenticated;
grant execute on function public.founders_fee_revenue(text) to service_role;
