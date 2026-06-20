"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transliterate } from "transliteration";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { TEMPLATES } from "@/lib/templates";

export type OnboardingState = {
  error: string | null;
  success?: boolean;
  slug?: string;
};

const LANGUAGES = ["es", "en", "pt"] as const;

// Templates are deprecated — every tenant gets every feature now (pay per use).
// We still need a default prompt to seed the WhatsApp agent, so we fall back to
// the 'physio' template if it exists, otherwise the first template in the
// registry. The workflow_template column on tenants stays so existing rows
// keep working, but new signups all get the same default.
const DEFAULT_TEMPLATE_ID = TEMPLATES.find((t) => t.id === "physio")?.id
  ?? TEMPLATES[0]?.id
  ?? "physio";

const provisionSchema = z.object({
  company_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  industry: z.string().trim().min(2).max(80),
  country: z.string().trim().length(2, "Código ISO de 2 letras").transform((s) => s.toUpperCase()),
  timezone: z.string().trim().min(3).max(80).default("America/La_Paz"),
  language: z.enum(LANGUAGES).default("es"),
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

  const template = TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  if (!template) return { error: "Configuración base no disponible — contacta a soporte." };

  const seed = baseSlug(parsed.data.company_name);

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
