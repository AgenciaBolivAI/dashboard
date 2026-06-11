"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";

export type BrainSearchHit = {
  source: "doc" | "decision";
  id: string;
  title: string;
  content: string;
  source_path: string;
  similarity: number;
  metadata: Record<string, unknown>;
  decided_at: string | null;
};

export type BrainSearchState = {
  error: string | null;
  query?: string;
  hits?: BrainSearchHit[];
  total_ms?: number;
};

const querySchema = z.object({
  query: z.string().trim().min(2).max(500),
  top_k: z.coerce.number().int().min(1).max(30).default(8),
});

/**
 * Embed the query with text-embedding-3-small + call the brain.search_company
 * RPC. Returns top-k unified matches across docs + decisions.
 *
 * Cost: ~$0.0001 per query (negligible). The expensive part is the
 * ingest, which is amortized across many searches.
 */
export async function searchCompanyBrainAction(
  query: string,
  top_k = 8,
): Promise<BrainSearchState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = querySchema.safeParse({ query, top_k });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "OPENAI_API_KEY no configurado" };

  const t0 = Date.now();
  // Embed the query
  let queryEmbedding: number[];
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: parsed.data.query,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { error: `OpenAI embed ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    queryEmbedding = json.data[0]!.embedding;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Embed failed: ${msg}` };
  }

  // Call the brain.search_company RPC. We use the REST API directly with
  // the Accept-Profile header so we hit the brain schema.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  let hits: BrainSearchHit[];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/search_company`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": "brain",
        "Content-Profile": "brain",
      },
      body: JSON.stringify({
        p_query_embedding: queryEmbedding,
        p_top_k: parsed.data.top_k,
        p_min_similarity: 0.3,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { error: `RPC ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    hits = (await res.json()) as BrainSearchHit[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `RPC failed: ${msg}` };
  }

  return {
    error: null,
    query: parsed.data.query,
    hits,
    total_ms: Date.now() - t0,
  };
}

// ── Add a manual ADR / decision ─────────────────────────────────────
const decisionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  problem: z.string().trim().min(10).max(2000),
  choice: z.string().trim().min(2).max(500),
  choice_reasoning: z.string().trim().min(10).max(2000),
  context_tags: z.array(z.string().trim().max(40)).max(10).optional(),
});

export type DecisionState = { error: string | null; success?: boolean; id?: string };

export async function recordDecisionAction(
  fields: z.infer<typeof decisionSchema>,
): Promise<DecisionState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = decisionSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "OPENAI_API_KEY no configurado" };

  // Embed (title + problem + choice + reasoning) so the decision is findable
  // by question that asks about any of those facets.
  const embedText = [
    parsed.data.title,
    parsed.data.problem,
    `Elegimos: ${parsed.data.choice}`,
    parsed.data.choice_reasoning,
  ].join("\n\n");

  let embedding: number[];
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: embedText }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { error: `OpenAI embed ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    embedding = json.data[0]!.embedding;
  } catch (e) {
    return { error: `Embed failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/decisions`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": "brain",
      "Content-Profile": "brain",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      title: parsed.data.title,
      problem: parsed.data.problem,
      choice: parsed.data.choice,
      choice_reasoning: parsed.data.choice_reasoning,
      context_tags: parsed.data.context_tags ?? [],
      decided_by: "Celiel",
      embedding,
    }),
  });
  if (!res.ok) {
    return { error: `Insert ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const rows = (await res.json()) as { id: string }[];
  return { error: null, success: true, id: rows[0]?.id };
}

// ── Unknowns (known unknowns) ────────────────────────────────────────
const unknownSchema = z.object({
  question: z.string().trim().min(5).max(500),
  context: z.string().trim().max(2000).optional(),
});

export type UnknownState = { error: string | null; success?: boolean; id?: string };

export async function recordUnknownAction(
  fields: z.infer<typeof unknownSchema>,
): Promise<UnknownState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = unknownSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/unknowns`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": "brain",
      "Content-Profile": "brain",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      question: parsed.data.question,
      context: parsed.data.context ?? null,
      raised_by: "Celiel",
    }),
  });
  if (!res.ok) {
    return { error: `Insert ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const rows = (await res.json()) as { id: string }[];
  return { error: null, success: true, id: rows[0]?.id };
}

const resolveSchema = z.object({
  id: z.string().uuid(),
  answer_summary: z.string().trim().min(5).max(1000),
  answered_by_doc_id: z.string().uuid().optional(),
  answered_by_decision_id: z.string().uuid().optional(),
});

export async function resolveUnknownAction(
  fields: z.infer<typeof resolveSchema>,
): Promise<UnknownState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = resolveSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${url}/rest/v1/unknowns?id=eq.${parsed.data.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": "brain",
        "Content-Profile": "brain",
      },
      body: JSON.stringify({
        status: "answered",
        answer_summary: parsed.data.answer_summary,
        answered_by_doc_id: parsed.data.answered_by_doc_id ?? null,
        answered_by_decision_id: parsed.data.answered_by_decision_id ?? null,
        answered_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    return { error: `Update ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { error: null, success: true };
}

export type UnknownRow = {
  id: string;
  question: string;
  context: string | null;
  status: "open" | "answered" | "obsolete";
  answer_summary: string | null;
  answered_at: string | null;
  raised_at: string;
};

export async function listOpenUnknowns(): Promise<UnknownRow[]> {
  await requireUser();
  await requireBolivAIAdmin();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${url}/rest/v1/unknowns?status=eq.open&order=raised_at.desc&limit=50&select=id,question,context,status,answer_summary,answered_at,raised_at`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Accept-Profile": "brain",
      },
    },
  );
  if (!res.ok) return [];
  return (await res.json()) as UnknownRow[];
}

// We avoid the wrapper; for stats we hit the brain schema RPC directly.
export type BrainKnowledgeStats = {
  total_docs: number;
  total_decisions: number;
  open_unknowns: number;
  docs_by_source: Record<string, number> | null;
  last_indexed_at: string | null;
};

export async function getBrainStats(): Promise<BrainKnowledgeStats | null> {
  await requireUser();
  await requireBolivAIAdmin();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // Service client bypasses RLS — we want the raw counts.
  const _svc = createServiceClient();
  void _svc;

  const res = await fetch(`${url}/rest/v1/rpc/knowledge_stats`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": "brain",
      "Content-Profile": "brain",
    },
    body: "{}",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as BrainKnowledgeStats[];
  return rows[0] ?? null;
}
