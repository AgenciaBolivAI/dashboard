/**
 * Company Brain ingest — walks the canonical knowledge sources, embeds
 * them with text-embedding-3-small, and upserts into brain.docs.
 *
 * Idempotent: re-running only re-embeds files whose content changed
 * (compared via SHA-256 hash).
 *
 * Run from the dashboard directory:
 *   npx tsx scripts/brain-ingest.ts
 *
 * Env (read from .env.local automatically via dotenv):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Sources walked (relative to repo root, two levels up from /platform/dashboard):
 *   memory location:           C:\Users\celie\.claude\projects\...\memory\*.md
 *   platform/docs/             *.md
 *   platform/schema-*.sql      structure source of truth
 *   castillo-os/workers/       README.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";

// Minimal .env.local loader — no dotenv dependency
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      // strip surrounding quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local missing — caller must export envs directly
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const MEMORY_DIR =
  process.env.BRAIN_MEMORY_DIR ??
  "C:\\Users\\celie\\.claude\\projects\\c--Users-celie-OneDrive-Desktop-bolivai-com\\memory";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error("Missing env: need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY");
  process.exit(1);
}

const REPO_ROOT = resolve(process.cwd(), "..", "..");
const PLATFORM_DOCS_DIR = resolve(REPO_ROOT, "platform", "docs");
const PLATFORM_SCHEMA_DIR = resolve(REPO_ROOT, "platform");
const WORKERS_DIR = resolve(REPO_ROOT, "castillo-os", "workers");

type Doc = {
  source_type:
    | "memory"
    | "platform_doc"
    | "schema"
    | "worker_doc"
    | "workflow_meta"
    | "code_doc"
    | "manual"
    | "voice_call";
  source_path: string;
  title: string;
  content: string;
};

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  try {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const e of entries) {
      const full = resolve(dir, e);
      try {
        const st = statSync(full);
        if (st.isFile() && predicate(e)) files.push(full);
      } catch {
        // skip unreadable entries
      }
    }
    return files;
  } catch {
    console.warn(`[brain-ingest] could not list ${dir}`);
    return [];
  }
}

function firstH1(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
}

async function gatherN8nWorkflows(): Promise<Doc[]> {
  // Pull every active n8n workflow's name + node list + key SQL/code snippets.
  // We don't embed the raw JSON (too noisy), we embed a curated summary that
  // captures what the workflow does + which tables it touches + which agents
  // it serves. Answers "which workflow inserts into ccavai_drafts" cleanly.
  const N8N_URL = process.env.N8N_BASE_URL ?? "https://n8n.srv1642711.hstgr.cloud";
  const N8N_KEY = process.env.N8N_API_KEY;
  if (!N8N_KEY) {
    console.warn("[brain-ingest] N8N_API_KEY missing — skipping workflow_meta");
    return [];
  }

  try {
    const res = await fetch(`${N8N_URL}/api/v1/workflows?limit=200`, {
      headers: { "X-N8N-API-KEY": N8N_KEY, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[brain-ingest] n8n list ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { data: Array<{ id: string; name: string; active: boolean }> };

    const docs: Doc[] = [];
    for (const w of data.data) {
      // Only ingest active workflows (or anything BolivAI/CastilloOS-prefixed)
      if (!w.active && !/Bolivai|CastilloOS/i.test(w.name)) continue;
      try {
        const detRes = await fetch(`${N8N_URL}/api/v1/workflows/${w.id}`, {
          headers: { "X-N8N-API-KEY": N8N_KEY, Accept: "application/json" },
        });
        if (!detRes.ok) continue;
        const wf = (await detRes.json()) as {
          name: string;
          nodes: Array<{ name: string; type: string; notes?: string; parameters?: Record<string, unknown> }>;
        };

        // Build a structured summary
        const lines: string[] = [];
        lines.push(`# ${wf.name}`);
        lines.push(``);
        lines.push(`n8n workflow id: ${w.id}`);
        lines.push(`active: ${w.active ? "yes" : "no"}`);
        lines.push(``);
        lines.push(`## Nodes`);
        for (const n of wf.nodes) {
          const t = n.type.replace("n8n-nodes-base.", "");
          lines.push(`- **${n.name}** (${t})`);
          if (n.notes) lines.push(`  ${n.notes.slice(0, 200)}`);

          // For postgres nodes, include the first ~200 chars of the query
          // so semantic search finds "which workflow touches ccavai_drafts"
          if (t === "postgres" && n.parameters?.query) {
            const q = String(n.parameters.query).slice(0, 250).replace(/\n/g, " ");
            lines.push(`  SQL: ${q}…`);
          }
          // For HTTP nodes, include the URL so search finds "which workflow hits OpenAI"
          if (t === "httpRequest" && n.parameters?.url) {
            const u = String(n.parameters.url).slice(0, 150);
            lines.push(`  URL: ${u}`);
          }
        }

        docs.push({
          source_type: "workflow_meta" as const,
          source_path: `n8n/${w.id}`,
          title: wf.name,
          content: lines.join("\n"),
        });
      } catch {
        // skip this workflow
      }
    }
    return docs;
  } catch (e) {
    console.warn(`[brain-ingest] n8n fetch failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

async function gatherVoiceCalls(): Promise<Doc[]> {
  // BolivAI tenant only — voice transcripts are tenant-internal data.
  // Same isolation rule as the brain tick.
  const BOLIVAI = "5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/voice_conversations?tenant_id=eq.${BOLIVAI}&select=id,direction,caller_phone,started_at,duration_seconds,call_outcome,charged_cents&order=started_at.desc&limit=200`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    if (!res.ok) {
      console.warn(`[brain-ingest] voice_conversations fetch ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as Array<{
      id: string;
      direction: string;
      caller_phone: string | null;
      started_at: string;
      duration_seconds: number | null;
      call_outcome: string | null;
      charged_cents: number | null;
    }>;

    // Future: pull transcript text from voice_conversations.transcript when
    // ElevenLabs ingest workflow writes it. For now, build a structured
    // summary that's still useful for "patterns in our voice calls" queries.
    return rows
      .filter((r) => r.duration_seconds && r.duration_seconds > 0)
      .map((r) => {
        const direction = r.direction === "inbound" ? "Rebecca (inbound)" : "Sandra (outbound)";
        const minutes = Math.round((r.duration_seconds ?? 0) / 60);
        const outcome = r.call_outcome ?? "unknown";
        const charged = r.charged_cents != null ? `$${(r.charged_cents / 100).toFixed(2)}` : "—";
        const content = [
          `Voice call — ${direction}`,
          `Caller: ${r.caller_phone ?? "(unknown)"}`,
          `Started: ${r.started_at}`,
          `Duration: ${minutes} min`,
          `Outcome: ${outcome}`,
          `Charged: ${charged}`,
        ].join("\n");
        return {
          source_type: "voice_call" as const,
          source_path: `voice/${r.id}`,
          title: `${direction} · ${r.started_at.slice(0, 10)} · ${outcome}`,
          content,
        };
      });
  } catch (e) {
    console.warn(`[brain-ingest] voice fetch failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

function gatherDocs(): Doc[] {
  const docs: Doc[] = [];

  // 1. Memory files
  const memoryFiles = listFiles(MEMORY_DIR, (n) => n.endsWith(".md"));
  for (const path of memoryFiles) {
    const content = readFileSync(path, "utf-8");
    const name = basename(path);
    const title = firstH1(content, name.replace(/\.md$/, "").replace(/_/g, " "));
    docs.push({
      source_type: "memory",
      source_path: `memory/${name}`,
      title,
      content,
    });
  }

  // 2. Platform docs (KBs, prompts)
  const platformDocs = listFiles(PLATFORM_DOCS_DIR, (n) => n.endsWith(".md"));
  for (const path of platformDocs) {
    const content = readFileSync(path, "utf-8");
    const name = basename(path);
    const title = firstH1(content, name.replace(/\.md$/, ""));
    docs.push({
      source_type: "platform_doc",
      source_path: `platform/docs/${name}`,
      title,
      content,
    });
  }

  // 3. Schema migrations
  const schemaFiles = listFiles(PLATFORM_SCHEMA_DIR, (n) =>
    /^schema-(step\d+|.*)\.sql$/.test(n),
  );
  for (const path of schemaFiles) {
    const content = readFileSync(path, "utf-8");
    const name = basename(path);
    // Extract title from the top comment block "-- Title here ..."
    const commentMatch = content.match(/--\s*=+\s*\n--\s*BolivAI\s*[—-]\s*(.+?)\n--\s*=+/);
    const title = commentMatch?.[1]?.trim() ?? name;
    docs.push({
      source_type: "schema",
      source_path: `platform/${name}`,
      title,
      content,
    });
  }

  // 4. Worker docs
  const workerDocs = listFiles(WORKERS_DIR, (n) => n.endsWith(".md"));
  for (const path of workerDocs) {
    const content = readFileSync(path, "utf-8");
    const name = basename(path);
    const title = firstH1(content, `worker: ${name}`);
    docs.push({
      source_type: "worker_doc",
      source_path: `castillo-os/workers/${name}`,
      title,
      content,
    });
  }

  return docs;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function embed(text: string): Promise<number[]> {
  // text-embedding-3-small: 1536 dimensions, $0.020 per 1M tokens
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 30_000), // ~7500 tokens cap; text-embedding-3-small handles 8192
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embed failed ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0]!.embedding;
}

async function main() {
  console.log("[brain-ingest] Starting…");
  const fileDocs = gatherDocs();
  const voiceDocs = await gatherVoiceCalls();
  const n8nDocs = await gatherN8nWorkflows();
  const docs = [...fileDocs, ...voiceDocs, ...n8nDocs];
  console.log(
    `[brain-ingest] Found ${fileDocs.length} files + ${voiceDocs.length} voice + ${n8nDocs.length} workflows = ${docs.length} candidates`,
  );

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    const hash = sha256(doc.content);
    try {
      const existing = await brainRpcGetHash(doc.source_type, doc.source_path);
      if (existing === hash) {
        skipped++;
        continue;
      }
      const vec = await embed(`${doc.title}\n\n${doc.content}`);
      await brainRpcUpsertDoc(doc, hash, vec);
      embedded++;
      console.log(`  [+] ${doc.source_path}`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [!] ${doc.source_path}: ${msg}`);
    }
  }

  console.log(`\n[brain-ingest] Done.`);
  console.log(`  Embedded: ${embedded}`);
  console.log(`  Skipped (unchanged): ${skipped}`);
  console.log(`  Failed: ${failed}`);
}

// ─── brain.* schema helpers (Supabase JS doesn't have ergonomic non-public
// schema access at the table builder level for our setup, so we use a
// service-key REST call directly with the schema header)
async function brainRest<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: object,
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
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`brain REST ${method} ${path} ${res.status}: ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function brainRpcGetHash(
  source_type: string,
  source_path: string,
): Promise<string | null> {
  const rows = await brainRest<{ content_hash?: string }[]>(
    "GET",
    `docs?source_type=eq.${encodeURIComponent(source_type)}&source_path=eq.${encodeURIComponent(source_path)}&select=content_hash`,
  );
  return rows[0]?.content_hash ?? null;
}

async function brainRpcUpsertDoc(doc: Doc, hash: string, embedding: number[]) {
  // The `on_conflict` query param is required for PostgREST to actually merge
  // duplicates on POST. Without it, you get a 409 even with Prefer: resolution=merge-duplicates.
  await brainRest("POST", "docs?on_conflict=source_type,source_path", {
    source_type: doc.source_type,
    source_path: doc.source_path,
    title: doc.title,
    content: doc.content,
    content_hash: hash,
    embedding,
    metadata: {},
    indexed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

main().catch((e) => {
  console.error("[brain-ingest] FATAL:", e);
  process.exit(1);
});
