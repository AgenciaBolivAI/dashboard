-- =====================================================================
-- BolivAI — Step 33: KB vector search fails CLOSED on missing tenant_id
-- =====================================================================
-- SECURITY. match_documents / match_pain (schema-vector-rpc.sql) used
--   where (filter->>'tenant_id' is null OR d.tenant_id = filter->>'tenant_id')
-- i.e. a call with NO tenant_id in the filter returned EVERY tenant's KB
-- chunks (fail-open cross-tenant leak). The live WhatsApp agent workflow
-- always passes {"tenant_id": "<uuid>"}, so requiring it is safe and removes
-- the landmine: no/empty tenant_id now returns ZERO rows (fail closed).
--
-- Same LangChain-shaped signature (query_embedding, match_count, filter jsonb)
-- so n8n's Supabase Vector Store keeps working unchanged. Idempotent.
-- =====================================================================

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
  where filter ? 'tenant_id'
    and nullif(filter->>'tenant_id', '') is not null
    and d.tenant_id = (filter->>'tenant_id')::uuid
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

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
  where filter ? 'tenant_id'
    and nullif(filter->>'tenant_id', '') is not null
    and p.tenant_id = (filter->>'tenant_id')::uuid
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
