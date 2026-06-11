-- =====================================================================
-- BolivAI — Step 14: voice-side knowledge-base reference
-- =====================================================================
-- Apply AFTER schema-step13-voice-phone.sql.
--
-- Tracks the ElevenLabs KB doc ID that mirrors a tenant's
-- documents+pain content, plus the last-synced timestamp so the
-- dashboard can show "Synced ✓ 5 min ago".
--
-- We keep one KB doc per tenant (aggregating their full knowledge into
-- a single text doc) rather than one-per-chunk. Simpler to manage,
-- ElevenLabs indexes whole docs anyway.
--
-- Idempotent — safe to re-run.
-- =====================================================================

alter table tenants
  add column if not exists voice_kb_doc_id    text,
  add column if not exists voice_kb_synced_at timestamptz;

comment on column tenants.voice_kb_doc_id is
  'ElevenLabs knowledge-base document ID that holds this tenant''s aggregated knowledge content. Null until first sync.';
comment on column tenants.voice_kb_synced_at is
  'Timestamp of the last successful sync from documents+pain → ElevenLabs KB.';
