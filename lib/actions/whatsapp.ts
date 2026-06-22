"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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
  const et = await getTranslations("action_errors");
  await requireUser();
  if (!idSchema.safeParse(tenantId).success) return { error: et("whatsapp_tenant_invalid") };
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: tenant, error: tErr } = await svc
    .from("tenants")
    .select("id, slug, status, gateway, gateway_config")
    .eq("id", tenantId)
    .single();

  if (tErr || !tenant) return { error: et("business_not_found") };
  if (tenant.gateway !== "evolution") {
    return {
      error: et("whatsapp_not_evolution", { gateway: tenant.gateway as string }),
    };
  }

  // Operate on the tenant's REAL instance. Prefer the already-provisioned name
  // from gateway_config — it may have been set up manually (e.g. as the phone
  // number), NOT as the slug. Only fall back to the slug for a brand-new
  // connection (the `pending_<slug>` placeholder onboarding writes, or nothing).
  const existingInstance = (tenant.gateway_config as Record<string, unknown> | null)
    ?.instance as string | undefined;
  const isPlaceholder = !existingInstance || existingInstance.startsWith("pending_");
  const instanceName = isPlaceholder ? (tenant.slug as string) : existingInstance;
  const freshConnect = isPlaceholder || tenant.status === "pending_whatsapp_setup";

  try {
    let qrBase64: string | undefined;
    let pairingCode: string | undefined;

    if (freshConnect) {
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
      // Re-issue a QR for the existing instance (lost session / re-link). If it
      // no longer exists on the Evolution server, create it instead of 404ing.
      try {
        const qr = await getInstanceQr(instanceName);
        qrBase64 = qr.base64;
        pairingCode = qr.pairingCode;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/not found|does not exist|404/i.test(msg)) {
          try {
            await deleteInstance(instanceName);
          } catch {
            // ignore — nothing to delete
          }
          const created = await createInstance(instanceName);
          qrBase64 = created.qrcode?.base64;
          pairingCode = created.qrcode?.pairingCode;
        } else {
          throw e;
        }
      }
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
    return { error: `${et("whatsapp_qr_failed")}: ${msg.slice(0, 200)}` };
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
