-- ───────────────────────────────────────────────────────────────────────────
-- step76 — Lead email enrichment toggle
-- AIMA captures a business website from Google Maps but no email. A free
-- website-scraping tick fills leads.email (+ metadata.emails). Per-tenant
-- toggle, default ON, lives on aima_settings (same home as the scraper).
-- ───────────────────────────────────────────────────────────────────────────

alter table public.aima_settings
  add column if not exists email_enrichment_enabled boolean not null default true;

-- Speeds the tick's "no email yet" scan.
create index if not exists idx_leads_email_enrich
  on public.leads (tenant_id, created_at)
  where email is null or email = '';
