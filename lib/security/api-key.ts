import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Per-tenant API keys for the public REST API (Zapier / Make / partners).
 * Format: `blv_<43-char base64url>`. We store ONLY sha256(plaintext); the
 * plaintext is returned once at creation and never again. Verification hashes
 * the incoming key and looks it up by the unique key_hash index — no timing
 * oracle (the lookup is on the hash, not a byte compare).
 */

const PREFIX = "blv";

// tenant_api_keys isn't in the generated DB types — loosely-typed client.
function svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export type GeneratedKey = {
  plaintext: string;
  hash: string;
  prefix: string;
  lastFour: string;
};

/** Mint a fresh key. Returns the plaintext (show ONCE) + the parts to persist. */
export function generateApiKey(): GeneratedKey {
  const plaintext = `${PREFIX}_${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    hash: sha256(plaintext),
    prefix: plaintext.slice(0, 8),
    lastFour: plaintext.slice(-4),
  };
}

export type ApiAuth = { tenantId: string; keyId: string; scopes: string[] };

/**
 * Resolve the tenant from an inbound request's API key. Accepts
 * `Authorization: Bearer blv_…` or `X-Api-Key: blv_…`. Returns null on any
 * miss (caller responds 401). Best-effort bumps last_used_at.
 */
export async function verifyApiKey(req: Request): Promise<ApiAuth | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const xHeader = req.headers.get("x-api-key") ?? "";
  let key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!key && xHeader) key = xHeader.trim();
  if (!key.startsWith(`${PREFIX}_`) || key.length < 12) return null;

  const s = svc();
  const { data } = await s
    .from("tenant_api_keys")
    .select("id, tenant_id, scopes")
    .eq("key_hash", sha256(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; tenant_id: string; scopes: string[] | null };

  // Touch last_used_at (await — fire-and-forget would be killed on Vercel).
  await s.from("tenant_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  return { tenantId: row.tenant_id, keyId: row.id, scopes: row.scopes ?? ["read", "write"] };
}

/** Does this auth allow writes? */
export function canWrite(auth: ApiAuth): boolean {
  return auth.scopes.includes("write");
}
