-- =====================================================================
-- BolivAI — Voice agent uniqueness constraints
-- =====================================================================
-- A tenant must NEVER share an ElevenLabs agent_id or phone_number_id
-- with another tenant. Sharing would mean Tenant B's calls flow through
-- Tenant A's tools URL (which has Tenant A's tenant_id baked in at agent-
-- creation time), and the tools handlers would scope writes to the wrong
-- tenant. Cross-tenant data leak.
--
-- These partial unique indexes (WHERE column IS NOT NULL) enforce
-- uniqueness while still allowing multiple tenants to have unset voice
-- config (most do — voice is opt-in).
--
-- Idempotent.
-- =====================================================================

create unique index if not exists tenants_voice_sandra_agent_unique
  on public.tenants (voice_elevenlabs_sandra_agent_id)
  where voice_elevenlabs_sandra_agent_id is not null;

create unique index if not exists tenants_voice_rebecca_agent_unique
  on public.tenants (voice_elevenlabs_rebecca_agent_id)
  where voice_elevenlabs_rebecca_agent_id is not null;

create unique index if not exists tenants_voice_outbound_phone_unique
  on public.tenants (voice_elevenlabs_outbound_phone_id)
  where voice_elevenlabs_outbound_phone_id is not null;

comment on index public.tenants_voice_sandra_agent_unique is
  'Enforces 1:1 mapping between Sandra agents and tenants. Inserting a second tenant with the same Sandra agent_id will fail with 23505. NULL allowed.';
comment on index public.tenants_voice_rebecca_agent_unique is
  'Same enforcement for Rebecca. NULL allowed.';
comment on index public.tenants_voice_outbound_phone_unique is
  'Same enforcement for the Twilio number ID (ElevenLabs phone_number_id). NULL allowed.';
