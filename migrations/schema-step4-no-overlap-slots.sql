-- =====================================================================
-- BolivAI — Step 4: prevent overlapping calendar_slots
-- =====================================================================
-- Apply AFTER schema-step3-book-slot-service.sql.
--
-- Adds a Postgres EXCLUDE constraint so two slots for the same staffer
-- can never overlap in time. This makes the bug ("9:00-9:30, 9:00-10:00,
-- 9:30-10:00 generated together") impossible at the data layer, in
-- addition to the app-level guard added in calendar.ts.
--
-- Also includes an optional cleanup query at the bottom to delete
-- overlapping slots that already exist (uncomment to run).
-- =====================================================================

create extension if not exists btree_gist;

-- Drop any older incarnation of the constraint
alter table calendar_slots
  drop constraint if exists calendar_slots_no_overlap;

-- Two slots for the same (tenant, staff) cannot have overlapping
-- [start_at, end_at) ranges. tstzrange '[]' style would treat exact
-- end-touching-start as a conflict; '[)' makes 9:00-10:00 and 10:00-11:00
-- valid (correct: end-time is exclusive).
alter table calendar_slots
  add constraint calendar_slots_no_overlap
  exclude using gist (
    tenant_id with =,
    staff_id  with =,
    tstzrange(start_at, end_at, '[)') with &&
  );


-- =====================================================================
-- OPTIONAL CLEANUP: delete duplicate / overlapping legacy slots
-- =====================================================================
-- Uncomment and run AFTER backing up if your calendar already has
-- overlapping slots (eg. ran the generator twice with different
-- durations). Keeps the longest slot in each overlap group, deletes
-- the rest. Only deletes slots where is_available = true (never
-- removes a slot tied to a confirmed reservation).
-- ─────────────────────────────────────────────────────────────────────
-- with ranked as (
--   select
--     id,
--     row_number() over (
--       partition by tenant_id, staff_id, date_trunc('day', start_at)
--       order by (end_at - start_at) desc, start_at
--     ) as rn,
--     start_at, end_at, tenant_id, staff_id
--   from calendar_slots
--   where is_available = true
-- ),
-- to_delete as (
--   select r.id
--   from ranked r
--   join ranked k
--     on  k.tenant_id = r.tenant_id
--     and k.staff_id  = r.staff_id
--     and k.rn        = 1
--     and r.id        <> k.id
--     and tstzrange(r.start_at, r.end_at, '[)')
--         && tstzrange(k.start_at, k.end_at, '[)')
-- )
-- delete from calendar_slots
-- where id in (select id from to_delete);
