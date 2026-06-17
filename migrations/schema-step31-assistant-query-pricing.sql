-- =====================================================================
-- BolivAI — pricing for the tenant analytics assistant
-- =====================================================================
-- The "Ask your business" assistant (lib/analytics-tools) charges a flat
-- 1 credit per answered question. Real cost is ~0.25-0.5 credits of
-- gpt-4o-mini tool-calling, so 1 credit = ~2-4x markup with margin.
-- Debited via debit_credits('assistant.query') on each successful answer
-- (lib/actions/assistant.ts), after a balance pre-check (pauses at zero
-- like every other agent). Idempotent.
-- =====================================================================

insert into public.credit_pricing
  (action_key, credits_per_unit, unit_label, description, cost_per_unit_micros, vendor_cost_micros)
values
  ('assistant.query', 1, 'message',
   'Tenant analytics assistant question (gpt-4o-mini tool-calling loop).',
   4000, '{"openai": 4000}'::jsonb)
on conflict (action_key) do nothing;
