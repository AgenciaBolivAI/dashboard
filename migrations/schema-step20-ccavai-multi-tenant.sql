-- =====================================================================
-- BolivAI — Multi-tenant CCAVAI
-- =====================================================================
-- ccavai_drafts + ccavai_runs were originally BolivAI-only (no tenant_id
-- column). This migration adds tenant_id to both, backfills every existing
-- row to BolivAI's tenant, updates RLS so other tenants can use CCAVAI
-- without seeing each other's drafts, and adds a per-tenant ccavai_settings
-- table parallel to aima_settings / vira_settings.
--
-- Backward compat: the existing CCAVAI n8n workflow reads/writes rows
-- without specifying tenant_id today. The default value on insert covers
-- that case so the workflow keeps working until it's updated to pass
-- tenant_id explicitly.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- ── 1. Add tenant_id with BolivAI default ────────────────────────────
do $$
declare v_bolivai uuid := '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'::uuid;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='ccavai_drafts' and column_name='tenant_id') then
    execute format('alter table public.ccavai_drafts
                    add column tenant_id uuid not null default %L::uuid
                    references public.tenants(id) on delete cascade', v_bolivai);
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='ccavai_runs' and column_name='tenant_id') then
    execute format('alter table public.ccavai_runs
                    add column tenant_id uuid not null default %L::uuid
                    references public.tenants(id) on delete cascade', v_bolivai);
  end if;
end $$;

-- Backfill existing rows to BolivAI (default does this for new rows, but be
-- explicit in case the default was changed later)
update public.ccavai_drafts set tenant_id = '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'::uuid
  where tenant_id is null;
update public.ccavai_runs set tenant_id = '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'::uuid
  where tenant_id is null;

create index if not exists idx_ccavai_drafts_tenant_generated
  on public.ccavai_drafts (tenant_id, generated_at desc);
create index if not exists idx_ccavai_runs_tenant_started
  on public.ccavai_runs (tenant_id, started_at desc);

-- ── 2. Per-tenant CCAVAI settings table ──────────────────────────────
create table if not exists public.ccavai_settings (
  tenant_id           uuid primary key references public.tenants(id) on delete cascade,
  enabled             boolean not null default false,
  -- Which platforms to draft for
  platforms           text[] not null default array['linkedin','instagram','facebook']::text[],
  -- Tone profile — drives the LLM
  tone                text not null default 'professional_warm'
                        check (tone in (
                          'professional_warm',  -- LinkedIn-friendly authoritative
                          'casual_friendly',    -- IG/FB community
                          'bold_punchy',        -- viral hooks
                          'educational',        -- explainer style
                          'industry_voice'      -- mirrors the tenant's industry tone
                        )),
  -- Source RSS feeds to monitor (jsonb array of {url, name})
  rss_sources         jsonb not null default '[]'::jsonb,
  -- How many drafts to generate per run
  drafts_per_run      int not null default 3
                        check (drafts_per_run >= 1 and drafts_per_run <= 10),
  -- Image generation
  generate_images     boolean not null default true,
  image_style         text not null default 'branded_modern'
                        check (image_style in (
                          'branded_modern','editorial','photographic','illustration'
                        )),
  -- Auto-post to socials (future: native publishing)
  auto_post           boolean not null default false,
  -- Custom brand language overrides per tenant
  brand_vocabulary    text,                                 -- "we say 'clients' not 'customers'"
  do_not_say          text[] not null default array[]::text[],
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.ccavai_settings_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_ccavai_settings_updated on public.ccavai_settings;
create trigger trg_ccavai_settings_updated
  before update on public.ccavai_settings
  for each row execute function public.ccavai_settings_set_updated_at();

-- Auto-seed for every existing tenant + new tenants
insert into public.ccavai_settings (tenant_id, enabled)
select t.id, (t.id = '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'::uuid) -- BolivAI starts enabled
from public.tenants t
where not exists (select 1 from public.ccavai_settings c where c.tenant_id = t.id)
on conflict (tenant_id) do nothing;

-- ── 3. Update RLS policies (replace the bolivai_admin-only ones with tenant-scoped) ──
drop policy if exists "ccavai_drafts_admin_select" on public.ccavai_drafts;
drop policy if exists "ccavai_runs_admin_select" on public.ccavai_runs;

create policy "ccavai_drafts_member_select"
  on public.ccavai_drafts for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = ccavai_drafts.tenant_id)
    or public.is_bolivai_admin()
  );

create policy "ccavai_runs_member_select"
  on public.ccavai_runs for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = ccavai_runs.tenant_id)
    or public.is_bolivai_admin()
  );

-- ccavai_settings RLS
alter table public.ccavai_settings enable row level security;

drop policy if exists "ccavai_settings_member_select" on public.ccavai_settings;
create policy "ccavai_settings_member_select"
  on public.ccavai_settings for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = ccavai_settings.tenant_id)
    or public.is_bolivai_admin()
  );

drop policy if exists "ccavai_settings_admin_update" on public.ccavai_settings;
create policy "ccavai_settings_admin_update"
  on public.ccavai_settings for update
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = ccavai_settings.tenant_id
              and du.role in ('owner','admin'))
    or public.is_bolivai_admin()
  );

revoke insert, update, delete, truncate on public.ccavai_settings from anon, authenticated;
grant update on public.ccavai_settings to authenticated;
grant all on public.ccavai_settings to service_role;
