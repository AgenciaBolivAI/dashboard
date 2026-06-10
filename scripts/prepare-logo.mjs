/**
 * One-shot: download BolivAI's hosted logo, chroma-key out the dark
 * background, auto-trim the surrounding empty space, save as a clean
 * transparent-background logotype PNG in public/branding/logotype.png.
 *
 * Run: node scripts/prepare-logo.mjs
 *
 * After this runs, the brand template references public/branding/logotype.png
 * (local file, base64-embedded at render time) — no more square dark plate
 * showing through the template.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const LOGO_URL =
  "https://dyhcyxdwigoqlvcfgerd.supabase.co/storage/v1/object/public/branding/5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f/logo.png";
const OUT_DIR = path.join(root, "public/branding");
const OUT_PATH = path.join(OUT_DIR, "logotype.png");

async function main() {
  console.log("Downloading logo…");
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`Source: ${buf.length} bytes`);

  // Load and inspect: get raw RGBA pixels.
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  console.log(`Decoded: ${info.width}x${info.height}, ${info.channels}ch`);

  // Sample the corner pixel to find the background color. The logo has a
  // dark teal/green background that's uniform across the padding.
  const cornerIdx = 0; // top-left pixel
  const bgR = data[cornerIdx + 0];
  const bgG = data[cornerIdx + 1];
  const bgB = data[cornerIdx + 2];
  console.log(`Detected bg color: rgb(${bgR}, ${bgG}, ${bgB})`);

  // Chroma-key: any pixel within Euclidean distance THRESHOLD of the bg
  // color becomes fully transparent. Anything farther stays as-is.
  const THRESHOLD = 60;
  const out = Buffer.alloc(data.length);
  let kept = 0;
  let cleared = 0;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i + 0] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 < THRESHOLD * THRESHOLD) {
      // Background pixel → transparent
      out[i + 0] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      cleared++;
    } else {
      out[i + 0] = data[i + 0];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      out[i + 3] = 255;
      kept++;
    }
  }
  console.log(`Pixels kept: ${kept.toLocaleString()}, cleared: ${cleared.toLocaleString()}`);

  // Re-encode + auto-trim transparent borders so the logo content sits flush.
  const final = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  console.log(`Trimmed to ${final.info.width}x${final.info.height}, ${final.data.length} bytes`);

  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, final.data);
  console.log(`✓ Wrote ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
