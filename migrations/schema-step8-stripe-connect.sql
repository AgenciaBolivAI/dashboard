-- =====================================================================
-- BolivAI — Step 8: tenant business profile + Stripe Connect onboarding
-- =====================================================================
-- Apply AFTER schema-step7-video-meeting.sql.
--
-- Adds:
--   1. Business profile columns on tenants (legal_name, tax_id, address,
--      invoice_footer) — surfaced on invoices.
--   2. Stripe Connect account fields (stripe_account_id, status, country,
--      charges_enabled, payouts_enabled) — populated by the OAuth callback
--      + account.updated webhook.
--   3. Per-tenant default invoice currency (USD by default; tenants in
--      EU/BR/etc override in Settings).
--
-- Idempotent — safe to re-run.
-- =====================================================================

alter table tenants
  add column if not exists legal_name              text,
  add column if not exists tax_id                  text,
  add column if not exists address_line1           text,
  add column if not exists address_line2           text,
  add column if not exists address_city            text,
  add column if not exists address_state           text,
  add column if not exists address_postal_code     text,
  add column if not exists address_country         text,  -- ISO 3166-1 alpha-2
  add column if not exists invoice_footer          text,
  add column if not exists invoice_default_currency text not null default 'USD',
  add column if not exists stripe_account_id       text unique,
  add column if not exists stripe_account_country  text,
  add column if not exists stripe_charges_enabled  boolean not null default false,
  add column if not exists stripe_payouts_enabled  boolean not null default false,
  add column if not exists stripe_account_updated_at timestamptz;

comment on column tenants.legal_name is
  'Registered business name shown on invoices (often differs from display name).';
comment on column tenants.tax_id is
  'Tax/VAT/EIN identifier shown on invoices. Free-form; jurisdiction varies.';
comment on column tenants.address_country is
  'ISO 3166-1 alpha-2 country code (e.g. US, MX, ES, BR).';
comment on column tenants.invoice_footer is
  'Optional footer text appended to every invoice (terms, thank-you, etc.).';
comment on column tenants.stripe_account_id is
  'Stripe Connect Express acct_... id. Null until the tenant completes onboarding.';
comment on column tenants.stripe_charges_enabled is
  'Mirror of Stripe account.charges_enabled. Updated by account.updated webhook.';
comment on column tenants.stripe_payouts_enabled is
  'Mirror of Stripe account.payouts_enabled. Updated by account.updated webhook.';
