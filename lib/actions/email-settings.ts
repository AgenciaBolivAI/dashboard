"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type EmailSettingsState = { error: string | null; success?: boolean };

const smtpSchema = z.object({
  host: z.string().trim().min(1).max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  user: z.string().trim().min(1).max(200),
  pass: z.string().min(1).max(500),
  from_email: z.string().trim().email().max(200),
  from_name: z.string().trim().max(120).nullable().optional(),
});

/** Save a tenant's SMTP sender (admin-only). Password stored in access_token
 * (admin-RLS-gated, same as the Google tokens); the rest in metadata. */
export async function saveSmtpConfigAction(
  tenantId: string,
  fields: z.infer<typeof smtpSchema>,
): Promise<EmailSettingsState> {
  const parsed = smtpSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const d = parsed.data;
  const svc = createServiceClient();
  const { error } = await svc.from("tenant_integrations").upsert(
    {
      tenant_id: tenantId,
      provider: "smtp",
      access_token: d.pass,
      metadata: {
        host: d.host,
        port: d.port,
        secure: d.secure ?? d.port === 465,
        user: d.user,
        from_email: d.from_email,
        from_name: d.from_name ?? null,
      },
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "tenant_id,provider" },
  );
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/** Remove the tenant's SMTP sender (admin-only). */
export async function removeSmtpConfigAction(tenantId: string): Promise<EmailSettingsState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { error } = await svc
    .from("tenant_integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", "smtp");
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
