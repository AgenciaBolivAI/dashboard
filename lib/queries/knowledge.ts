import { createClient } from "@/lib/supabase/server";

export type KnowledgeType = "documents" | "pain";

export type FaqChunk = {
  id: number;
  source: string | null;
  content: string;
  question: string | null;
  answer: string | null;
  response_template: string | null;
  created_at: string;
};

export type PainChunk = {
  id: number;
  source: string | null;
  content: string;
  symptom: string | null;
  diagnosis: string | null;
  recommendation: string | null;
  created_at: string;
};

export type AnyChunk = FaqChunk | PainChunk;

/** Strip the PostgREST `.or()` grammar separators from a free-text term. */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

export async function listKnowledge(
  tenantId: string,
  type: KnowledgeType,
  opts: { search?: string } = {},
): Promise<AnyChunk[]> {
  const supabase = await createClient();
  const term = opts.search ? sanitizeSearch(opts.search) : "";

  if (type === "documents") {
    let q = supabase
      .from("documents")
      .select("id, source, content, question, answer, response_template, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (term) {
      q = q.or(`content.ilike.*${term}*,question.ilike.*${term}*,answer.ilike.*${term}*,source.ilike.*${term}*`);
    }
    const { data } = await q;
    return (data ?? []) as FaqChunk[];
  }

  let q = supabase
    .from("pain")
    .select("id, source, content, symptom, diagnosis, recommendation, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (term) {
    q = q.or(
      `content.ilike.*${term}*,symptom.ilike.*${term}*,diagnosis.ilike.*${term}*,recommendation.ilike.*${term}*,source.ilike.*${term}*`,
    );
  }
  const { data } = await q;
  return (data ?? []) as PainChunk[];
}

export type KnowledgeSource = {
  source: string;
  chunk_count: number;
  ingested_at: string;
};

/**
 * Every uploaded source for a tenant joined with the current count of chunks
 * (in the relevant table). Includes orphans — record_manager rows whose
 * chunks have been deleted — so they can be cleaned up to re-upload.
 */
export async function listSources(
  tenantId: string,
  type: KnowledgeType,
): Promise<KnowledgeSource[]> {
  const supabase = await createClient();
  const { data: rmRows } = await supabase
    .from("record_manager")
    .select("source, ingested_at")
    .eq("tenant_id", tenantId)
    .order("ingested_at", { ascending: false });

  const sources = (rmRows ?? []) as Array<{ source: string; ingested_at: string }>;
  if (sources.length === 0) return [];

  const table = type === "documents" ? "documents" : "pain";
  const { data: rows } = await supabase
    .from(table)
    .select("source")
    .eq("tenant_id", tenantId)
    .in("source", sources.map((s) => s.source));

  const counts = new Map<string, number>();
  for (const r of (rows ?? []) as Array<{ source: string }>) {
    counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  }

  return sources.map((s) => ({
    source: s.source,
    chunk_count: counts.get(s.source) ?? 0,
    ingested_at: s.ingested_at,
  }));
}

export type KnowledgeStats = {
  documentsCount: number;
  painCount: number;
  sourcesCount: number;
};

export async function getKnowledgeStats(tenantId: string): Promise<KnowledgeStats> {
  const supabase = await createClient();
  const [docsRes, painRes, srcRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("pain")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("record_manager")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  return {
    documentsCount: docsRes.count ?? 0,
    painCount: painRes.count ?? 0,
    sourcesCount: srcRes.count ?? 0,
  };
}
