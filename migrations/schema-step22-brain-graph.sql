-- =====================================================================
-- BolivAI — Brain graph: doc→entity join table + graph RPCs
-- =====================================================================
-- Adds the missing piece for the visual graph and per-entity drill-down:
--
--   brain.doc_entities — which entities were extracted from which doc.
--                        Each (doc_id, entity_id) is unique. Lets us answer
--                        "which docs mention AIMA" from the entity page,
--                        and "what entities did this doc surface" in
--                        reverse.
--
-- Plus two RPCs:
--
--   brain.get_graph(p_type_filter text[], p_min_mentions int)
--     Returns { nodes, edges } shaped for force-directed rendering.
--     Optional filters: subset of types, min mention_count threshold.
--
--   brain.get_entity_full(p_entity_id uuid)
--     Returns entity + its incoming/outgoing edges + the docs that
--     mentioned it. Powers /admin/brain/entity/[id].
--
-- Idempotent. Safe to re-run.
-- =====================================================================

create table if not exists brain.doc_entities (
  doc_id       uuid not null references brain.docs(id)     on delete cascade,
  entity_id    uuid not null references brain.entities(id) on delete cascade,
  -- Multiple extractions can re-confirm the same pair; we bump a counter
  -- rather than create duplicates.
  extraction_count int not null default 1,
  last_extracted_at timestamptz not null default now(),
  primary key (doc_id, entity_id)
);

create index if not exists idx_brain_doc_entities_entity
  on brain.doc_entities (entity_id);

-- ── Graph payload RPC ────────────────────────────────────────────────
create or replace function brain.get_graph(
  p_type_filter   text[] default null,           -- null = all types
  p_min_mentions  int    default 1
)
returns jsonb
language plpgsql
security definer
set search_path = brain, public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            e.id,
        'name',          e.name,
        'type',          e.type,
        'summary',       e.summary,
        'mention_count', e.mention_count,
        'last_seen',     e.last_seen
      ))
      from brain.entities e
      where (p_type_filter is null or e.type = any(p_type_filter))
        and e.mention_count >= p_min_mentions
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source',   ed.from_entity,
        'target',   ed.to_entity,
        'relation', ed.relation,
        'weight',   ed.weight
      ))
      from brain.edges ed
      where exists (
        select 1 from brain.entities e1
        where e1.id = ed.from_entity
          and (p_type_filter is null or e1.type = any(p_type_filter))
          and e1.mention_count >= p_min_mentions
      )
        and exists (
        select 1 from brain.entities e2
        where e2.id = ed.to_entity
          and (p_type_filter is null or e2.type = any(p_type_filter))
          and e2.mention_count >= p_min_mentions
      )
    ), '[]'::jsonb)
  )
  into result;
  return result;
end $$;

comment on function brain.get_graph is
  'Returns {nodes, edges} for force-directed graph rendering. Optional type filter (subset of entity types) + min_mentions threshold to trim noise. Edges are filtered to keep only those connecting two surviving nodes.';

-- ── Per-entity drill-down RPC ───────────────────────────────────────
create or replace function brain.get_entity_full(
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = brain, public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'entity', (
      select to_jsonb(e) - 'embedding'
      from brain.entities e
      where e.id = p_entity_id
    ),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'edge_id',  ed.id,
        'relation', ed.relation,
        'weight',   ed.weight,
        'other',    jsonb_build_object(
                      'id',   target.id,
                      'name', target.name,
                      'type', target.type,
                      'mention_count', target.mention_count
                    )
      ) order by ed.weight desc, target.mention_count desc)
      from brain.edges ed
      join brain.entities target on target.id = ed.to_entity
      where ed.from_entity = p_entity_id
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'edge_id',  ed.id,
        'relation', ed.relation,
        'weight',   ed.weight,
        'other',    jsonb_build_object(
                      'id',   src.id,
                      'name', src.name,
                      'type', src.type,
                      'mention_count', src.mention_count
                    )
      ) order by ed.weight desc, src.mention_count desc)
      from brain.edges ed
      join brain.entities src on src.id = ed.from_entity
      where ed.to_entity = p_entity_id
    ), '[]'::jsonb),
    'docs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_id',           d.id,
        'title',            d.title,
        'source_type',      d.source_type,
        'source_path',      d.source_path,
        'extraction_count', de.extraction_count,
        'updated_at',       d.updated_at
      ) order by de.extraction_count desc, d.updated_at desc)
      from brain.doc_entities de
      join brain.docs d on d.id = de.doc_id
      where de.entity_id = p_entity_id
    ), '[]'::jsonb)
  )
  into result;
  return result;
end $$;

comment on function brain.get_entity_full is
  'Returns the entity + its outgoing/incoming edges with the other entity inlined + the docs that mention it (with extraction_count for ranking). Powers /admin/brain/entity/[id].';

-- ── RLS: admin only (consistent with the rest of the brain.* knowledge tables)
alter table brain.doc_entities enable row level security;

drop policy if exists "doc_entities_admin_select" on brain.doc_entities;
create policy "doc_entities_admin_select"
  on brain.doc_entities for select
  to authenticated
  using (public.is_bolivai_admin());

revoke all on brain.doc_entities from anon, authenticated;
grant select on brain.doc_entities to authenticated;
grant all on brain.doc_entities to service_role;
