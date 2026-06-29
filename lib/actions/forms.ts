"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type FormActionResult = { ok: boolean; error?: string; id?: string; slug?: string };

const FIELD_KEYS = ["name", "email", "phone", "message"] as const;

const fieldSchema = z.object({
  key: z.enum(FIELD_KEYS),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "email", "tel", "textarea"]),
  required: z.boolean(),
  enabled: z.boolean(),
});

const formSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  fields: z.array(fieldSchema).min(1).max(4),
  success_message: z.string().trim().max(400).nullable().optional(),
  // http(s) only — the public form does `window.location = redirect`, so a
  // `javascript:`/`data:` URL (which z.url() would accept) is an XSS vector.
  redirect_url: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(500)
        .url()
        .refine((v) => /^https?:\/\//i.test(v), "redirect_url must be http(s)"),
    ])
    .nullable()
    .optional(),
});

function svcClient(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** url-safe, unguessable public id (~16 chars). */
function makeSlug(): string {
  return randomBytes(12).toString("base64url");
}

/** Validate the field set: at least one of email/phone must be enabled (we need
 * a way to contact the lead) and enabled fields must have unique keys. */
function fieldsError(fields: z.infer<typeof fieldSchema>[]): string | null {
  const enabled = fields.filter((f) => f.enabled);
  if (enabled.length === 0) return "fields";
  const keys = new Set(enabled.map((f) => f.key));
  if (keys.size !== enabled.length) return "fields";
  if (!keys.has("email") && !keys.has("phone")) return "contact";
  return null;
}

export async function createLeadFormAction(
  tenantId: string,
  input: z.infer<typeof formSchema>,
): Promise<FormActionResult> {
  const et = await getTranslations("action_errors");
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  const fErr = fieldsError(parsed.data.fields);
  if (fErr) return { ok: false, error: et(fErr === "contact" ? "form_needs_contact_field" : "invalid_data") };

  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const d = parsed.data;
  const svc = svcClient();
  const slug = makeSlug();
  const { data, error } = await svc
    .from("lead_forms")
    .insert({
      tenant_id: tenantId,
      slug,
      title: d.title,
      description: d.description ?? null,
      fields: d.fields,
      success_message: d.success_message ?? null,
      redirect_url: d.redirect_url || null,
      status: "active",
      created_by: user.id,
    })
    .select("id, slug")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  const row = data as { id: string; slug: string };
  return { ok: true, id: row.id, slug: row.slug };
}

export async function updateLeadFormAction(
  tenantId: string,
  formId: string,
  input: z.infer<typeof formSchema>,
): Promise<FormActionResult> {
  const et = await getTranslations("action_errors");
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  const fErr = fieldsError(parsed.data.fields);
  if (fErr) return { ok: false, error: et(fErr === "contact" ? "form_needs_contact_field" : "invalid_data") };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const d = parsed.data;
  const svc = svcClient();
  const { error } = await svc
    .from("lead_forms")
    .update({
      title: d.title,
      description: d.description ?? null,
      fields: d.fields,
      success_message: d.success_message ?? null,
      redirect_url: d.redirect_url || null,
    })
    .eq("id", formId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: formId };
}

export async function toggleLeadFormAction(
  tenantId: string,
  formId: string,
  status: "active" | "disabled",
): Promise<FormActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const svc = svcClient();
  const { error } = await svc
    .from("lead_forms")
    .update({ status })
    .eq("id", formId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: formId };
}

export async function deleteLeadFormAction(tenantId: string, formId: string): Promise<FormActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const svc = svcClient();
  const { error } = await svc.from("lead_forms").delete().eq("id", formId).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: formId };
}
