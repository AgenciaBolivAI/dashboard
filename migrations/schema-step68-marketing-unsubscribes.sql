-- =====================================================================
-- BolivAI — Step 68: Marketing unsubscribe / suppression list — P2
-- =====================================================================
-- Compliance (CAN-SPAM / GDPR / TCPA): every marketing send carries an opt-out
-- link, and a recipient who opts out must never be messaged again. This is the
-- per-tenant suppression list, keyed by ADDRESS (canonical: lowercased email OR
-- digits-only phone) so it covers a person whether they're a lead or a customer
-- and across the channel that uses that address.
--
-- Filtered at TWO points: at enrollment (resolveAudience excludes suppressed) and
-- at send time in the tick (catches anyone who opts out between approve + send).
-- Written by the public unsubscribe route via the SERVICE role (no anon access).
-- =====================================================================

create table if not exists public.marketing_unsubscribes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  address    text not null,            -- canonical: lower(email) OR digits(phone)
  channel    text,                     -- channel they opted out from (info only)
  source     text,                     -- 'link' | 'one_click' | 'manual'
  message_id uuid,                     -- the message that carried the opt-out (audit)
  created_at timestamptz not null default now(),
  unique (tenant_id, address)
);
create index if not exists idx_marketing_unsub_tenant
  on public.marketing_unsubscribes (tenant_id, address);

-- RLS — members READ (compliance view / future suppression UI); writes via the
-- service role (the public unsubscribe route + any admin tooling).
alter table public.marketing_unsubscribes enable row level security;

drop policy if exists "marketing_unsub_member_select" on public.marketing_unsubscribes;
create policy "marketing_unsub_member_select" on public.marketing_unsubscribes
  for select to authenticated using (public.is_member_of(tenant_id));

revoke insert, update, delete, truncate on public.marketing_unsubscribes from anon, authenticated;
grant select on public.marketing_unsubscribes to authenticated;
grant all on public.marketing_unsubscribes to service_role;
