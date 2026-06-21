import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Tenant } from "@/lib/tenant";

/**
 * Business-context memory (Phase 0b). Assembles a compact, per-tenant context
 * block injected into the assistant's system prompt on every call, so the AI
 * "knows the business" without being told each time:
 *   - profile (name, industry, language, timezone),
 *   - a cheap live activity snapshot (a few counts),
 *   - durable LEARNED FACTS the AI/owner wrote back (tenant_facts).
 *
 * Retrieval-augmented by design: small + bounded so it scales (we cap facts and
 * only pull counts, never rows). The deeper company knowledge stays in the
 * Company Brain / knowledge base, reachable through tools.
 */

// assistant tables may not be in the generated types yet — loose client view.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };

/** Durable facts a tenant has accumulated, newest first (bounded). */
export async function getTenantFacts(tenantId: string, limit = 25): Promise<string[]> {
  const svc = createServiceClient() as unknown as AnyClient;
  const { data, error } = await svc
    .from("tenant_facts")
    .select("fact, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as { fact: string }[])
    .map((r) => (typeof r.fact === "string" ? r.fact.trim() : ""))
    .filter(Boolean);
}

async function safeCount(table: string, tenantId: string, extra?: (q: unknown) => unknown): Promise<number> {
  try {
    const svc = createServiceClient() as unknown as AnyClient;
    let q = svc.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    if (extra) q = extra(q);
    const { count } = await q;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

/**
 * Build the injected context block. Returns a plain string (empty if nothing
 * useful) — the caller drops it into the system prompt under a header.
 */
export async function buildBusinessContext(tenant: Tenant): Promise<string> {
  const tenantId = tenant.id;

  const [services, staff, openLeads, customers, facts] = await Promise.all([
    safeCount("services", tenantId),
    safeCount("staff", tenantId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    safeCount("leads", tenantId, (q: any) => q.not("status", "in", "(converted,lost)")),
    safeCount("users", tenantId),
    getTenantFacts(tenantId),
  ]);

  const profile = [
    `Negocio: ${tenant.name}`,
    tenant.industry ? `Industria: ${tenant.industry}` : null,
    `Idioma del negocio: ${tenant.language}`,
    `Zona horaria: ${tenant.timezone}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const snapshot = `Snapshot: ${services} servicios · ${staff} miembros del equipo · ${openLeads} leads abiertos · ${customers} clientes.`;

  const lines = [profile, snapshot];
  if (facts.length) {
    lines.push("", "Hechos aprendidos sobre este negocio (tenlos en cuenta):");
    for (const f of facts) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
