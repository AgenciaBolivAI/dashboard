/**
 * GET /api/v1/me — connection test for Zapier/Make. Returns the business this
 * API key belongs to. Auth: Authorization: Bearer <BolivAI API key>.
 */
import { apiAuth, isErr, v1svc, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { data } = await v1svc()
    .from("tenants")
    .select("id, name, slug, language, timezone")
    .eq("id", a.tenantId)
    .maybeSingle();
  if (!data) return bad("Tenant not found", 404);
  const t = data as { id: string; name: string; slug: string; language: string | null; timezone: string | null };
  return ok({ tenant_id: t.id, name: t.name, slug: t.slug, language: t.language, timezone: t.timezone });
}
