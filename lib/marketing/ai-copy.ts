import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatCompletion } from "@/lib/llm";
import { debitCredits, getBalanceWithService } from "@/lib/billing/credits";
import { createServiceClient } from "@/lib/supabase/service";
import type { MarketingChannel } from "./channels";

/**
 * BOLIV drafts marketing copy (subject + body) for a campaign from a plain goal
 * ("invite past customers back with a 15% off offer this month"). Channel-aware:
 * email gets a subject + a slightly longer body; WhatsApp/SMS get no subject and
 * a concise body. Debits `marketing.ai_copy_draft` up front (pre-checks balance,
 * so a broke tenant can't spam the model). Returns plain text — the send layer
 * wraps email bodies in HTML.
 */
export type DraftInput = {
  goal: string;
  channel: MarketingChannel;
  businessName?: string | null;
  language?: string | null;
  tone?: string | null;
};
export type DraftResult = { ok: true; subject: string | null; body: string } | { ok: false; error: string };

export async function draftCampaignCopy(
  tenantId: string,
  input: DraftInput,
  actorUserId?: string | null,
): Promise<DraftResult> {
  // Pre-check the balance against the real price so a broke tenant can't burn the
  // model, but only DEBIT after a successful, delivered draft (no charge for an
  // LLM error). The debit itself enforces the per-user budget + final price.
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data: pr } = await svc
    .from("credit_pricing")
    .select("credits_per_unit")
    .eq("action_key", "marketing.ai_copy_draft")
    .maybeSingle();
  const cost = Number((pr as { credits_per_unit: number } | null)?.credits_per_unit ?? 3);
  const bal = await getBalanceWithService(tenantId);
  if (!bal || bal.available_credits < cost) {
    return { ok: false, error: "Saldo de créditos insuficiente para generar." };
  }

  const lang = (input.language || "es").slice(0, 5);
  const isEmail = input.channel === "email";
  const channelRules = isEmail
    ? "Write an email: a short, compelling subject line plus a body of 2–4 short paragraphs. End with a clear call to action."
    : "Write a single concise messaging text (WhatsApp/SMS): 2–4 short sentences, friendly, with one clear call to action. Set subject to null.";

  const sys =
    `You are BOLIV, an expert marketing copywriter for "${input.businessName || "this business"}". ` +
    `${channelRules} ` +
    `Tone: ${input.tone || "warm, professional, concise"}. ` +
    `Write in this language (BCP-47): ${lang}. ` +
    `Do NOT use markdown, emojis spam, or placeholder tokens like [NAME]. Plain text only. ` +
    `Return STRICT JSON: {"subject": string|null, "body": string}.`;

  const res = await chatCompletion({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: input.goal.slice(0, 2000) },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.7,
    maxTokens: 700,
  });
  if (!res.ok) return { ok: false, error: res.error };

  let parsed: { subject?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(res.message.content ?? "{}");
  } catch {
    return { ok: false, error: "El modelo devolvió una respuesta inválida." };
  }
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!body) return { ok: false, error: "El modelo no devolvió contenido." };
  const subject =
    isEmail && typeof parsed.subject === "string" && parsed.subject.trim()
      ? parsed.subject.trim().slice(0, 180)
      : null;

  // Charge only for the delivered draft. If the debit now fails (a concurrent
  // drain or a per-user budget cap), don't hand back the copy.
  const deb = await debitCredits({
    tenantId,
    actionKey: "marketing.ai_copy_draft",
    units: 1,
    actorUserId: actorUserId ?? null,
    metadata: { channel: input.channel },
  });
  if (!deb.ok) {
    return { ok: false, error: deb.reason || "Saldo de créditos insuficiente para generar." };
  }

  return { ok: true, subject, body: body.slice(0, 5000) };
}
