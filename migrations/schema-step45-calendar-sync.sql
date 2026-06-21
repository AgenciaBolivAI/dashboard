-- =====================================================================
-- BolivAI — Step 45: Google Calendar 2-way sync — link columns
-- =====================================================================
-- Phase 4c. Links a reservation to its mirrored Google Calendar event so the
-- dashboard (and the n8n book_slot workflow) can create / update / delete the
-- event and stay in sync.
--
--   google_event_id          the Google Calendar event id (null = not synced)
--   google_calendar_synced_at last successful push
--
-- Sync is opt-in per tenant: tenant_integrations(provider='google').metadata
-- carries { calendar_id, sync_enabled }. reservations already has RLS + grants.
-- Idempotent.
-- =====================================================================
alter table public.reservations
  add column if not exists google_event_id           text,
  add column if not exists google_calendar_synced_at timestamptz;

create index if not exists idx_reservations_google_event
  on public.reservations (tenant_id, google_event_id) where google_event_id is not null;
