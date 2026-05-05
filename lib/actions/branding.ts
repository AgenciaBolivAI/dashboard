"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type BrandingState = {
  error: string | null;
  success?: boolean;
  logoUrl?: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

const colorsSchema = z.object({
  tenant_id: z.string().uuid(),
  primary_color: z.string().regex(HEX, "Color primario inválido (use #rrggbb)"),
  accent_color: z.string().regex(HEX, "Color de acento inválido (use #rrggbb)"),
  custom_domain: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim().toLowerCase() : null))
    .refine(
      (v) => v === null || /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v),
      "Dominio inválido (ej. panel.tucliente.com)",
    ),
});

export async function updateBrandingAction(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const parsed = colorsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      primary_color: parsed.data.primary_color,
      accent_color: parsed.data.accent_color,
      custom_domain: parsed.data.custom_domain,
    } as never)
    .eq("id", parsed.data.tenant_id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ese dominio ya está en uso por otro agente" };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadLogoAction(formData: FormData): Promise<BrandingState> {
  const tenantId = formData.get("tenant_id");
  const file = formData.get("logo");

  if (typeof tenantId !== "string" || !file || !(file instanceof File)) {
    return { error: "Archivo requerido" };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Formato no soportado (use PNG, JPG, WebP o SVG)" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Máximo 5 MB" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1] || "png";
  const path = `${tenantId}/logo.${ext}`;

  const svc = createServiceClient();
  const { error: uploadErr } = await svc.storage
    .from("branding")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadErr) return { error: uploadErr.message };

  const { data: pub } = svc.storage.from("branding").getPublicUrl(path);
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`; // bust CDN cache

  const supabase = await createClient();
  const { error: updateErr } = await supabase
    .from("tenants")
    .update({ logo_url: logoUrl })
    .eq("id", tenantId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, logoUrl };
}

export async function removeLogoAction(tenantId: string): Promise<BrandingState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  // best-effort delete (try common extensions)
  await svc.storage.from("branding").remove([
    `${tenantId}/logo.png`,
    `${tenantId}/logo.jpeg`,
    `${tenantId}/logo.jpg`,
    `${tenantId}/logo.webp`,
    `${tenantId}/logo.svg`,
  ]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ logo_url: null })
    .eq("id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
