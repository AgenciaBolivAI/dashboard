"use server";

import { revalidatePath } from "next/cache";
import { transliterate } from "transliteration";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";
import { provisionSchema, type ProvisionInput } from "@/lib/onboarding/schema";

export type OnboardingState = {
  error: string | null;
  success?: boolean;
  slug?: string;
};

// Templates are deprecated — every tenant gets every feature now (pay per use).
// We still need a default prompt to seed the WhatsApp agent, so we fall back to
// the 'physio' template if it exists, otherwise the first template in the
// registry. The workflow_template column on tenants stays so existing rows
// keep working, but new signups all get the same default.
const DEFAULT_TEMPLATE_ID = TEMPLATES.find((t) => t.id === "physio")?.id
  ?? TEMPLATES[0]?.id
  ?? "physio";

/**
 * Generate a tenant slug from the company name: lowercase, ASCII-only,
 * hyphens. Transliterates first so non-Latin names (北京按摩 → "bei-jing-an-mo",
 * Москва → "moskva", مطعم → "mtaam") become readable slugs instead of collapsing
 * to the "agente" fallback — BolivAI serves worldwide markets. If taken, the
 * caller appends a numeric suffix until unique.
 */
function baseSlug(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "agente";
}

async function findUniqueSlug(seed: string): Promise<string> {
  const svc = createServiceClient();
  let candidate = seed;
  let suffix = 1;
  while (true) {
    const { data } = await svc
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    suffix++;
    candidate = `${seed}-${suffix}`;
    if (suffix > 50) {
      candidate = `${seed}-${Math.random().toString(36).slice(2, 6)}`;
      return candidate;
    }
  }
}

export type ProvisionResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; error: string };

/**
 * Core tenant provisioning — shared by the form action AND the BOLIV onboarding
 * chat. The caller MUST have authenticated (requireUser) and validated `input`
 * through provisionSchema. Performs: double-tenant guard, slug generation with
 * 23505 retry, tenants insert, dashboard_users(owner) + aima_settings +
 * credit_accounts seed.
 */
export async function provisionTenant(
  userId: string,
  userEmail: string | null,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const svc = createServiceClient();

  // Defense in depth — block accidental "create a second tenant".
  const { data: existing } = await svc
    .from("dashboard_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, error: "Tu cuenta ya está asociada a un tenant. Contáctanos para crear otro." };
  }

  const template = TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  if (!template) return { ok: false, error: "Configuración base no disponible — contacta a soporte." };

  const seed = baseSlug(input.company_name);

  // findUniqueSlug is a check-then-insert, so two near-simultaneous signups of
  // the same name can both read "free" and race for the same slug. The DB
  // `slug unique` constraint is the real guard: on a 23505 (unique_violation)
  // we regenerate the slug and retry, so the race self-heals instead of
  // surfacing a raw "duplicate key" error to the loser. Sensible defaults
  // wherever the wizard didn't ask.
  let tenantRow: { id: string; slug: string } | null = null;
  let insertErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0
        ? await findUniqueSlug(seed)
        : await findUniqueSlug(`${seed}-${Math.random().toString(36).slice(2, 6)}`);
    const res = await svc
      .from("tenants")
      .insert({
        slug,
        name: input.company_name,
        industry: input.industry,
        address_country: input.country,
        timezone: input.timezone,
        language: input.language,
        workflow_template: template.id,
        gateway: "evolution",
        gateway_config: { instance: `pending_${slug}` },
        whatsapp_number: input.whatsapp_number,
        prompt_template: template.promptTemplate,
        prompt_variables: {
          ...template.promptVariables,
          company_name: input.company_name,
          industry: input.industry,
        },
        primary_color: input.primary_color,
        accent_color: input.accent_color,
        logo_url: input.logo_url ?? null,
        plan: "credits",
        status: "pending_whatsapp_setup",
        notification_email: userEmail ?? null,
        notify_on_new_reservation: true,
        notify_on_reschedule: true,
        notify_on_cancel: true,
        invoice_default_currency: "USD",
      })
      .select("id, slug")
      .single();
    if (!res.error && res.data) {
      tenantRow = res.data as { id: string; slug: string };
      insertErr = null;
      break;
    }
    insertErr = res.error;
    // Only a slug collision is retryable; any other error is real → stop.
    if (res.error?.code !== "23505") break;
  }

  if (insertErr || !tenantRow) {
    return { ok: false, error: insertErr?.message ?? "No se pudo crear el agente" };
  }

  const tenantId = (tenantRow as { id: string }).id;

  // Membership: this user is the owner. CRITICAL — if this insert fails, the user
  // owns a tenant with NO membership → every dashboard route bounces them back to
  // /onboarding (and the double-tenant guard, reading dashboard_users, lets them
  // create yet another orphan). So roll the tenant back and surface the error.
  const { error: memberErr } = await svc.from("dashboard_users").insert({
    user_id: userId,
    tenant_id: tenantId,
    role: "owner",
  });
  if (memberErr) {
    await svc.from("tenants").delete().eq("id", tenantId);
    return { ok: false, error: memberErr.message };
  }

  // Seed AIMA settings + credit account so /marketing + /billing render cleanly
  // on first visit (best-effort — a failure here does NOT orphan the tenant).
  await Promise.all([
    svc.from("aima_settings").insert({ tenant_id: tenantId }),
    svc.from("credit_accounts").insert({ tenant_id: tenantId }),
  ]);

  revalidatePath("/", "layout");
  return { ok: true, tenantId, slug: tenantRow.slug as string };
}

/**
 * The onboarding FORM action — a thin wrapper that parses FormData and delegates
 * to provisionTenant. Contract unchanged so components/onboarding/wizard.tsx is
 * untouched.
 */
export async function provisionTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = provisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const user = await requireUser();
  const res = await provisionTenant(user.id, user.email ?? null, parsed.data);
  if (!res.ok) return { error: res.error };
  return { error: null, success: true, slug: res.slug };
}
