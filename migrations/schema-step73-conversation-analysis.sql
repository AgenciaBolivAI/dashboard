-- =====================================================================
-- BolivAI — Step 73: Conversation sentiment + signals
-- =====================================================================
-- BOLIV reads a conversation and writes its sentiment (positive/neutral/negative
-- + a -100..100 score), a short summary, and buying signals (intent, objections,
-- at-risk, next best action). Runs on-demand and automatically when a chat is
-- handed to a human (HITL). One current analysis per conversation. A negative /
-- at-risk read also raises an `ai_recommendations` row so it surfaces in the bell.
-- RLS mirrors step72: members READ, writes via service role only.
-- =====================================================================

create table if not exists public.conversation_analysis (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sentiment       text check (sentiment in ('positive','neutral','negative')),
  score           integer,           -- -100..100
  summary         text,
  signals         jsonb,             -- {buying_intent, objections[], at_risk bool, next_best_action}
  status          text not null default 'done' check (status in ('queued','running','done','failed')),
  model           text,
  credit_tx_id    uuid,
  error           text,
  generated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (conversation_id)
);
create index if not exists idx_conversation_analysis_tenant
  on public.conversation_analysis (tenant_id, sentiment);

drop trigger if exists trg_conversation_analysis_updated on public.conversation_analysis;
create trigger trg_conversation_analysis_updated before update on public.conversation_analysis
  for each row execute function set_updated_at();

alter table public.conversation_analysis enable row level security;
drop policy if exists "conversation_analysis_member_select" on public.conversation_analysis;
create policy "conversation_analysis_member_select" on public.conversation_analysis
  for select to authenticated using (public.is_member_of(tenant_id));
revoke insert, update, delete, truncate on public.conversation_analysis from anon, authenticated;
grant select on public.conversation_analysis to authenticated;
grant all on public.conversation_analysis to service_role;
