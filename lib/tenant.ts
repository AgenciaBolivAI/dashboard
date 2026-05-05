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
  workflow_template: string;
  gateway: string;
  gateway_config: Record<string, unknown>;
};

export async function getTenantBySlug(slug: string): Promise<Tenant> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, slug, name, industry, plan, status, prompt_template, prompt_variables, whatsapp_number, timezone, language, logo_url, primary_color, accent_color, custom_domain, support_email, support_whatsapp, workflow_template, gateway, gateway_config",
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
  return data as Tenant;
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
