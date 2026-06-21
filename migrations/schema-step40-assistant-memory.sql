-- =====================================================================
-- BolivAI — Step 40: AI-native memory — assistant conversation persistence
--                    + per-tenant business-context facts
-- =====================================================================
-- Phase 0b/0c of the platform upgrade. Two small, tenant-scoped stores that
-- make the platform AI *remember*:
--
--   * assistant_messages — the "Ask your business" assistant's threads persist
--     per (tenant, user) so context, prior asks and answers carry across
--     sessions (0c). PER-USER private: a member sees only their OWN thread.
--
--   * tenant_facts — durable business-context the AI (or an owner) writes back
--     and that is injected into the assistant's context on every call:
--     "owner takes no Sunday bookings", "prefers WhatsApp over email" (0b).
--     Tenant-wide (shared), readable by any member.
--
-- Writes happen through the dashboard service client (server actions) — the
-- same zero-trust posture as the rest of the platform. Idempotent.
-- =====================================================================

-- ── 0c. Assistant conversation persistence ──────────────────────────
create table if not exists public.assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  tools_used  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
-- One index serves both "load this user's thread, oldest→newest" and pruning.
create index if not exists idx_assistant_messages_thread
  on public.assistant_messages (tenant_id, user_id, created_at);

-- ── 0b. Per-tenant business-context facts ───────────────────────────
create table if not exists public.tenant_facts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  fact        text not null,
  -- Where the fact came from: a person typed it, the assistant learned it,
  -- an agent inferred it, or the system derived it.
  source      text not null default 'manual'
                check (source in ('manual','assistant','agent','system')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tenant_facts_tenant
  on public.tenant_facts (tenant_id, created_at desc);

drop trigger if exists trg_tenant_facts_updated on public.tenant_facts;
create trigger trg_tenant_facts_updated
  before update on public.tenant_facts
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS
--   assistant_messages — PER-USER private: a member reads only their own
--     thread within a tenant they belong to. All writes via service role.
--   tenant_facts — shared: any member reads; admins/owners may manage
--     directly; the assistant writes via the service role.
-- =====================================================================
alter table public.assistant_messages enable row level security;
alter table public.tenant_facts        enable row level security;

drop policy if exists "assistant_messages_own_select" on public.assistant_messages;
create policy "assistant_messages_own_select" on public.assistant_messages
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member_of(tenant_id));

drop policy if exists "tenant_facts_member_select" on public.tenant_facts;
create policy "tenant_facts_member_select" on public.tenant_facts
  for select to authenticated
  using (public.is_member_of(tenant_id));

drop policy if exists "tenant_facts_admin_manage" on public.tenant_facts;
create policy "tenant_facts_admin_manage" on public.tenant_facts
  for all to authenticated
  using (public.is_admin_of(tenant_id))
  with check (public.is_admin_of(tenant_id));

-- =====================================================================
-- Grants: reads for authenticated (RLS-filtered), all writes via service role.
-- =====================================================================
revoke insert, update, delete, truncate on public.assistant_messages from anon, authenticated;
grant select on public.assistant_messages to authenticated;
grant all on public.assistant_messages to service_role;

revoke insert, update, delete, truncate on public.tenant_facts from anon, authenticated;
grant select on public.tenant_facts to authenticated;
grant all on public.tenant_facts to service_role;
