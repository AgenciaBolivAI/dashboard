"use server";

import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import { runAssistant, type ChatMsg, type PendingAction } from "@/lib/analytics-tools/run";
import { dispatchTool, WRITE_TOOL_NAMES } from "@/lib/analytics-tools/index";
import { getBalanceWithService, debitCredits } from "@/lib/billing/credits";

export type AskAssistantResult =
  | { ok: true; answer: string; toolsUsed: string[]; pendingAction?: PendingAction | null }
  | { ok: false; error: string };

/**
 * Tenant-facing "Ask your business" assistant. Resolves the tenant from the
 * slug + session (the LLM never chooses the tenant), then runs the read-only +
 * preview tool loop. Write actions only ever PREVIEW here — the model cannot
 * execute them; that requires an explicit user click via executeAssistantAction.
 */
export async function askAssistantAction(
  tenantSlug: string,
  history: ChatMsg[],
): Promise<AskAssistantResult> {
  const user = await requireUser();
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  const trimmed = (history ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    return { ok: false, error: "No hay pregunta que responder." };
  }

  // Metering: 1 credit / answered question. Pause at zero like every agent —
  // refuse upfront if the tenant can't afford it (no free answer at 0 balance).
  const bal = await getBalanceWithService(tenant.id);
  if (!bal || bal.available_credits < 1) {
    return {
      ok: false,
      error: "Necesitas al menos 1 crédito para usar el asistente. Recárgalo en Facturación.",
    };
  }

  const res = await runAssistant({
    tenantId: tenant.id,
    tenantName: tenant.name,
    timezone: tenant.timezone ?? "UTC",
    history: trimmed,
  });

  // Only charge for a successful answer (not for OpenAI errors). Best-effort —
  // the pre-check above already gated affordability.
  if (res.error) return { ok: false, error: res.error };
  // Attribute the spend to the asking employee + enforce their budget (if any).
  await debitCredits({
    tenantId: tenant.id,
    actionKey: "assistant.query",
    units: 1,
    actorUserId: user.id,
  }).catch(() => {});
  return { ok: true, answer: res.answer, toolsUsed: res.toolsUsed, pendingAction: res.pendingAction ?? null };
}

export type ExecuteActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Execute a write action the assistant proposed — the ONLY path where a write
 * tool runs with confirm:true. Triggered by the user clicking "Confirm" in the
 * UI card, never by the model. Re-validates tenant + role inside the tool.
 */
export async function executeAssistantActionAction(
  tenantSlug: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ExecuteActionResult> {
  await requireUser();
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  if (!WRITE_TOOL_NAMES.has(name)) {
    return { ok: false, error: "Acción no permitida." };
  }

  const result = (await dispatchTool(name, { ...(args ?? {}), confirm: true }, tenant.id)) as
    | { error?: string; ok?: boolean; message?: string }
    | null;

  if (result && typeof result === "object" && result.error) {
    return { ok: false, error: String(result.error) };
  }
  return { ok: true, message: (result && result.message) || "Hecho." };
}
