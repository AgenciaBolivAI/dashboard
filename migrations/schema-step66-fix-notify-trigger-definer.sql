-- =====================================================================
-- BolivAI — Step 66: fix reservation notify trigger (SECURITY DEFINER)
-- =====================================================================
-- REGRESSION FIX. step61's security hardening re-hid secret columns on
-- `tenants` (voice_phone_auth_token, gateway_config) by revoking table-level
-- SELECT from `authenticated` and granting only the non-secret columns. But
-- `notify_reservation_changed()` (step5) is SECURITY INVOKER and does
-- `select * from tenants` — so when a dashboard MEMBER cancels/reschedules a
-- reservation (RLS-bound client), the trigger runs as that member and the
-- `select *` is DENIED ("permission denied for table tenants") → the whole
-- cancel/reschedule transaction fails. Bookings still worked because they go
-- through the service client (which bypasses this).
--
-- Fix: make the trigger SECURITY DEFINER (like step60's notify_new_reservation),
-- so it reads tenants/bolivai_settings with the function owner's privileges. It
-- only READS a few non-secret columns + fires an HTTP POST — no user-controlled
-- writes — so DEFINER is safe. `set search_path = public` per DEFINER hygiene.
-- Idempotent.
-- =====================================================================

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
