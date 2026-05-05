import { createClient } from "@/lib/supabase/server";

export type Lead = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  intent: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  conversation_id: string | null;
};

export async function listLeads(
  tenantId: string,
  opts: { status?: string; intent?: string; limit?: number } = {},
): Promise<Lead[]> {
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select("id, name, whatsapp_number, email, intent, status, notes, created_at, conversation_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.intent) q = q.eq("intent", opts.intent);

  const { data } = await q;
  return (data ?? []) as Lead[];
}

export async function getLeadIntents(tenantId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("intent")
    .eq("tenant_id", tenantId)
    .not("intent", "is", null);
  const set = new Set<string>();
  for (const r of (data ?? []) as { intent: string }[]) set.add(r.intent);
  return Array.from(set);
}
