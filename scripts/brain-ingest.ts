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
import { embedOne } from "../lib/llm";

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
  // Voice calls live in brain.episodes (written by Rebecca + Sandra ticks
  // which pull from ElevenLabs). Each episode carries metadata.transcript
  // (full text) and metadata.conversation_id for stable identity.
  //
  // BolivAI-internal by nature — both Rebecca and Sandra are Celiel-owned
  // agents, the conversations they have ARE BolivAI's. No tenant filter
  // needed here.
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/episodes` +
      `?source=eq.elevenlabs` +
      `&order=created_at.desc&limit=300` +
      `&select=id,title,content,metadata,created_at`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Accept-Profile": "brain",
      },
    });
    if (!res.ok) {
      console.warn(`[brain-ingest] brain.episodes voice fetch ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as Array<{
      id: string;
      title: string;
      content: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>;

    return rows
      .filter((r) => r.metadata?.conversation_id)
      .map((r) => {
        const meta = r.metadata as Record<string, string | number | null>;
        const transcript = (meta.transcript as string | undefined) ?? "";
        const direction = (meta.direction as string | undefined) ?? "inbound";
        const agent = direction === "outbound" ? "Sandra (outbound)" : "Rebecca (inbound)";
        const durationSecs = Number(meta.duration_secs ?? 0);
        const minutes = Math.round(durationSecs / 60);

        const header = [
          `Voice call — ${agent}`,
          `Title: ${r.title}`,
          `Started: ${meta.started_at ?? r.created_at}`,
          `Duration: ${minutes} min`,
          `Language: ${meta.language ?? "?"}`,
          `Outcome: ${meta.call_successful ?? meta.status ?? "?"}`,
        ].join("\n");

        const content = transcript
          ? `${header}\n\nSummary: ${r.content}\n\n--- Transcript ---\n${transcript}`
          : `${header}\n\nSummary: ${r.content}\n\n(Full transcript not yet captured for this call)`;

        return {
          source_type: "voice_call" as const,
          // Use the ElevenLabs conversation_id for stable identity across re-ingests
          source_path: `voice/${meta.conversation_id}`,
          title: `${agent} · ${(meta.started_at as string | undefined)?.slice(0, 10) ?? r.created_at.slice(0, 10)} · ${r.title}`,
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
  // Routed through the LLM client factory (lib/llm) so re-ingesting honors the
  // same LLM_EMBED_* config as the running app — a self-host flip stays in sync.
  // text-embedding-3-small: 1536 dims. ~7500 token cap; small handles 8192.
  return embedOne(text.slice(0, 30_000), { timeoutMs: 30_000 });
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
