import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { publishDraft, type PublishTarget } from "@/lib/content/publish";

export const runtime = "nodejs";
// Instagram publishing polls the media container until it's processed (up to
// ~30s), so allow headroom beyond the default function timeout.
export const maxDuration = 60;

/**
 * Native publish endpoint for n8n auto-post (the CCAVAI tick calls this for
 * each approved draft when a tenant has auto_post enabled). Bearer-authed with
 * CCAVAI_WEBHOOK_SECRET, same trust boundary as the other internal endpoints.
 *
 * Body: { tenant_id, draft_id, target: "facebook" | "instagram" }
 */
export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 200 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
  const draftId = typeof body.draft_id === "string" ? body.draft_id : null;
  const target =
    body.target === "facebook" || body.target === "instagram"
      ? (body.target as PublishTarget)
      : null;

  if (!tenantId || !draftId || !target) {
    return NextResponse.json(
      { ok: false, error: "tenant_id, draft_id, target are required" },
      { status: 200 },
    );
  }

  const result = await publishDraft({ tenantId, draftId, target });
  return NextResponse.json(result);
}
