-- ───────────────────────────────────────────────────────────────────────────
-- step75 — Multi-session BOLIV chat
-- The assistant was a single flat thread per (tenant, user). Add `session_id`
-- so a user can keep many separate chats (New chat + history) like ChatGPT/
-- Claude. Existing history collapses into ONE session per (tenant, user) so
-- nothing is lost. RLS is unchanged (still per-user SELECT + service writes).
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assistant_messages
  add column if not exists session_id uuid;

-- Backfill: each existing flat (tenant, user) thread becomes one session.
with grp as (
  select tenant_id, user_id, gen_random_uuid() as sid
  from public.assistant_messages
  where session_id is null
  group by tenant_id, user_id
)
update public.assistant_messages m
set session_id = grp.sid
from grp
where m.tenant_id = grp.tenant_id
  and m.user_id = grp.user_id
  and m.session_id is null;

alter table public.assistant_messages
  alter column session_id set not null;

create index if not exists idx_assistant_messages_session
  on public.assistant_messages (tenant_id, user_id, session_id, created_at);
