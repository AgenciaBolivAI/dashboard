-- =====================================================================
-- BolivAI — Step 42: Tasks + AI recommendations + per-user preferences
-- =====================================================================
-- Phase 3 of the platform upgrade — the "productivity app" layer:
--
--   tasks               team to-do items, optionally linked to a lead/deal/
--                       conversation/ticket/customer. The bridge between the
--                       AI workforce and the humans: agents CREATE tasks,
--                       people complete them.
--   ai_recommendations  the connective tissue any agent/assistant writes to —
--                       rendered as insight / next-best-action cards on the
--                       personalized home (and later on deal/ticket cards).
--   user_preferences    per-(user,tenant) personalization (layout / saved
--                       filters / pinned items) on top of the shared team view.
--
-- Writes go through the dashboard service client (server actions, RLS-gated by
-- requireTenantAccess); members read their tenant's rows. Idempotent.
-- =====================================================================

-- ── Tasks ────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  title            text not null,
  notes            text,
  status           text not null default 'open'    check (status in ('open','done')),
  priority         text not null default 'medium'  check (priority in ('low','medium','high')),
  due_at           timestamptz,
  assignee_user_id uuid references auth.users(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  -- Optional link to the entity this task is about. related_id is the target's
  -- uuid (leads/conversations/users/reservations all use uuid PKs; 'deal' is a
  -- lead row). 'none' (or null) = a standalone task.
  related_type     text check (related_type in ('lead','deal','conversation','ticket','customer','reservation','none')),
  related_id       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists idx_tasks_tenant_status on public.tasks (tenant_id, status, due_at);
create index if not exists idx_tasks_assignee
  on public.tasks (tenant_id, assignee_user_id) where assignee_user_id is not null;
create index if not exists idx_tasks_related
  on public.tasks (tenant_id, related_type, related_id) where related_id is not null;

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function set_updated_at();

-- ── AI recommendations ───────────────────────────────────────────────
create table if not exists public.ai_recommendations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  kind           text not null default 'insight'
                   check (kind in ('insight','next_action','task_suggestion','risk','opportunity')),
  title          text not null,
  body           text,
  action_type    text,                                  -- e.g. create_task, call_lead, open_url
  action_payload jsonb not null default '{}'::jsonb,
  related_type   text,
  related_id     uuid,
  status         text not null default 'new'  check (status in ('new','done','dismissed')),
  source         text not null default 'system',        -- which agent/assistant produced it
  created_at     timestamptz not null default now()
);
create index if not exists idx_ai_recs_tenant
  on public.ai_recommendations (tenant_id, status, created_at desc);

-- ── Per-user preferences ─────────────────────────────────────────────
create table if not exists public.user_preferences (
  user_id         uuid not null references auth.users(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  layout          jsonb not null default '{}'::jsonb,
  default_filters jsonb not null default '{}'::jsonb,
  pinned          jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

drop trigger if exists trg_user_preferences_updated on public.user_preferences;
create trigger trg_user_preferences_updated before update on public.user_preferences
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS — members read their tenant's tasks + recommendations; a user reads
-- only their OWN preferences. All writes via the service role (server actions).
-- =====================================================================
alter table public.tasks              enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.user_preferences   enable row level security;

drop policy if exists "tasks_member_select" on public.tasks;
create policy "tasks_member_select" on public.tasks
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "ai_recs_member_select" on public.ai_recommendations;
create policy "ai_recs_member_select" on public.ai_recommendations
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "user_prefs_own_select" on public.user_preferences;
create policy "user_prefs_own_select" on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member_of(tenant_id));

-- =====================================================================
-- Grants: reads for authenticated (RLS-filtered), all writes via service role.
-- =====================================================================
revoke insert, update, delete, truncate on public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;
grant all on public.tasks to service_role;

revoke insert, update, delete, truncate on public.ai_recommendations from anon, authenticated;
grant select on public.ai_recommendations to authenticated;
grant all on public.ai_recommendations to service_role;

revoke insert, update, delete, truncate on public.user_preferences from anon, authenticated;
grant select on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
