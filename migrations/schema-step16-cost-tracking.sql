-- =====================================================================
-- BolivAI — Cost tracking + platform P&L
-- =====================================================================
-- Adds OUR per-unit API cost on top of what we charge tenants, then
-- exposes a few admin-only RPCs that aggregate revenue, usage, costs,
-- and gross margin across the whole platform.
--
-- Unit: micros (millionths of a USD). $1 = 1,000,000 micros. Lets us
-- represent costs as small as $0.000001 without floating-point loss.
--
-- Credits → micros conversion: credits_per_unit * 10,000 = revenue_micros
-- (because 1 credit = 1 cent = 10,000 micros).
--
-- Idempotent. Safe to re-run.
-- =====================================================================

alter table public.credit_pricing
  add column if not exists cost_per_unit_micros bigint not null default 0;

comment on column public.credit_pricing.cost_per_unit_micros is
  'BolivAI''s actual API cost per unit (ElevenLabs/OpenAI/Twilio/Apollo/Instantly/etc) in micro-dollars. revenue is credits_per_unit * 10,000 micros; margin = revenue - cost.';

-- Seed cost estimates. These are launch baselines; tune as real invoices come in.
update public.credit_pricing set cost_per_unit_micros = case action_key
  -- WhatsApp turn: gpt-4o-mini ~500 tok in/out = ~$0.001
  when 'whatsapp.agent_turn'           then 1000
  -- Voice inbound: ElevenLabs ~$0.10/min + Twilio inbound $0.013 + LLM ~$0.08
  when 'voice.inbound.minute'          then 200000
  when 'voice.inbound.reservation'     then 0  -- reservation only, no cost
  -- Voice outbound: ElevenLabs + Twilio outbound + LLM
  when 'voice.outbound.minute'         then 250000
  when 'voice.outbound.connected_call' then 50000   -- per-call setup
  when 'voice.outbound.no_answer'      then 20000   -- dial attempt
  -- Content: gpt-4o-mini share + gpt-image-1 medium
  when 'content.draft_per_platform'    then 1000
  when 'content.branded_image'         then 50000
  -- Marketing: DIY infra ~free, Apollo per-credit, Instantly per-email
  when 'marketing.lead_scraped_diy'    then 0
  when 'marketing.lead_scraped_apollo' then 10000
  when 'marketing.cold_email_sent'     then 10000
  -- Free or near-free actions
  when 'calendar.appointment_booked'   then 0
  when 'invoice.sent'                  then 0
  when 'video.meeting_minute'          then 1000
  when 'knowledge.kb_sync'             then 1000
  else cost_per_unit_micros
end;

-- ── Platform-wide P&L for a time window ──────────────────────────────
create or replace function public.platform_pnl(p_window text default 'today')
returns table (
  window_start         timestamptz,
  revenue_micros       bigint,
  topup_cents          bigint,
  usage_credits        bigint,
  cost_micros          bigint,
  margin_micros        bigint,
  margin_pct           numeric,
  active_tenants       bigint,
  total_tenants        bigint,
  tenants_at_zero      bigint,
  tenants_low_balance  bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select case p_window
      when 'today'  then date_trunc('day',   now())
      when 'week'   then date_trunc('week',  now())
      when 'month'  then date_trunc('month', now())
      when '24h'    then now() - interval '24 hours'
      when '7d'     then now() - interval '7 days'
      when '30d'    then now() - interval '30 days'
      when '90d'    then now() - interval '90 days'
      when 'all'    then 'epoch'::timestamptz
      else date_trunc('day', now())
    end as start_ts
  ),
  rev as (
    -- Topups recorded as positive credits_delta of type='top_up'
    select coalesce(sum(case
        when (metadata->>'paid_cents') is not null
        then (metadata->>'paid_cents')::bigint
        else credits_delta
      end), 0)::bigint as topup_cents
    from public.credit_transactions, bounds
    where type = 'top_up' and created_at >= start_ts
  ),
  usage as (
    -- Usage is recorded as negative credits_delta; we want absolute spent
    select coalesce(sum(-credits_delta), 0)::bigint as usage_credits
    from public.credit_transactions, bounds
    where type in ('usage','release') and created_at >= start_ts
  ),
  cost as (
    -- Multiply each usage row by the action's cost_per_unit_micros.
    -- Usage tx credits_delta = -(credits_per_unit * units), so:
    -- units = -credits_delta / credits_per_unit
    -- cost_micros_for_tx = units * cost_per_unit_micros
    select coalesce(sum(
      case when cp.credits_per_unit > 0
        then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
        else 0
      end
    ), 0)::bigint as cost_micros
    from public.credit_transactions tx
    join public.credit_pricing cp on cp.action_key = tx.action_key
    cross join bounds
    where tx.type in ('usage','release')
      and tx.created_at >= bounds.start_ts
      and tx.action_key is not null
  ),
  tenant_counts as (
    select
      (select count(*) from public.credit_accounts)::bigint as total_tenants,
      (select count(*) from public.credit_accounts
        where (balance_credits - reserved_credits) <= 0)::bigint as at_zero,
      (select count(*) from public.credit_accounts
        where (balance_credits - reserved_credits) <= low_balance_threshold
          and (balance_credits - reserved_credits) > 0)::bigint as low_balance,
      (select count(distinct tenant_id) from public.credit_transactions tx, bounds
        where tx.type in ('usage','release') and tx.created_at >= bounds.start_ts)::bigint as active
  )
  select
    (select start_ts from bounds)                                       as window_start,
    (rev.topup_cents * 10000)::bigint                                   as revenue_micros,
    rev.topup_cents                                                     as topup_cents,
    usage.usage_credits                                                 as usage_credits,
    cost.cost_micros                                                    as cost_micros,
    (usage.usage_credits * 10000 - cost.cost_micros)::bigint            as margin_micros,
    case when usage.usage_credits > 0
      then round((usage.usage_credits * 10000.0 - cost.cost_micros) / nullif(usage.usage_credits * 10000.0, 0) * 100, 1)
      else null
    end                                                                 as margin_pct,
    tenant_counts.active                                                as active_tenants,
    tenant_counts.total_tenants                                         as total_tenants,
    tenant_counts.at_zero                                               as tenants_at_zero,
    tenant_counts.low_balance                                           as tenants_low_balance
  from rev, usage, cost, tenant_counts;
$$;

-- ── Per-action breakdown (revenue / cost / margin) ───────────────────
create or replace function public.platform_action_breakdown(p_window text default '7d')
returns table (
  action_key       text,
  units            bigint,
  revenue_credits  bigint,
  cost_micros      bigint,
  margin_micros    bigint,
  margin_pct       numeric,
  unique_tenants   bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select case p_window
      when 'today'  then date_trunc('day',   now())
      when 'week'   then date_trunc('week',  now())
      when 'month'  then date_trunc('month', now())
      when '24h'    then now() - interval '24 hours'
      when '7d'     then now() - interval '7 days'
      when '30d'    then now() - interval '30 days'
      when '90d'    then now() - interval '90 days'
      when 'all'    then 'epoch'::timestamptz
      else now() - interval '7 days'
    end as start_ts
  )
  select
    tx.action_key,
    sum(case when cp.credits_per_unit > 0 then -tx.credits_delta / cp.credits_per_unit else 0 end)::bigint as units,
    sum(-tx.credits_delta)::bigint                                                                          as revenue_credits,
    sum(case when cp.credits_per_unit > 0
        then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
        else 0
      end)::bigint                                                                                         as cost_micros,
    (sum(-tx.credits_delta) * 10000 - sum(case when cp.credits_per_unit > 0
        then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
        else 0
      end))::bigint                                                                                         as margin_micros,
    case when sum(-tx.credits_delta) > 0
      then round(((sum(-tx.credits_delta) * 10000.0 - sum(case when cp.credits_per_unit > 0
            then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
            else 0
          end))) / nullif(sum(-tx.credits_delta) * 10000.0, 0) * 100, 1)
      else null
    end                                                                                                    as margin_pct,
    count(distinct tx.tenant_id)::bigint                                                                    as unique_tenants
  from public.credit_transactions tx
  join public.credit_pricing cp on cp.action_key = tx.action_key
  cross join bounds
  where tx.type in ('usage','release')
    and tx.created_at >= bounds.start_ts
    and tx.action_key is not null
  group by tx.action_key
  order by margin_micros desc;
$$;

-- ── Per-tenant P&L summary ───────────────────────────────────────────
create or replace function public.tenant_pnl_summary(p_window text default 'month')
returns table (
  tenant_id            uuid,
  slug                 text,
  name                 text,
  status               text,
  balance_credits      bigint,
  revenue_cents        bigint,
  usage_credits        bigint,
  cost_micros          bigint,
  margin_micros        bigint,
  margin_pct           numeric,
  last_activity_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select case p_window
      when 'today'  then date_trunc('day',   now())
      when 'week'   then date_trunc('week',  now())
      when 'month'  then date_trunc('month', now())
      when '24h'    then now() - interval '24 hours'
      when '7d'     then now() - interval '7 days'
      when '30d'    then now() - interval '30 days'
      when '90d'    then now() - interval '90 days'
      when 'all'    then 'epoch'::timestamptz
      else date_trunc('month', now())
    end as start_ts
  ),
  rev as (
    select tx.tenant_id,
      sum(case when (metadata->>'paid_cents') is not null then (metadata->>'paid_cents')::bigint else credits_delta end)::bigint as revenue_cents
    from public.credit_transactions tx, bounds
    where tx.type = 'top_up' and tx.created_at >= bounds.start_ts
    group by tx.tenant_id
  ),
  usage as (
    select tx.tenant_id,
      sum(-tx.credits_delta)::bigint                                                                            as usage_credits,
      sum(case when cp.credits_per_unit > 0
          then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
          else 0
        end)::bigint                                                                                            as cost_micros,
      max(tx.created_at)                                                                                        as last_activity_at
    from public.credit_transactions tx
    join public.credit_pricing cp on cp.action_key = tx.action_key
    cross join bounds
    where tx.type in ('usage','release')
      and tx.created_at >= bounds.start_ts
      and tx.action_key is not null
    group by tx.tenant_id
  )
  select
    t.id                                                                  as tenant_id,
    t.slug,
    t.name,
    t.status,
    coalesce(ca.balance_credits, 0)::bigint                               as balance_credits,
    coalesce(rev.revenue_cents, 0)::bigint                                as revenue_cents,
    coalesce(usage.usage_credits, 0)::bigint                              as usage_credits,
    coalesce(usage.cost_micros, 0)::bigint                                as cost_micros,
    (coalesce(usage.usage_credits, 0) * 10000 - coalesce(usage.cost_micros, 0))::bigint as margin_micros,
    case when coalesce(usage.usage_credits, 0) > 0
      then round(((coalesce(usage.usage_credits, 0) * 10000.0 - coalesce(usage.cost_micros, 0)))
              / nullif(coalesce(usage.usage_credits, 0) * 10000.0, 0) * 100, 1)
      else null
    end                                                                   as margin_pct,
    usage.last_activity_at
  from public.tenants t
  left join public.credit_accounts ca on ca.tenant_id = t.id
  left join rev on rev.tenant_id = t.id
  left join usage on usage.tenant_id = t.id
  order by margin_micros desc nulls last, t.created_at desc;
$$;

-- ── Daily timeseries for the platform (revenue + cost + margin) ───────
create or replace function public.platform_daily_timeseries(p_days int default 30)
returns table (
  day            date,
  revenue_cents  bigint,
  usage_credits  bigint,
  cost_micros    bigint,
  margin_micros  bigint
)
language sql
security definer
set search_path = public
as $$
  with d as (
    select generate_series(
      (current_date - (p_days - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    coalesce(sum(case when tx.type = 'top_up' then
      case when (tx.metadata->>'paid_cents') is not null then (tx.metadata->>'paid_cents')::bigint
        else tx.credits_delta end
      else 0 end), 0)::bigint                                                                                   as revenue_cents,
    coalesce(sum(case when tx.type in ('usage','release') then -tx.credits_delta else 0 end), 0)::bigint        as usage_credits,
    coalesce(sum(case when tx.type in ('usage','release') and cp.credits_per_unit > 0
        then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
        else 0
      end), 0)::bigint                                                                                          as cost_micros,
    (coalesce(sum(case when tx.type in ('usage','release') then -tx.credits_delta else 0 end), 0) * 10000 -
     coalesce(sum(case when tx.type in ('usage','release') and cp.credits_per_unit > 0
        then (-tx.credits_delta / cp.credits_per_unit) * cp.cost_per_unit_micros
        else 0
      end), 0))::bigint                                                                                         as margin_micros
  from d
  left join public.credit_transactions tx
    on date_trunc('day', tx.created_at) = d.day
  left join public.credit_pricing cp on cp.action_key = tx.action_key
  group by d.day
  order by d.day;
$$;

comment on function public.platform_pnl is
  'Platform-wide P&L for a window. Returns revenue (top-ups), usage credits spent, our API cost in micros, gross margin in micros + %, and active/total tenant counts.';
comment on function public.platform_action_breakdown is
  'Per-action_key breakdown of units consumed, revenue, our cost, margin. Sorted by margin descending.';
comment on function public.tenant_pnl_summary is
  'Per-tenant P&L: balance, revenue, usage, cost, margin. Sorted by margin descending.';
comment on function public.platform_daily_timeseries is
  'Daily revenue, usage, cost, margin over the last N days (default 30). For the admin overview sparkline.';
