-- =====================================================================
-- BolivAI — Step 72: Prospect research (BOLIV web-grounded lead/customer intel)
-- =====================================================================
-- When a tenant gets a lead, BOLIV researches the company + person from the web
-- (gpt-4o-search-preview) and attaches a summary so the tenant knows who they're
-- about to talk to. One CURRENT research row per subject (re-run updates it).
--   prospect_research  the brief + structured fields + sources + job status
--   prospect_settings  per-tenant auto-research toggle / sources / daily cap
-- RLS mirrors schema-step68: members READ, writes via service role only. The
-- settings table is service-role only (read masked server-side, like
-- tenant_sms_settings).
-- =====================================================================

create table if not exists public.prospect_research (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  subject_kind  text not null check (subject_kind in ('lead','customer')),
  subject_id    uuid not null,
  status        text not null default 'queued' check (status in ('queued','running','done','failed')),
  summary       text,                 -- markdown brief in the tenant's language
  structured    jsonb,                -- {headline, industry, company_size, key_people[], talking_points[], website}
  sources       jsonb,                -- [{title, url}]
  model         text,
  credit_tx_id  uuid,
  error         text,
  requested_by  uuid references auth.users(id) on delete set null,
  generated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, subject_kind, subject_id)
);
create index if not exists idx_prospect_research_subject
  on public.prospect_research (tenant_id, subject_kind, subject_id);
-- The research tick scans this: queued jobs per tenant (partial = hot rows only).
create index if not exists idx_prospect_research_due
  on public.prospect_research (tenant_id, status) where status = 'queued';

drop trigger if exists trg_prospect_research_updated on public.prospect_research;
create trigger trg_prospect_research_updated before update on public.prospect_research
  for each row execute function set_updated_at();

create table if not exists public.prospect_settings (
  tenant_id                 uuid primary key references public.tenants(id) on delete cascade,
  auto_research_enabled     boolean not null default true,
  auto_sources              text[]  not null default '{form,whatsapp,voice,meta}',
  daily_cap                 integer not null default 25,
  sentiment_auto_on_handoff boolean not null default true,
  updated_at                timestamptz not null default now()
);
drop trigger if exists trg_prospect_settings_updated on public.prospect_settings;
create trigger trg_prospect_settings_updated before update on public.prospect_settings
  for each row execute function set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.prospect_research enable row level security;
drop policy if exists "prospect_research_member_select" on public.prospect_research;
create policy "prospect_research_member_select" on public.prospect_research
  for select to authenticated using (public.is_member_of(tenant_id));
revoke insert, update, delete, truncate on public.prospect_research from anon, authenticated;
grant select on public.prospect_research to authenticated;
grant all on public.prospect_research to service_role;

-- Settings carry no secret but are written only by gated actions → service role.
alter table public.prospect_settings enable row level security;
revoke all on public.prospect_settings from anon, authenticated;
grant all on public.prospect_settings to service_role;
