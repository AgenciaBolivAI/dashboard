-- =====================================================================
-- BolivAI — Step 41: Lead deal fields (sales pipeline value + forecasting)
-- =====================================================================
-- Turns `leads` into the pipeline's deal records without forking a new table:
-- the existing `status` is the pipeline STAGE; these add the money + timing so
-- the Kanban can show value per card, column totals, and a weighted forecast.
--
--   value_cents       deal value in the smallest currency unit (bigint)
--   currency          ISO-4217 (defaults to the tenant's invoice currency in UI)
--   expected_close_at date the deal is expected to close (forecast horizon)
--   won_at            stamped when the lead becomes 'converted' (won)
--
-- leads already has RLS + grants from the base schema; new columns inherit them.
-- Idempotent.
-- =====================================================================
alter table public.leads
  add column if not exists value_cents       bigint,
  add column if not exists currency          text,
  add column if not exists expected_close_at date,
  add column if not exists won_at            timestamptz;

-- Speeds up the board/report grouping (leads by stage within a tenant).
create index if not exists idx_leads_tenant_status
  on public.leads (tenant_id, status);
