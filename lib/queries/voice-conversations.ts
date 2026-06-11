import { createClient } from "@/lib/supabase/server";

export type VoiceConversationRow = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  direction: string | null;
  caller_phone: string | null;
  started_at: string;
  duration_seconds: number;
  call_outcome: string | null;
  user_name: string | null;
  user_whatsapp: string | null;
};

/**
 * Pull the most recent voice calls for a tenant. Joined with users so the
 * UI can show the customer/lead name + a link to their profile without
 * second round-trips.
 */
export async function listVoiceConversations(
  tenantId: string,
  limit = 100,
): Promise<VoiceConversationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("voice_conversations" as never)
    .select(
      "id, elevenlabs_conversation_id, user_id, direction, caller_phone, started_at, duration_seconds, call_outcome, users:user_id ( name, whatsapp_number )" as never,
    )
    .eq("tenant_id" as never, tenantId)
    .order("started_at" as never, { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as Array<{
    id: string;
    elevenlabs_conversation_id: string;
    user_id: string | null;
    direction: string | null;
    caller_phone: string | null;
    started_at: string;
    duration_seconds: number;
    call_outcome: string | null;
    users: { name: string | null; whatsapp_number: string | null } | null;
  }>).map((r) => ({
    id: r.id,
    conversation_id: r.elevenlabs_conversation_id,
    user_id: r.user_id,
    direction: r.direction,
    caller_phone: r.caller_phone,
    started_at: r.started_at,
    duration_seconds: r.duration_seconds,
    call_outcome: r.call_outcome,
    user_name: r.users?.name ?? null,
    user_whatsapp: r.users?.whatsapp_number ?? null,
  }));
}
