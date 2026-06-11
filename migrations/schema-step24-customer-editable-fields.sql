-- =====================================================================
-- BolivAI — Customer editable fields (business_name, point_of_contact)
-- =====================================================================
-- Adds two columns to public.users so operators can edit them from the
-- customer detail page:
--
--   business_name        — when the customer IS a business (B2B context).
--                          Optional; many B2C customers leave it blank.
--   point_of_contact     — name (and optionally role) of the person to
--                          talk to. Useful for businesses where the
--                          `name` column holds the company.
--
-- Existing columns (name, whatsapp_number, email) become editable through
-- updateCustomerProfileAction; no schema changes needed for those — the
-- form just sends them in the same payload as the new fields.
--
-- Idempotent.
-- =====================================================================

alter table public.users
  add column if not exists business_name text,
  add column if not exists point_of_contact text;

comment on column public.users.business_name is
  'Name of the customer''s business when they are a B2B customer. Optional. For B2C, this is null and the personal name lives in public.users.name.';
comment on column public.users.point_of_contact is
  'Name (and optionally role) of the person the operator should ask for when reaching out. Free-form text, e.g. "Maria Lopez, Owner". For B2C, typically null.';
