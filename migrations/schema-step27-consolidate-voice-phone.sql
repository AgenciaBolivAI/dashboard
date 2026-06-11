-- =====================================================================
-- BolivAI — Consolidate voice phone columns
-- =====================================================================
-- Two columns were both storing the ElevenLabs phone_number_id, never
-- unified across the codebase: voice_phone_elevenlabs_id (older, used by
-- attachTwilioNumberAction) and voice_elevenlabs_outbound_phone_id
-- (newer, used by the post-step23 voice actions + Sandra batch call).
--
-- This migration copies whatever's in the old column into the new one
-- (if the new is null), then drops the old one. BolivAI tenant already
-- has its value in the new column, so this is a no-op data-wise for us
-- but cleans up the schema before any new tenants attach a number.
--
-- Idempotent.
-- =====================================================================

-- 1. Copy any remaining values from old → new (if new is null)
update public.tenants
set voice_elevenlabs_outbound_phone_id = voice_phone_elevenlabs_id
where voice_phone_elevenlabs_id is not null
  and voice_elevenlabs_outbound_phone_id is null;

-- 2. Drop the deprecated column
alter table public.tenants
  drop column if exists voice_phone_elevenlabs_id;

comment on column public.tenants.voice_elevenlabs_outbound_phone_id is
  'ElevenLabs phone_number_id returned by /v1/convai/phone-numbers/create after a tenant attaches their Twilio number. Used for both outbound (passed as agent_phone_number_id in the call body) and inbound (the number is assigned to MASTER_REBECCA_AGENT_ID so ElevenLabs routes inbound calls to her).';
