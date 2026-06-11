-- =====================================================================
-- BolivAI — Vector RPC fix to match LangChain / n8n Supabase Vector Store
-- =====================================================================
-- The original match_documents / match_pain functions used a custom
-- p_tenant_id parameter, but n8n's Supabase Vector Store always calls
-- with (query_embedding, match_count, filter::jsonb). Mismatch → PGRST202
-- "function not found" errors.
--
-- Fix: drop the old signatures and recreate with the standard LangChain
-- shape, where `filter` is a jsonb that we destructure for tenant_id.
--
-- Apply once. Idempotent.
-- =====================================================================

-- Drop old (specific signatures so we don't accidentally drop the new ones)
drop function if exists match_documents(vector, int, uuid);
drop function if exists match_pain(vector, int, uuid);

-- ─── match_documents: LangChain-shaped (filter jsonb) ───────────────
create or replace function match_documents (
  query_embedding vector(1536),
  match_count     int default 3,
  filter          jsonb default '{}'::jsonb
) returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
) language sql stable as $$
  select
    d.id,
    d.content,
    coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'tenant_id', d.tenant_id,
      'source',    d.source,
      'question',  d.question,
      'answer',    d.answer,
      'response_template', d.response_template
    ) as metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where (filter->>'tenant_id' is null
         or d.tenant_id = (filter->>'tenant_id')::uuid)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── match_pain: LangChain-shaped (filter jsonb) ────────────────────
create or replace function match_pain (
  query_embedding vector(1536),
  match_count     int default 3,
  filter          jsonb default '{}'::jsonb
) returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
) language sql stable as $$
  select
    p.id,
    p.content,
    coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'tenant_id',      p.tenant_id,
      'source',         p.source,
      'symptom',        p.symptom,
      'diagnosis',      p.diagnosis,
      'recommendation', p.recommendation
    ) as metadata,
    1 - (p.embedding <=> query_embedding) as similarity
  from pain p
  where (filter->>'tenant_id' is null
         or p.tenant_id = (filter->>'tenant_id')::uuid)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
