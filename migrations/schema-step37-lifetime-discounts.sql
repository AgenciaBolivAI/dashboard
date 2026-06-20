-- =====================================================================
-- BolivAI — Step 37: Admin control over the lifetime access fee
-- =====================================================================
-- Adds a per-tenant discount on the one-time Founding Member fee so a
-- BolivAI admin can set 0–100% off for a specific tenant. A 100% discount
-- (or the "Grant free now" admin action) is just grant_lifetime_access(...)
-- with p_paid_cents = 0 — no new RPC needed. Shareable discount CODES are
-- handled natively in Stripe (Coupons + Promotion Codes), so they need no
-- schema here.
-- Idempotent.
-- =====================================================================

alter table public.tenants
  add column if not exists lifetime_discount_pct int not null default 0
    check (lifetime_discount_pct between 0 and 100);
