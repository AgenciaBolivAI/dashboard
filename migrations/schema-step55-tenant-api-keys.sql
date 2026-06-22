-- =====================================================================
-- BolivAI — Step 55: per-tenant API keys for the public REST API
-- (powers the Zapier + Make integrations and any partner/API access).
-- Only the SHA-256 hash of the key is stored; the plaintext is shown ONCE
-- at creation. Auth: Authorization: Bearer blv_…  ->  /api/v1/*.
-- Locked down like email_log/seat_charges: RLS on, anon/authenticated
-- revoked, service_role only. The dashboard reads metadata via a server
-- action (createServiceClient + admin gate) and NEVER exposes key_hash.
-- =====================================================================
create table if not exists public.tenant_api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null default 'API key',
  key_hash     text not null unique,          -- sha256(plaintext), hex
  key_prefix   text not null,                 -- e.g. "blv_a1b2" (for display)
  last_four    text not null,                 -- last 4 chars (for display)
  scopes       text[] not null default '{read,write}',
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists tenant_api_keys_hash_active_idx
  on public.tenant_api_keys (key_hash) where revoked_at is null;
create index if not exists tenant_api_keys_tenant_idx
  on public.tenant_api_keys (tenant_id);

alter table public.tenant_api_keys enable row level security;
revoke all on public.tenant_api_keys from anon, authenticated;
grant all on public.tenant_api_keys to service_role;
