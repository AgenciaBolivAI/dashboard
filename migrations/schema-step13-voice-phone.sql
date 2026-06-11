-- =====================================================================
-- BolivAI — Step 13: ElevenLabs phone-number reference
-- =====================================================================
-- Apply AFTER schema-step12-voice-agents.sql.
--
-- ElevenLabs returns a phone_number_id when we import a Twilio number
-- into a tenant's agent. We need to store it so we can detach/delete
-- the number later without scanning ElevenLabs' workspace.
--
-- Idempotent — safe to re-run.
-- =====================================================================

alter table tenants
  add column if not exists voice_phone_elevenlabs_id text;

comment on column tenants.voice_phone_elevenlabs_id is
  'ElevenLabs phone-number resource ID (phnum_...) returned when we import the tenant''s Twilio number. Used to detach/delete on ElevenLabs side.';
