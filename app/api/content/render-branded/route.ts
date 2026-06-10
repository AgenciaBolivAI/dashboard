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
import { checkBearer } from "@/lib/security/bearer";

export const runtime = "nodejs";   // needs node:fs for font loading
export const maxDuration = 30;

function unauthorized() {
  return new NextResponse("Unauthorized", { status: 401 });
}

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  let body: Partial<BrandRenderInput> & { return_format?: "png" | "json" } = {};
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
