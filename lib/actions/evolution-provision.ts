"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import {
  createInstance,
  getInstanceQr,
  deleteInstance,
  setInstanceWebhook,
} from "@/lib/evolution";

export type ProvisionState = {
  error: string | null;
  qr_base64?: string;
  pairing_code?: string;
  instance_name?: string;
};

const provisionSchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Provisions a fresh Evolution instance for the tenant + returns the QR code
 * for the operator/customer to scan. Flips tenant.status from
 * `pending_whatsapp_setup` to `active` and persists the real instance name.
 *
 * Admin-only. Safe to re-run: if an instance already exists with the same
 * name, we delete + recreate (re-issues a fresh QR). If status is already
 * `active`, we just re-fetch the QR without recreating.
 */
export async function provisionEvolutionInstanceAction(
  tenantId: string,
): Promise<ProvisionState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = provisionSchema.safeParse({ tenant_id: tenantId });
  if (!parsed.success) return { error: "tenant_id inválido" };

  const svc = createServiceClient();
  const { data: tenant, error: tErr } = await svc
    .from("tenants")
    .select("id, slug, status, gateway, gateway_config, name")
    .eq("id", tenantId)
    .single();

  if (tErr || !tenant) return { error: "Tenant no encontrado" };
  if (tenant.gateway !== "evolution") {
    return { error: `Este tenant usa gateway '${tenant.gateway}', no Evolution.` };
  }

  // Operate on the tenant's REAL instance. Use the already-provisioned name from
  // gateway_config — it may have been set up manually (e.g. the phone number),
  // not as the slug. Only fall back to the slug for a brand-new instance (the
  // `pending_<slug>` placeholder onboarding writes, or nothing on file).
  const existingInstance = (tenant.gateway_config as Record<string, unknown> | null)
    ?.instance as string | undefined;
  const isPlaceholder = !existingInstance || existingInstance.startsWith("pending_");
  const instanceName = isPlaceholder ? (tenant.slug as string) : existingInstance;

  try {
    let qrBase64: string | undefined;
    let pairingCode: string | undefined;

    if (tenant.status === "pending_whatsapp_setup") {
      // First provisioning — delete any stale stub then create fresh
      try {
        await deleteInstance(instanceName);
      } catch {
        // Ignore — instance probably doesn't exist yet
      }
      const created = await createInstance(instanceName);
      qrBase64 = created.qrcode?.base64;
      pairingCode = created.qrcode?.pairingCode;
    } else {
      // Re-issue QR for an existing instance (e.g. operator lost the previous
      // one). If the instance no longer exists on the Evolution server
      // (deleted/reset), create it instead of returning a 404.
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

    // Point the webhook at the live agent workflow (/webhook/evolution-webhook)
    // so messages route to the bot. Previously hit /webhook/whatsapp-in (dead).
    await setInstanceWebhook(instanceName);

    // Persist the real instance name + flip status if it was pending.
    // Spread-into-literal so the Supabase strict-update payload type matches.
    const newGatewayConfig = {
      ...(tenant.gateway_config as Record<string, unknown> ?? {}),
      instance: instanceName,
    };
    const flipStatus = tenant.status === "pending_whatsapp_setup";
    await svc
      .from("tenants")
      .update({
        gateway_config: newGatewayConfig,
        ...(flipStatus && { status: "active" }),
      })
      .eq("id", tenantId);

    revalidatePath(`/admin/tenants/${tenantId}`);
    return {
      error: null,
      qr_base64: qrBase64,
      pairing_code: pairingCode,
      instance_name: instanceName,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Evolution falló: ${msg.slice(0, 300)}` };
  }
}
