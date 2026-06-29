/**
 * Public lead-capture form submission (P2). NO auth — anyone with the form's
 * unguessable slug can POST. Hardened like the Meta webhook: service-role only
 * (never anon-RLS), zod-validated, honeypot + per-IP rate-limited. A valid
 * submission becomes a `leads` row (source='form:<slug>') and pings the tenant.
 *
 * POST /api/forms/<slug>/submit  { name?, email?, phone?, message?, _hp? }
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyTenant } from "@/lib/notifications";
import type { LeadFormField } from "@/lib/queries/marketing";

export const runtime = "nodejs";

const MAX_LEN = 2000;
const RATE_LIMIT_PER_MIN = 5;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "";
}

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export async function POST(req: Request, ctx: { params: Promise<{ formSlug: string }> }) {
  const { formSlug } = await ctx.params;
  const svc = createServiceClient() as unknown as SupabaseClient;

  // Resolve the form (active only).
  const { data: formRow } = await svc
    .from("lead_forms")
    .select("id, tenant_id, fields, status, success_message, redirect_url")
    .eq("slug", formSlug)
    .maybeSingle();
  const form = formRow as
    | {
        id: string;
        tenant_id: string;
        fields: LeadFormField[];
        status: string;
        success_message: string | null;
        redirect_url: string | null;
      }
    | null;
  if (!form || form.status !== "active") {
    return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  // Honeypot — a real user never fills the hidden field.
  if (clean(body._hp)) {
    return NextResponse.json({ ok: true }); // pretend success; drop silently
  }

  // Per-IP fixed-window rate limit (fail-open on limiter error).
  try {
    const keyId = `form:${form.id}:${clientIp(req)}`.slice(0, 200);
    const { data: rl } = await svc.rpc("api_rate_limit_hit", {
      p_key_id: keyId,
      p_limit: RATE_LIMIT_PER_MIN,
      p_window_seconds: 60,
    });
    const row = (Array.isArray(rl) ? rl[0] : rl) as { allowed?: boolean } | undefined;
    if (row && row.allowed === false) {
      return NextResponse.json({ ok: false, error: "Too many submissions. Try again shortly." }, { status: 429 });
    }
  } catch {
    /* fail-open */
  }

  const name = clean(body.name);
  const email = clean(body.email);
  const phone = clean(body.phone);
  const message = clean(body.message);

  // Validate required fields against the form config.
  const enabled = (form.fields ?? []).filter((f) => f.enabled);
  const values: Record<string, string> = { name, email, phone, message };
  for (const f of enabled) {
    if (f.required && !values[f.key]) {
      return NextResponse.json({ ok: false, error: `Missing required field: ${f.label}` }, { status: 400 });
    }
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }
  // Normalize + sanity-check the phone (must carry real digits if provided).
  const whatsapp = phone ? phone.replace(/[^\d+]/g, "") : "";
  const phoneValid = whatsapp.replace(/\D/g, "").length >= 6;
  if (phone && !phoneValid) {
    return NextResponse.json({ ok: false, error: "Invalid phone." }, { status: 400 });
  }
  // Need at least one real way to reach them.
  if (!email && !phoneValid) {
    return NextResponse.json({ ok: false, error: "Provide an email or phone." }, { status: 400 });
  }

  const { error: insErr } = await svc.from("leads").insert({
    tenant_id: form.tenant_id,
    name: name || null,
    email: email || null,
    whatsapp_number: phoneValid ? whatsapp : null,
    notes: message || null,
    intent: "other",
    status: "new",
    source: `form:${formSlug}`,
    metadata: { form_id: form.id, form_slug: formSlug },
  });
  if (insErr) {
    return NextResponse.json({ ok: false, error: "Could not save submission." }, { status: 500 });
  }

  // Bump the form's submission counter (best-effort).
  await svc.rpc("increment_form_submit_count", { p_form_id: form.id }).then(
    () => {},
    () => {},
  );

  await notifyTenant(form.tenant_id, {
    type: "lead",
    title: name ? `Nuevo lead: ${name}` : "Nuevo lead desde formulario",
    body: [email, phone].filter(Boolean).join(" · ") || null,
    href: "/dashboard",
  });

  return NextResponse.json({
    ok: true,
    success_message: form.success_message,
    redirect_url: form.redirect_url,
  });
}
