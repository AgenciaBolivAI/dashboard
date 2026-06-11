import { createClient } from "@/lib/supabase/server";

/**
 * Batch-resolve user IDs by phone number.
 *
 * Invoices, reservations, and other tables that denormalize customer phone
 * (rather than holding a user_id FK) call this so the dashboard can render
 * the customer name as a Link to /customers/[user_id] without having to
 * round-trip per row.
 *
 * Input phones can be in any format ("+591...", "591...", "+1 (305) 264-2711");
 * we strip everything but digits + leading + before matching. Public.users
 * stores `whatsapp_number` as digits-only (no leading +), so we normalize
 * to that.
 */
export async function lookupUserIdsByPhones(
  tenantId: string,
  phones: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const normalized = Array.from(
    new Set(
      phones
        .filter((p): p is string => Boolean(p))
        .map((p) => p.replace(/\D/g, ""))
        .filter((p) => p.length >= 7),
    ),
  );
  if (normalized.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, whatsapp_number")
    .eq("tenant_id", tenantId)
    .in("whatsapp_number", normalized);

  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; whatsapp_number: string | null }[]) {
    if (r.whatsapp_number) out[r.whatsapp_number] = r.id;
  }
  return out;
}

/**
 * Resolve a single user_id by phone. Returns null if no match.
 * Use this from detail pages (invoice detail, reservation detail) where
 * the batch helper would be overkill.
 */
export async function lookupUserIdByPhone(
  tenantId: string,
  phone: string | null | undefined,
): Promise<string | null> {
  if (!phone) return null;
  const map = await lookupUserIdsByPhones(tenantId, [phone]);
  const digits = phone.replace(/\D/g, "");
  return map[digits] ?? null;
}

/** Helper for callers — phone → digits-only string suitable for map lookup. */
export function normalizePhoneForLookup(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 7 ? d : null;
}
