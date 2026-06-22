-- =====================================================================
-- BolivAI — Step 50: scaling indexes (pre-growth).
-- An audit of pg_indexes showed the schema is already well-indexed: nearly
-- every tenant-scoped table has a tenant_id-leading composite index. Only three
-- gaps remained. Adding them now while the tables are tiny (no lock cost); at
-- volume these would otherwise become sequential scans on the hottest paths.
-- =====================================================================

-- (1) HOTTEST PATH — the LLM conversation memory. The n8n Postgres Chat Memory
-- node reads `where session_id = $1 order by id` on EVERY inbound agent message,
-- and this table is append-only (never pruned). With only a pkey it was a full
-- sequential scan that grows unbounded across all tenants. This is the single
-- most important index for scale.
create index if not exists idx_n8n_chat_histories_session
  on public.n8n_chat_histories (session_id, id);

-- (2) Knowledge base documents: tenant-scoped listing + the RLS tenant_id check.
-- (The HNSW embedding index already covers vector search; this covers the
-- "list / filter this tenant's docs" path.)
create index if not exists idx_documents_tenant
  on public.documents (tenant_id, created_at desc);

-- (3) chat_history: the per-conversation path is already indexed
-- (conversation_id, created_at). Add the tenant-wide path for analytics /
-- tenant-scoped scans and the RLS tenant_id predicate.
create index if not exists idx_chat_history_tenant_time
  on public.chat_history (tenant_id, created_at desc);
