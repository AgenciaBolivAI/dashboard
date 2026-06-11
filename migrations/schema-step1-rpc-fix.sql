-- =====================================================================
-- BolivAI — Step 1: search_slots_day RPC fix
-- =====================================================================
-- Apply AFTER schema.sql.
--
-- Fixes:
--   1. Returns slot_id so book_slot can use it
--   2. Uses tenant timezone instead of hardcoded UTC for date matching
--      (prevents off-by-one when slots are stored UTC but customer
--      asks for "today" in Bolivia time)
--
-- Diagnostic queries are at the bottom — run those FIRST to confirm
-- your tenant slug and slot data before applying the function.
-- =====================================================================

-- ─── Updated function ────────────────────────────────────────────────
-- Must DROP first because the return type changed (added slot_id column)
drop function if exists search_slots_day(uuid, date, integer);

create or replace function search_slots_day (
  p_tenant_id    uuid,
  p_date         date,
  p_duration_min int default 30
) returns table (
  slot_id     uuid,
  staff_id    uuid,
  staff_name  text,
  start_at    timestamptz,
  end_at      timestamptz
) language sql stable as $$
  select
    s.id        as slot_id,
    s.staff_id,
    st.name     as staff_name,
    s.start_at,
    s.end_at
  from calendar_slots s
  join staff   st on st.id = s.staff_id
  join tenants t  on t.id  = s.tenant_id
  where s.tenant_id = p_tenant_id
    and (s.start_at at time zone coalesce(t.timezone, 'America/La_Paz'))::date = p_date
    and s.is_available = true
    and (s.end_at - s.start_at) >= make_interval(mins => p_duration_min)
  order by s.start_at;
$$;


-- =====================================================================
-- DIAGNOSTIC QUERIES — run these first to confirm your data
-- =====================================================================

-- A. List all tenants and their slugs (find the exact slug for "Anesha")
-- select id, slug, name, timezone from tenants order by created_at;

-- B. Once you know the tenant_id, count its slots
-- select count(*) as total_slots,
--        sum((is_available)::int) as available_slots,
--        min(start_at) as first_slot,
--        max(start_at) as last_slot
-- from calendar_slots
-- where tenant_id = '<paste-tenant-id-here>';

-- C. Test the function for tomorrow (replace tenant_id and date)
-- select * from search_slots_day(
--   '<paste-tenant-id-here>'::uuid,
--   (current_date + 1)::date,
--   60
-- );
