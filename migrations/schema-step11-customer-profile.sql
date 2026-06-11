-- =====================================================================
-- BolivAI — Step 11: customer profile flags
-- =====================================================================
-- Apply AFTER schema-step10-invoice-pdf.sql.
--
-- Adds:
--   * users.is_vip          — tenant-controlled "this is a VIP" flag
--   * users.tenant_notes    — tenant's private CRM notes (distinct from
--                             users.facts, which is what the AGENT writes
--                             into the prompt; tenant_notes is human-only)
--
-- Idempotent — safe to re-run.
-- =====================================================================

alter table users
  add column if not exists is_vip        boolean not null default false,
  add column if not exists tenant_notes  text;

comment on column users.is_vip is
  'Tenant-toggled VIP flag. Surfaces a badge in the Customer 360 view + the calendar.';
comment on column users.tenant_notes is
  'Private CRM notes the tenant writes about a customer. Not fed to the agent (use users.facts for that).';

create index if not exists users_vip_idx on users(tenant_id, is_vip)
  where is_vip = true;
