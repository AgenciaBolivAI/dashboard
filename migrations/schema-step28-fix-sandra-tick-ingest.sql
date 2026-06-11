-- =====================================================================
-- BolivAI — Fix Sandra Tick ingest (episodes never inserted → no status)
-- =====================================================================
-- ROOT CAUSE: brain.episodes had no unique index matching the Insert
-- Episode node's ON CONFLICT ((metadata->>'conversation_id')) WHERE
-- source='elevenlabs'. So every upsert threw "no unique or exclusion
-- constraint matching the ON CONFLICT specification" and was swallowed by
-- the node's continueOnFail=true. Zero episodes → Auto-Update Lead Status
-- never received a real lead_id → leads never moved off 'new'.
--
-- This migration creates the missing partial unique index. The workflow
-- nodes (Shape Episodes done-only filter, idempotent Debit, overlap-window
-- Bump Cursor) are patched separately via the n8n API.
--
-- Idempotent.
-- =====================================================================

-- 1. Dedupe any pre-existing elevenlabs episodes sharing a conversation_id
--    (keep the physically-latest row) so the unique index can be created.
delete from brain.episodes a
using brain.episodes b
where a.source = 'elevenlabs'
  and b.source = 'elevenlabs'
  and (a.metadata->>'conversation_id') is not null
  and (a.metadata->>'conversation_id') = (b.metadata->>'conversation_id')
  and a.ctid < b.ctid;

-- 2. Partial unique index that the ON CONFLICT target needs.
create unique index if not exists episodes_elevenlabs_conv_uniq
  on brain.episodes ((metadata->>'conversation_id'))
  where source = 'elevenlabs';

comment on index brain.episodes_elevenlabs_conv_uniq is
  'Makes the Sandra/Rebecca tick Insert Episode upsert (ON CONFLICT on conversation_id WHERE source=elevenlabs) work. Without it the upsert throws and continueOnFail swallows the error → no episodes, no lead status updates.';
