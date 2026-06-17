"use server";

import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import { runAssistant, type ChatMsg } from "@/lib/analytics-tools/run";

export type AskAssistantResult =
  | { ok: true; answer: string; toolsUsed: string[] }
  | { ok: false; error: string };

/**
 * Tenant-facing "Ask your business" analytics assistant. Resolves the tenant
 * from the slug + session (so the LLM never chooses the tenant), then runs the
 * read-only analytics tool-calling loop. The client holds the running thread
 * and sends it each turn (no DB persistence for now).
 */
export async function askAssistantAction(
  tenantSlug: string,
  history: ChatMsg[],
): Promise<AskAssistantResult> {
  await requireUser();
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  // Defensive bounds: trim to the last 16 turns, cap message length.
  const trimmed = (history ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    return { ok: false, error: "No hay pregunta que responder." };
  }

  const res = await runAssistant({
    tenantId: tenant.id,
    tenantName: tenant.name,
    timezone: tenant.timezone ?? "UTC",
    history: trimmed,
  });

  if (res.error) return { ok: false, error: res.error };
  return { ok: true, answer: res.answer, toolsUsed: res.toolsUsed };
}
