-- =====================================================================
-- BolivAI — Step 46: Autonomous campaigns (BOLIV Stage 3)
-- =====================================================================
-- The plan → approve → schedule → execute → report engine. BOLIV decomposes a
-- request ("find dental clinics in Cochabamba, have Sandra call them Tuesday
-- morning, show me results Wednesday") into a campaign with ordered, scheduled
-- steps. The owner approves once; an n8n tick hits /api/campaigns/tick on a
-- cron and executes due steps in order, writing results back.
--
--   campaigns       the goal + lifecycle (draft→approved→running→done) + an
--                   optional credit budget cap (kill switch = status=cancelled)
--   campaign_steps  ordered steps, each a kind (aima_scrape | sandra_calls |
--                   report | wait) with params + a scheduled_at + a result
--
-- Safety: nothing runs until status='approved' (human approval); a budget_credits
-- cap pauses the campaign when spent; cancelling is the kill switch. Steps only
-- fire when scheduled_at <= now AND all prior steps are done. Idempotent.
-- =====================================================================

create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  title          text not null,
  goal           text,
  status         text not null default 'draft'
                   check (status in ('draft','approved','running','paused','done','cancelled')),
  budget_credits integer,                 -- null = no cap
  spent_credits  integer not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  approved_by    uuid references auth.users(id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_campaigns_tenant
  on public.campaigns (tenant_id, status, created_at desc);

create table if not exists public.campaign_steps (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  seq          integer not null,
  kind         text not null check (kind in ('aima_scrape','sandra_calls','report','wait')),
  params       jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending','running','done','failed','skipped')),
  result       jsonb,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
-- The tick scans this: due, not-yet-run steps for a tenant.
create index if not exists idx_campaign_steps_due
  on public.campaign_steps (tenant_id, status, scheduled_at);
create index if not exists idx_campaign_steps_campaign
  on public.campaign_steps (campaign_id, seq);

drop trigger if exists trg_campaigns_updated on public.campaigns;
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS — members read their tenant's campaigns + steps; all writes via the
-- service role (server actions + the tick engine). Idempotent.
-- =====================================================================
alter table public.campaigns      enable row level security;
alter table public.campaign_steps enable row level security;

drop policy if exists "campaigns_member_select" on public.campaigns;
create policy "campaigns_member_select" on public.campaigns
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "campaign_steps_member_select" on public.campaign_steps;
create policy "campaign_steps_member_select" on public.campaign_steps
  for select to authenticated using (public.is_member_of(tenant_id));

revoke insert, update, delete, truncate on public.campaigns from anon, authenticated;
grant select on public.campaigns to authenticated;
grant all on public.campaigns to service_role;

revoke insert, update, delete, truncate on public.campaign_steps from anon, authenticated;
grant select on public.campaign_steps to authenticated;
grant all on public.campaign_steps to service_role;
