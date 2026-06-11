import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBolivAIAdmin } from "@/lib/auth";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  plan: string;
  status: string;
  prompt_template: string | null;
  prompt_variables: Record<string, unknown>;
  whatsapp_number: string | null;
  timezone: string;
  language: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  custom_domain: string | null;
  support_email: string | null;
  support_whatsapp: string | null;
  notification_email: string | null;
  notification_whatsapp_e164: string | null;
  notify_on_new_reservation: boolean;
  notify_on_reschedule: boolean;
  notify_on_cancel: boolean;
  workflow_template: string;
  gateway: string;
  gateway_config: Record<string, unknown>;
  // ── Billing / business profile ────────────────────────────────────
  legal_name: string | null;
  tax_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  invoice_footer: string | null;
  invoice_default_currency: string;
  stripe_account_id: string | null;
  stripe_account_country: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_account_updated_at: string | null;
  // ── Voice (ElevenLabs) ────────────────────────────────────────────
  elevenlabs_agent_id: string | null;
  voice_enabled: boolean;
  voice_id: string | null;
  voice_greeting: string | null;
  voice_languages: string[];
  voice_phone_provider: string | null;
  voice_phone_number: string | null;
  voice_agent_created_at: string | null;
  voice_agent_updated_at: string | null;
  voice_elevenlabs_outbound_phone_id: string | null;
  voice_persona: Record<string, unknown> | null;
  voice_kb_doc_id: string | null;
  voice_kb_synced_at: string | null;
};

export async function getTenantBySlug(slug: string): Promise<Tenant> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, slug, name, industry, plan, status, prompt_template, prompt_variables, whatsapp_number, timezone, language, logo_url, primary_color, accent_color, custom_domain, support_email, support_whatsapp, notification_email, notification_whatsapp_e164, notify_on_new_reservation, notify_on_reschedule, notify_on_cancel, workflow_template, gateway, gateway_config, legal_name, tax_id, address_line1, address_line2, address_city, address_state, address_postal_code, address_country, invoice_footer, invoice_default_currency, stripe_account_id, stripe_account_country, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_updated_at, elevenlabs_agent_id, voice_enabled, voice_id, voice_greeting, voice_languages, voice_phone_provider, voice_phone_number, voice_agent_created_at, voice_agent_updated_at, voice_elevenlabs_outbound_phone_id, voice_persona, voice_kb_doc_id, voice_kb_synced_at" as never,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[getTenantBySlug] query error:", { slug, error });
    notFound();
  }
  if (!data) {
    console.error("[getTenantBySlug] no row visible (RLS or wrong slug)", { slug });
    notFound();
  }
  return data as unknown as Tenant;
}

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
};

/**
 * Tenants the current user has access to. Returns:
 *   - For bolivai_admins: every tenant in the system
 *   - For everyone else: only tenants they have a `dashboard_users` row in
 *
 * Each entry's role is the user's actual role on that tenant
 * ("bolivai_admin" for system staff, otherwise the dashboard_users.role).
 */
export async function getMyTenants(): Promise<{
  role: string;
  tenant: TenantSummary;
}[]> {
  const supabase = await createClient();

  if (await isBolivAIAdmin()) {
    const { data } = await supabase
      .from("tenants")
      .select("id, slug, name, logo_url, primary_color")
      .order("name");
    return ((data ?? []) as TenantSummary[]).map((t) => ({
      role: "bolivai_admin",
      tenant: t,
    }));
  }

  const { data } = await supabase
    .from("dashboard_users")
    .select("role, tenants(id, slug, name, logo_url, primary_color)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as Array<{ role: string; tenants: TenantSummary | null }>)
    .filter((row) => row.tenants !== null)
    .map((row) => ({ role: row.role, tenant: row.tenants as TenantSummary }));
}
