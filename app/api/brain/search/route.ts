/**
 * Bearer-authed semantic search over the Company Brain.
 *
 * Designed to be called from n8n's ATLAS chat workflows (as an HTTP Request
 * Tool the agent can call), but generic enough for any internal automation
 * that needs to ask the brain a question.
 *
 * Auth: Authorization: Bearer ${CCAVAI_WEBHOOK_SECRET} (same internal-trust
 * boundary as the other admin-only routes — reusing the shared secret).
 *
 * Request:
 *   POST /api/brain/search
 *   { "query": "...", "top_k": 5 }
 *
 * Response:
 *   {
 *     "answer_context": "formatted text the LLM should reason over",
 *     "hits": [{ source, title, source_path, similarity, content_excerpt }]
 *   }
 *
 * The `answer_context` is a pre-formatted blob the agent can drop into its
 * system context. The agent then synthesizes a natural-language answer
 * citing the docs by title.
 */
import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { embedOne } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: string; top_k?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  const top_k = Math.max(1, Math.min(20, Number(body.top_k ?? 5)));
  if (query.length < 2) {
    return NextResponse.json({ error: "query too short" }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  // 1. Embed the query (via the LLM client factory — self-host config-flip ready)
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedOne(query);
  } catch (e) {
    return NextResponse.json(
      { error: `embed failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // 2. Call brain.search_company RPC
  type Hit = {
    source: "doc" | "decision";
    id: string;
    title: string;
    content: string;
    source_path: string;
    similarity: number;
    metadata: Record<string, unknown>;
    decided_at: string | null;
  };
  let hits: Hit[];
  try {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/search_company`, {
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
        p_top_k: top_k,
        p_min_similarity: 0.25,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!rpcRes.ok) {
      return NextResponse.json(
        { error: `rpc ${rpcRes.status}: ${(await rpcRes.text()).slice(0, 300)}` },
        { status: 502 },
      );
    }
    hits = (await rpcRes.json()) as Hit[];
  } catch (e) {
    return NextResponse.json(
      { error: `rpc failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // 3. Format for the LLM
  const trimmed = hits.map((h) => ({
    source: h.source,
    title: h.title,
    source_path: h.source_path,
    similarity: Math.round(h.similarity * 1000) / 10,
    // 600 chars is enough to give context without overwhelming the LLM
    content_excerpt: h.content.length > 600 ? h.content.slice(0, 600) + "…" : h.content,
    ...(h.source === "decision" && h.metadata?.choice
      ? { decision_choice: String(h.metadata.choice) }
      : {}),
    ...(h.decided_at ? { decided_at: h.decided_at } : {}),
  }));

  const answer_context =
    hits.length === 0
      ? `No se encontró información relevante en el brain de BolivAI para: "${query}". Responde basándote solo en tu conocimiento general y aclara que no hay docs internos que lo respalden.`
      : [
          `Pregunta del usuario: "${query}"`,
          ``,
          `Fuentes relevantes del brain de BolivAI (ordenadas por similitud):`,
          ``,
          ...trimmed.map(
            (h, i) =>
              `[${i + 1}] ${h.title}\n` +
              `    source: ${h.source} · ${h.source_path || "(decision)"} · ${h.similarity}% match\n` +
              (("decision_choice" in h)
                ? `    elegimos: ${h.decision_choice}\n`
                : "") +
              `    contenido:\n    ${h.content_excerpt.replace(/\n/g, "\n    ")}`,
          ),
          ``,
          `Sintetizá una respuesta natural en el idioma del usuario citando los títulos cuando uses información de ellos. Si las fuentes no responden bien la pregunta, decilo abiertamente.`,
        ].join("\n");

  return NextResponse.json({
    answer_context,
    hits: trimmed,
  });
}
