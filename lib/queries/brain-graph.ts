/**
 * Brain graph queries — read-side helpers that hit the brain.* schema
 * via PostgREST (Supabase JS client doesn't expose non-public schemas
 * ergonomically for us, so we go REST with Accept-Profile: brain).
 *
 * All callers are bolivai_admin gated upstream.
 */

export type GraphNode = {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  mention_count: number;
  last_seen: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: string;
  weight: number;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type EntityFull = {
  entity: {
    id: string;
    name: string;
    type: string;
    summary: string | null;
    mention_count: number;
    first_seen: string;
    last_seen: string;
    metadata: Record<string, unknown> | null;
    agent_id: string | null;
  } | null;
  outgoing: Array<{
    edge_id: string;
    relation: string;
    weight: number;
    other: { id: string; name: string; type: string; mention_count: number };
  }>;
  incoming: Array<{
    edge_id: string;
    relation: string;
    weight: number;
    other: { id: string; name: string; type: string; mention_count: number };
  }>;
  docs: Array<{
    doc_id: string;
    title: string;
    source_type: string;
    source_path: string;
    extraction_count: number;
    updated_at: string;
  }>;
};

function brainHeaders(): Record<string, string> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    "Accept-Profile": "brain",
    "Content-Profile": "brain",
  };
}

function supabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export async function getGraph(opts: {
  types?: string[];
  minMentions?: number;
} = {}): Promise<GraphPayload> {
  const url = `${supabaseUrl()}/rest/v1/rpc/get_graph`;
  const res = await fetch(url, {
    method: "POST",
    headers: brainHeaders(),
    body: JSON.stringify({
      p_type_filter: opts.types ?? null,
      p_min_mentions: opts.minMentions ?? 1,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`getGraph ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { nodes: [], edges: [] };
  }
  return (await res.json()) as GraphPayload;
}

export async function getEntityFull(entityId: string): Promise<EntityFull | null> {
  const url = `${supabaseUrl()}/rest/v1/rpc/get_entity_full`;
  const res = await fetch(url, {
    method: "POST",
    headers: brainHeaders(),
    body: JSON.stringify({ p_entity_id: entityId }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`getEntityFull ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as EntityFull;
  if (!data?.entity) return null;
  return data;
}

export type DocFull = {
  doc: {
    id: string;
    source_type: string;
    source_path: string;
    title: string;
    content: string;
    metadata: Record<string, unknown> | null;
    indexed_at: string;
    updated_at: string;
  } | null;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    summary: string | null;
    mention_count: number;
  }>;
};

export async function getDocFull(docId: string): Promise<DocFull | null> {
  const url = `${supabaseUrl()}/rest/v1/rpc/get_doc_full`;
  const res = await fetch(url, {
    method: "POST",
    headers: brainHeaders(),
    body: JSON.stringify({ p_doc_id: docId }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as DocFull;
  if (!data?.doc) return null;
  return data;
}

// Used by search results that want to deep-link directly to the entity page
// without having a UUID handy. Returns null if no exact (case-insensitive)
// match exists.
export async function findEntityByName(
  name: string,
  type?: string,
): Promise<{ id: string } | null> {
  const params = new URLSearchParams();
  params.set("name", `ilike.${name}`);
  if (type) params.set("type", `eq.${type}`);
  params.set("agent_id", "is.null");
  params.set("select", "id");
  params.set("limit", "1");
  const url = `${supabaseUrl()}/rest/v1/entities?${params.toString()}`;
  const res = await fetch(url, {
    headers: brainHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0] ?? null;
}
