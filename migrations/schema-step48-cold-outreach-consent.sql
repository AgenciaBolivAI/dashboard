-- =====================================================================
-- BolivAI — Step 48: cold-outreach lawful-basis attestation.
-- AIMA scraping + Sandra COLD CALLS may only run after a tenant admin attests
-- they have a lawful basis / opt-in to contact the targeted businesses. Until
-- then the app blocks the AIMA scrape trigger and the campaign engine's
-- aima_scrape / sandra_calls steps. (Code-side gate; this column is the flag.)
-- =====================================================================
alter table public.aima_settings
  add column if not exists cold_outreach_attested_at timestamptz,
  add column if not exists cold_outreach_attested_by text;

comment on column public.aima_settings.cold_outreach_attested_at is
  'When a tenant admin attested a lawful basis / opt-in for cold outreach (AIMA scrape + Sandra cold calls). NULL = not attested → outreach is blocked by the app.';
comment on column public.aima_settings.cold_outreach_attested_by is
  'Email of the admin who attested the cold-outreach lawful basis.';
