-- =====================================================================
-- BolivAI — Step 44: Ticketing layer on the conversations inbox
-- =====================================================================
-- Phase 4a. A support ticket is a conversation flagged is_ticket=true with a
-- richer workflow on top of the existing chat. Keeps one inbox (no fork): the
-- agent thread, HITL, and history all stay; tickets just add priority, an
-- assignee, an SLA timer, tags, a resolution, and a 5-state status.
--
--   is_ticket         flips a conversation into a tracked ticket
--   priority          low | medium | high | urgent
--   assignee_user_id  who owns it
--   ticket_status     open → in_progress → waiting → resolved → closed
--   tags              free-form labels
--   sla_due_at        response/resolution deadline (overdue badge in UI)
--   resolution_notes  what fixed it
--   resolved_at       stamped when status hits resolved
--
-- conversations already has RLS + grants; new columns inherit them. Idempotent.
-- =====================================================================
alter table public.conversations
  add column if not exists is_ticket        boolean not null default false,
  add column if not exists priority         text check (priority in ('low','medium','high','urgent')),
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null,
  add column if not exists ticket_status    text
                            check (ticket_status in ('open','in_progress','waiting','resolved','closed')),
  add column if not exists tags             text[],
  add column if not exists sla_due_at       timestamptz,
  add column if not exists resolution_notes text,
  add column if not exists resolved_at      timestamptz;

create index if not exists idx_conversations_ticket
  on public.conversations (tenant_id, ticket_status, priority) where is_ticket;
create index if not exists idx_conversations_ticket_assignee
  on public.conversations (tenant_id, assignee_user_id) where is_ticket and assignee_user_id is not null;
