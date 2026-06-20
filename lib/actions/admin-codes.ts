"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { createLifetimeCode, deactivateLifetimeCode } from "@/lib/billing/lifetime-codes";

export type CodeState = { error: string | null; success?: boolean };

/** Create a shareable founders-fee discount code (Stripe coupon + promo code). */
export async function createLifetimeCodeAction(
  _prev: CodeState,
  formData: FormData,
): Promise<CodeState> {
  await requireUser();
  await requireBolivAIAdmin();

  const percentOff = Math.round(Number(formData.get("percent_off")));
  if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
    return { error: "El descuento debe estar entre 1 y 100." };
  }

  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const maxRaw = String(formData.get("max_redemptions") ?? "").trim();
  const expRaw = String(formData.get("expires_at") ?? "").trim(); // yyyy-mm-dd
  const maxRedemptions = maxRaw ? Math.max(1, Math.round(Number(maxRaw))) : undefined;
  const expiresAt = expRaw ? Math.floor(new Date(`${expRaw}T23:59:59Z`).getTime() / 1000) : undefined;

  try {
    await createLifetimeCode({
      percentOff,
      code: code || undefined,
      label: label || undefined,
      maxRedemptions,
      expiresAt,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "No se pudo crear el código." };
  }

  revalidatePath("/admin/codes");
  return { error: null, success: true };
}

/** Deactivate a code so it can no longer be redeemed. */
export async function deactivateLifetimeCodeAction(promotionCodeId: string): Promise<CodeState> {
  await requireUser();
  await requireBolivAIAdmin();
  if (!promotionCodeId) return { error: "id requerido" };
  try {
    await deactivateLifetimeCode(promotionCodeId);
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
  revalidatePath("/admin/codes");
  return { error: null, success: true };
}
