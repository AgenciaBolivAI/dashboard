-- =====================================================================
-- BolivAI — Step 69: platform audit fixes (2026-06-29)
-- =====================================================================
-- Bundles the DB-side fixes from the full-platform audit:
--  1. notify_reservation_changed — RESTORE the full payload step66 accidentally
--     dropped (support_email/whatsapp + meeting_provider/url/room_name) and the
--     customer-email guard clause, while keeping the step66 SECURITY DEFINER fix.
--  2. reschedule_reservation — null the meeting_* fields so the notify workflow
--     regenerates the Daily room (was reusing the stale/expired room + URL).
--  3. invoices.send_lock_at — a send mutex so a double-click / retry can't create
--     two Stripe invoices (double-charge).
--  4. credit_pricing — stop exposing our vendor cost / margin to anon (public
--     anon key) and to tenant users; only the service role (admin P&L) sees cost.
-- Idempotent.
-- =====================================================================

-- ── 1. notify_reservation_changed: DEFINER (keep) + full payload + guard ──────
create or replace function notify_reservation_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings   bolivai_settings%rowtype;
  v_tenant     tenants%rowtype;
  v_event      text;
  v_payload    jsonb;
begin
  select * into v_settings from bolivai_settings where id = 1;

  if v_settings.notify_webhook_url is null
     or v_settings.notify_webhook_url = '' then
    return new;
  end if;

  if (TG_OP = 'INSERT') then
    v_event := 'reservation.created';
  elsif (TG_OP = 'UPDATE') then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      v_event := 'reservation.cancelled';
    elsif new.start_at <> old.start_at or new.slot_id is distinct from old.slot_id then
      v_event := 'reservation.rescheduled';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select * into v_tenant from tenants where id = new.tenant_id;
  if not found then
    return new;
  end if;

  if v_event = 'reservation.created'     and not v_tenant.notify_on_new_reservation then return new; end if;
  if v_event = 'reservation.rescheduled' and not v_tenant.notify_on_reschedule     then return new; end if;
  if v_event = 'reservation.cancelled'   and not v_tenant.notify_on_cancel         then return new; end if;

  -- Fire if the OWNER has a channel OR the CUSTOMER gave an email (customer
  -- confirmation/cancel email). step66 dropped the customer_email clause.
  if (v_tenant.notification_email is null or v_tenant.notification_email = '')
     and (v_tenant.notification_whatsapp_e164 is null or v_tenant.notification_whatsapp_e164 = '')
     and (new.customer_email is null or new.customer_email = '') then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'event',        v_event,
    'tenant_id',    new.tenant_id,
    'tenant_name',  v_tenant.name,
    'tenant_language',  v_tenant.language,
    'tenant_timezone',  v_tenant.timezone,
    'notification_email',         v_tenant.notification_email,
    'notification_whatsapp_e164', v_tenant.notification_whatsapp_e164,
    'support_email',              v_tenant.support_email,
    'support_whatsapp',           v_tenant.support_whatsapp,
    'reservation', jsonb_build_object(
      'id',                  new.id,
      'staff_id',            new.staff_id,
      'service_id',          new.service_id,
      'slot_id',             new.slot_id,
      'start_at',            new.start_at,
      'end_at',              new.end_at,
      'duration_minutes',    new.duration_minutes,
      'status',              new.status,
      'customer_name',       new.customer_name,
      'customer_email',      new.customer_email,
      'customer_phone',      new.customer_phone,
      'notes',               new.notes,
      'meeting_provider',    new.meeting_provider,
      'meeting_url',         new.meeting_url,
      'meeting_room_name',   new.meeting_room_name
    )
  );

  perform net.http_post(
    url     := v_settings.notify_webhook_url,
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-bolivai-secret', coalesce(v_settings.notify_shared_secret, '')
               ),
    body    := v_payload
  );

  return new;
end;
$$;

-- ── 2. reschedule_reservation: clear meeting_* so the room is regenerated ──────
create or replace function reschedule_reservation(
  p_reservation_id uuid,
  p_new_slot_id    uuid,
  p_duration_min   integer default null
)
returns reservations
language plpgsql
as $$
declare
  v_old      reservations%rowtype;
  v_new_slot calendar_slots%rowtype;
  v_duration int;
  v_updated  reservations%rowtype;
begin
  select * into v_old from reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reservation % not found', p_reservation_id;
  end if;
  if v_old.status not in ('confirmed', 'pending') then
    raise exception 'Cannot reschedule reservation in status %', v_old.status;
  end if;

  select * into v_new_slot from calendar_slots
  where id = p_new_slot_id and tenant_id = v_old.tenant_id and is_available = true
  for update;
  if not found then
    raise exception 'Target slot % not available', p_new_slot_id;
  end if;

  v_duration := coalesce(p_duration_min, v_old.duration_minutes);

  if v_old.slot_id is not null then
    update calendar_slots set is_available = true where id = v_old.slot_id;
  end if;
  update calendar_slots set is_available = false where id = p_new_slot_id;

  update reservations set
    slot_id           = p_new_slot_id,
    staff_id          = v_new_slot.staff_id,
    start_at          = v_new_slot.start_at,
    end_at            = v_new_slot.start_at + make_interval(mins => v_duration),
    duration_minutes  = v_duration,
    status            = 'confirmed',
    -- Clear the old room so notify_reservation_changed → the Daily workflow
    -- creates a fresh room (the old one's exp = old end_at + 300s is stale).
    meeting_provider  = null,
    meeting_url       = null,
    meeting_room_name = null
  where id = p_reservation_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- ── 3. invoices send mutex (prevents double-send → double Stripe invoice) ─────
alter table public.invoices add column if not exists send_lock_at timestamptz;

-- ── 4. credit_pricing: hide vendor cost / margin from anon + tenant users ─────
-- The old policy was `to anon,authenticated using(true)` → anyone with the public
-- anon key could read cost_per_unit_micros / vendor_cost_micros (our margins).
revoke select on public.credit_pricing from anon;
drop policy if exists credit_pricing_select_all on public.credit_pricing;
drop policy if exists credit_pricing_select_auth on public.credit_pricing;
create policy credit_pricing_select_auth on public.credit_pricing
  for select to authenticated using (true);
-- Tenants may see what they PAY (credits_per_unit) but never our cost/margin.
revoke select on public.credit_pricing from authenticated;
grant select (action_key, credits_per_unit, unit_label, description, updated_at)
  on public.credit_pricing to authenticated;
-- Admin P&L reads cost via the service role (createServiceClient) — unaffected.
grant all on public.credit_pricing to service_role;
