-- =====================================================================
-- BolivAI — Voice phone configuration per tenant
-- =====================================================================
-- Stores the Twilio (or other-provider) phone number assigned to each
-- tenant for both inbound (Rebecca) and outbound (Sandra) voice calls,
-- along with the ElevenLabs identifiers needed to actually drive calls
-- via their Conversational AI API.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

alter table public.tenants
  add column if not exists voice_phone_number text,
  add column if not exists voice_elevenlabs_outbound_phone_id text,
  add column if not exists voice_elevenlabs_sandra_agent_id text,
  add column if not exists voice_elevenlabs_rebecca_agent_id text;

comment on column public.tenants.voice_phone_number is
  'E.164 phone number assigned to this tenant for outbound (Sandra) and inbound (Rebecca) voice calls. Stored as e.g. ''+18888690795''.';
comment on column public.tenants.voice_elevenlabs_outbound_phone_id is
  'ElevenLabs phone_number_id for outbound calls — required by ElevenLabs convai/twilio/outbound-call endpoint.';
comment on column public.tenants.voice_elevenlabs_sandra_agent_id is
  'ElevenLabs agent_id for this tenant''s Sandra (outbound). Multi-agent tenants will get their own ID.';
comment on column public.tenants.voice_elevenlabs_rebecca_agent_id is
  'ElevenLabs agent_id for this tenant''s Rebecca (inbound).';

-- Initial values for BolivAI's own tenant — single Twilio toll-free
-- shared between Sandra (outbound) and Rebecca (inbound).
update public.tenants
   set voice_phone_number = coalesce(voice_phone_number, '+18888690795'),
       voice_elevenlabs_outbound_phone_id = coalesce(voice_elevenlabs_outbound_phone_id, 'phnum_5001ktvmfjnfff8tj9yrf2xfr8h7'),
       voice_elevenlabs_sandra_agent_id  = coalesce(voice_elevenlabs_sandra_agent_id,  'agent_7701ktjmj6mmecgt64nd8w9x7gez'),
       voice_elevenlabs_rebecca_agent_id = coalesce(voice_elevenlabs_rebecca_agent_id, 'agent_6201ktkwyvv4e0yskg72wwxexde9')
 where id = '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'::uuid;
