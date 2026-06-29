-- =====================================================================
-- BolivAI — Step 65: Marketing credit pricing (P2)
-- =====================================================================
-- Per-send / per-draft pricing for the marketing layer. credits_per_unit is what
-- the tenant pays; cost_per_unit_micros (+ vendor_cost_micros) feed the admin P&L
-- (markup over real vendor cost). Debited via debit_credits('marketing.*') on
-- each confirmed send / draft. Idempotent.
-- =====================================================================

insert into public.credit_pricing
  (action_key, credits_per_unit, unit_label, description, cost_per_unit_micros, vendor_cost_micros)
values
  ('marketing.email_broadcast', 2, 'email',
   'One marketing email sent to a recipient (tenant Gmail/SMTP).',
   500, '{}'::jsonb),
  ('marketing.whatsapp_broadcast', 3, 'message',
   'One marketing WhatsApp message sent via Evolution.',
   1000, '{}'::jsonb),
  ('marketing.sms_broadcast', 8, 'message',
   'One marketing SMS sent via the tenant Twilio number.',
   8000, '{"twilio": 7900}'::jsonb),
  ('marketing.ai_copy_draft', 3, 'draft',
   'BOLIV drafts campaign copy (subject + body) via the LLM.',
   3000, '{"openai": 3000}'::jsonb)
on conflict (action_key) do nothing;
