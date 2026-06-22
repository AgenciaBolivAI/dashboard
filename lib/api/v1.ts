import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyApiKey, canWrite, type ApiAuth } from "@/lib/security/api-key";

/**
 * Shared helpers for the public REST API (/api/v1) consumed by the Zapier +
 * Make integrations. Every handler authenticates with a per-tenant API key and
 * is hard-scoped to that tenant (the key resolves the tenant id server-side —
 * a caller can never read or write another tenant's data).
 */

export function v1svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** Authenticate; returns the resolved auth, or a ready-to-return error Response. */
export async function apiAuth(req: Request, opts?: { write?: boolean }): Promise<ApiAuth | NextResponse> {
  const auth = await verifyApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized — send Authorization: Bearer <BolivAI API key> (or X-Api-Key)." },
      { status: 401 },
    );
  }
  if (opts?.write && !canWrite(auth)) {
    return NextResponse.json({ error: "This API key is read-only." }, { status: 403 });
  }
  return auth;
}

/** `?since=<ISO>` (only newer rows) + `?limit=` (1–100, default 50). */
export function listParams(req: Request): { since: string | null; limit: number } {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  return { since, limit };
}

/** Narrow apiAuth()'s result: true when it returned an error Response. */
export function isErr(x: ApiAuth | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
export function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Parse a JSON body, tolerating empty/invalid (returns {}). */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** First non-empty string among the given body keys (e.g. phone / whatsapp_number). */
export function str(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}
