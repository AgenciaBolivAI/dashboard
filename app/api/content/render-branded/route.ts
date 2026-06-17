/**
 * POST /api/content/render-branded
 *
 * Takes a subject image + headline + accent phrases, renders a 1080×1350
 * BolivAI-branded PNG, returns it (data URI in JSON, or raw PNG body).
 *
 * Auth: Bearer token in Authorization header matching CCAVAI_WEBHOOK_SECRET
 * (the same secret n8n already uses to trigger CCAVAI generation).
 *
 * Callers:
 *  - n8n CCAVAI workflow — after gpt-image-1 returns the subject, n8n
 *    POSTs the data URI here to get the branded version.
 *  - Dashboard "Cambiar imagen" / "Regenerar" actions — when Celiel
 *    uploads or re-prompts, the server hits this endpoint.
 */
import { NextResponse } from "next/server";
import { renderBrandedPng, type BrandRenderInput } from "@/lib/content/brand-render";
import { uploadCcavaiImage, decodeDataUri } from "@/lib/content/ccavai-storage";
import { checkBearer } from "@/lib/security/bearer";

export const runtime = "nodejs";   // needs node:fs for font loading
// Cold-start of Satori + resvg-js + font loading consistently lands at 25-35s
// on Vercel. 30s wasn't enough headroom — n8n's CCAVAI workflow would
// silently fall back to the unbranded subject image. 90s is the new floor.
export const maxDuration = 90;

function unauthorized() {
  return new NextResponse("Unauthorized", { status: 401 });
}

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  let body: Partial<BrandRenderInput> & {
    return_format?: "png" | "json" | "storage";
    tenant_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject_image || !body.headline) {
    return NextResponse.json(
      { error: "subject_image and headline are required" },
      { status: 400 },
    );
  }

  let png: Buffer;
  try {
    png = await renderBrandedPng({
      subject_image: body.subject_image,
      headline: body.headline,
      accent_phrases: body.accent_phrases ?? [],
      category_label: body.category_label,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "render failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Storage mode: upload both the subject + branded PNG to the ccavai bucket
  // and return their public URLs. Keeps the multi-MB base64 OUT of Postgres
  // (was bloating ccavai_drafts to ~680MB + huge egress per render).
  if (body.return_format === "storage") {
    if (!body.tenant_id) {
      return NextResponse.json({ error: "tenant_id required for storage mode" }, { status: 400 });
    }
    try {
      const subjDecoded = decodeDataUri(body.subject_image);
      const subjectUrl = subjDecoded
        ? await uploadCcavaiImage(body.tenant_id, "subject", subjDecoded.buf, subjDecoded.contentType)
        : body.subject_image; // already a URL — pass through
      const brandedUrl = await uploadCcavaiImage(body.tenant_id, "branded", png, "image/png");
      return NextResponse.json({
        ok: true,
        image_url: brandedUrl,
        subject_image_url: subjectUrl,
        bytes: png.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upload failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (body.return_format === "json") {
    return NextResponse.json({
      ok: true,
      image_data_uri: `data:image/png;base64,${png.toString("base64")}`,
      bytes: png.length,
    });
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": "no-store",
    },
  });
}
