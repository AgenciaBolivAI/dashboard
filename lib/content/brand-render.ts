/**
 * BolivAI branded image renderer.
 *
 * Takes a subject photo (AI-generated or uploaded) + a headline +
 * accent phrases and produces a 1080×1350 PNG with consistent BolivAI
 * branding. Used by CCAVAI's tick to brand its drafts, and by the
 * dashboard's "Cambiar imagen / Generar versión" actions.
 *
 * Uses Satori (Vercel's JSX→SVG renderer) + resvg-js (SVG→PNG).
 * No headless browser, edge-runtime-compatible, ~200ms render.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import sharp from "sharp";

/**
 * The subject image displays in a 1080×740 region. gpt-image-1 returns a
 * 1024×1024 PNG (~2 MB base64). Embedding that raw into the SVG makes resvg
 * rasterize a giant inline image — fast (~4s) when the lambda is warm with
 * memory headroom, but it balloons to >120s (timeouts) under any cold-start
 * or memory pressure. Downscaling + recompressing to a JPEG that exactly
 * fills the slot (~120 KB) keeps the embedded SVG small and renders
 * consistently in a couple seconds.
 *
 * Falls back to the original image if anything goes wrong (URLs, odd inputs)
 * so we never break a render over the optimization.
 */
async function prepareSubjectImage(src: string): Promise<string> {
  if (typeof src !== "string" || !src.startsWith("data:image/")) return src;
  try {
    const b64 = src.slice(src.indexOf(",") + 1);
    const input = Buffer.from(b64, "base64");
    const out = await sharp(input)
      .resize(1080, 740, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return src;
  }
}

export type BrandRenderInput = {
  /** Source for the subject image — URL or `data:image/png;base64,…`. */
  subject_image: string;
  /** Main headline (free form). Will be UPPERCASED inside the template. */
  headline: string;
  /** Phrases (case-insensitive) inside the headline to color with the BolivAI accent. */
  accent_phrases?: string[];
  /** Optional small label above the headline (e.g., "AI NEWS", "RESEARCH"). */
  category_label?: string;
  /** Override the wordmark with an explicit data URI. Defaults to the bundled
   *  transparent-background logotype at public/branding/logotype.png. */
  wordmark_image_url?: string;
};

export const BRAND = {
  primary: "#00e5a0",
  accent: "#00b87d",
  background: "#0a0a0a",
  textPrimary: "#ffffff",
  textMuted: "#94a3b8",
};

type SatoriFont = { name: string; data: Buffer; weight: 700; style: "normal" };
let cachedFonts: SatoriFont[] | null = null;
let cachedLogotypeDataUri: string | null = null;

async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) return cachedFonts;
  const fontDir = path.join(process.cwd(), "public", "fonts");
  const [anton, inter] = await Promise.all([
    readFile(path.join(fontDir, "Anton-Regular.ttf")),
    readFile(path.join(fontDir, "Inter-Bold.ttf")),
  ]);
  cachedFonts = [
    { name: "Anton", data: anton, weight: 700, style: "normal" },
    { name: "Inter", data: inter, weight: 700, style: "normal" },
  ];
  return cachedFonts;
}

async function loadDefaultLogotype(): Promise<string> {
  if (cachedLogotypeDataUri) return cachedLogotypeDataUri;
  const logoPath = path.join(process.cwd(), "public", "branding", "logotype.png");
  const buf = await readFile(logoPath);
  cachedLogotypeDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedLogotypeDataUri;
}

/**
 * Split a headline into colored segments. Accent phrases (case-insensitive)
 * get rendered in the primary brand green; everything else stays white.
 * Greedy left-to-right match — if two accent phrases overlap, the
 * earlier-starting one wins.
 */
function buildHeadlineSegments(headline: string, accentPhrases: string[]) {
  const upper = headline.toUpperCase();
  const accents = accentPhrases
    .map((p) => p.toUpperCase().trim())
    .filter((p) => p.length > 0);

  type Seg = { text: string; accent: boolean };
  const segments: Seg[] = [];
  let remaining = upper;

  while (remaining.length > 0) {
    let earliest = -1;
    let earliestAccent = "";
    for (const a of accents) {
      const idx = remaining.indexOf(a);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestAccent = a;
      }
    }
    if (earliest === -1) {
      segments.push({ text: remaining, accent: false });
      break;
    }
    if (earliest > 0) {
      segments.push({ text: remaining.slice(0, earliest), accent: false });
    }
    segments.push({ text: earliestAccent, accent: true });
    remaining = remaining.slice(earliest + earliestAccent.length);
  }
  return segments;
}

/**
 * Build the JSX-as-React.createElement tree. Satori parses this directly —
 * inline div/span/img only, NO React components, NO event handlers.
 * CSS is a subset (flexbox, gradients, basic typography).
 */
function buildTree(input: BrandRenderInput) {
  const segments = buildHeadlineSegments(input.headline, input.accent_phrases || []);

  return React.createElement(
    "div",
    {
      style: {
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        backgroundColor: BRAND.background,
        fontFamily: "Inter",
        color: BRAND.textPrimary,
      },
    },
    [
      // Subject image (top ~55% of canvas) with gradient fade into the bg
      React.createElement(
        "div",
        {
          key: "subject",
          style: {
            position: "relative",
            display: "flex",
            width: 1080,
            height: 740,
          },
        },
        [
          React.createElement("img", {
            key: "img",
            src: input.subject_image,
            style: { width: 1080, height: 740, objectFit: "cover" },
          }),
          React.createElement("div", {
            key: "fade",
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 240,
              background: `linear-gradient(180deg, rgba(10,10,10,0) 0%, ${BRAND.background} 100%)`,
              display: "flex",
            },
          }),
        ],
      ),
      // Headline + wordmark area
      React.createElement(
        "div",
        {
          key: "text-area",
          style: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "30px 60px 50px",
          },
        },
        [
          // Optional category label
          input.category_label
            ? React.createElement(
                "div",
                {
                  key: "label",
                  style: {
                    display: "flex",
                    alignSelf: "flex-start",
                    backgroundColor: BRAND.primary,
                    color: "#0a0a0a",
                    fontFamily: "Inter",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: 4,
                    padding: "6px 18px",
                    marginBottom: 18,
                  },
                },
                input.category_label.toUpperCase(),
              )
            : null,
          // Headline
          React.createElement(
            "div",
            {
              key: "headline",
              style: {
                display: "flex",
                flexWrap: "wrap",
                fontFamily: "Anton",
                fontSize: 90,
                lineHeight: 0.95,
                letterSpacing: 0.5,
              },
            },
            segments.map((seg, i) =>
              React.createElement(
                "span",
                {
                  key: i,
                  style: {
                    color: seg.accent ? BRAND.primary : BRAND.textPrimary,
                    marginRight: 16,
                  },
                },
                seg.text,
              ),
            ),
          ),
          // Wordmark — uses the bundled trimmed logotype by default
          React.createElement(
            "div",
            {
              key: "wordmark",
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 30,
                height: 120,
              },
            },
            React.createElement("img", {
              src: input.wordmark_image_url,
              width: 540,
              height: 120,
              style: { width: 540, height: 120, objectFit: "contain" },
            }),
          ),
        ].filter(Boolean),
      ),
    ],
  );
}

export async function renderBrandedPng(input: BrandRenderInput): Promise<Buffer> {
  const [fonts, defaultLogo, subject] = await Promise.all([
    loadFonts(),
    loadDefaultLogotype(),
    prepareSubjectImage(input.subject_image),
  ]);
  const tree = buildTree({
    ...input,
    subject_image: subject,
    wordmark_image_url: input.wordmark_image_url ?? defaultLogo,
  });
  const svg = await satori(tree, {
    width: 1080,
    height: 1350,
    fonts,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  return resvg.render().asPng();
}

/** Returns the rendered PNG as a base64 data URI, ready to drop in DB. */
export async function renderBrandedDataUri(input: BrandRenderInput): Promise<string> {
  const buf = await renderBrandedPng(input);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
