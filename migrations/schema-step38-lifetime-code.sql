-- =====================================================================
-- BolivAI — Step 38: record which discount code a tenant redeemed
-- =====================================================================
-- For the per-code usage report we attribute each lifetime grant to the
-- code (if any) used at checkout. Written by the confirm route + Stripe
-- webhook from the session's bolivai_code metadata. NULL = no code
-- (direct $40, admin waive, or per-tenant discount).
-- Idempotent.
-- =====================================================================

alter table public.tenants
  add column if not exists lifetime_code text;
