"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getGateway } from "@/lib/templates";

export type TenantState = { error: string | null; success?: boolean };

// ─── General settings ────────────────────────────────────────────────
const generalSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nombre requerido"),
  industry: z.string().optional(),
  language: z.string().min(2),
  timezone: z.string().min(1),
  whatsapp_number: z.string().optional(),
  support_email: z.string().email().optional().or(z.literal("")),
  support_whatsapp: z.string().optional(),
});

export async function updateTenantGeneralAction(
  _prev: TenantState,
  formData: FormData,
): Promise<TenantState> {
  const parsed = generalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      industry: parsed.data.industry || null,
      language: parsed.data.language,
      timezone: parsed.data.timezone,
      whatsapp_number: parsed.data.whatsapp_number || null,
      support_email: parsed.data.support_email || null,
      support_whatsapp: parsed.data.support_whatsapp || null,
    })
    .eq("id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Agent prompt + variables ────────────────────────────────────────
const agentSchema = z.object({
  tenant_id: z.string().uuid(),
  prompt_template: z.string(),
  prompt_variables: z.string(), // JSON-encoded
});

export async function updateTenantAgentAction(
  _prev: TenantState,
  formData: FormData,
): Promise<TenantState> {
  const parsed = agentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  let parsedVars: Record<string, unknown>;
  try {
    parsedVars = JSON.parse(parsed.data.prompt_variables);
    if (typeof parsedVars !== "object" || parsedVars === null || Array.isArray(parsedVars)) {
      return { error: "Las variables deben ser un objeto JSON" };
    }
  } catch {
    return { error: "JSON de variables inválido" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      prompt_template: parsed.data.prompt_template,
      prompt_variables: parsedVars,
    })
    .eq("id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Gateway config (Settings → Integraciones) ───────────────────────
const gatewayConfigSchema = z.object({
  tenant_id: z.string().uuid(),
  gateway: z.enum(["evolution", "meta_whatsapp", "twilio"]),
  config_json: z.string(),
});

export async function updateGatewayConfigAction(
  _prev: TenantState,
  formData: FormData,
): Promise<TenantState> {
  const parsed = gatewayConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(parsed.data.config_json);
  } catch {
    return { error: "Configuración de gateway inválida (JSON)" };
  }

  const gateway = getGateway(parsed.data.gateway);
  for (const f of gateway.configFields) {
    if (f.required && !config[f.key]) {
      return { error: `Falta ${f.label}` };
    }
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      gateway: parsed.data.gateway,
      gateway_config: config,
    })
    .eq("id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
