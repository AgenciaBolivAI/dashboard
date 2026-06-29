-- =====================================================================
-- BolivAI — Step 74: Prospect-intelligence credit pricing
-- =====================================================================
-- research.prospect  — one web-grounded research run (gpt-4o-search-preview brief
--                      + a gpt-4o-mini structured extract). The search model is
--                      pricier, hence a higher charge; cost micros feed the P&L.
-- analysis.sentiment — one conversation sentiment + signals pass (gpt-4o-mini).
-- Idempotent.
-- =====================================================================

insert into public.credit_pricing
  (action_key, credits_per_unit, unit_label, description, cost_per_unit_micros, vendor_cost_micros)
values
  ('research.prospect', 15, 'research',
   'BOLIV web-grounded prospect research: gpt-4o-search-preview brief + structured extract.',
   45000, '{"openai": 45000}'::jsonb),
  ('analysis.sentiment', 3, 'analysis',
   'Conversation sentiment + buying signals (gpt-4o-mini).',
   2000, '{"openai": 2000}'::jsonb)
on conflict (action_key) do nothing;
