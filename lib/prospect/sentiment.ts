import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { chatCompletion } from "@/lib/llm";
import { debitCredits, getBalanceWithService } from "@/lib/billing/credits";

/**
 * Conversation sentiment + buying signals. Loads the chat transcript, asks
 * gpt-4o-mini for a structured read (sentiment / score / summary / signals) in
 * the tenant's language, debits `analysis.sentiment`, and upserts
 * conversation_analysis. A negative or at-risk read also raises an
 * `ai_recommendations` (kind 'risk') so it surfaces in the bell/briefing.
 * Never throws; balance-gated.
 */
export type SentimentResult = { ok: true } | { ok: false; error: string };

type Signals = { buying_intent?: string; objections?: string[]; at_risk?: boolean; next_best_action?: string };
type Analysis = { sentiment?: "positive" | "neutral" | "negative"; score?: number; summary?: string; signals?: Signals };

const ACTION = "analysis.sentiment";

async function priceOf(svc: SupabaseClient, fallback: number): Promise<number> {
  const { data } = await svc.from("credit_pricing").select("credits_per_unit").eq("action_key", ACTION).maybeSingle();
  return Number((data as { credits_per_unit: number } | null)?.credits_per_unit ?? fallback);
}

export async function analyzeConversation(
  tenantId: string,
  conversationId: string,
  localeOverride?: string | null,
): Promise<SentimentResult> {
  const svc = createServiceClient() as unknown as SupabaseClient;

  const { data: t } = await svc.from("tenants").select("name, language").eq("id", tenantId).maybeSingle();
  const tenant = t as { name: string | null; language: string | null } | null;
  // Prefer the caller's current UI locale; fall back to the tenant's language
  // for the background/auto path (no request context).
  const lang = (localeOverride || tenant?.language || "es").slice(0, 5);

  const { data: msgs } = await svc
    .from("chat_history")
    .select("role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(60);
  const rows = (msgs ?? []) as Array<{ role: string; content: string | null }>;
  const transcript = rows
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => `${m.role === "user" ? "Customer" : m.role === "operator" ? "Human agent" : "Business"}: ${m.content!.slice(0, 1000)}`)
    .join("\n");
  if (!transcript) return { ok: false, error: "empty_conversation" };

  await svc.from("conversation_analysis").upsert(
    { tenant_id: tenantId, conversation_id: conversationId, status: "running", error: null },
    { onConflict: "conversation_id" },
  );

  const cost = await priceOf(svc, 3);
  const bal = await getBalanceWithService(tenantId);
  if (!bal || bal.available_credits < cost) {
    await svc.from("conversation_analysis").update({ status: "failed", error: "insufficient_credits" }).eq("conversation_id", conversationId);
    return { ok: false, error: "insufficient_credits" };
  }

  const sys =
    `You analyze a customer conversation for "${tenant?.name || "a business"}". Return STRICT JSON: ` +
    `{"sentiment": "positive"|"neutral"|"negative", "score": integer -100..100 (customer's overall feeling), ` +
    `"summary": string (1–2 sentences), "signals": {"buying_intent": "high"|"medium"|"low"|"none", ` +
    `"objections": [string], "at_risk": boolean (true if the customer is unhappy/likely to churn or drop off), ` +
    `"next_best_action": string}}. Write summary/objections/next_best_action in this language (BCP-47): ${lang}.`;
  const res = await chatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    responseFormat: { type: "json_object" },
    maxTokens: 500,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: transcript.slice(0, 12000) },
    ],
  });
  if (!res.ok) {
    await svc.from("conversation_analysis").update({ status: "failed", error: res.error.slice(0, 400) }).eq("conversation_id", conversationId);
    return { ok: false, error: res.error };
  }
  let a: Analysis = {};
  try {
    a = JSON.parse(res.message.content ?? "{}") as Analysis;
  } catch {
    await svc.from("conversation_analysis").update({ status: "failed", error: "bad_model_json" }).eq("conversation_id", conversationId);
    return { ok: false, error: "bad_model_json" };
  }
  const sentiment = a.sentiment === "positive" || a.sentiment === "negative" ? a.sentiment : "neutral";
  const score = typeof a.score === "number" ? Math.max(-100, Math.min(100, Math.round(a.score))) : null;
  const atRisk = Boolean(a.signals?.at_risk);

  await debitCredits({ tenantId, actionKey: ACTION, units: 1, referenceId: conversationId, metadata: { kind: "sentiment" } });

  await svc
    .from("conversation_analysis")
    .update({
      status: "done",
      sentiment,
      score,
      summary: (a.summary ?? "").slice(0, 2000),
      signals: (a.signals ?? {}) as unknown as Record<string, never>,
      model: "gpt-4o-mini",
      generated_at: new Date().toISOString(),
      error: null,
    } as never)
    .eq("conversation_id", conversationId);

  // Surface negative / at-risk conversations as a BOLIV insight.
  if (sentiment === "negative" || atRisk) {
    await svc.from("ai_recommendations").insert({
      tenant_id: tenantId,
      kind: "risk",
      title: atRisk ? "Conversación en riesgo" : "Sentimiento negativo detectado",
      body: (a.summary ?? "").slice(0, 600) || (a.signals?.next_best_action ?? null),
      action_payload: {},
      related_type: "conversation",
      related_id: conversationId,
      source: "boliv",
      status: "new",
    } as never).then(undefined, () => {});
  }

  return { ok: true };
}
