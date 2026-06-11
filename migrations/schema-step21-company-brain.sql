-- =====================================================================
-- BolivAI — Company Brain (knowledge graph foundation)
-- =====================================================================
-- "Living map of how the company works." Three tables that sit under the
-- existing `brain.*` schema (CastilloOS):
--
--   brain.docs        — embedded source documents (memory/, docs/, sql/,
--                       prompts, ElevenLabs KBs, worker READMEs, etc.).
--                       The actual content is stored verbatim + embedded
--                       for semantic search. Hash dedup prevents
--                       re-embedding unchanged files.
--
--   brain.decisions   — intentional ADR-style records. The thing humans
--                       (Celiel) explicitly write down: "we picked X over
--                       Y, because Z, in the context of A, on 2026-06-11."
--                       Embedded so they're searchable alongside docs.
--
--   brain.unknowns    — open questions the company knows it doesn't know
--                       yet. Status flips from 'open' → 'answered' when a
--                       doc or decision answers them.
--
-- RLS: bolivai_admin only. This is INTERNAL company knowledge, not tenant
-- data. Other tenants must NEVER see these tables.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- pgvector should already be enabled (BolivAI uses it). Be defensive:
create extension if not exists vector;

-- ── brain.docs — embedded source documents ───────────────────────────
create table if not exists brain.docs (
  id            uuid primary key default gen_random_uuid(),

  source_type   text not null
    check (source_type in (
      'memory',         -- C:\Users\celie\.claude\projects\...\memory\*.md
      'platform_doc',   -- platform/docs/*.md (KBs, prompts)
      'schema',         -- platform/schema-*.sql
      'worker_doc',     -- castillo-os/workers/README.md and similar
      'workflow_meta',  -- n8n workflow names + descriptions
      'code_doc',       -- top-of-file comments in lib/components
      'manual'          -- pasted by Celiel directly via admin UI
    )),
  source_path   text not null,                       -- canonical path relative to repo root
  title         text not null,                       -- human-readable (first H1 or filename)
  content       text not null,                       -- full document text (capped at ~50KB chunks for now)
  content_hash  text not null,                       -- sha256 of content; lets us skip re-embedding
  embedding     vector(1536),                        -- text-embedding-3-small

  -- Discovery metadata: tags, related entity refs, custom annotations
  metadata      jsonb not null default '{}',

  indexed_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique on (source_type, source_path) so re-ingesting the same file
-- updates the row in place
create unique index if not exists idx_brain_docs_source on brain.docs (source_type, source_path);

-- ivfflat is good enough at our scale (<10K docs). Switch to HNSW later if needed.
create index if not exists idx_brain_docs_embedding on brain.docs
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create or replace function brain.docs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_brain_docs_updated on brain.docs;
create trigger trg_brain_docs_updated
  before update on brain.docs
  for each row execute function brain.docs_set_updated_at();

-- ── brain.decisions — intentional ADRs ───────────────────────────────
create table if not exists brain.decisions (
  id                  uuid primary key default gen_random_uuid(),

  title               text not null,                 -- "Switch from Apollo to Google Maps for AIMA"
  problem             text not null,                 -- the context that forced the choice
  options_considered  jsonb not null default '[]',   -- [{name, reasoning, rejected_why}]
  choice              text not null,                 -- what we picked
  choice_reasoning    text not null,                 -- why this option won
  context_tags        text[] not null default array[]::text[],

  -- Links to source material
  related_doc_ids     uuid[] not null default array[]::uuid[],

  decided_at          timestamptz not null default now(),
  decided_by          text,                          -- "Celiel" or future: user_id

  -- For semantic search
  embedding           vector(1536)
);

create index if not exists idx_brain_decisions_decided_at on brain.decisions (decided_at desc);
create index if not exists idx_brain_decisions_embedding on brain.decisions
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- ── brain.unknowns — known unknowns ──────────────────────────────────
create table if not exists brain.unknowns (
  id              uuid primary key default gen_random_uuid(),
  question        text not null,                     -- "How do we handle multi-currency invoices?"
  context         text,                              -- why this matters

  status          text not null default 'open'
                    check (status in ('open','answered','obsolete')),

  answered_by_doc_id        uuid references brain.docs(id) on delete set null,
  answered_by_decision_id   uuid references brain.decisions(id) on delete set null,
  answer_summary            text,
  answered_at               timestamptz,

  raised_at       timestamptz not null default now(),
  raised_by       text
);

create index if not exists idx_brain_unknowns_status on brain.unknowns (status, raised_at desc);

-- ── RLS lockdown — admin only ────────────────────────────────────────
alter table brain.docs enable row level security;
alter table brain.decisions enable row level security;
alter table brain.unknowns enable row level security;

drop policy if exists "brain_docs_admin_select" on brain.docs;
create policy "brain_docs_admin_select"
  on brain.docs for select
  to authenticated
  using (public.is_bolivai_admin());

drop policy if exists "brain_decisions_admin_select" on brain.decisions;
create policy "brain_decisions_admin_select"
  on brain.decisions for select
  to authenticated
  using (public.is_bolivai_admin());

drop policy if exists "brain_unknowns_admin_select" on brain.unknowns;
create policy "brain_unknowns_admin_select"
  on brain.unknowns for select
  to authenticated
  using (public.is_bolivai_admin());

-- Writes are server-side only (createServiceClient bypasses RLS)
revoke all on brain.docs from anon, authenticated;
revoke all on brain.decisions from anon, authenticated;
revoke all on brain.unknowns from anon, authenticated;
grant select on brain.docs to authenticated;
grant select on brain.decisions to authenticated;
grant select on brain.unknowns to authenticated;
grant all on brain.docs to service_role;
grant all on brain.decisions to service_role;
grant all on brain.unknowns to service_role;

-- ── Search RPC — cosine similarity over docs + decisions ─────────────
-- Caller embeds the query (text-embedding-3-small, server-side) and passes
-- the vector. RPC returns top-k matches across BOTH docs and decisions,
-- unified into one ranked list with a `source` discriminator.
create or replace function brain.search_company(
  p_query_embedding vector(1536),
  p_top_k           int default 8,
  p_min_similarity  float default 0.50
)
returns table (
  source        text,
  id            uuid,
  title         text,
  content       text,
  source_path   text,
  similarity    float,
  metadata      jsonb,
  decided_at    timestamptz
)
language sql
security definer
set search_path = brain, public
as $$
  with doc_matches as (
    select
      'doc'::text          as source,
      d.id,
      d.title,
      d.content,
      d.source_path,
      1 - (d.embedding <=> p_query_embedding) as similarity,
      d.metadata,
      null::timestamptz    as decided_at
    from brain.docs d
    where d.embedding is not null
      and 1 - (d.embedding <=> p_query_embedding) >= p_min_similarity
  ),
  decision_matches as (
    select
      'decision'::text     as source,
      dec.id,
      dec.title,
      dec.problem || E'\n\n' || dec.choice_reasoning as content,
      ''::text             as source_path,
      1 - (dec.embedding <=> p_query_embedding) as similarity,
      jsonb_build_object(
        'choice', dec.choice,
        'context_tags', dec.context_tags
      ) as metadata,
      dec.decided_at
    from brain.decisions dec
    where dec.embedding is not null
      and 1 - (dec.embedding <=> p_query_embedding) >= p_min_similarity
  )
  select * from doc_matches
  union all
  select * from decision_matches
  order by similarity desc
  limit p_top_k;
$$;

comment on function brain.search_company is
  'Semantic search across brain.docs + brain.decisions. Caller embeds the query text with text-embedding-3-small (1536-dim) and passes the vector. Returns top-k matches unified with similarity score + source discriminator.';

-- ── A tiny stats helper for the admin overview ──────────────────────
create or replace function brain.knowledge_stats()
returns table (
  total_docs      bigint,
  total_decisions bigint,
  open_unknowns   bigint,
  docs_by_source  jsonb,
  last_indexed_at timestamptz
)
language sql
security definer
set search_path = brain, public
as $$
  select
    (select count(*) from brain.docs)                                as total_docs,
    (select count(*) from brain.decisions)                           as total_decisions,
    (select count(*) from brain.unknowns where status = 'open')      as open_unknowns,
    (select jsonb_object_agg(source_type, c) from (
       select source_type, count(*) as c from brain.docs group by source_type
     ) t)                                                            as docs_by_source,
    (select max(indexed_at) from brain.docs)                         as last_indexed_at;
$$;
