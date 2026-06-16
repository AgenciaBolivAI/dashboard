-- =====================================================================
-- BolivAI — SECURITY FIX: tenant-scoped aima_stats
-- =====================================================================
-- CROSS-TENANT LEAK: the per-tenant marketing page called
-- public.aima_stats(p_window) which delegates to brain.aima_stats(p_window)
-- — and brain.aima_stats has the BolivAI tenant id HARDCODED
-- ('5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'). So EVERY tenant's marketing
-- page showed BolivAI's AIMA stats (leads sourced, Sandra queue, etc.).
-- A brand-new tenant (foto-montoya) saw BolivAI's 631 leads + 8 queued.
--
-- brain.aima_stats stays as-is — it is a founder/BolivAI-only metric.
-- This adds a TENANT-SCOPED overload that every tenant page must use.
-- It is SECURITY INVOKER so RLS on leads / sandra_call_queue /
-- aima_scrape_runs double-guards: even if a caller passes another
-- tenant's id, RLS returns zero rows for a non-member.
-- Idempotent.
-- =====================================================================

create or replace function public.aima_stats(p_tenant_id uuid, p_window text default '7d')
returns table(
  leads_sourced bigint,
  emails_sent bigint,
  emails_opened bigint,
  emails_replied bigint,
  in_sandra_queue bigint,
  demos_booked bigint,
  scraper_enabled boolean,
  cold_email_enabled boolean,
  last_scrape_at timestamptz,
  window_start timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with bounds as (
    select case p_window
      when 'today'  then date_trunc('day',   now())
      when 'week'   then date_trunc('week',  now())
      when 'month'  then date_trunc('month', now())
      when '24h'    then now() - interval '24 hours'
      when '7d'     then now() - interval '7 days'
      when '30d'    then now() - interval '30 days'
      else now() - interval '7 days'
    end as start_ts
  ),
  tenant as (
    select t.id,
           coalesce(s.scraper_enabled, false)    as scraper_enabled,
           coalesce(s.cold_email_enabled, false) as cold_email_enabled
    from public.tenants t
    left join public.aima_settings s on s.tenant_id = t.id
    where t.id = p_tenant_id
  )
  select
    (select count(*) from public.leads
       where tenant_id = p_tenant_id
         and source = 'aima'
         and created_at >= (select start_ts from bounds))::bigint                        as leads_sourced,
    (select count(*) from public.leads
       where tenant_id = p_tenant_id
         and source = 'aima'
         and (metadata->>'emailed_at') is not null
         and (metadata->>'emailed_at')::timestamptz >= (select start_ts from bounds))::bigint as emails_sent,
    (select count(*) from public.leads
       where tenant_id = p_tenant_id
         and source = 'aima'
         and (metadata->>'opened_at') is not null
         and (metadata->>'opened_at')::timestamptz >= (select start_ts from bounds))::bigint  as emails_opened,
    (select count(*) from public.leads
       where tenant_id = p_tenant_id
         and source = 'aima'
         and (metadata->>'replied_at') is not null
         and (metadata->>'replied_at')::timestamptz >= (select start_ts from bounds))::bigint as emails_replied,
    (select count(*) from public.sandra_call_queue
       where tenant_id = p_tenant_id
         and status = 'pending')::bigint                                                 as in_sandra_queue,
    (select count(*) from public.leads
       where tenant_id = p_tenant_id
         and source = 'aima'
         and intent = 'demo_consideration'
         and status = 'converted'
         and created_at >= (select start_ts from bounds))::bigint                        as demos_booked,
    coalesce((select scraper_enabled from tenant), false)                                as scraper_enabled,
    coalesce((select cold_email_enabled from tenant), false)                             as cold_email_enabled,
    (select max(finished_at) from public.aima_scrape_runs
       where tenant_id = p_tenant_id and status = 'success')                             as last_scrape_at,
    (select start_ts from bounds)                                                        as window_start;
$function$;

grant execute on function public.aima_stats(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Neutralize the LEAKY 1-arg overload immediately (production hot-fix).
-- It previously delegated to brain.aima_stats(p_window) which has the
-- BolivAI tenant id hardcoded, so any caller without a tenant context got
-- BolivAI's numbers. It now returns a zero row. The currently-deployed
-- marketing page calls this version until the app deploy ships; this stops
-- the leak in prod NOW. brain.aima_stats (founder metric) is untouched.
-- ---------------------------------------------------------------------
create or replace function public.aima_stats(p_window text default 'today')
returns table(
  leads_sourced bigint, emails_sent bigint, emails_opened bigint, emails_replied bigint,
  in_sandra_queue bigint, demos_booked bigint, scraper_enabled boolean, cold_email_enabled boolean,
  last_scrape_at timestamptz, window_start timestamptz
)
language sql stable security invoker set search_path to 'public'
as $function$
  -- No tenant context → must never leak. Tenant pages use aima_stats(uuid,text).
  select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
         false, false, null::timestamptz, now();
$function$;
