"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";

export type OnboardingState = {
  error: string | null;
  success?: boolean;
  slug?: string;
};

const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [string, ...string[]];
const LANGUAGES = ["es", "en", "pt"] as const;

const provisionSchema = z.object({
  company_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  industry: z.string().trim().min(2).max(80),
  country: z.string().trim().length(2, "Código ISO de 2 letras").transform((s) => s.toUpperCase()),
  timezone: z.string().trim().min(3).max(80).default("America/La_Paz"),
  language: z.enum(LANGUAGES).default("es"),
  template_id: z.enum(TEMPLATE_IDS),
  whatsapp_number: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,16}$/, "Número con código país, ej. +5217712345678")
    .transform((s) => s.replace(/^\+/, "")),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Color hex (#RRGGBB)")
    .default("#00e5a0"),
  accent_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Color hex (#RRGGBB)")
    .default("#00b87d"),
  logo_url: z
    .string()
    .trim()
    .url("URL inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * Generate a tenant slug from the company name: lowercase, ASCII-only,
 * hyphens. If taken, append a numeric suffix until unique.
 */
function baseSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "agente";
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

export async function provisionTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = provisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const user = await requireUser();
  const svc = createServiceClient();

  // Defense in depth — block accidental "create a second tenant" via this route.
  const { data: existing } = await svc
    .from("dashboard_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "Tu cuenta ya está asociada a un tenant. Contáctanos para crear otro." };
  }

  const template = TEMPLATES.find((t) => t.id === parsed.data.template_id);
  if (!template) return { error: "Plantilla inválida" };

  const slug = await findUniqueSlug(baseSlug(parsed.data.company_name));

  // Build the tenant payload. Sensible defaults wherever the wizard didn't ask.
  const { data: tenantRow, error: insertErr } = await svc
    .from("tenants")
    .insert({
      slug,
      name: parsed.data.company_name,
      industry: parsed.data.industry,
      address_country: parsed.data.country,
      timezone: parsed.data.timezone,
      language: parsed.data.language,
      workflow_template: template.id,
      gateway: "evolution",
      gateway_config: { instance: `pending_${slug}` },
      whatsapp_number: parsed.data.whatsapp_number,
      prompt_template: template.promptTemplate,
      prompt_variables: {
        ...template.promptVariables,
        company_name: parsed.data.company_name,
        industry: parsed.data.industry,
      },
      primary_color: parsed.data.primary_color,
      accent_color: parsed.data.accent_color,
      logo_url: parsed.data.logo_url ?? null,
      plan: "credits",
      status: "pending_whatsapp_setup",
      notification_email: user.email ?? null,
      notify_on_new_reservation: true,
      notify_on_reschedule: true,
      notify_on_cancel: true,
      invoice_default_currency: "USD",
    })
    .select("id, slug")
    .single();

  if (insertErr || !tenantRow) {
    return { error: insertErr?.message ?? "No se pudo crear el agente" };
  }

  const tenantId = (tenantRow as { id: string }).id;

  // Membership: this user is the owner
  await svc.from("dashboard_users").insert({
    user_id: user.id,
    tenant_id: tenantId,
    role: "owner",
  });

  // AIMA settings row + credit account auto-init via debit/topup, but seed
  // them now so /marketing + /billing render cleanly on first visit.
  await Promise.all([
    svc.from("aima_settings").insert({ tenant_id: tenantId }),
    svc.from("credit_accounts").insert({ tenant_id: tenantId }),
  ]);

  revalidatePath("/", "layout");
  return { error: null, success: true, slug: tenantRow.slug as string };
}
