-- =====================================================================
-- BolivAI — per-vendor cost attribution
-- =====================================================================
-- Adds vendor-level cost breakdown to each action_key so we can answer
-- questions like "how much OpenAI did the platform consume yesterday"
-- and "what's our ElevenLabs run rate this week".
--
-- The existing credit_pricing.cost_per_unit_micros is the TOTAL cost.
-- vendor_cost_micros breaks that total down by vendor. Sums across
-- vendor_cost_micros values should equal cost_per_unit_micros for
-- each row (we don't enforce it as a constraint — just keep them in
-- sync when tuning).
--
-- Vendors we track:
--   openai       - GPT-4o-mini, GPT-image-1, text embeddings
--   elevenlabs   - Voice synthesis + transcription
--   twilio       - Phone call legs + dial attempts
--   google_maps  - Places API (AIMA scraping)
--   apollo       - B2B contact data (deprecated)
--   instantly    - Cold email sending (deprecated)
--   daily_co     - Video meeting infrastructure
--
-- Idempotent. Safe to re-run.
-- =====================================================================

alter table public.credit_pricing
  add column if not exists vendor_cost_micros jsonb not null default '{}'::jsonb;

comment on column public.credit_pricing.vendor_cost_micros is
  'Per-vendor cost breakdown in micro-dollars (millionths of USD). Sum should equal cost_per_unit_micros. Keys: openai, elevenlabs, twilio, google_maps, apollo, instantly, daily_co. Used to answer "how much OpenAI did we burn yesterday".';

-- ── Seed vendor breakdowns per action_key ────────────────────────────
-- Numbers chosen so each row's vendor totals add to cost_per_unit_micros.
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('openai', 1000)
  where action_key = 'whatsapp.agent_turn';

-- Inbound voice ($0.20 cost = 200_000 micros): ElevenLabs ~$0.10 + Twilio ~$0.013 + OpenAI ~$0.08 + overhead ~$0.007
update public.credit_pricing set vendor_cost_micros = jsonb_build_object(
  'elevenlabs', 100000,
  'twilio', 20000,
  'openai', 80000
) where action_key = 'voice.inbound.minute';

update public.credit_pricing set vendor_cost_micros = jsonb_build_object()
  where action_key = 'voice.inbound.reservation';

-- Outbound voice ($0.25): ElevenLabs $0.10 + Twilio $0.05 + OpenAI $0.10
update public.credit_pricing set vendor_cost_micros = jsonb_build_object(
  'elevenlabs', 100000,
  'twilio', 50000,
  'openai', 100000
) where action_key = 'voice.outbound.minute';

-- Per-call charges from Twilio (connection, dial attempts)
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('twilio', 50000)
  where action_key = 'voice.outbound.connected_call';
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('twilio', 20000)
  where action_key = 'voice.outbound.no_answer';

-- CCAVAI content: drafts use gpt-4o-mini, branded images use gpt-image-1
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('openai', 1000)
  where action_key = 'content.draft_per_platform';
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('openai', 50000)
  where action_key = 'content.branded_image';

-- Marketing: each row maps 1:1 to its vendor
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('google_maps', 17000)
  where action_key = 'marketing.lead_scraped_google_maps';
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('apollo', 10000)
  where action_key = 'marketing.lead_scraped_apollo';
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('instantly', 10000)
  where action_key = 'marketing.cold_email_sent';
update public.credit_pricing set vendor_cost_micros = '{}'::jsonb
  where action_key = 'marketing.lead_scraped_diy';

-- Calendar booking + invoicing: no vendor cost (Stripe takes their own cut on invoices)
update public.credit_pricing set vendor_cost_micros = '{}'::jsonb
  where action_key in ('calendar.appointment_booked', 'invoice.sent');

-- Video meetings via Daily.co
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('daily_co', 1000)
  where action_key = 'video.meeting_minute';

-- KB sync: OpenAI embeddings
update public.credit_pricing set vendor_cost_micros = jsonb_build_object('openai', 1000)
  where action_key = 'knowledge.kb_sync';

-- ── Sanity check: vendor breakdown vs total cost ─────────────────────
do $$
declare row record;
declare sum_vendor bigint;
begin
  for row in (select action_key, cost_per_unit_micros, vendor_cost_micros from public.credit_pricing) loop
    if row.vendor_cost_micros is null then continue; end if;
    select coalesce(sum((value)::bigint), 0) into sum_vendor
    from jsonb_each_text(row.vendor_cost_micros);
    if sum_vendor <> 0 and sum_vendor <> row.cost_per_unit_micros then
      raise notice 'MISMATCH on %: total=%, vendor sum=%',
        row.action_key, row.cost_per_unit_micros, sum_vendor;
    end if;
  end loop;
end $$;
