-- =====================================================================
-- BolivAI — Step 12: per-tenant ElevenLabs voice agents
-- =====================================================================
-- Apply AFTER schema-step11-customer-profile.sql.
--
-- Adds:
--   1. tenants.elevenlabs_agent_id + voice_enabled + voice_id + greeting
--      — one ElevenLabs agent per BolivAI tenant.
--   2. tenants.voice_phone_* — Twilio (or Telnyx) credentials + number
--      attached to the agent. Tokens are stored as text for v1; can be
--      migrated to pgsodium / Vault later. CREATE PROCEDURE access only
--      via service-role; tenants read masked via the dashboard.
--   3. voice_conversations — one row per call/session with metering.
--   4. voice_usage_monthly — monthly rollup for Stripe-Connect billing.
--
-- Idempotent — safe to re-run.
-- =====================================================================

alter table tenants
  add column if not exists elevenlabs_agent_id      text unique,
  add column if not exists voice_enabled            boolean not null default false,
  add column if not exists voice_id                 text,    -- ElevenLabs voice ID
  add column if not exists voice_greeting           text,
  add column if not exists voice_languages          text[] not null default array['en'],
  add column if not exists voice_phone_provider     text,    -- 'twilio' | 'telnyx' | null
  add column if not exists voice_phone_number       text,    -- E.164
  add column if not exists voice_phone_account_sid  text,    -- (deferred to Phase 3)
  add column if not exists voice_phone_auth_token   text,    -- (deferred to Phase 3)
  add column if not exists voice_agent_created_at   timestamptz,
  add column if not exists voice_agent_updated_at   timestamptz;

comment on column tenants.elevenlabs_agent_id is
  'ElevenLabs Conversational AI agent ID (acct-scoped agent_...). One per tenant.';
comment on column tenants.voice_enabled is
  'Master toggle. False = agent stays provisioned on ElevenLabs but BolivAI ignores it.';
comment on column tenants.voice_id is
  'ElevenLabs voice ID (e.g. 21m00Tcm4TlvDq8ikWAM = Rachel). Tenant picks from a curated list.';
comment on column tenants.voice_greeting is
  'Override for the agent''s first message. Falls back to the prompt_template''s opener if null.';

create table if not exists voice_conversations (
  id                          uuid primary key default uuid_generate_v4(),
  tenant_id                   uuid not null references tenants(id) on delete cascade,
  user_id                     uuid references users(id) on delete set null,
  elevenlabs_conversation_id  text unique,                  -- nullable while a call is mid-flight
  direction                   text not null
                                check (direction in ('inbound','outbound','web_widget')),
  caller_phone                text,
  started_at                  timestamptz not null default now(),
  ended_at                    timestamptz,
  duration_seconds            int,
  cost_cents                  int,           -- BolivAI's cost (ElevenLabs + Twilio)
  charged_cents               int,           -- what the tenant is billed (with markup)
  transcript_url              text,
  call_outcome                text
                                check (call_outcome in
                                  ('booked','rescheduled','cancelled','voicemail',
                                   'no_pickup','human_transfer','completed_no_action','error')),
  created_at                  timestamptz not null default now()
);

create index if not exists voice_conversations_tenant_idx
  on voice_conversations(tenant_id, started_at desc);
create index if not exists voice_conversations_user_idx
  on voice_conversations(user_id, started_at desc)
  where user_id is not null;

create table if not exists voice_usage_monthly (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  year_month      text not null,  -- 'YYYY-MM'
  minutes_used    numeric(10,2) not null default 0,
  cost_cents      int not null default 0,
  charged_cents   int not null default 0,
  charged_at      timestamptz,
  stripe_invoice_id text,
  unique(tenant_id, year_month)
);

alter table voice_conversations  enable row level security;
alter table voice_usage_monthly  enable row level security;

drop policy if exists "voice_conversations: tenant access" on voice_conversations;
create policy "voice_conversations: tenant access"
  on voice_conversations for all
  to authenticated
  using (
    tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  )
  with check (
    tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  );

drop policy if exists "voice_usage_monthly: tenant access" on voice_usage_monthly;
create policy "voice_usage_monthly: tenant access"
  on voice_usage_monthly for all
  to authenticated
  using (
    tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  )
  with check (
    tenant_id in (select tenant_id from dashboard_users where user_id = auth.uid())
    or exists (select 1 from bolivai_admins where user_id = auth.uid())
  );
