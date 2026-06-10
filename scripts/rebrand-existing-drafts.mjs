/**
 * One-shot: re-render every existing CCAVAI draft using the bundled
 * Satori-based brand template, then update ccavai_drafts.image_url with
 * the new branded PNG.
 *
 * Needed because the workflow's Brand Image step calls bolivai.cloud/api/content/render-branded,
 * which 404s until the latest dashboard build is deployed. While the
 * route catches up, this script rebrands what's already in the DB.
 *
 * Run: node scripts/rebrand-existing-drafts.mjs
 *      node scripts/rebrand-existing-drafts.mjs --only-stale   (skip drafts already branded)
 */
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
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

const BRAND = { primary: "#00e5a0", background: "#0a0a0a", textPrimary: "#ffffff" };

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
            React.createElement("img", { src: input.wordmark_image_url, width: 540, height: 120, style: { width: 540, height: 120, objectFit: "contain" } }),
          ),
        ].filter(Boolean),
      ),
    ],
  );
}

async function renderToPng(input) {
  const [anton, inter, logo] = await Promise.all([
    readFile(path.join(root, "public/fonts/Anton-Regular.ttf")),
    readFile(path.join(root, "public/fonts/Inter-Bold.ttf")),
    readFile(path.join(root, "public/branding/logotype.png")),
  ]);
  const logoDataUri = `data:image/png;base64,${logo.toString("base64")}`;
  const svg = await satori(buildTree({ ...input, wordmark_image_url: logoDataUri }), {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Anton", data: anton, weight: 700, style: "normal" },
      { name: "Inter", data: inter, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
}

async function listDrafts() {
  // Pull only fields we need to keep memory sane — 9 drafts × ~2MB image each = ~18MB
  // is fine, but stream-ish via pagination if we ever scale up.
  const onlyStale = process.argv.includes("--only-stale");
  const filter = onlyStale ? "&image_url=is.null" : "";
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ccavai_drafts?select=id,story_title,branded_headline,accent_phrases,subject_image_url${filter}&order=generated_at.desc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function updateBranded(id, dataUri) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ccavai_drafts?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ image_url: dataUri }),
  });
  if (!res.ok) throw new Error(`Update ${id} ${res.status}: ${await res.text()}`);
}

// Optional dedupe: a single story has 3 drafts (LinkedIn/IG/FB), all
// sharing the same subject. Render once per story, apply to all 3.
async function main() {
  const drafts = await listDrafts();
  console.log(`Found ${drafts.length} drafts`);

  // Group by story_title so we render once per story.
  const byStory = new Map();
  for (const d of drafts) {
    if (!d.subject_image_url || !d.branded_headline) {
      console.log(`  skip ${d.id.slice(0, 8)} (missing subject or headline)`);
      continue;
    }
    const key = d.story_title;
    const list = byStory.get(key);
    if (list) list.push(d);
    else byStory.set(key, [d]);
  }

  console.log(`Grouped into ${byStory.size} stories`);

  let storyIdx = 0;
  for (const [storyTitle, group] of byStory.entries()) {
    storyIdx++;
    const head = group[0];
    console.log(`\n[${storyIdx}/${byStory.size}] ${storyTitle.slice(0, 60)}…`);
    console.log(`  headline: "${head.branded_headline}"`);
    console.log(`  accents:  ${JSON.stringify(head.accent_phrases || [])}`);
    console.log(`  rendering…`);
    const t0 = Date.now();
    let png;
    try {
      png = await renderToPng({
        subject_image: head.subject_image_url,
        headline: head.branded_headline,
        accent_phrases: head.accent_phrases || [],
        category_label: "AI NEWS",
      });
    } catch (e) {
      console.log(`  ✗ render failed: ${e.message}`);
      continue;
    }
    const dataUri = `data:image/png;base64,${png.toString("base64")}`;
    console.log(`  ✓ rendered ${png.length} bytes in ${Date.now() - t0}ms`);

    for (const d of group) {
      try {
        await updateBranded(d.id, dataUri);
        console.log(`    → updated ${d.id.slice(0, 8)} (${d.platform || "?"})`);
      } catch (e) {
        console.log(`    ✗ update ${d.id.slice(0, 8)} failed: ${e.message}`);
      }
    }
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
