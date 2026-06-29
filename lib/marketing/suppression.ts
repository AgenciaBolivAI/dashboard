import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Per-tenant marketing suppression list (opt-outs). Keyed by a CANONICAL address
 * so a person is matched whether they're a lead or a customer, regardless of how
 * the raw value was stored:
 *   email → trimmed + lowercased
 *   phone → digits only (drops +, spaces, punctuation)
 *
 * Filtered at enrollment (resolveAudience) and again at send time (the tick), so
 * an opt-out between approve and send is still honored.
 */
export function canonicalAddress(raw: string): string {
  const v = (raw || "").trim();
  if (v.includes("@")) return v.toLowerCase();
  return v.replace(/\D/g, "");
}

/** All suppressed canonical addresses for a tenant (bulk filter). */
export async function getSuppressionSet(tenantId: string): Promise<Set<string>> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc.from("marketing_unsubscribes").select("address").eq("tenant_id", tenantId);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ address: string }>) set.add(r.address);
  return set;
}

/** Record an opt-out (idempotent on tenant+address). */
export async function recordUnsubscribe(input: {
  tenantId: string;
  address: string;
  channel?: string | null;
  source: "link" | "one_click" | "manual";
  messageId?: string | null;
}): Promise<void> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  await svc.from("marketing_unsubscribes").upsert(
    {
      tenant_id: input.tenantId,
      address: canonicalAddress(input.address),
      channel: input.channel ?? null,
      source: input.source,
      message_id: input.messageId ?? null,
    },
    { onConflict: "tenant_id,address" },
  );
}
