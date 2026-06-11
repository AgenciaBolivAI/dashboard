import { createClient } from "@/lib/supabase/server";

export type VoiceConversationRow = {
  id: string;
  conversation_id: string;
  lead_id: string | null;
  direction: string | null;
  caller_phone: string | null;
  started_at: string;
  duration_seconds: number;
  call_outcome: string | null;
  lead_name: string | null;
  lead_phone: string | null;
};

type EpisodeRow = {
  id?: string;
  created_at: string;
  metadata: {
    conversation_id?: string;
    lead_id?: string;
    tenant_id?: string;
    direction?: string;
    duration_secs?: number | string;
    call_successful?: string;
    started_at?: string;
  } | null;
};

/**
 * Recent voice calls for a tenant, read from brain.episodes (the single
 * source the Sandra/Rebecca tick writes). Joined with public.leads so the
 * UI can show the lead name + link to /leads/[id].
 *
 * brain.episodes lives in the `brain` schema — reached via REST with the
 * Accept-Profile header (same pattern as getLeadCallHistory). The dashboard
 * client can't select cross-schema, so we use the service key here; the
 * page already gates access via requireTenantAccess.
 */
export async function listVoiceConversations(
  tenantId: string,
  limit = 100,
): Promise<VoiceConversationRow[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const params = new URLSearchParams({
    select: "id,created_at,metadata",
    source: "eq.elevenlabs",
    "metadata->>tenant_id": `eq.${tenantId}`,
    order: "created_at.desc",
    limit: String(limit),
  });
  const res = await fetch(`${url}/rest/v1/episodes?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "brain",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const episodes = (await res.json()) as EpisodeRow[];
  if (episodes.length === 0) return [];

  // Resolve lead names in one batch
  const leadIds = Array.from(
    new Set(
      episodes
        .map((e) => e.metadata?.lead_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const leadById = new Map<string, { name: string | null; whatsapp_number: string | null }>();
  if (leadIds.length > 0) {
    const supabase = await createClient();
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, whatsapp_number")
      .eq("tenant_id", tenantId)
      .in("id", leadIds);
    for (const l of (leads ?? []) as Array<{ id: string; name: string | null; whatsapp_number: string | null }>) {
      leadById.set(l.id, { name: l.name, whatsapp_number: l.whatsapp_number });
    }
  }

  return episodes.map((e) => {
    const m = e.metadata ?? {};
    const leadId = m.lead_id || null;
    const lead = leadId ? leadById.get(leadId) : undefined;
    return {
      id: e.id ?? m.conversation_id ?? e.created_at,
      conversation_id: m.conversation_id ?? "",
      lead_id: leadId,
      direction: m.direction ?? "outbound",
      caller_phone: lead?.whatsapp_number ?? null,
      started_at: m.started_at ?? e.created_at,
      duration_seconds: Number(m.duration_secs ?? 0),
      call_outcome: m.call_successful ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.whatsapp_number ?? null,
    };
  });
}
