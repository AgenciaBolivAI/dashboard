-- =====================================================================
-- BolivAI — Step 56: rate limiting for the public REST API (/api/v1).
-- Fixed-window counter, one row per (api key, time window). The app calls
-- api_rate_limit_hit() once per request (atomic increment-and-check), so
-- there's no read-then-write race. Locked down like the other internal
-- tables: RLS on, anon/authenticated revoked, service_role only.
-- =====================================================================
create table if not exists public.api_rate_limits (
  key_id       uuid        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key_id, window_start)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;
grant all on public.api_rate_limits to service_role;

-- Atomically register one request against a key's current window and report
-- whether it's still within the limit. Also prunes that key's expired windows
-- (PK-indexed, cheap) so the table stays ~1 row per active key.
create or replace function public.api_rate_limit_hit(
  p_key_id         uuid,
  p_limit          integer,
  p_window_seconds integer
) returns table(allowed boolean, used integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  delete from public.api_rate_limits
    where key_id = p_key_id and window_start < v_window;

  insert into public.api_rate_limits as r (key_id, window_start, count)
    values (p_key_id, v_window, 1)
    on conflict (key_id, window_start)
    do update set count = r.count + 1
    returning r.count into v_count;

  return query
    select (v_count <= p_limit),
           v_count,
           (v_window + make_interval(secs => p_window_seconds));
end;
$$;

revoke all on function public.api_rate_limit_hit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_hit(uuid, integer, integer) to service_role;
