import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cold-outreach lawful-basis gate. AIMA scraping and Sandra COLD CALLS are
 * unsolicited B2B outreach — in many jurisdictions (GDPR, CAN-SPAM, TCPA, local
 * do-not-call rules) they require a lawful basis / opt-in. Until a tenant admin
 * attests that basis (schema-step48: aima_settings.cold_outreach_attested_at),
 * the app refuses to trigger a scrape or queue cold calls.
 *
 * True only when the attestation timestamp is set.
 */
export async function isColdOutreachAttested(tenantId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("aima_settings")
    .select("cold_outreach_attested_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data?.cold_outreach_attested_at);
}

/** User-facing block message (Spanish — matches the rest of the action layer). */
export const COLD_OUTREACH_BLOCKED_MSG =
  "Antes de iniciar prospección en frío (AIMA / llamadas de Sandra) debes confirmar que tienes una base legal para contactar a estos negocios. Actívalo en Marketing → AIMA.";
