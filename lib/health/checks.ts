/**
 * Platform health checks — shared by the visual /admin/health page AND the
 * `npm run health` CLI so both report the same green/red truth.
 *
 * Framework-agnostic on purpose: no next/server-only imports, no @/ aliases.
 * Callers pass in a Supabase client (service role), the loaded message JSONs,
 * and process.env. Each check is cheap and never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import manifest from "./manifest.json";

export type CheckResult = { name: string; ok: boolean; detail?: string };
export type CheckGroup = { group: string; results: CheckResult[] };

// Lists live in manifest.json — the single source of truth shared with the
// `npm run health` CLI. Add there when a feature adds a critical object.
export const CRITICAL_TABLES = manifest.tables as string[];
export const CRITICAL_COLUMNS = manifest.columns as Array<[string, string, string]>;
export const CRITICAL_PRICING = manifest.pricing as string[];
export const REQUIRED_ENV = manifest.env as string[];
export const LOCALES = manifest.locales as string[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient & { from: (t: string) => any };

async function checkTable(sb: AnyClient, table: string): Promise<CheckResult> {
  const { error } = await sb.from(table).select("*", { count: "exact", head: true });
  return { name: table, ok: !error, detail: error ? error.message.slice(0, 90) : undefined };
}

async function checkColumn(sb: AnyClient, table: string, col: string, step: string): Promise<CheckResult> {
  const { error } = await sb.from(table).select(col).limit(1);
  return { name: `${table}.${col} (${step})`, ok: !error, detail: error ? error.message.slice(0, 90) : undefined };
}

async function checkPricing(sb: AnyClient, keys: string[]): Promise<CheckResult[]> {
  const { data, error } = await sb.from("credit_pricing").select("action_key").in("action_key", keys);
  if (error) return [{ name: "credit_pricing", ok: false, detail: error.message.slice(0, 90) }];
  const have = new Set((data ?? []).map((r: { action_key: string }) => r.action_key));
  return keys.map((k) => ({ name: k, ok: have.has(k) }));
}

// ── i18n parity (dotted key sets per locale vs the en reference) ──────────────
function collectKeys(obj: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) collectKeys(v, path, out);
      else out.add(path);
    }
  }
  return out;
}

export function i18nChecks(messages: Record<string, unknown>): CheckResult[] {
  const en = messages.en;
  if (!en) return [{ name: "messages/en.json", ok: false, detail: "reference locale missing" }];
  const ref = collectKeys(en);
  const out: CheckResult[] = [];
  for (const loc of LOCALES.filter((l) => l !== "en")) {
    const m = messages[loc];
    if (!m) {
      out.push({ name: loc, ok: false, detail: "file missing" });
      continue;
    }
    const keys = collectKeys(m);
    const missing = [...ref].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !ref.has(k));
    const ok = missing.length === 0 && extra.length === 0;
    out.push({
      name: loc,
      ok,
      detail: ok
        ? undefined
        : `${missing.length} missing, ${extra.length} extra${missing.length ? ` — e.g. ${missing.slice(0, 3).join(", ")}` : ""}`,
    });
  }
  return out;
}

export function envChecks(env: Record<string, string | undefined>, keys = REQUIRED_ENV): CheckResult[] {
  return keys.map((k) => ({ name: k, ok: Boolean(env[k] && env[k]!.trim()), detail: env[k] ? undefined : "not set" }));
}

// ── Live integration probes (reachability/validity, side-effect-free) ────────
type Probe = {
  name: string; method?: string; url?: string; urlEnv?: string; path?: string;
  authEnv?: string; apikey?: boolean; expect: "ok" | "registered" | "reachable";
};
export const PROBES = (manifest.probes ?? []) as Probe[];

export async function runProbe(p: Probe, env: Record<string, string | undefined>): Promise<CheckResult> {
  const base = p.url || (p.urlEnv ? env[p.urlEnv] : undefined);
  if (!base) return { name: p.name, ok: false, detail: `${p.urlEnv || "url"} not set` };
  const url = base.replace(/\/$/, "") + (p.path || "");
  const headers: Record<string, string> = {};
  const key = p.authEnv ? env[p.authEnv] : undefined;
  if (key) headers.Authorization = `Bearer ${key}`;
  if (p.apikey && key) headers.apikey = key;
  const method = p.method || "GET";
  if (method === "POST") headers["Content-Type"] = "application/json";
  try {
    const r = await fetch(url, { method, headers, body: method === "POST" ? "{}" : undefined, signal: AbortSignal.timeout(9000) });
    if (p.expect === "ok") return { name: p.name, ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` };
    if (p.expect === "registered") return { name: p.name, ok: r.status !== 404, detail: r.status === 404 ? "HTTP 404 — webhook not registered (workflow inactive?)" : undefined };
    return { name: p.name, ok: true, detail: undefined }; // reachable: any HTTP response
  } catch (e) {
    return { name: p.name, ok: false, detail: `unreachable — ${(e instanceof Error ? e.message : String(e)).slice(0, 60)}` };
  }
}

export async function probeChecks(env: Record<string, string | undefined>): Promise<CheckResult[]> {
  return Promise.all(PROBES.map((p) => runProbe(p, env)));
}

/** Run every group. `messages` = { en:{...}, es:{...}, ... }. */
export async function runHealthChecks(
  sb: SupabaseClient,
  messages: Record<string, unknown>,
  env: Record<string, string | undefined>,
): Promise<CheckGroup[]> {
  const client = sb as AnyClient;
  const [tables, columns, pricing, probes] = await Promise.all([
    Promise.all(CRITICAL_TABLES.map((t) => checkTable(client, t))),
    Promise.all(CRITICAL_COLUMNS.map(([t, c, s]) => checkColumn(client, t, c, s))),
    checkPricing(client, CRITICAL_PRICING),
    probeChecks(env),
  ]);
  return [
    { group: "Database tables", results: tables },
    { group: "Migrations (columns)", results: columns },
    { group: "Credit pricing", results: pricing },
    { group: "Translations (i18n parity)", results: i18nChecks(messages) },
    { group: "Environment", results: envChecks(env) },
    { group: "Integrations (live)", results: probes },
  ];
}

export function summarize(groups: CheckGroup[]): { passed: number; failed: number; total: number; ok: boolean } {
  let passed = 0;
  let failed = 0;
  for (const g of groups) for (const r of g.results) r.ok ? passed++ : failed++;
  return { passed, failed, total: passed + failed, ok: failed === 0 };
}
