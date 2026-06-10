import { createClient } from "@/lib/supabase/server";

export type SandraQueueItem = {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  queued_at: string;
  scheduled_for: string | null;
  status:
    | "pending"
    | "calling"
    | "completed"
    | "skipped"
    | "no_answer"
    | "failed";
  priority: number;
  attempts: number;
  last_attempt_at: string | null;
  call_conversation_id: string | null;
  outcome: string | null;
  notes: string | null;
  // Joined lead data
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_intent: string | null;
  lead_source: string | null;
};

export async function listSandraQueue(
  tenantId: string,
  opts: { status?: SandraQueueItem["status"]; limit?: number } = {},
): Promise<SandraQueueItem[]> {
  const supabase = await createClient();
  // Join sandra_call_queue ← leads to surface contact info in the queue UI
  // without a second roundtrip per row.
  let q = supabase
    .from("sandra_call_queue")
    .select(
      `id, tenant_id, lead_id, queued_at, scheduled_for, status, priority,
       attempts, last_attempt_at, call_conversation_id, outcome, notes,
       leads ( name, whatsapp_number, email, intent, source )`,
    )
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true })
    .order("queued_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq("status", opts.status);

  const { data } = await q;
  type Joined = {
    id: string;
    tenant_id: string;
    lead_id: string | null;
    queued_at: string;
    scheduled_for: string | null;
    status: SandraQueueItem["status"];
    priority: number;
    attempts: number;
    last_attempt_at: string | null;
    call_conversation_id: string | null;
    outcome: string | null;
    notes: string | null;
    leads: {
      name: string | null;
      whatsapp_number: string | null;
      email: string | null;
      intent: string | null;
      source: string | null;
    } | null;
  };
  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    lead_id: row.lead_id,
    queued_at: row.queued_at,
    scheduled_for: row.scheduled_for,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    last_attempt_at: row.last_attempt_at,
    call_conversation_id: row.call_conversation_id,
    outcome: row.outcome,
    notes: row.notes,
    lead_name: row.leads?.name ?? null,
    lead_phone: row.leads?.whatsapp_number ?? null,
    lead_email: row.leads?.email ?? null,
    lead_intent: row.leads?.intent ?? null,
    lead_source: row.leads?.source ?? null,
  }));
}

export async function countSandraQueueByStatus(
  tenantId: string,
): Promise<Record<SandraQueueItem["status"], number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sandra_call_queue")
    .select("status")
    .eq("tenant_id", tenantId);
  const counts: Record<SandraQueueItem["status"], number> = {
    pending: 0,
    calling: 0,
    completed: 0,
    skipped: 0,
    no_answer: 0,
    failed: 0,
  };
  for (const row of (data ?? []) as { status: SandraQueueItem["status"] }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
