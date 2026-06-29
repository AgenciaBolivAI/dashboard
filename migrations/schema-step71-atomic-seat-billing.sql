-- =====================================================================
-- BolivAI — Step 71: atomic seat billing (no double-charge / no re-charge)
-- =====================================================================
-- billTenantSeats() did read-seats_charged → debit → add_seat_charge as THREE
-- separate steps. Two concurrent ticks could both read the same `seats_charged`
-- and both debit (double charge); and if the ledger bump failed AFTER the debit
-- (the app only warned), the next tick saw the old `seats_charged` and charged
-- again. This folds check + debit + bump into ONE transaction under a row lock
-- on seat_charges, so the debit and the ledger bump commit together (or not at
-- all). Idempotent per (tenant, period). Service-role only.
-- =====================================================================

create or replace function public.bill_tenant_seats(p_tenant_id uuid, p_period text, p_billable integer)
returns table(ok boolean, due integer, charged integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already integer;
  v_due     integer;
  v_debit   record;
begin
  -- Serialize on this tenant+period's ledger row (lock it FOR UPDATE).
  insert into public.seat_charges (tenant_id, period, seats_charged)
    values (p_tenant_id, p_period, 0)
    on conflict (tenant_id, period) do nothing;
  select seats_charged into v_already
    from public.seat_charges
    where tenant_id = p_tenant_id and period = p_period
    for update;

  v_due := greatest(0, p_billable - coalesce(v_already, 0));
  if v_due <= 0 then
    return query select true, 0, 0, null::text;
    return;
  end if;

  -- Debit inside this transaction (debit_credits locks credit_accounts + logs
  -- the ledger row). If it fails, nothing is committed → no charge, no bump.
  select * into v_debit
    from public.debit_credits(p_tenant_id, 'seat_fee', v_due, null,
      jsonb_build_object('kind', 'seat_monthly', 'period', p_period));
  if not coalesce(v_debit.ok, false) then
    return query select false, v_due, 0, coalesce(v_debit.reason, 'debit_failed');
    return;
  end if;

  -- Bump the ledger in the SAME transaction — commits atomically with the debit.
  update public.seat_charges
    set seats_charged = seats_charged + v_due, updated_at = now()
    where tenant_id = p_tenant_id and period = p_period;

  return query select true, v_due, v_due, null::text;
end;
$$;

revoke all on function public.bill_tenant_seats(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.bill_tenant_seats(uuid, text, integer) to service_role;
