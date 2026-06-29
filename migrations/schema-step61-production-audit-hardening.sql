-- schema-step61: Production audit hardening (2026-06-28)
-- Closes live findings verified against prod during the full platform audit.
-- All changes verified non-breaking against current dashboard query paths
-- (secret columns are read only via the service-role client; getTenantBySlug
-- selects gateway_config but NOT voice_phone_auth_token).

begin;

-- C1: hide tenant_integrations OAuth/SMTP secrets from anon/authenticated.
-- Reads of access_token/refresh_token happen ONLY via the service client
-- (app/dashboard/[tenantSlug]/settings/integrations/page.tsx). A later broad
-- table grant had re-exposed these to the authenticated (browser) role.
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema='public' and table_name='tenant_integrations'
    and column_name not in ('access_token','refresh_token');
  execute 'revoke select on public.tenant_integrations from anon, authenticated';
  execute format('grant select (%s) on public.tenant_integrations to anon, authenticated', cols);
end $$;

-- M3: hide tenant_channels.config (holds Meta page/verify tokens) from
-- anon/authenticated. content/page.tsx (authenticated) selects only
-- "channel, status"; config is read only via the service client.
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema='public' and table_name='tenant_channels'
    and column_name not in ('config');
  execute 'revoke select on public.tenant_channels from anon, authenticated';
  execute format('grant select (%s) on public.tenant_channels to anon, authenticated', cols);
end $$;

-- M2: hide internal cost/margin columns of credit_pricing from anon/authenticated.
-- credit_pricing has a USING(true) read policy (customer pricing is public),
-- but cost_per_unit_micros + vendor_cost_micros are our vendor cost / margin and
-- were readable with the public anon key. App reads costs only via service client.
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema='public' and table_name='credit_pricing'
    and column_name not in ('cost_per_unit_micros','vendor_cost_micros');
  execute 'revoke select on public.credit_pricing from anon, authenticated';
  execute format('grant select (%s) on public.credit_pricing to anon, authenticated', cols);
end $$;

-- C2 (partial / restore): re-hide tenants.voice_phone_auth_token, which a later
-- broad table grant had re-exposed (undoing step49). getTenantBySlug does NOT
-- select this column, so hiding is safe. gateway_config is intentionally kept
-- readable (getTenantBySlug needs it); it currently holds NO secrets (all 8
-- tenants are Evolution = {instance} only). Tokens must never be stored there.
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema='public' and table_name='tenants'
    and column_name <> 'voice_phone_auth_token';
  execute 'revoke select on public.tenants from anon, authenticated';
  execute format('grant select (%s) on public.tenants to anon, authenticated', cols);
end $$;

-- H3: brain.aima_stats(text) hardcodes the BolivAI tenant and is SECURITY DEFINER
-- (bypasses RLS). It was EXECUTE-able by anon/authenticated. Lock to service_role.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='brain' and p.proname='aima_stats') then
    execute 'revoke all on function brain.aima_stats(text) from public, anon, authenticated';
    execute 'grant execute on function brain.aima_stats(text) to service_role';
  end if;
end $$;

-- H5: tenant deletion must NOT cascade-wipe the financial audit trail.
-- Change the credit ledger + invoices FKs from ON DELETE CASCADE to RESTRICT,
-- so a tenant with financial history cannot be silently hard-deleted.
alter table public.invoices            drop constraint if exists invoices_tenant_id_fkey;
alter table public.invoices            add  constraint invoices_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete restrict;
alter table public.credit_accounts     drop constraint if exists credit_accounts_tenant_id_fkey;
alter table public.credit_accounts     add  constraint credit_accounts_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete restrict;
alter table public.credit_transactions drop constraint if exists credit_transactions_tenant_id_fkey;
alter table public.credit_transactions add  constraint credit_transactions_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete restrict;

-- M5: next_invoice_number(uuid) is SECURITY DEFINER + EXECUTE-granted to
-- authenticated, with no check that the caller belongs to p_tenant_id — an
-- authenticated user could advance another tenant's invoice sequence. Add a gate.
create or replace function public.next_invoice_number(p_tenant_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  if not (
    public.is_member_of(p_tenant_id)
    or coalesce((nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role'),'') = 'service_role'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.invoice_number_sequence (tenant_id, year, next_seq)
    values (p_tenant_id, v_year, 1)
    on conflict (tenant_id, year)
    do update set next_seq = invoice_number_sequence.next_seq + 1
    returning next_seq into v_seq;

  return 'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$function$;

-- M6: drop ccavai_drafts.tenant_id hardcoded-BolivAI default (keep NOT NULL).
-- The CCAVAI tick "Insert Drafts" node sets tenant_id explicitly, so dropping the
-- default is safe; an omitted tenant_id now fails loudly instead of silently
-- mis-attributing another tenant's draft to BolivAI.
alter table public.ccavai_drafts alter column tenant_id drop default;

commit;
