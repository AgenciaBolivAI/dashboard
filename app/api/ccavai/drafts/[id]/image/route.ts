/**
 * GET /api/ccavai/drafts/[id]/image
 *
 * Streams the branded PNG for a single CCAVAI draft. Lets the page query
 * stay slim (no inline 2MB data URIs per row, which blow Vercel's 4.5MB
 * response cap when 9+ drafts are on screen) — the browser pulls each
 * image lazily via <img src="/api/ccavai/drafts/.../image"> + caches.
 *
 * Optional query param: ?variant=subject returns the raw gpt-image-1
 * subject instead of the branded composite. Useful for the edit dialog's
 * "current subject" preview.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, getRoleOnTenant } from "@/lib/auth";

export const runtime = "nodejs";

const DATA_URI_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/;

// 1×1 transparent PNG. Served (200) instead of 404 when a draft has no image
// yet (e.g. a generation whose image step failed) so the browser <img> doesn't
// flood the console with 404s. The card still shows, just without a picture.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
function placeholder() {
  return new NextResponse(new Uint8Array(PLACEHOLDER_PNG), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=30" },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const variant = url.searchParams.get("variant") === "subject" ? "subject" : "branded";
  const column = variant === "subject" ? "subject_image_url" : "image_url";

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("ccavai_drafts")
    .select(`${column}, tenant_id`)
    .eq("id", id)
    .single();

  if (error || !data) {
    return placeholder();
  }
  const row = data as Record<string, string | null>;

  // Tenant-scope the read. This route can't take a tenant param (it's an
  // <img src>), and it uses the RLS-bypassing service client — so resolve the
  // draft's tenant and confirm the caller is a member (or BolivAI staff).
  // Without this, any signed-in user could fetch another tenant's draft image
  // by id (cross-tenant IDOR). Return the placeholder (not 403) so we don't
  // leak whether a given id exists.
  const tenantId = row.tenant_id;
  if (!tenantId || !(await getRoleOnTenant(tenantId))) {
    return placeholder();
  }

  const dataUri = row[column];
  if (!dataUri) {
    return placeholder();
  }

  const match = dataUri.match(DATA_URI_RE);
  if (!match) {
    // Already a regular URL — redirect the browser to it.
    return NextResponse.redirect(dataUri);
  }
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      // Drafts don't change once rendered (only on explicit edit which
      // touches a new id surface), so cache aggressively at the edge.
      "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
    },
  });
}
