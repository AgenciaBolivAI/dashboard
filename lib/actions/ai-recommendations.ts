"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type RecResult = { ok: boolean; error?: string };

/** Mark an AI recommendation as done or dismissed (clears it from the home). */
export async function setRecommendationStatusAction(
  tenantId: string,
  recId: string,
  status: "done" | "dismissed",
): Promise<RecResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  if (status !== "done" && status !== "dismissed") return { ok: false, error: "Estado inválido" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("ai_recommendations")
    .update({ status } as never)
    .eq("id", recId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
