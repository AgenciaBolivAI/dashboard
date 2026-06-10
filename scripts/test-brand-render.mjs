/**
 * Standalone smoke test for the brand renderer.
 *
 * Pulls the latest CCAVAI draft from Supabase, takes its subject image
 * (data URI) + draft_title (or generates a sample headline), runs it
 * through the brand template, saves the result to disk so Celiel can
 * eyeball the output.
 *
 * Run:  node scripts/test-brand-render.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// .env.local loader
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const satori = require("satori").default;
const { Resvg } = require("@resvg/resvg-js");
const React = require("react");

// ── Inline copy of the template logic (mirrors lib/content/brand-render.ts) ──
const BRAND = {
  primary: "#00e5a0",
  accent: "#00b87d",
  background: "#0a0a0a",
  textPrimary: "#ffffff",
};

function buildHeadlineSegments(headline, accentPhrases) {
  const upper = headline.toUpperCase();
  const accents = (accentPhrases || []).map((p) => p.toUpperCase().trim()).filter(Boolean);
  const segments = [];
  let remaining = upper;
  while (remaining.length > 0) {
    let earliest = -1;
    let acc = "";
    for (const a of accents) {
      const idx = remaining.indexOf(a);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) { earliest = idx; acc = a; }
    }
    if (earliest === -1) { segments.push({ text: remaining, accent: false }); break; }
    if (earliest > 0) segments.push({ text: remaining.slice(0, earliest), accent: false });
    segments.push({ text: acc, accent: true });
    remaining = remaining.slice(earliest + acc.length);
  }
  return segments;
}

function buildTree(input) {
  const segments = buildHeadlineSegments(input.headline, input.accent_phrases || []);
  return React.createElement(
    "div",
    { style: { width: 1080, height: 1350, display: "flex", flexDirection: "column", backgroundColor: BRAND.background, fontFamily: "Inter", color: BRAND.textPrimary } },
    [
      React.createElement(
        "div",
        { key: "subject", style: { position: "relative", display: "flex", width: 1080, height: 740 } },
        [
          React.createElement("img", { key: "img", src: input.subject_image, style: { width: 1080, height: 740, objectFit: "cover" } }),
          React.createElement("div", { key: "fade", style: { position: "absolute", left: 0, right: 0, bottom: 0, height: 240, background: `linear-gradient(180deg, rgba(10,10,10,0) 0%, ${BRAND.background} 100%)`, display: "flex" } }),
        ],
      ),
      React.createElement(
        "div",
        { key: "text-area", style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "30px 60px 50px" } },
        [
          input.category_label ? React.createElement(
            "div",
            { key: "label", style: { display: "flex", alignSelf: "flex-start", backgroundColor: BRAND.primary, color: "#0a0a0a", fontFamily: "Inter", fontWeight: 700, fontSize: 22, letterSpacing: 4, padding: "6px 18px", marginBottom: 18 } },
            input.category_label.toUpperCase(),
          ) : null,
          React.createElement(
            "div",
            { key: "headline", style: { display: "flex", flexWrap: "wrap", fontFamily: "Anton", fontSize: 90, lineHeight: 0.95, letterSpacing: 0.5 } },
            segments.map((seg, i) => React.createElement("span", { key: i, style: { color: seg.accent ? BRAND.primary : BRAND.textPrimary, marginRight: 16 } }, seg.text)),
          ),
          React.createElement(
            "div",
            { key: "wordmark", style: { display: "flex", alignItems: "center", justifyContent: "center", marginTop: 30, height: 120 } },
            input.wordmark_image_url
              ? React.createElement("img", { src: input.wordmark_image_url, width: 540, height: 120, style: { width: 540, height: 120, objectFit: "contain" } })
              : React.createElement("span", { style: { fontFamily: "Anton", fontSize: 54, letterSpacing: 8, color: BRAND.primary } }, "BOLIVAI"),
          ),
        ].filter(Boolean),
      ),
    ],
  );
}

async function renderToPng(input) {
  const anton = await readFile(path.join(root, "public/fonts/Anton-Regular.ttf"));
  const inter = await readFile(path.join(root, "public/fonts/Inter-Bold.ttf"));
  const svg = await satori(buildTree(input), {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Anton", data: anton, weight: 700, style: "normal" },
      { name: "Inter", data: inter, weight: 700, style: "normal" },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  return resvg.render().asPng();
}

// ── Pull most recent draft from Supabase via REST ──
async function getLatestDraft() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ccavai_drafts?select=id,platform,story_title,draft_title,image_url&order=generated_at.desc&limit=10`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  // Prefer an Instagram or LinkedIn draft with an image
  const ig = rows.find((r) => r.platform === "instagram" && r.image_url);
  return ig ?? rows.find((r) => r.image_url) ?? rows[0];
}

async function main() {
  console.log("Pulling latest draft with image…");
  const draft = await getLatestDraft();
  if (!draft) {
    console.error("No drafts found.");
    process.exit(1);
  }
  if (!draft.image_url || !draft.image_url.startsWith("data:image/")) {
    console.error("Draft has no image_url:", draft.id);
    process.exit(1);
  }

  // For the smoke test, derive accent phrases ourselves (CCAVAI workflow
  // will eventually return these from OpenAI). Pick 2-3 keywords from the
  // story title using a tiny heuristic: longer caps-worthy words.
  const headline = draft.draft_title ?? draft.story_title ?? "AI changes the game";
  const words = (draft.story_title ?? headline).split(/\s+/).filter(Boolean);
  const accents = words.filter((w) => w.length >= 5).slice(0, 2);
  console.log(`Draft id: ${draft.id} (${draft.platform})`);
  console.log(`Headline: ${headline}`);
  console.log(`Accents:  ${JSON.stringify(accents)}`);

  // Use the trimmed transparent-background logotype (prepared by
  // scripts/prepare-logo.mjs).
  const logoBuf = await readFile(path.join(root, "public/branding/logotype.png"));
  const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;
  console.log(`Logotype loaded: ${logoBuf.length} bytes`);

  console.log("Rendering…");
  const t0 = Date.now();
  const png = await renderToPng({
    subject_image: draft.image_url,
    headline,
    accent_phrases: accents,
    category_label: "AI NEWS",
    wordmark_image_url: logoDataUri,
  });
  const ms = Date.now() - t0;

  const outDir = path.join(root, "tmp");
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `branded-${draft.id.slice(0, 8)}.png`);
  await writeFile(outPath, png);
  console.log(`✓ Rendered ${png.length} bytes in ${ms}ms → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
