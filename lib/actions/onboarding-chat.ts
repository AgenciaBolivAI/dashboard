"use server";

import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  provisionTenant,
  provisionSchema,
} from "@/lib/actions/onboarding";
import { runOnboardingChat, type ChatMsg, type OnboardingProfile } from "@/lib/onboarding/run";

export type OnboardingChatResult =
  | { ok: true; done: false; answer: string }
  | { ok: true; done: true; slug: string }
  | { ok: false; error: string };

// Localized re-ask when the AI calls provision too early / with invalid data.
const REASK: Record<string, string> = {
  es: "Casi listo — confírmame el número de WhatsApp completo con código de país y en qué ciudad estás. 🙂",
  en: "Almost there — please confirm the full WhatsApp number with country code and which city you're in. 🙂",
  pt: "Quase lá — confirme o número de WhatsApp completo com código do país e em qual cidade você está. 🙂",
  fr: "Presque — confirmez le numéro WhatsApp complet avec l'indicatif pays et votre ville. 🙂",
  it: "Ci siamo quasi — conferma il numero WhatsApp completo con prefisso internazionale e la tua città. 🙂",
};

/**
 * BOLIV's conversational onboarding turn. FREE (no credit debit) and PRE-TENANT
 * (only requireUser). Returns BOLIV's next question, or — once it has enough —
 * provisions the workspace and returns the new slug.
 */
export async function onboardingChatAction(
  history: ChatMsg[],
  locale = "es",
): Promise<OnboardingChatResult> {
  const user = await requireUser();
  const svc = createServiceClient();

  // Server backstop for the double-tenant case (page already redirects members).
  const { data: existing } = await svc
    .from("dashboard_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, error: "Tu cuenta ya tiene un espacio de trabajo." };
  }

  // Sanitize history (mirror askAssistantAction): last 16, valid roles, capped.
  const trimmed = (history ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }) as ChatMsg);
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    return { ok: false, error: "No hay mensaje que responder." };
  }

  const run = await runOnboardingChat(trimmed);
  if (run.kind === "error") return { ok: false, error: run.error };
  if (run.kind === "answer") return { ok: true, done: false, answer: run.answer };

  // run.kind === "provision": validate the AI-extracted profile authoritatively.
  const p = run.profile;
  const parsed = provisionSchema.safeParse({
    company_name: p.company_name,
    industry: p.industry,
    country: p.country,
    timezone: p.timezone,
    language: p.language,
    whatsapp_number: p.whatsapp_number,
    primary_color: p.primary_color,
    accent_color: p.accent_color,
    logo_url: p.logo_url,
  });
  if (!parsed.success) {
    // Provisioned too early / invalid — re-ask in the user's language (safety net).
    return { ok: true, done: false, answer: REASK[locale] ?? REASK.es };
  }

  const res = await provisionTenant(user.id, user.email ?? null, parsed.data);
  if (!res.ok) return { ok: false, error: res.error };

  // ── Best-effort AI-native extras (never roll back the tenant) ────────────
  await applyOnboardingExtras(res.tenantId, p).catch(() => {});

  return { ok: true, done: true, slug: res.slug };
}

async function applyOnboardingExtras(tenantId: string, p: OnboardingProfile): Promise<void> {
  const svc = createServiceClient();

  // AIMA lead targeting → the aima_settings row already exists (provisioned).
  const verticals = Array.isArray(p.target_verticals)
    ? p.target_verticals.map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    : undefined;
  const geographies = Array.isArray(p.target_geographies)
    ? p.target_geographies.map((s) => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 120)
    : undefined;
  if (verticals?.length || geographies?.length) {
    const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
    if (verticals?.length) patch.target_verticals = verticals;
    if (geographies?.length) patch.target_geographies = geographies;
    await svc.from("aima_settings").upsert(patch as never, { onConflict: "tenant_id" });
  }

  // Voice greeting.
  const greeting = typeof p.voice_greeting === "string" ? p.voice_greeting.trim().slice(0, 300) : "";
  if (greeting) {
    await svc.from("tenants").update({ voice_greeting: greeting } as never).eq("id", tenantId);
  }

  // Services described in the chat.
  if (Array.isArray(p.services) && p.services.length > 0) {
    const rows = p.services
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .slice(0, 25)
      .map((s) => ({
        tenant_id: tenantId,
        name: String(s.name).trim().slice(0, 120),
        description: s.description ? String(s.description).slice(0, 2000) : null,
        price_amount: typeof s.price_amount === "number" ? s.price_amount : null,
        price_currency: typeof s.price_currency === "string" && s.price_currency ? s.price_currency.slice(0, 8) : "USD",
        duration_min:
          typeof s.duration_min === "number" ? Math.max(1, Math.min(600, Math.round(s.duration_min))) : 30,
        category: s.category ? String(s.category).slice(0, 80) : null,
        active: true,
      }));
    if (rows.length > 0) await svc.from("services").insert(rows as never);
  }
}
