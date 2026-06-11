-- =====================================================================
-- BolivAI — Credit-based usage billing
-- =====================================================================
-- Pay-as-you-go model. Tenants top up credits via Stripe Checkout, then
-- every billable agent action atomically debits credits via the
-- debit_credits RPC. Voice calls pre-reserve a minimum balance so a
-- 20-minute conversation never ends mid-sentence because of a low fund.
--
-- $1 = 100 credits (1 credit = 1¢). All pricing in credit_pricing is
-- editable without code deploy.
--
-- Tables:
--   credit_accounts          — one row per tenant, balance + reserved + lifetime totals
--   credit_transactions      — append-only ledger (source of truth; balance derived but cached)
--   credit_pricing           — action_key → credits_per_unit
--
-- RPCs:
--   debit_credits(...)       — atomic spend; returns ok=false if insufficient
--   reserve_credits(...)     — hold balance for in-flight call/job
--   release_credits(...)     — finalise reservation (commit + release leftover)
--   credit_topup(...)        — apply Stripe payment to balance; idempotent on stripe_pi_id
--   tenant_balance(...)      — balance + reserved + available (read-only view)
--
-- Seed: pricing table populated with the launch pricing sheet.
-- Idempotent.
-- =====================================================================

-- ── Tables ──────────────────────────────────────────────────────────
create table if not exists public.credit_accounts (
  tenant_id                uuid primary key references public.tenants(id) on delete cascade,
  balance_credits          bigint not null default 0
                             check (balance_credits >= 0),
  reserved_credits         bigint not null default 0
                             check (reserved_credits >= 0),
  lifetime_topped_up_cents bigint not null default 0,
  lifetime_spent_credits   bigint not null default 0,
  low_balance_threshold    bigint not null default 500,
  out_of_credits_at        timestamptz,                  -- set when balance hits 0; cleared on next top-up
  auto_refill_enabled      boolean not null default false,
  auto_refill_amount_cents int,
  auto_refill_trigger      bigint not null default 200,
  stripe_customer_id       text,
  default_payment_method   text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  type              text not null check (type in
    ('top_up','usage','reservation','release','refund','bonus','reversal','manual_adjust')),
  credits_delta     bigint not null,
  balance_after     bigint not null,
  action_key        text,
  reference_id      text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_credit_tx_tenant_time
  on public.credit_transactions (tenant_id, created_at desc);
create index if not exists idx_credit_tx_reference
  on public.credit_transactions (reference_id)
  where reference_id is not null;
-- Unique constraint per (tenant, stripe_pi_id) on top_up rows enforces
-- idempotency for Stripe webhook retries.
create unique index if not exists ux_credit_tx_topup_ref
  on public.credit_transactions (tenant_id, reference_id)
  where type = 'top_up';

create table if not exists public.credit_pricing (
  action_key       text primary key,
  credits_per_unit bigint not null check (credits_per_unit >= 0),
  unit_label       text not null,
  description      text,
  updated_at       timestamptz not null default now()
);

-- ── Seed pricing ────────────────────────────────────────────────────
insert into public.credit_pricing (action_key, credits_per_unit, unit_label, description) values
  ('whatsapp.agent_turn',           5,   'turn',     'One round-trip: customer msg → agent LLM reply via Evolution.'),
  ('voice.inbound.minute',          70,  'minute',   'Active inbound voice call minute (Rebecca pattern).'),
  ('voice.inbound.reservation',     500, 'reservation', 'Minimum balance reserved before answering an inbound call.'),
  ('voice.outbound.minute',         100, 'minute',   'Active outbound voice call minute (Sandra pattern).'),
  ('voice.outbound.connected_call', 20,  'call',     'One-time charge when an outbound dial connects to a human.'),
  ('voice.outbound.no_answer',      5,   'call',     'No-answer / voicemail outcome.'),
  ('content.draft_per_platform',    5,   'draft',    'One platform-specific draft from CCAVAI.'),
  ('content.branded_image',         25,  'image',    'gpt-image-1 subject + Satori brand composite.'),
  ('marketing.lead_scraped_diy',    1,   'lead',     'Lead found via the DIY scraper (no per-lead API cost).'),
  ('marketing.lead_scraped_apollo', 3,   'lead',     'Lead found via Apollo API.'),
  ('marketing.cold_email_sent',     5,   'email',    'Cold email sent via Instantly.'),
  ('calendar.appointment_booked',   5,   'booking',  'Reservation created by an agent.'),
  ('invoice.sent',                  10,  'invoice',  'Stripe invoice created + sent through agent.'),
  ('video.meeting_minute',          1,   'minute',   'Active minute in a Daily.co room.'),
  ('knowledge.kb_sync',             5,   'sync',     'Knowledge base re-index pushed to voice agents.')
on conflict (action_key) do nothing;

-- ── RPCs ───────────────────────────────────────────────────────────
-- 1) debit_credits — atomic spend
create or replace function public.debit_credits(
  p_tenant_id    uuid,
  p_action_key   text,
  p_units        int default 1,
  p_reference_id text default null,
  p_metadata     jsonb default '{}'::jsonb
) returns table (
  ok              boolean,
  balance_after   bigint,
  credits_debited bigint,
  reason          text
)
language plpgsql
security definer
as $$
declare
  v_credits_per_unit bigint;
  v_total            bigint;
  v_balance          bigint;
  v_reserved         bigint;
  v_available        bigint;
begin
  if p_units < 1 then
    return query select false, 0::bigint, 0::bigint, 'p_units must be >= 1';
    return;
  end if;

  select credits_per_unit into v_credits_per_unit
  from public.credit_pricing where action_key = p_action_key;
  if v_credits_per_unit is null then
    return query select false, 0::bigint, 0::bigint, format('Unknown action_key: %s', p_action_key);
    return;
  end if;
  v_total := v_credits_per_unit * p_units;

  -- Auto-provision an account row on first usage so callers don't have to
  insert into public.credit_accounts (tenant_id)
    values (p_tenant_id) on conflict (tenant_id) do nothing;

  select balance_credits, reserved_credits into v_balance, v_reserved
  from public.credit_accounts where tenant_id = p_tenant_id for update;
  v_available := v_balance - v_reserved;

  if v_available < v_total then
    -- Mark out_of_credits_at so dashboard/banners light up
    update public.credit_accounts
       set out_of_credits_at = coalesce(out_of_credits_at, now()),
           updated_at = now()
     where tenant_id = p_tenant_id;
    return query select false, v_balance, 0::bigint,
      format('Insufficient credits (need %s, available %s)', v_total, v_available);
    return;
  end if;

  update public.credit_accounts
     set balance_credits        = balance_credits - v_total,
         lifetime_spent_credits = lifetime_spent_credits + v_total,
         updated_at             = now()
   where tenant_id = p_tenant_id;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, action_key, reference_id, metadata)
  values
    (p_tenant_id, 'usage', -v_total, v_balance - v_total, p_action_key, p_reference_id, p_metadata);

  return query select true, v_balance - v_total, v_total, null::text;
end;
$$;

-- 2) reserve_credits — hold balance for in-flight voice call
create or replace function public.reserve_credits(
  p_tenant_id    uuid,
  p_action_key   text,           -- e.g. 'voice.inbound.reservation'
  p_units        int default 1,
  p_reference_id text default null
) returns table (
  ok              boolean,
  reservation_id  text,
  balance_after   bigint,
  reserved_after  bigint,
  reason          text
)
language plpgsql
security definer
as $$
declare
  v_credits_per_unit bigint;
  v_total            bigint;
  v_balance          bigint;
  v_reserved         bigint;
  v_available        bigint;
  v_reservation_id   text;
begin
  select credits_per_unit into v_credits_per_unit
  from public.credit_pricing where action_key = p_action_key;
  if v_credits_per_unit is null then
    return query select false, null::text, 0::bigint, 0::bigint, format('Unknown action_key: %s', p_action_key);
    return;
  end if;
  v_total := v_credits_per_unit * p_units;

  insert into public.credit_accounts (tenant_id)
    values (p_tenant_id) on conflict (tenant_id) do nothing;

  select balance_credits, reserved_credits into v_balance, v_reserved
  from public.credit_accounts where tenant_id = p_tenant_id for update;
  v_available := v_balance - v_reserved;

  if v_available < v_total then
    return query select false, null::text, v_balance, v_reserved,
      format('Insufficient credits to reserve (need %s, available %s)', v_total, v_available);
    return;
  end if;

  v_reservation_id := coalesce(p_reference_id, gen_random_uuid()::text);

  update public.credit_accounts
     set reserved_credits = reserved_credits + v_total,
         updated_at = now()
   where tenant_id = p_tenant_id;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, action_key, reference_id, metadata)
  values
    (p_tenant_id, 'reservation', 0, v_balance, p_action_key, v_reservation_id,
     jsonb_build_object('reserved', v_total));

  return query select true, v_reservation_id, v_balance, v_reserved + v_total, null::text;
end;
$$;

-- 3) release_credits — settle a reservation: commit the used portion, release the rest
create or replace function public.release_credits(
  p_tenant_id    uuid,
  p_reservation_id text,
  p_action_key   text,            -- the per-unit cost to actually charge (e.g. 'voice.inbound.minute')
  p_units        int default 1
) returns table (
  ok              boolean,
  balance_after   bigint,
  credits_charged bigint,
  reason          text
)
language plpgsql
security definer
as $$
declare
  v_credits_per_unit bigint;
  v_total_charge     bigint;
  v_reserved_amount  bigint;
  v_balance          bigint;
  v_reserved         bigint;
begin
  -- Look up the reservation
  select (metadata->>'reserved')::bigint into v_reserved_amount
  from public.credit_transactions
  where reference_id = p_reservation_id and type = 'reservation'
  order by created_at desc limit 1;
  if v_reserved_amount is null then
    return query select false, 0::bigint, 0::bigint, format('Reservation not found: %s', p_reservation_id);
    return;
  end if;

  select credits_per_unit into v_credits_per_unit
  from public.credit_pricing where action_key = p_action_key;
  if v_credits_per_unit is null then
    return query select false, 0::bigint, 0::bigint, format('Unknown action_key: %s', p_action_key);
    return;
  end if;
  v_total_charge := least(v_credits_per_unit * p_units, v_reserved_amount);

  select balance_credits, reserved_credits into v_balance, v_reserved
  from public.credit_accounts where tenant_id = p_tenant_id for update;

  update public.credit_accounts
     set balance_credits        = balance_credits - v_total_charge,
         reserved_credits       = greatest(reserved_credits - v_reserved_amount, 0),
         lifetime_spent_credits = lifetime_spent_credits + v_total_charge,
         updated_at             = now()
   where tenant_id = p_tenant_id;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, action_key, reference_id, metadata)
  values
    (p_tenant_id, 'release', -v_total_charge, v_balance - v_total_charge, p_action_key, p_reservation_id,
     jsonb_build_object('reserved_returned', v_reserved_amount - v_total_charge, 'units', p_units));

  return query select true, v_balance - v_total_charge, v_total_charge, null::text;
end;
$$;

-- 4) credit_topup — apply Stripe payment to tenant balance (idempotent on stripe_pi_id)
create or replace function public.credit_topup(
  p_tenant_id     uuid,
  p_paid_cents    bigint,
  p_bonus_credits bigint default 0,
  p_stripe_pi_id  text default null,
  p_metadata      jsonb default '{}'::jsonb
) returns table (
  new_balance     bigint,
  credits_added   bigint,
  was_idempotent  boolean
)
language plpgsql
security definer
as $$
declare
  v_base_credits  bigint;
  v_total         bigint;
  v_balance       bigint;
begin
  if p_paid_cents <= 0 then
    return query select 0::bigint, 0::bigint, false;
    return;
  end if;

  -- Idempotency: if we've already credited this Stripe payment, return current balance
  if p_stripe_pi_id is not null and exists (
    select 1 from public.credit_transactions
    where tenant_id = p_tenant_id
      and reference_id = p_stripe_pi_id
      and type = 'top_up'
  ) then
    select balance_credits into v_balance
    from public.credit_accounts where tenant_id = p_tenant_id;
    return query select coalesce(v_balance, 0::bigint), 0::bigint, true;
    return;
  end if;

  v_base_credits := p_paid_cents;       -- $1 (100¢) = 100 credits
  v_total        := v_base_credits + greatest(p_bonus_credits, 0);

  insert into public.credit_accounts (tenant_id, balance_credits, lifetime_topped_up_cents)
  values (p_tenant_id, v_total, p_paid_cents)
  on conflict (tenant_id) do update
    set balance_credits          = public.credit_accounts.balance_credits + excluded.balance_credits,
        lifetime_topped_up_cents = public.credit_accounts.lifetime_topped_up_cents + excluded.lifetime_topped_up_cents,
        out_of_credits_at        = null,    -- top-up always clears the OoC flag
        updated_at               = now();

  select balance_credits into v_balance
  from public.credit_accounts where tenant_id = p_tenant_id;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, reference_id, metadata)
  values
    (p_tenant_id, 'top_up', v_total, v_balance, p_stripe_pi_id,
     p_metadata || jsonb_build_object(
       'paid_cents',    p_paid_cents,
       'base_credits',  v_base_credits,
       'bonus_credits', p_bonus_credits
     ));

  return query select v_balance, v_total, false;
end;
$$;

-- 5) tenant_balance — read-only convenience for the dashboard widget
create or replace function public.tenant_balance(p_tenant_id uuid)
returns table (
  balance_credits        bigint,
  reserved_credits       bigint,
  available_credits      bigint,
  lifetime_topped_up_cents bigint,
  lifetime_spent_credits bigint,
  low_balance_threshold  bigint,
  out_of_credits_at      timestamptz,
  is_low                 boolean,
  is_zero                boolean
)
language sql
security definer
as $$
  select
    a.balance_credits,
    a.reserved_credits,
    (a.balance_credits - a.reserved_credits) as available_credits,
    a.lifetime_topped_up_cents,
    a.lifetime_spent_credits,
    a.low_balance_threshold,
    a.out_of_credits_at,
    (a.balance_credits - a.reserved_credits) <= a.low_balance_threshold as is_low,
    (a.balance_credits - a.reserved_credits) <= 0 as is_zero
  from public.credit_accounts a
  where a.tenant_id = p_tenant_id;
$$;

-- ── Backfill: every existing tenant gets a zero-balance account row ─
insert into public.credit_accounts (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

comment on function public.debit_credits is
  'Atomically debit credits for an action. Returns ok=false if insufficient. Auto-provisions credit_accounts row on first call.';
comment on function public.reserve_credits is
  'Hold a balance amount before a long-running action (voice call). Pair with release_credits on completion.';
comment on function public.release_credits is
  'Settle a reservation: commit the actually-used credits, return the rest to available balance.';
comment on function public.credit_topup is
  'Apply a Stripe payment to a tenant balance. Idempotent on p_stripe_pi_id.';
comment on function public.tenant_balance is
  'Read-only snapshot: balance + reserved + available + low/zero flags.';
