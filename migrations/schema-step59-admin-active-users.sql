-- =====================================================================
-- BolivAI — Step 59: admin drill-down behind the Platform-activity tiles.
-- Lists the dashboard USERS behind DAU / WAU / MAU / Registered (with email +
-- business + last-active) so the founder can act on them (e.g. email today's
-- active users a discount code). Joins user_activity / dashboard_users →
-- auth.users (email) → tenants (business) in ONE query — SECURITY DEFINER so it
-- can read auth.users; service_role-only execute. The calling action is itself
-- admin-gated (isBolivAIAdmin), so emails only ever reach a platform admin.
-- One row per DISTINCT user (matches the DAU/WAU/MAU distinct-user counts).
-- =====================================================================
create or replace function public.admin_active_users(p_kind text)
returns table (email text, business text, last_active timestamptz, registered timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_since date;
begin
  if p_kind = 'registered' then
    return query
      select au.email::text,
             coalesce(string_agg(distinct t.name, ', '), '—') as business,
             au.last_sign_in_at as last_active,
             au.created_at as registered
      from public.dashboard_users du
      join auth.users au on au.id = du.user_id
      left join public.tenants t on t.id = du.tenant_id
      group by au.id, au.email, au.last_sign_in_at, au.created_at
      order by au.created_at desc;
    return;
  end if;

  v_since := case p_kind
    when 'dau' then (now() at time zone 'utc')::date
    when 'wau' then ((now() at time zone 'utc')::date - 6)
    when 'mau' then ((now() at time zone 'utc')::date - 29)
    else (now() at time zone 'utc')::date
  end;

  return query
    select au.email::text,
           coalesce(string_agg(distinct t.name, ', '), '—') as business,
           max(ua.last_seen_at) as last_active,
           au.created_at as registered
    from public.user_activity ua
    join auth.users au on au.id = ua.user_id
    left join public.tenants t on t.id = ua.tenant_id
    where ua.day >= v_since
    group by au.id, au.email, au.created_at
    order by max(ua.last_seen_at) desc;
end;
$$;

revoke all on function public.admin_active_users(text) from public, anon, authenticated;
grant execute on function public.admin_active_users(text) to service_role;
