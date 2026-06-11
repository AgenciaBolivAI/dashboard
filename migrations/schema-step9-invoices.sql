-- =====================================================================
-- BolivAI — Step 9: invoices + invoice line items
-- =====================================================================
-- Apply AFTER schema-step8-stripe-connect.sql.
--
-- Money is stored in CENTS (bigint). All UI converts. Subtotal/tax/total
-- are denormalized for fast list rendering; an UPDATE trigger keeps them
-- in sync from invoice_items.
-- =====================================================================

create extension if not exists "uuid-ossp";

create table if not exists invoices (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  reservation_id           uuid references reservations(id) on delete set null,

  -- Customer (denormalized — frozen at send time)
  customer_name            text,
  customer_email           text,
  customer_phone           text,
  customer_address         text,

  number                   text,                        -- "INV-2026-001" — set on send
  status                   text not null default 'draft',
                                                       -- draft|open|paid|void|uncollectible|past_due
  currency                 text not null default 'USD',
  subtotal_cents           bigint not null default 0,
  tax_cents                bigint not null default 0,
  total_cents              bigint not null default 0,
  amount_paid_cents        bigint not null default 0,
  application_fee_cents    bigint not null default 0,

  issue_date               date,
  due_date                 date,
  sent_at                  timestamptz,
  paid_at                  timestamptz,

  -- Stripe linkage (per tenant — these IDs live on the tenant's connected account)
  stripe_invoice_id        text,
  stripe_payment_link      text,
  stripe_subscription_id   text,
  stripe_customer_id       text,

  -- Recurring
  is_recurring             boolean not null default false,
  recurrence_interval      text,                        -- week|month|year
  recurrence_interval_count int default 1,
  recurrence_end_date      date,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint invoices_status_check check (status in
    ('draft','open','paid','void','uncollectible','past_due')),
  constraint invoices_recurrence_check check (
    recurrence_interval is null or recurrence_interval in ('week','month','year')
  )
);

create index if not exists invoices_tenant_status_idx on invoices(tenant_id, status, created_at desc);
create index if not exists invoices_stripe_invoice_idx on invoices(stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists invoices_reservation_idx on invoices(reservation_id) where reservation_id is not null;

create table if not exists invoice_items (
  id                  uuid primary key default uuid_generate_v4(),
  invoice_id          uuid not null references invoices(id) on delete cascade,
  position            int not null default 0,
  description         text not null,
  quantity            numeric(12,2) not null default 1,
  unit_price_cents    bigint not null default 0,
  tax_rate_bps        int not null default 0,  -- basis points (1900 = 19% IVA)
  amount_cents        bigint not null default 0,
  service_id          uuid references services(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id, position);

-- Trigger: recompute invoice totals whenever items change ──────────────
create or replace function recompute_invoice_totals()
returns trigger language plpgsql as $$
declare
  v_invoice_id uuid;
  v_subtotal bigint;
  v_tax      bigint;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select
    coalesce(sum(amount_cents), 0),
    coalesce(sum(round(amount_cents::numeric * tax_rate_bps / 10000)), 0)
  into v_subtotal, v_tax
  from invoice_items
  where invoice_id = v_invoice_id;

  update invoices
    set subtotal_cents = v_subtotal,
        tax_cents      = v_tax,
        total_cents    = v_subtotal + v_tax,
        updated_at     = now()
    where id = v_invoice_id;

  return null;
end;
$$;

drop trigger if exists invoice_items_recompute on invoice_items;
create trigger invoice_items_recompute
  after insert or update or delete on invoice_items
  for each row execute function recompute_invoice_totals();

-- Trigger: bump updated_at on invoice update ──────────────────────────
create or replace function bump_invoice_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists invoices_bump_updated on invoices;
create trigger invoices_bump_updated
  before update on invoices
  for each row execute function bump_invoice_updated_at();

-- Tenant per-year invoice numbering ────────────────────────────────────
create table if not exists invoice_number_sequence (
  tenant_id uuid not null,
  year      int  not null,
  next_seq  int  not null default 1,
  primary key (tenant_id, year)
);

create or replace function next_invoice_number(p_tenant_id uuid)
returns text language plpgsql as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  insert into invoice_number_sequence (tenant_id, year, next_seq)
    values (p_tenant_id, v_year, 1)
    on conflict (tenant_id, year)
    do update set next_seq = invoice_number_sequence.next_seq + 1
    returning next_seq into v_seq;

  return 'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- RLS for invoices (mirrors reservations RLS — tenant-scoped) ──────────
alter table invoices enable row level security;
alter table invoice_items enable row level security;

drop policy if exists "invoices: tenant access" on invoices;
create policy "invoices: tenant access"
  on invoices for all
  to authenticated
  using (
    tenant_id in (
      select tenant_id from dashboard_users where user_id = auth.uid()
    )
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  )
  with check (
    tenant_id in (
      select tenant_id from dashboard_users where user_id = auth.uid()
    )
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  );

drop policy if exists "invoice_items: tenant access" on invoice_items;
create policy "invoice_items: tenant access"
  on invoice_items for all
  to authenticated
  using (
    invoice_id in (
      select id from invoices where
        tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
        or exists (select 1 from bolivai_admins where user_id = auth.uid())
    )
  )
  with check (
    invoice_id in (
      select id from invoices where
        tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
        or exists (select 1 from bolivai_admins where user_id = auth.uid())
    )
  );
