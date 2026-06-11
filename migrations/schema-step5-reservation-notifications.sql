-- =====================================================================
-- BolivAI — Step 5: Tenant reservation notifications + reschedule/cancel
-- =====================================================================
-- Apply AFTER schema-step4-no-overlap-slots.sql.
--
-- What this migration does:
--   1. Adds notification_email + notification_whatsapp_e164 to tenants
--      (where the OWNER receives reservation alerts — different from
--      support_email/support_whatsapp which the agent gives to CUSTOMERS).
--   2. Adds bolivai_settings table for global config (notification webhook
--      URL + shared secret used by the notify trigger).
--   3. Adds reschedule_reservation() and cancel_reservation() RPCs.
--   4. Adds a trigger that fires on reservation insert/update and POSTs
--      to the n8n notification webhook via pg_net (Supabase extension).
--      Covers ALL reservation paths: agent, dashboard manual, REST API.
--
-- Idempotent — safe to re-run.
-- =====================================================================

create extension if not exists pg_net;

-- ─── 1. Tenant notification settings ────────────────────────────────
alter table tenants
  add column if not exists notification_email          text,
  add column if not exists notification_whatsapp_e164  text,
  add column if not exists notify_on_new_reservation   boolean not null default true,
  add column if not exists notify_on_reschedule        boolean not null default true,
  add column if not exists notify_on_cancel            boolean not null default true;

comment on column tenants.notification_email is
  'Email address where the tenant owner receives reservation alerts. Distinct from support_email (which the agent gives to customers).';
comment on column tenants.notification_whatsapp_e164 is
  'E.164 phone number where the tenant owner receives WhatsApp reservation alerts (via Evolution).';

-- ─── 2. Global notification config ──────────────────────────────────
-- Stored in a singleton row so the trigger can find the webhook URL +
-- shared secret without an env var (pg_net runs inside Postgres; it has
-- no access to the n8n env). Seed with a placeholder; ops updates it.
create table if not exists bolivai_settings (
  id              int primary key default 1,
  notify_webhook_url   text,
  notify_shared_secret text,
  updated_at      timestamptz not null default now(),
  constraint bolivai_settings_singleton check (id = 1)
);

insert into bolivai_settings (id) values (1)
  on conflict (id) do nothing;

-- ─── 3. reschedule_reservation() ────────────────────────────────────
-- Moves a reservation to a new slot atomically. Frees the old slot,
-- locks the new slot, updates start_at/end_at/duration. Returns the
-- updated reservations row.

create or replace function reschedule_reservation (
  p_reservation_id uuid,
  p_new_slot_id    uuid,
  p_duration_min   int default null
) returns reservations language plpgsql as $$
declare
  v_old          reservations%rowtype;
  v_new_slot     calendar_slots%rowtype;
  v_duration     int;
  v_updated      reservations%rowtype;
begin
  -- Lock the existing reservation
  select * into v_old from reservations
  where id = p_reservation_id for update;

  if not found then
    raise exception 'Reservation % not found', p_reservation_id;
  end if;

  if v_old.status not in ('confirmed', 'pending') then
    raise exception 'Cannot reschedule reservation in status %', v_old.status;
  end if;

  -- Lock the target slot
  select * into v_new_slot from calendar_slots
  where id = p_new_slot_id
    and tenant_id = v_old.tenant_id
    and is_available = true
  for update;

  if not found then
    raise exception 'Target slot % not available', p_new_slot_id;
  end if;

  v_duration := coalesce(p_duration_min, v_old.duration_minutes);

  -- Free the old slot (if it still exists)
  if v_old.slot_id is not null then
    update calendar_slots
      set is_available = true
      where id = v_old.slot_id;
  end if;

  -- Lock the new slot
  update calendar_slots
    set is_available = false
    where id = p_new_slot_id;

  -- Move the reservation
  update reservations set
    slot_id          = p_new_slot_id,
    staff_id         = v_new_slot.staff_id,
    start_at         = v_new_slot.start_at,
    end_at           = v_new_slot.start_at + make_interval(mins => v_duration),
    duration_minutes = v_duration,
    status           = 'confirmed'
  where id = p_reservation_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- ─── 4. cancel_reservation() ────────────────────────────────────────
create or replace function cancel_reservation (
  p_reservation_id uuid,
  p_reason         text default null
) returns reservations language plpgsql as $$
declare
  v_old      reservations%rowtype;
  v_updated  reservations%rowtype;
begin
  select * into v_old from reservations
  where id = p_reservation_id for update;

  if not found then
    raise exception 'Reservation % not found', p_reservation_id;
  end if;

  if v_old.status = 'cancelled' then
    return v_old;  -- already cancelled; idempotent
  end if;

  update reservations set
    status = 'cancelled',
    notes  = case
               when p_reason is null then notes
               when notes is null    then 'Cancelled: ' || p_reason
               else notes || E'\n\nCancelled: ' || p_reason
             end
  where id = p_reservation_id
  returning * into v_updated;

  -- Free the slot
  if v_old.slot_id is not null then
    update calendar_slots
      set is_available = true
      where id = v_old.slot_id;
  end if;

  return v_updated;
end;
$$;

-- ─── 5. Notification trigger ────────────────────────────────────────
-- Fires on reservation insert (new booking) or status change
-- (reschedule / cancel). POSTs to the configured webhook via pg_net.
-- The webhook (n8n workflow `reservation-notify.json`) looks up the
-- tenant's notification_email + notification_whatsapp_e164 and sends.

create or replace function notify_reservation_changed()
returns trigger language plpgsql as $$
declare
  v_settings   bolivai_settings%rowtype;
  v_tenant     tenants%rowtype;
  v_event      text;
  v_payload    jsonb;
begin
  select * into v_settings from bolivai_settings where id = 1;

  -- No webhook configured → no-op. The migration ships with NULL so
  -- the system is dormant until ops sets the URL.
  if v_settings.notify_webhook_url is null
     or v_settings.notify_webhook_url = '' then
    return new;
  end if;

  -- Resolve the event type
  if (TG_OP = 'INSERT') then
    v_event := 'reservation.created';
  elsif (TG_OP = 'UPDATE') then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      v_event := 'reservation.cancelled';
    elsif new.start_at <> old.start_at or new.slot_id is distinct from old.slot_id then
      v_event := 'reservation.rescheduled';
    else
      return new;  -- non-notable update
    end if;
  else
    return new;
  end if;

  -- Look up tenant + filter by per-event opt-in flags
  select * into v_tenant from tenants where id = new.tenant_id;
  if not found then
    return new;
  end if;

  if v_event = 'reservation.created'    and not v_tenant.notify_on_new_reservation then return new; end if;
  if v_event = 'reservation.rescheduled' and not v_tenant.notify_on_reschedule    then return new; end if;
  if v_event = 'reservation.cancelled'  and not v_tenant.notify_on_cancel        then return new; end if;

  -- Skip if the tenant has neither channel configured
  if (v_tenant.notification_email is null or v_tenant.notification_email = '')
     and (v_tenant.notification_whatsapp_e164 is null or v_tenant.notification_whatsapp_e164 = '') then
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
    'reservation', jsonb_build_object(
      'id',               new.id,
      'staff_id',         new.staff_id,
      'service_id',       new.service_id,
      'slot_id',          new.slot_id,
      'start_at',         new.start_at,
      'end_at',           new.end_at,
      'duration_minutes', new.duration_minutes,
      'status',           new.status,
      'customer_name',    new.customer_name,
      'customer_email',   new.customer_email,
      'customer_phone',   new.customer_phone,
      'notes',            new.notes
    )
  );

  -- Fire-and-forget HTTP POST. pg_net returns a request id; we do not
  -- block the transaction on the response.
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

drop trigger if exists reservation_notify on reservations;
create trigger reservation_notify
  after insert or update on reservations
  for each row execute function notify_reservation_changed();

-- ─── 6. RLS for bolivai_settings ────────────────────────────────────
-- Singleton row; only platform admins (bolivai_admins) can read or write.
alter table bolivai_settings enable row level security;

drop policy if exists "bolivai_settings: admin read" on bolivai_settings;
create policy "bolivai_settings: admin read"
  on bolivai_settings for select
  to authenticated
  using (exists (select 1 from bolivai_admins where user_id = auth.uid()));

drop policy if exists "bolivai_settings: admin write" on bolivai_settings;
create policy "bolivai_settings: admin write"
  on bolivai_settings for all
  to authenticated
  using (exists (select 1 from bolivai_admins where user_id = auth.uid()))
  with check (exists (select 1 from bolivai_admins where user_id = auth.uid()));
