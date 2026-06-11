-- =====================================================================
-- BolivAI — Step 7: chat_history idempotency + lookup_customer_reservation
-- =====================================================================
-- Two changes:
--   1. UNIQUE constraint on (conversation_id, evolution_message_id) so
--      retried Evolution webhooks can't insert duplicate user messages.
--   2. lookup_customer_reservation(p_tenant_id uuid, p_customer_phone text)
--      RPC that returns the customer's active reservations so the agent
--      has a way to find a reservation_id for reschedule/cancel without
--      having to ask the customer.
--
-- Safe to re-run. Idempotent.
-- =====================================================================

-- ─── 1. chat_history idempotency ────────────────────────────────────
-- Use a partial unique index instead of a constraint so existing NULL
-- evolution_message_id rows (assistant-generated chunks etc.) don't
-- collide on each other.
create unique index if not exists chat_history_evo_msg_uniq
  on chat_history (conversation_id, evolution_message_id)
  where evolution_message_id is not null;

-- ─── 2. lookup_customer_reservation() ───────────────────────────────
-- Returns the customer's CONFIRMED future reservations at this tenant.
-- The agent passes only the tenant_id; the customer phone comes from
-- the workflow's Extract Message node (their WhatsApp number).
-- p_request_reason is an unused parameter that exists ONLY so the n8n
-- toolHttpRequest can reference a {request_reason} placeholder in its
-- body — n8n's placeholder scanner only scans body/URL (not headers),
-- so we need a body field, and PostgREST rejects unknown RPC parameters.
-- The agent passes anything as request_reason (e.g. "cancel", "view").

-- Drop any previous overloads to avoid "function name is not unique" on COMMENT below.
drop function if exists lookup_customer_reservation(uuid, text);
drop function if exists lookup_customer_reservation(uuid, text, text);

create or replace function lookup_customer_reservation(
  p_tenant_id      uuid,
  p_customer_phone text,
  p_request_reason text default null
) returns table (
  reservation_id   uuid,
  slot_id          uuid,
  start_at         timestamptz,
  end_at           timestamptz,
  duration_minutes int,
  status           text,
  customer_name    text,
  customer_email   text,
  service_id       uuid
) language sql stable as $$
  select
    r.id,
    r.slot_id,
    r.start_at,
    r.end_at,
    r.duration_minutes,
    r.status,
    r.customer_name,
    r.customer_email,
    r.service_id
  from reservations r
  where r.tenant_id = p_tenant_id
    and r.status    = 'confirmed'
    and (
      r.customer_phone = p_customer_phone
      or r.customer_phone = '+' || regexp_replace(p_customer_phone, '^\+', '')
      or '+' || regexp_replace(r.customer_phone, '^\+', '') = p_customer_phone
    )
    and r.start_at >= now()
  order by r.start_at asc
  limit 5;
$$;

comment on function lookup_customer_reservation(uuid, text, text) is
  'Returns the customer''s confirmed future reservations at the given tenant. Used by the agent before reschedule_reservation / cancel_reservation. Matches on customer_phone with or without leading +. The p_request_reason parameter is unused — it exists only so the n8n tool can carry a {request_reason} placeholder in the request body.';
