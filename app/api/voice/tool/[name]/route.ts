import { NextRequest, NextResponse } from "next/server";
import { TOOLS } from "@/lib/voice-tools";

/**
 * Server Tool dispatcher for voice agents.
 *
 * URL: /api/voice/tool/{tool_name}?tenant={tenant_uuid}
 * Header: Authorization: Bearer ${VOICE_TOOL_SECRET}
 * Body: tool-specific JSON (validated against the tool's Zod schema)
 *
 * Per-tenant agents bake the URL + bearer into their tools config at
 * creation time, so every inbound request already carries the tenant
 * scope. The route validates the bearer (constant-time comparison),
 * resolves the tool, validates the body, and runs the handler.
 *
 * Failures are returned as 200 + ok:false so the agent can speak the
 * user_facing_error naturally instead of receiving an opaque 4xx.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const tool = TOOLS[name];
  if (!tool) {
    return NextResponse.json(
      { ok: false, error: `unknown tool: ${name}` },
      { status: 404 },
    );
  }

  const expected = process.env.VOICE_TOOL_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !timingSafeEqual(got, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenant");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json(
      { ok: false, error: "missing or invalid tenant query param" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = tool.schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: `invalid arguments: ${issue?.message ?? "validation failed"}`,
        user_facing_error: "I had a problem with that. Let me try again.",
      },
      { status: 200 },
    );
  }

  try {
    const result = await tool.handler(parsed.data, { tenantId });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[voice tool ${name}] handler threw`, msg);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        user_facing_error: "Something went wrong on our side. Please try again.",
      },
      { status: 200 },
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
