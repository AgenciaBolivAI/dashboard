-- =====================================================================
-- BolivAI — Step 60: in-dashboard notification system
-- =====================================================================
-- A tenant-scoped notifications feed surfaced by the header bell. A DB
-- trigger on `reservations` creates a notification for EVERY booking (agent
-- OR manual), so the owner is alerted regardless of source. The trigger is
-- exception-guarded so a notification failure can never roll back a booking.
-- =====================================================================

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null default 'system',     -- reservation | lead | system | ...
  title       text not null,
  body        text,
  href        text,                                -- dashboard link for the drill-in
  meta        jsonb not null default '{}',         -- structured detail for the "deeper glance"
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_tenant_created_idx on notifications (tenant_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (tenant_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select using (is_member_of(tenant_id));

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update using (is_member_of(tenant_id)) with check (is_member_of(tenant_id));

grant select, update on notifications to authenticated;

-- ── reservation INSERT → notification (covers agent + manual bookings) ──
create or replace function notify_new_reservation() returns trigger
  language plpgsql security definer as $$
declare
  v_slug text;
  v_tz   text;
begin
  begin
    select slug, coalesce(timezone, 'UTC') into v_slug, v_tz
    from tenants where id = new.tenant_id;

    insert into notifications (tenant_id, type, title, body, href, meta)
    values (
      new.tenant_id,
      'reservation',
      coalesce(nullif(new.customer_name, ''), 'Cliente'),
      to_char(new.start_at at time zone v_tz, 'YYYY-MM-DD HH24:MI'),
      '/dashboard/' || v_slug || '/calendar',
      jsonb_build_object(
        'reservation_id', new.id,
        'customer_name',  new.customer_name,
        'customer_email', new.customer_email,
        'customer_phone', new.customer_phone,
        'start_at',       new.start_at,
        'end_at',         new.end_at,
        'service_id',     new.service_id
      )
    );
  exception when others then
    -- never let a notification failure break the booking transaction
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_reservation on reservations;
create trigger trg_notify_new_reservation
  after insert on reservations
  for each row execute function notify_new_reservation();
