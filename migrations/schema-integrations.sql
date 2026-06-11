-- =====================================================================
-- BolivAI — Per-tenant OAuth integrations
-- =====================================================================
-- Stores OAuth tokens granted by tenant admins so workflows (n8n) can
-- act on behalf of the tenant against external services.
--
-- v1 supports Google (Calendar / Sheets / Gmail send). Extend the
-- check constraint when adding more providers.
-- =====================================================================

create table if not exists tenant_integrations (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  provider      text not null check (provider in ('google')),
  access_token  text,
  refresh_token text,
  scope         text,
  expires_at    timestamptz,
  metadata      jsonb not null default '{}',  -- calendar_id, spreadsheet_id, ...
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index if not exists idx_tenant_integrations_tenant
  on tenant_integrations (tenant_id);

drop trigger if exists trg_tenant_integrations_updated on tenant_integrations;
create trigger trg_tenant_integrations_updated
  before update on tenant_integrations
  for each row execute function set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Only admins of the tenant (or BolivAI staff) can read/write the
-- tokens. Service role (n8n) bypasses RLS.
alter table tenant_integrations enable row level security;

drop policy if exists "tenant_integrations_admin_all" on tenant_integrations;
create policy "tenant_integrations_admin_all" on tenant_integrations for all
  using (is_admin_of(tenant_id))
  with check (is_admin_of(tenant_id));
