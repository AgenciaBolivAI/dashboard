-- =====================================================================
-- BolivAI — Step 54: per-seat billing.
-- Every account includes 2 seats; each extra team member costs US$5/month
-- (= 500 credits, since 1 credit = 1¢). The seat fee is debited from the
-- tenant's prepaid credit balance:
--   • at invite time for a billable seat (hard gate — blocked if the balance
--     can't cover it), and
--   • monthly by the seat-billing tick.
-- A per-(tenant, UTC month) ledger (seat_charges) makes both paths reconcile
-- to "each billable seat charged at most once per calendar month".
-- =====================================================================

-- 1) Pricing row — pure platform fee (cost_per_unit_micros/vendor default 0/{}).
insert into public.credit_pricing (action_key, credits_per_unit, unit_label, description)
values ('seat_fee', 500, 'seat-month', 'Extra team seat beyond the 2 included — billed monthly (US$5 = 500 credits).')
on conflict (action_key) do update
  set credits_per_unit = excluded.credits_per_unit,
      unit_label       = excluded.unit_label,
      description       = excluded.description,
      updated_at        = now();

-- 2) Per-tenant included (free) seats — admin can raise it for a customer.
alter table public.tenants
  add column if not exists included_seats int not null default 2;

-- 3) Mark which pending invitations already paid their seat fee (for refunds
--    on revoke + clarity). Defaults false; existing rows = unbilled.
alter table public.invitations
  add column if not exists seat_charged boolean not null default false;

-- 4) Idempotency ledger: how many seat-months a tenant has been charged in a
--    given calendar month (UTC). Invite-time bumps it +1; the monthly tick
--    tops it up to the current billable-seat count.
create table if not exists public.seat_charges (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  period        text not null,            -- 'YYYY-MM' (UTC)
  seats_charged int  not null default 0 check (seats_charged >= 0),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, period)
);
alter table public.seat_charges enable row level security;
revoke all on public.seat_charges from anon, authenticated;
grant all on public.seat_charges to service_role;

-- 5) Refund RPC — reverse a seat charge when a charged, still-pending invite is
--    revoked in the same month. Adds balance + a 'refund' ledger row. Internal
--    only (service_role); SECURITY DEFINER like the other credit RPCs.
create or replace function public.refund_credits(
  p_tenant_id    uuid,
  p_credits      bigint,
  p_action_key   text default 'seat_fee',
  p_reference_id text default null,
  p_metadata     jsonb default '{}'::jsonb
) returns table (
  ok            boolean,
  balance_after bigint
)
language plpgsql
security definer
as $$
declare
  v_balance bigint;
begin
  if p_credits <= 0 then
    return query select false, 0::bigint;
    return;
  end if;

  insert into public.credit_accounts (tenant_id)
    values (p_tenant_id) on conflict (tenant_id) do nothing;

  update public.credit_accounts
     set balance_credits        = balance_credits + p_credits,
         lifetime_spent_credits = greatest(0, lifetime_spent_credits - p_credits),
         out_of_credits_at      = null,
         updated_at             = now()
   where tenant_id = p_tenant_id
   returning balance_credits into v_balance;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, action_key, reference_id, metadata)
  values
    (p_tenant_id, 'refund', p_credits, v_balance, p_action_key, p_reference_id, p_metadata);

  return query select true, v_balance;
end;
$$;

revoke execute on function public.refund_credits(uuid, bigint, text, text, jsonb) from anon, authenticated;
grant  execute on function public.refund_credits(uuid, bigint, text, text, jsonb) to service_role;

-- 6) Atomic increment for the per-(tenant, month) seat ledger. Used by both the
--    invite-time charge (+1) and the monthly tick (+due), and refund (-1), so
--    concurrent calls can't lose an update. Returns the new running count
--    (floored at 0).
create or replace function public.add_seat_charge(
  p_tenant_id uuid,
  p_period    text,
  p_delta     int
) returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into public.seat_charges (tenant_id, period, seats_charged)
    values (p_tenant_id, p_period, greatest(0, p_delta))
  on conflict (tenant_id, period) do update
    set seats_charged = greatest(0, public.seat_charges.seats_charged + p_delta),
        updated_at    = now()
  returning seats_charged into v_count;
  return v_count;
end;
$$;

revoke execute on function public.add_seat_charge(uuid, text, int) from anon, authenticated;
grant  execute on function public.add_seat_charge(uuid, text, int) to service_role;
