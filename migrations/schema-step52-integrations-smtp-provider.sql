-- =====================================================================
-- BolivAI — Step 52: allow a per-tenant 'smtp' integration row.
-- tenant_integrations.provider was checked to ('google') only. The BOLIV email
-- feature lets a tenant send from their own SMTP server (creds stored here:
-- password in access_token, host/port/user/from in metadata). Relax the check.
-- =====================================================================
alter table public.tenant_integrations
  drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations
  add constraint tenant_integrations_provider_check
  check (provider in ('google', 'smtp'));
