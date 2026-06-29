-- =====================================================================
-- BolivAI — Step 70: rate-limiter key as TEXT (fix dead public-route limit)
-- =====================================================================
-- `api_rate_limit_hit(p_key_id uuid)` + `api_rate_limits.key_id uuid` only
-- accepted uuid keys. The PUBLIC form-submit (/api/forms/[slug]/submit) and
-- unsubscribe (/api/marketing/unsubscribe) routes key by a composite STRING
-- ("form:<id>:<ip>", "unsub:<ip>") → the RPC raised `invalid input syntax for
-- type uuid`, which the routes' fail-open `catch {}` swallowed → the per-IP
-- abuse limit NEVER fired on those unauthenticated endpoints. Widen key_id to
-- text (the /api/v1 uuid keys are valid text too). No FK on key_id; PK is
-- (key_id, window_start). Idempotent.
-- =====================================================================

alter table public.api_rate_limits alter column key_id type text;

drop function if exists public.api_rate_limit_hit(uuid, integer, integer);

create or replace function public.api_rate_limit_hit(p_key_id text, p_limit integer, p_window_seconds integer)
returns table(allowed boolean, used integer, reset_at timestamptz)
language plpgsql security definer set search_path = public
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

revoke all on function public.api_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_hit(text, integer, integer) to service_role;
