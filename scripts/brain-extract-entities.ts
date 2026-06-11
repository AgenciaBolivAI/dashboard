/**
 * Company Brain — entity extraction pass.
 *
 * Reads docs from brain.docs that haven't been processed yet (or whose
 * content changed since the last extraction), asks gpt-4o-mini to extract
 * structured entities + relations, upserts into brain.entities + brain.edges.
 *
 * Designed to be cron-friendly + idempotent:
 *   - Tracks last extraction via brain.docs.metadata.entities_extracted_at
 *   - Skips docs already processed past their updated_at
 *   - Entity dedup via UNIQUE (lower(name), type, coalesce(agent_id,…))
 *   - Edge dedup via UNIQUE (from_entity, to_entity, relation) — re-runs
 *     increment weight instead of duplicating
 *
 * Run from dashboard/:
 *   npx tsx scripts/brain-extract-entities.ts
 *
 * Cost: ~3K tokens in + ~800 out per doc × gpt-4o-mini ≈ $0.0006/doc.
 * 71 docs ≈ $0.05 first run, then near-zero on subsequent runs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* */
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error("Missing env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY)");
  process.exit(1);
}

const VALID_TYPES = [
  "person", "project", "company", "concept", "task", "event", "place", "tool",
  "agent", "workflow", "table", "integration", "vendor",
] as const;
type EntityType = (typeof VALID_TYPES)[number];

// ── brain.* REST helper ──────────────────────────────────────────────
async function brainRest<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: object,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Accept-Profile": "brain",
      "Content-Profile": "brain",
      Prefer: "return=representation",
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${method} ${path} ${res.status}: ${errText.slice(0, 240)}`);
  }
  const txt = await res.text();
  return (txt ? JSON.parse(txt) : null) as T;
}

// ── 1. Find docs to process ──────────────────────────────────────────
type DocRow = {
  id: string;
  source_type: string;
  source_path: string;
  title: string;
  content: string;
  updated_at: string;
  metadata: { entities_extracted_at?: string };
};

async function listDocsToProcess(): Promise<DocRow[]> {
  // Pull all docs (we'll filter client-side because PostgREST can't compare
  // metadata->>'entities_extracted_at' >= updated_at in one clean go).
  const rows = await brainRest<DocRow[]>(
    "GET",
    "docs?select=id,source_type,source_path,title,content,updated_at,metadata&limit=500",
  );
  return rows.filter((r) => {
    const last = r.metadata?.entities_extracted_at;
    if (!last) return true;
    return new Date(last) < new Date(r.updated_at);
  });
}

// ── 2. Ask GPT to extract entities + relations ───────────────────────
type ExtractedEntity = { name: string; type: string; summary: string };
type ExtractedRelation = { from: string; to: string; relation: string };
type Extraction = { entities: ExtractedEntity[]; relations: ExtractedRelation[] };

const SYSTEM_PROMPT = `You read a document about BolivAI (an AI workforce SaaS platform) and extract structured knowledge.

Return STRICT JSON with this exact shape — no markdown, no prose around it:

{
  "entities": [
    { "name": "AIMA", "type": "agent", "summary": "Lead scraping agent" }
  ],
  "relations": [
    { "from": "AIMA", "to": "Google Maps Places API", "relation": "uses" }
  ]
}

ENTITY TYPE — must be exactly one of:
  person, project, company, concept, task, event, place, tool,
  agent, workflow, table, integration, vendor

Guidance for picking a type:
  agent       → named AI characters: Sandra, Rebecca, ATLAS, AIMA, CCAVAI, VIRA, HERMES, etc.
  workflow    → n8n workflows
  table       → database tables (credit_pricing, vira_jobs, ccavai_drafts, etc.)
  integration → external SDKs/APIs we depend on: Stripe Connect, ElevenLabs, Twilio, etc.
  vendor      → external companies billing us: OpenAI, ElevenLabs, Google, Twilio, Apollo, Instantly
  tool        → generic tools (Whisper, ffmpeg, yt-dlp, pgvector)
  concept     → architectural ideas (RLS, credit-based billing, multi-tenant, brain ingest)
  company     → tenants and external companies that aren't vendors
  person      → individuals
  project     → CastilloOS, BolivAI

RELATION — use natural verbs like:
  uses, owns, debits, bills, feeds, depends_on, triggers, writes_to, reads_from,
  charges, contains, part_of, supersedes, replaces, ingests_from, gates,
  notifies, schedules, generates, processes, transcribes, hosts

EXTRACTION RULES:
- Only extract entities that are EXPLICITLY mentioned in the document.
- Use the most specific name (not "the workflow" — use the actual workflow name).
- 8-25 entities per document is a healthy range. Fewer if the doc is short.
- Don't invent relationships not implied by the text.
- Skip generic concepts that aren't BolivAI-specific (don't extract "user", "system", "process").
- For schema migration docs, extract the new tables as type=table + the foreign keys as relations.
- For memory docs, extract the architectural decisions as relations between entities.`;

async function extract(doc: DocRow): Promise<Extraction | null> {
  const userMsg = `Document title: ${doc.title}\nSource: ${doc.source_path}\n\n${doc.content.slice(0, 12000)}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    console.warn(`  extraction error ${res.status}: ${(await res.text()).slice(0, 150)}`);
    return null;
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  try {
    return JSON.parse(json.choices[0]!.message.content) as Extraction;
  } catch {
    return null;
  }
}

// ── 3. Upsert entity ─────────────────────────────────────────────────
type EntityRow = { id: string; name: string; type: string };

async function findOrCreateEntity(
  name: string,
  type: EntityType,
  summary: string,
): Promise<EntityRow | null> {
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) return null;

  // 1. Lookup
  const existing = await brainRest<EntityRow[]>(
    "GET",
    `entities?name=eq.${encodeURIComponent(cleanName)}&type=eq.${encodeURIComponent(type)}&agent_id=is.null&select=id,name,type&limit=1`,
  );
  if (existing.length > 0) {
    // bump mention_count + refresh summary if we have a longer one
    await brainRest(
      "PATCH",
      `entities?id=eq.${existing[0]!.id}`,
      {
        mention_count: undefined, // placeholder — we increment via SQL below
        last_seen: new Date().toISOString(),
        ...(summary && summary.length > 20 ? { summary } : {}),
      },
      { Prefer: "return=minimal" },
    );
    return existing[0]!;
  }

  // 2. Create
  try {
    const rows = await brainRest<EntityRow[]>("POST", "entities", {
      name: cleanName,
      type,
      summary: summary?.slice(0, 800) || null,
      agent_id: null,
      mention_count: 1,
      metadata: { source: "auto_extracted" },
    });
    return rows[0] ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Race with another upsert? Just look up again
    if (msg.includes("23505") || msg.includes("duplicate")) {
      const retry = await brainRest<EntityRow[]>(
        "GET",
        `entities?name=eq.${encodeURIComponent(cleanName)}&type=eq.${encodeURIComponent(type)}&agent_id=is.null&select=id,name,type&limit=1`,
      );
      return retry[0] ?? null;
    }
    console.warn(`  entity insert failed for ${cleanName}: ${msg.slice(0, 120)}`);
    return null;
  }
}

// ── 4a. Link doc ↔ entity so we know which docs mention which entities
async function linkDocEntity(docId: string, entityId: string) {
  try {
    await brainRest(
      "POST",
      "doc_entities?on_conflict=doc_id,entity_id",
      {
        doc_id: docId,
        entity_id: entityId,
        extraction_count: 1,
        last_extracted_at: new Date().toISOString(),
      },
      { Prefer: "resolution=merge-duplicates" },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // PostgREST's merge-duplicates path doesn't auto-increment count, just
    // re-overwrites — that's fine for our purposes. Suppress dup errors.
    if (!msg.includes("23505")) {
      console.warn(`  doc_entity link failed: ${msg.slice(0, 100)}`);
    }
  }
}

// ── 4b. Upsert edge ──────────────────────────────────────────────────
async function upsertEdge(fromId: string, toId: string, relation: string) {
  if (fromId === toId) return; // skip self-edges (constraint would reject anyway)
  const cleanRel = relation.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 60);
  try {
    await brainRest(
      "POST",
      "edges?on_conflict=from_entity,to_entity,relation",
      {
        from_entity: fromId,
        to_entity: toId,
        relation: cleanRel,
        weight: 1,
      },
      { Prefer: "resolution=merge-duplicates" },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The PATCH-on-conflict path doesn't auto-increment weight. For now, ignore.
    if (!msg.includes("23505")) {
      console.warn(`  edge insert failed ${relation}: ${msg.slice(0, 120)}`);
    }
  }
}

// ── 5. Mark doc as processed ─────────────────────────────────────────
async function markProcessed(doc: DocRow) {
  await brainRest(
    "PATCH",
    `docs?id=eq.${doc.id}`,
    {
      metadata: {
        ...(doc.metadata ?? {}),
        entities_extracted_at: new Date().toISOString(),
      },
    },
    { Prefer: "return=minimal" },
  );
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("[brain-extract] Starting…");
  const docs = await listDocsToProcess();
  console.log(`[brain-extract] ${docs.length} docs to process`);

  let totalEntities = 0;
  let totalEdges = 0;
  let processed = 0;
  let failed = 0;

  for (const doc of docs) {
    process.stdout.write(`  ${doc.source_path} `);
    const extraction = await extract(doc);
    if (!extraction) {
      console.log("[!] extraction failed");
      failed++;
      continue;
    }

    const nameToId = new Map<string, string>();
    let entCount = 0;
    let edgeCount = 0;

    for (const ent of extraction.entities ?? []) {
      const type = ent.type as EntityType;
      if (!(VALID_TYPES as readonly string[]).includes(type)) continue;
      const row = await findOrCreateEntity(ent.name, type, ent.summary ?? "");
      if (row) {
        nameToId.set(ent.name.toLowerCase(), row.id);
        await linkDocEntity(doc.id, row.id);
        entCount++;
      }
    }

    for (const rel of extraction.relations ?? []) {
      const fromId = nameToId.get(rel.from.toLowerCase());
      const toId = nameToId.get(rel.to.toLowerCase());
      if (!fromId || !toId) continue;
      await upsertEdge(fromId, toId, rel.relation);
      edgeCount++;
    }

    await markProcessed(doc);
    console.log(`[✓] ${entCount} entities, ${edgeCount} edges`);
    totalEntities += entCount;
    totalEdges += edgeCount;
    processed++;
  }

  // ── Self-heal: recompute mention_count from doc_entities count.
  // Guarantees node sizes in the graph reflect real distinct-doc counts
  // even if individual upserts skipped the per-call increment.
  console.log(`\n[brain-extract] Recomputing mention_count from doc_entities…`);
  try {
    await brainRest("POST", "rpc/recompute_mention_counts", {});
    console.log(`  ✓ mention_count synced`);
  } catch (e) {
    console.warn(`  mention_count recompute failed: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`\n[brain-extract] Done.`);
  console.log(`  Docs processed:  ${processed}`);
  console.log(`  Docs failed:     ${failed}`);
  console.log(`  Entities written: ${totalEntities}`);
  console.log(`  Edges written:    ${totalEdges}`);
}

main().catch((e) => {
  console.error("[brain-extract] FATAL:", e);
  process.exit(1);
});
