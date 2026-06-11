import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

/**
 * Proxy ElevenLabs's conversation audio endpoint so tenants can listen to
 * their own call recordings from our dashboard without ever seeing an
 * ElevenLabs URL or our API key.
 *
 * Auth flow:
 *   1. Require an authenticated user
 *   2. Look up the conversation_id in voice_conversations → resolves tenant_id
 *   3. requireTenantAccess against that tenant — only members can listen
 *   4. Fetch audio from ElevenLabs with our master xi-api-key
 *   5. Stream it back as audio/mpeg
 *
 * If the conversation isn't in voice_conversations, we 404 — never proxy
 * for a conversation that doesn't belong to a known tenant.
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

  const supabase = await createClient();
  // voice_conversations is the table the tick workflows write to with one row
  // per ElevenLabs conversation_id + the tenant it belongs to.
  const { data } = await supabase
    .from("voice_conversations" as never)
    .select("tenant_id" as never)
    .eq("elevenlabs_conversation_id" as never, conversationId)
    .maybeSingle();

  const row = data as { tenant_id?: string } | null;
  if (!row?.tenant_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await requireTenantAccess(row.tenant_id);

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
