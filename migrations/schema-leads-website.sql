-- =====================================================================
-- BolivAI — leads.website (web-dev upsell signal)
-- =====================================================================
-- Captures whether a lead's business has a website (and which one), so the
-- team can spot prospects WITHOUT a site and upsell web development.
-- NULL = unknown / no site provided. Editable in the dashboard leads view;
-- captured by the WhatsApp agent's capture_lead tool when the lead mentions it.
-- Idempotent.
-- =====================================================================
alter table public.leads add column if not exists website text;
comment on column public.leads.website is
  'Lead business website URL (null = no site / unknown) — used to upsell web development';
