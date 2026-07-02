#!/usr/bin/env node
/**
 * Platform health check — `npm run health`.
 *
 * Green/red report covering the things that historically break each other:
 *   • TypeScript typecheck (the #1 "you broke X" catcher)
 *   • DB tables + recent-migration columns exist
 *   • Credit pricing rows present
 *   • i18n parity across all 5 locales
 *   • Required env vars present
 *
 * Lists come from lib/health/manifest.json — the SAME file the /admin/health
 * page uses, so the two never drift. Exits non-zero if anything is red.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const G = "\x1b[32m", R = "\x1b[31m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";
const PASS = `${G}✓${X}`, FAIL = `${R}✗${X}`;

const url = (p) => new URL(p, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(url(p), "utf8"));

// ── env (.env.local → process.env) ───────────────────────────────────────────
try {
  const env = readFileSync(url("../.env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim();
  }
} catch {
  /* .env.local optional (e.g. CI uses real env) */
}

const manifest = readJson("../lib/health/manifest.json");
const messages = Object.fromEntries(manifest.locales.map((l) => [l, readJson(`../messages/${l}.json`)]));

const groups = [];
const add = (group, results) => groups.push({ group, results });

// ── 1. Typecheck ─────────────────────────────────────────────────────────────
process.stdout.write(`${D}running typecheck…${X}\r`);
const tc = spawnSync("npm", ["run", "typecheck"], { encoding: "utf8", shell: true });
const tcErrors = ((tc.stdout || "") + (tc.stderr || "")).split("\n").filter((l) => /error TS\d+/.test(l));
add("TypeScript", [
  { name: "tsc --noEmit", ok: tc.status === 0, detail: tc.status === 0 ? undefined : `${tcErrors.length} error(s) — first: ${(tcErrors[0] || "").trim().slice(0, 100)}` },
]);

// ── 2. Database (tables + columns + pricing) via PostgREST fetch ─────────────
// Direct REST (no supabase-js) so the CLI has no WebSocket/realtime dependency.
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supaUrl || !supaKey) {
  add("Database", [{ name: "connection", ok: false, detail: "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" }]);
} else {
  const rest = supaUrl.replace(/\/$/, "") + "/rest/v1/";
  const H = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };
  const rq = async (path) => {
    try {
      const r = await fetch(rest + path, { headers: H, signal: AbortSignal.timeout(15000) });
      return { ok: r.ok, status: r.status, body: r.ok ? null : (await r.text()).slice(0, 90), res: r };
    } catch (e) {
      return { ok: false, status: 0, body: String(e).slice(0, 90) };
    }
  };
  const detail = (r) => (r.ok ? undefined : `HTTP ${r.status} ${r.body || ""}`.trim().slice(0, 90));

  add("Database tables", await Promise.all(manifest.tables.map(async (t) => {
    const r = await rq(`${t}?select=*&limit=0`);
    return { name: t, ok: r.ok, detail: detail(r) };
  })));

  add("Migrations (columns)", await Promise.all(manifest.columns.map(async ([t, c, step]) => {
    const r = await rq(`${t}?select=${encodeURIComponent(c)}&limit=1`);
    return { name: `${t}.${c} (${step})`, ok: r.ok, detail: detail(r) };
  })));

  const inList = encodeURIComponent(`(${manifest.pricing.map((k) => `"${k}"`).join(",")})`);
  const pr = await rq(`credit_pricing?select=action_key&action_key=in.${inList}`);
  let have = new Set();
  if (pr.ok) { try { have = new Set((await pr.res.json()).map((x) => x.action_key)); } catch { /* ignore */ } }
  add("Credit pricing", manifest.pricing.map((k) => ({ name: k, ok: pr.ok && have.has(k), detail: pr.ok ? undefined : detail(pr) })));
}

// ── 3. i18n parity ───────────────────────────────────────────────────────────
const collect = (o, p = "", out = new Set()) => {
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) {
    const path = p ? `${p}.${k}` : k;
    (v && typeof v === "object" && !Array.isArray(v)) ? collect(v, path, out) : out.add(path);
  }
  return out;
};
const ref = collect(messages.en);
add("Translations (i18n parity)", manifest.locales.filter((l) => l !== "en").map((l) => {
  const keys = collect(messages[l]);
  const missing = [...ref].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !ref.has(k));
  const ok = missing.length === 0 && extra.length === 0;
  return { name: l, ok, detail: ok ? undefined : `${missing.length} missing, ${extra.length} extra${missing.length ? ` — e.g. ${missing.slice(0, 3).join(", ")}` : ""}` };
}));

// ── 4. Env ───────────────────────────────────────────────────────────────────
add("Environment", manifest.env.map((k) => ({ name: k, ok: Boolean(process.env[k] && process.env[k].trim()), detail: process.env[k] ? undefined : "not set" })));

// ── 5. Live integration probes (reachability/validity, side-effect-free) ─────
const probe = async (p) => {
  const base = p.url || (p.urlEnv ? process.env[p.urlEnv] : undefined);
  if (!base) return { name: p.name, ok: false, detail: `${p.urlEnv || "url"} not set` };
  const target = base.replace(/\/$/, "") + (p.path || "");
  const headers = {};
  const key = p.authEnv ? process.env[p.authEnv] : undefined;
  if (key) headers.Authorization = `Bearer ${key}`;
  if (p.apikey && key) headers.apikey = key;
  const method = p.method || "GET";
  if (method === "POST") headers["Content-Type"] = "application/json";
  try {
    const r = await fetch(target, { method, headers, body: method === "POST" ? "{}" : undefined, signal: AbortSignal.timeout(9000) });
    if (p.expect === "ok") return { name: p.name, ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` };
    if (p.expect === "registered") return { name: p.name, ok: r.status !== 404, detail: r.status === 404 ? "HTTP 404 — not registered (workflow inactive?)" : undefined };
    return { name: p.name, ok: true };
  } catch (e) {
    return { name: p.name, ok: false, detail: `unreachable — ${String(e?.message || e).slice(0, 60)}` };
  }
};
add("Integrations (live)", await Promise.all((manifest.probes || []).map(probe)));

// ── Report ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
console.log(`\n${B}BolivAI — Health Check${X}\n`);
for (const g of groups) {
  const bad = g.results.filter((r) => !r.ok).length;
  const badge = bad === 0 ? `${G}${g.results.length - bad}/${g.results.length}${X}` : `${R}${g.results.length - bad}/${g.results.length}${X}`;
  console.log(`${B}${g.group}${X}  ${badge}`);
  for (const r of g.results) {
    r.ok ? passed++ : failed++;
    const mark = r.ok ? PASS : FAIL;
    const nm = r.ok ? r.name : `${R}${r.name}${X}`;
    console.log(`  ${mark} ${nm}${r.ok || !r.detail ? "" : `  ${D}${r.detail}${X}`}`);
  }
  console.log("");
}
const total = passed + failed;
if (failed === 0) console.log(`${G}${B}✓ ALL GREEN — ${passed}/${total} checks passed${X}\n`);
else console.log(`${R}${B}✗ ${failed} FAILING — ${passed}/${total} passed${X}\n`);
process.exit(failed === 0 ? 0 : 1);
