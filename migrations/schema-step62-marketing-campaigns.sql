-- =====================================================================
-- BolivAI — Step 62: Marketing campaigns (broadcast + drip) — P2
-- =====================================================================
-- A multi-channel demand-gen + retention layer that makes the existing owned
-- channels (tenant email, WhatsApp via Evolution, Twilio SMS) do more. DISTINCT
-- from `campaigns`/`campaign_steps` (schema-step46) — that is BOLIV's autonomous
-- lead-gen orchestrator (one sequential step per campaign). Marketing has a
-- different cardinality: 1 campaign → many per-recipient sends, each with its own
-- status / cost / retry. So this is a parallel model + a dedicated tick
-- (/api/marketing/tick) rather than an overload of the orchestrator.
--
--   marketing_campaigns  the message + audience + lifecycle (draft → approved →
--                        running → done) + an optional credit budget cap.
--   marketing_steps      drip sequence (seq + delay_minutes). v1 ships broadcast
--                        only; the table is here so drip is a pure engine add.
--   marketing_messages   per-recipient fan-out + ledger: to_address frozen at
--                        enqueue, status queued|sending|sent|failed|skipped,
--                        scheduled_at, credit_tx_id.
--
-- Safety: nothing sends until status='approved' (human approval). status=
-- 'cancelled' is the kill switch; a budget_credits cap pauses on exhaustion.
-- Sends only fire when scheduled_at <= now. Idempotent enrollment via a unique
-- (campaign, recipient, step) index so tick retries never double-send.
-- =====================================================================

create table if not exists public.marketing_campaigns (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  title            text not null,
  goal             text,
  channel          text not null check (channel in ('email','whatsapp','sms')),
  kind             text not null default 'broadcast' check (kind in ('broadcast','drip')),
  subject          text,                       -- email subject (null for wa/sms)
  body             text,                       -- broadcast body (drip uses marketing_steps)
  audience         jsonb not null default '{}'::jsonb,  -- {source,lead_status,lead_source,vip_only,limit}
  status           text not null default 'draft'
                     check (status in ('draft','approved','running','paused','done','cancelled')),
  budget_credits   integer,                    -- null = no cap
  spent_credits    integer not null default 0,
  scheduled_at     timestamptz,                -- null = send asap on approval
  total_recipients integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  approved_by      uuid references auth.users(id) on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_marketing_campaigns_tenant
  on public.marketing_campaigns (tenant_id, status, created_at desc);

create table if not exists public.marketing_steps (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.marketing_campaigns(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  seq           integer not null,
  delay_minutes integer not null default 0,    -- delay after enrollment (drip)
  subject       text,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_marketing_steps_campaign
  on public.marketing_steps (campaign_id, seq);

create table if not exists public.marketing_messages (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  campaign_id    uuid not null references public.marketing_campaigns(id) on delete cascade,
  step_id        uuid references public.marketing_steps(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('lead','user')),
  recipient_id   uuid not null,
  channel        text not null check (channel in ('email','whatsapp','sms')),
  to_address     text not null,                -- frozen at enqueue (email / phone)
  subject        text,
  body           text not null,
  status         text not null default 'queued'
                   check (status in ('queued','sending','sent','failed','skipped')),
  scheduled_at   timestamptz not null default now(),
  error          text,
  credit_tx_id   uuid,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
-- The tick scans this: due, queued messages for a tenant (partial = hot rows only).
create index if not exists idx_marketing_messages_due
  on public.marketing_messages (tenant_id, status, scheduled_at)
  where status = 'queued';
create index if not exists idx_marketing_messages_campaign
  on public.marketing_messages (campaign_id, status);
-- Idempotent enrollment: one message per (campaign, recipient, step). step_id is
-- nullable for broadcasts → coalesce to a sentinel so NULLs dedupe too (Postgres
-- treats NULLs as distinct in a plain unique index).
create unique index if not exists uq_marketing_messages_enroll
  on public.marketing_messages
  (campaign_id, recipient_id, (coalesce(step_id, '00000000-0000-0000-0000-000000000000'::uuid)));

drop trigger if exists trg_marketing_campaigns_updated on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated before update on public.marketing_campaigns
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS — members READ their tenant's rows; ALL writes via the service role
-- (server actions + the tick engine). Mirrors schema-step46 exactly.
-- =====================================================================
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_steps     enable row level security;
alter table public.marketing_messages  enable row level security;

drop policy if exists "marketing_campaigns_member_select" on public.marketing_campaigns;
create policy "marketing_campaigns_member_select" on public.marketing_campaigns
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "marketing_steps_member_select" on public.marketing_steps;
create policy "marketing_steps_member_select" on public.marketing_steps
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "marketing_messages_member_select" on public.marketing_messages;
create policy "marketing_messages_member_select" on public.marketing_messages
  for select to authenticated using (public.is_member_of(tenant_id));

revoke insert, update, delete, truncate on public.marketing_campaigns from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_steps     from anon, authenticated;
revoke insert, update, delete, truncate on public.marketing_messages  from anon, authenticated;
grant select on public.marketing_campaigns to authenticated;
grant select on public.marketing_steps     to authenticated;
grant select on public.marketing_messages  to authenticated;
grant all on public.marketing_campaigns to service_role;
grant all on public.marketing_steps     to service_role;
grant all on public.marketing_messages  to service_role;
