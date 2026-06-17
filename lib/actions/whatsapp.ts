"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import {
  createInstance,
  getInstanceQr,
  getInstanceStatus,
  deleteInstance,
  setInstanceWebhook,
} from "@/lib/evolution";

/**
 * Self-serve WhatsApp connection for tenants (owner/admin only).
 *
 * Mirrors the admin provisioner (lib/actions/evolution-provision.ts) but is
 * gated by tenant membership instead of bolivai_admin, so a customer can scan
 * the QR themselves during/after onboarding — no manual BolivAI involvement.
 *
 * Key difference vs the admin flow: status flips to `active` only once the
 * phone has ACTUALLY paired (connectionState === "open"), detected by the poll
 * action below — not at instance-creation time.
 */

const idSchema = z.string().uuid();

export type WhatsAppProvisionState = {
  error: string | null;
  qr_base64?: string;
  pairing_code?: string;
  instance_name?: string;
};

export async function provisionTenantWhatsAppAction(
  tenantId: string,
): Promise<WhatsAppProvisionState> {
  await requireUser();
  if (!idSchema.safeParse(tenantId).success) return { error: "tenant_id inválido" };
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: tenant, error: tErr } = await svc
    .from("tenants")
    .select("id, slug, status, gateway, gateway_config")
    .eq("id", tenantId)
    .single();

  if (tErr || !tenant) return { error: "Negocio no encontrado" };
  if (tenant.gateway !== "evolution") {
    return {
      error: `Tu canal es '${tenant.gateway}', no Evolution. Cámbialo en Ajustes → Integraciones.`,
    };
  }

  // Tenant slug is DNS-safe by construction (onboarding zod regex).
  const instanceName = tenant.slug as string;
  const hasInstance = Boolean(
    (tenant.gateway_config as Record<string, unknown> | null)?.instance,
  );
  const stubInstance =
    (tenant.gateway_config as Record<string, unknown> | null)?.instance ===
    `pending_${instanceName}`;

  try {
    let qrBase64: string | undefined;
    let pairingCode: string | undefined;

    if (!hasInstance || stubInstance || tenant.status === "pending_whatsapp_setup") {
      // First connection — drop any stale stub, then create fresh + QR.
      try {
        await deleteInstance(instanceName);
      } catch {
        // ignore — probably doesn't exist yet
      }
      const created = await createInstance(instanceName);
      qrBase64 = created.qrcode?.base64;
      pairingCode = created.qrcode?.pairingCode;
    } else {
      // Re-issue a QR for the existing instance (lost session / re-link).
      const qr = await getInstanceQr(instanceName);
      qrBase64 = qr.base64;
      pairingCode = qr.pairingCode;
    }

    // Always (re)point the webhook at the live agent workflow so the bot
    // actually replies — independent of how the instance was created.
    await setInstanceWebhook(instanceName);

    // Persist the instance name so the poll + message routing can find it.
    const newGatewayConfig = {
      ...((tenant.gateway_config as Record<string, unknown>) ?? {}),
      instance: instanceName,
    };
    await svc
      .from("tenants")
      .update({ gateway_config: newGatewayConfig })
      .eq("id", tenantId);

    return {
      error: null,
      qr_base64: qrBase64,
      pairing_code: pairingCode,
      instance_name: instanceName,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `No se pudo generar el QR: ${msg.slice(0, 200)}` };
  }
}

export type WhatsAppStatusState = { state: string; connected: boolean };

/**
 * Poll the live Evolution connection state. When the phone finishes pairing
 * (state === "open") the tenant flips from pending_whatsapp_setup → active.
 */
export async function checkTenantWhatsAppStatusAction(
  tenantId: string,
): Promise<WhatsAppStatusState> {
  await requireUser();
  if (!idSchema.safeParse(tenantId).success) {
    return { state: "unknown", connected: false };
  }
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: tenant } = await svc
    .from("tenants")
    .select("id, status, gateway_config")
    .eq("id", tenantId)
    .single();

  const instance = (tenant?.gateway_config as Record<string, unknown> | null)
    ?.instance as string | undefined;
  if (!instance) return { state: "no_instance", connected: false };

  try {
    const res = (await getInstanceStatus(instance)) as {
      instance?: { state?: string };
    };
    const state = res.instance?.state ?? "unknown";
    const connected = state === "open";

    if (connected && tenant?.status === "pending_whatsapp_setup") {
      await svc.from("tenants").update({ status: "active" }).eq("id", tenantId);
      revalidatePath("/dashboard", "layout");
    }

    return { state, connected };
  } catch {
    return { state: "error", connected: false };
  }
}
