-- =====================================================================
-- BolivAI — Step 3: book_slot now accepts service_id
-- =====================================================================
-- Apply AFTER schema-step2-staff-services.sql.
--
-- Adds an optional p_service_id arg to book_slot and persists it on the
-- reservations row so the dashboard's calendar can show the service name.
-- =====================================================================

drop function if exists book_slot(uuid, uuid, uuid, integer, text, text, text, text);
drop function if exists book_slot(uuid, uuid, uuid, integer, text, text, text, text, uuid);

create or replace function book_slot (
  p_tenant_id       uuid,
  p_user_id         uuid,
  p_slot_id         uuid,
  p_duration_min    int,
  p_customer_name   text,
  p_customer_email  text,
  p_customer_phone  text default null,
  p_notes           text default null,
  p_service_id      uuid default null
) returns reservations language plpgsql as $$
declare
  v_slot calendar_slots%rowtype;
  v_reservation reservations%rowtype;
begin
  -- Lock the slot row to prevent double-booking
  select * into v_slot
  from calendar_slots
  where id = p_slot_id and tenant_id = p_tenant_id and is_available = true
  for update;

  if not found then
    raise exception 'Slot % not available', p_slot_id;
  end if;

  -- If a service_id was supplied, verify the assigned staffer actually
  -- offers it. Skip the check when no service was supplied (back-compat).
  if p_service_id is not null then
    if not exists (
      select 1 from staff_services
      where tenant_id = p_tenant_id
        and staff_id  = v_slot.staff_id
        and service_id = p_service_id
    ) then
      raise exception 'Staff % does not offer service %', v_slot.staff_id, p_service_id;
    end if;
  end if;

  insert into reservations (
    tenant_id, user_id, staff_id, slot_id, service_id,
    start_at, end_at, duration_minutes,
    customer_name, customer_email, customer_phone, notes
  ) values (
    p_tenant_id, p_user_id, v_slot.staff_id, v_slot.id, p_service_id,
    v_slot.start_at, v_slot.start_at + make_interval(mins => p_duration_min), p_duration_min,
    p_customer_name, p_customer_email, p_customer_phone, p_notes
  ) returning * into v_reservation;

  update calendar_slots set is_available = false where id = p_slot_id;

  return v_reservation;
end;
$$;
