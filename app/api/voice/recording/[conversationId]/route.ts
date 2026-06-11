import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

const BOLIVAI_TENANT_ID = "5e0a3c3a-3a64-4d51-a51d-9e233fb9da4f";

/** Resolve a voice conversation's tenant from brain.episodes via REST. */
async function tenantForConversation(conversationId: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const params = new URLSearchParams({
    select: "metadata",
    source: "eq.elevenlabs",
    "metadata->>conversation_id": `eq.${conversationId}`,
    limit: "1",
  });
  const res = await fetch(`${url}/rest/v1/episodes?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "brain",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ metadata?: Record<string, unknown> }>;
  const meta = rows[0]?.metadata;
  if (!meta) return null;
  return typeof meta.tenant_id === "string" && meta.tenant_id
    ? meta.tenant_id
    : BOLIVAI_TENANT_ID;
}

/**
 * Proxy ElevenLabs's conversation audio endpoint so operators can listen to
 * their own call recordings from our dashboard without ever seeing an
 * ElevenLabs URL or our API key.
 *
 * Auth flow:
 *   1. Require an authenticated user
 *   2. Resolve the conversation_id → tenant_id from brain.episodes (the
 *      single source the Sandra/Rebecca tick writes). metadata.tenant_id is
 *      set per call; older rows default to the BolivAI tenant since brain is
 *      BolivAI-scoped today.
 *   3. requireTenantAccess against that tenant — only members can listen
 *   4. Fetch audio from ElevenLabs with our master xi-api-key, stream it back
 *
 * If the conversation isn't a known voice episode, we 404 — never proxy for a
 * conversation that doesn't belong to a known tenant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  if (!conversationId || conversationId.length > 80) {
    return NextResponse.json({ error: "invalid conversation id" }, { status: 400 });
  }

  await requireUser();

  const tenantId = await tenantForConversation(conversationId);
  if (!tenantId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await requireTenantAccess(tenantId);

  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) {
    return NextResponse.json({ error: "elevenlabs not configured" }, { status: 500 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
    { headers: { "xi-api-key": elKey } },
  );
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `elevenlabs ${upstream.status}` },
      { status: upstream.status },
    );
  }

  // Pipe the audio bytes straight through. ElevenLabs returns audio/mpeg.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
