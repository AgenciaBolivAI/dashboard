"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type CcavaiState = { error: string | null; success?: boolean };

const STATUS_VALUES = ["pending", "approved", "rejected", "posted", "archived"] as const;
const statusSchema = z.enum(STATUS_VALUES);

export async function updateCcavaiDraftStatusAction(
  tenantId: string,
  draftId: string,
  status: string,
  notes?: string,
  postedUrl?: string,
): Promise<CcavaiState> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Estado inválido" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("ccavai_drafts")
    .update({
      status: parsed.data,
      decided_at: new Date().toISOString(),
      ...(notes !== undefined && { decided_notes: notes.trim() || null }),
      ...(postedUrl !== undefined && { posted_url: postedUrl.trim() || null }),
    })
    .eq("id", draftId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function triggerCcavaiGenerationAction(
  tenantId: string,
): Promise<CcavaiState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const url = process.env.CCAVAI_WEBHOOK_URL;
  const secret = process.env.CCAVAI_WEBHOOK_SECRET;
  if (!url || !secret) {
    return {
      error: "CCAVAI webhook no configurado (CCAVAI_WEBHOOK_URL / CCAVAI_WEBHOOK_SECRET).",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { error: `Webhook respondió ${res.status}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("aborted")) {
      // Workflow runs ~60s — a timeout here means the request reached n8n,
      // execution is already underway, and we just lost the ack. Treat as ok.
      return { error: null, success: true };
    }
    return { error: msg };
  }

  return { error: null, success: true };
}
