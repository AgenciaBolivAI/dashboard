-- =====================================================================
-- BolivAI — Step 10: store the Stripe-generated invoice PDF URL
-- =====================================================================
-- Apply AFTER schema-step9-invoices.sql.
--
-- Stripe's Invoice object returns BOTH `hosted_invoice_url` (the
-- customer-facing payment page) AND `invoice_pdf` (a direct PDF
-- download). We already capture the first; this adds the second so
-- tenants can download a PDF for their bookkeeping.
-- =====================================================================

alter table invoices
  add column if not exists stripe_invoice_pdf text;

comment on column invoices.stripe_invoice_pdf is
  'Direct PDF download URL from Stripe. Tenants click to grab a copy for their records.';
