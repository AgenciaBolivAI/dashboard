-- =====================================================================
-- BolivAI — Step 57: fix invoice number generation for the dashboard path.
--
-- next_invoice_number() was SECURITY INVOKER. step17 locked down
-- invoice_number_sequence (revoke all from authenticated). So when the
-- dashboard "Send invoice" flow (which runs as the authenticated user via
-- createClient) called the RPC, the INSERT/UPDATE on the sequence table was
-- denied → the function errored → the invoice shipped with no number
-- (status "open" but Number shows "(draft)"). The Stripe webhook path worked
-- only because it uses service_role.
--
-- Fix: SECURITY DEFINER so the body runs as the owner and bypasses the table
-- grant lockdown, regardless of caller. Lock search_path; restrict EXECUTE to
-- the two roles that legitimately mint numbers.
-- =====================================================================
create or replace function public.next_invoice_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  insert into public.invoice_number_sequence (tenant_id, year, next_seq)
    values (p_tenant_id, v_year, 1)
    on conflict (tenant_id, year)
    do update set next_seq = invoice_number_sequence.next_seq + 1
    returning next_seq into v_seq;

  return 'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number(uuid) from public;
grant execute on function public.next_invoice_number(uuid) to authenticated, service_role;
