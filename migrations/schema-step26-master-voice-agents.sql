-- =====================================================================
-- BolivAI — Master voice agents + tenant voice_persona
-- =====================================================================
-- Architecture change: tenants no longer have their own ElevenLabs agent
-- IDs. We use ONE Sandra and ONE Rebecca on BolivAI's master account, and
-- override their behavior per call via ElevenLabs's conversation_config_
-- override + dynamic_variables. Tenants only edit a small persona JSON
-- (business name, language, voice, first message, value prop, FAQ, etc.)
-- and never touch ElevenLabs.
--
-- This drops the per-tenant agent_id columns (and step25's unique
-- constraints on them) and adds the voice_persona JSONB.
--
-- Kept as-is:
--   voice_elevenlabs_outbound_phone_id  — phone numbers ARE still per
--                                          tenant (different number per
--                                          tenant; see commit message for
--                                          the provisioning plan).
--   voice_phone_number                  — display-friendly mirror.
--
-- Idempotent.
-- =====================================================================

-- 1. Drop step25 unique indexes on the agent_id columns first (FKs to columns we're dropping)
drop index if exists public.tenants_voice_sandra_agent_unique;
drop index if exists public.tenants_voice_rebecca_agent_unique;

-- 2. Drop the per-tenant agent_id columns
alter table public.tenants
  drop column if exists voice_elevenlabs_sandra_agent_id,
  drop column if exists voice_elevenlabs_rebecca_agent_id;

-- 3. Add voice_persona JSONB
alter table public.tenants
  add column if not exists voice_persona jsonb not null default '{}'::jsonb;

comment on column public.tenants.voice_persona is
  'Tenant-specific voice agent persona, applied per call as ElevenLabs conversation_config_override. Shape: { business_name, business_description, voice_id, language, sandra: { first_message, value_prop, forbidden_topics }, rebecca: { first_message, faq, forbidden_topics } }. All fields optional; master prompts in code fill the gaps.';

-- 4. Seed BolivAI's persona from what Sandra + Rebecca currently say so the
--    architecture switch is invisible to anyone calling our line.
update public.tenants
set voice_persona = jsonb_build_object(
  'business_name',        'BolivAI',
  'business_description', 'Plataforma de AI agents para PyMEs: Sandra (ventas), Rebecca (soporte), agente de WhatsApp, AIMA (leads), VIRA (video).',
  'language',             'es',
  'sandra', jsonb_build_object(
    'first_message',      'Hola, te habla Sandra de BolivAI.',
    'value_prop',         'Ayudamos a negocios a automatizar ventas y soporte con AI agents que trabajan 24/7.',
    'forbidden_topics',   'No prometer integraciones específicas sin confirmar; no compartir precios sin antes calificar el caso del cliente.'
  ),
  'rebecca', jsonb_build_object(
    'first_message',      'Hola, gracias por llamar a BolivAI. Soy Rebecca, ¿en qué puedo ayudarte?',
    'faq',                'Self-service signup en bolivai.cloud/signup. Demos las agenda Sandra. Soporte: hola@bolivai.com.',
    'forbidden_topics',   'No agendar demos en este canal (eso lo hace Sandra). No compartir precios sin antes calificar.'
  )
)
where id = '5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f'
  and (voice_persona is null or voice_persona = '{}'::jsonb);
