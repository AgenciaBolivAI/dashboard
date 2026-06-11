import crypto from "node:crypto";

/**
 * Per-tenant voice-tool bearer derivation.
 *
 * Instead of one shared VOICE_TOOL_SECRET that grants access to ANY tenant
 * (the original design), each tenant's ElevenLabs agent gets a bearer
 * derived from HMAC-SHA256(tenant_id, VOICE_TOOL_SECRET). The root secret
 * never leaves the server. ElevenLabs stores the per-tenant derived bearer.
 *
 * Compromise model:
 * - Root secret stolen (Vercel env breach)  → attacker can mint bearers for any tenant. Catastrophic. Mitigated by keeping root secret out of every other surface.
 * - Per-tenant bearer stolen (ElevenLabs breach, agent config leak) → attacker can impersonate ONLY that one tenant.
 * - Logs/CI snapshots → only per-tenant bearers ever appear in tool URLs; root secret stays in process.env on Vercel.
 *
 * Format: 64 hex chars (256 bits). Header-safe, URL-safe, log-friendly.
 */
export function computeTenantBearer(tenantId: string, rootSecret: string): string {
  if (!rootSecret) throw new Error("VOICE_TOOL_SECRET is not configured");
  return crypto
    .createHmac("sha256", rootSecret)
    .update(tenantId.toLowerCase())
    .digest("hex");
}

/**
 * Constant-time string compare wrapper. Use this for any secret comparison
 * to avoid timing-based exfiltration. Returns false on length mismatch
 * without calling timingSafeEqual (which would throw).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
