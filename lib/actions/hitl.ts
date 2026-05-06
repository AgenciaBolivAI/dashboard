"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { sendText } from "@/lib/evolution";

export type HitlState = { error: string | null; success?: boolean; clearForm?: boolean };

// ─── Helpers ─────────────────────────────────────────────────────────
async function loadConversationContext(conversationId: string) {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("conversations")
    .select(
      `id, tenant_id, user_id, hitl_taken_over,
       tenants:tenant_id ( id, slug, evolution_instance ),
       users:user_id ( id, whatsapp_number )`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) throw new Error("Conversación no encontrada");
  return data as unknown as {
    id: string;
    tenant_id: string;
    user_id: string;
    hitl_taken_over: boolean;
    tenants: { id: string; slug: string; evolution_instance: string | null };
    users: { id: string; whatsapp_number: string };
  };
}

// ─── Take over a conversation ────────────────────────────────────────
export async function takeoverAction(conversationId: string): Promise<HitlState> {
  try {
    const user = await requireUser();
    const ctx = await loadConversationContext(conversationId);
    await requireTenantAccess(ctx.tenant_id, { minRole: "operator" });

    // Use service-role client: auth has already been verified above, and
    // RLS on conversations does not grant UPDATE to operators by default.
    // With the anon client the update silently affected 0 rows and the
    // n8n workflow kept seeing hitl_taken_over = false.
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("conversations")
      .update({
        hitl_taken_over: true,
        hitl_operator_id: user.id,
        hitl_taken_over_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "No se pudo tomar el control (conversación no encontrada)" };
    }

    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations/${conversationId}`);
    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations`);
    return { error: null, success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// ─── Release a conversation back to the bot ──────────────────────────
export async function releaseAction(conversationId: string): Promise<HitlState> {
  try {
    await requireUser();
    const ctx = await loadConversationContext(conversationId);
    await requireTenantAccess(ctx.tenant_id, { minRole: "operator" });

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("conversations")
      .update({
        hitl_taken_over: false,
        hitl_operator_id: null,
        hitl_taken_over_at: null,
      })
      .eq("id", conversationId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "No se pudo liberar (conversación no encontrada)" };
    }

    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations/${conversationId}`);
    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations`);
    return { error: null, success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" };
  }
}

// ─── Operator sends a message ────────────────────────────────────────
const sendSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().trim().min(1, "Mensaje vacío").max(4000, "Demasiado largo"),
});

export async function sendOperatorMessageAction(
  _prev: HitlState,
  formData: FormData,
): Promise<HitlState> {
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await requireUser();
    const ctx = await loadConversationContext(parsed.data.conversation_id);
    await requireTenantAccess(ctx.tenant_id, { minRole: "operator" });

    if (!ctx.hitl_taken_over) {
      return {
        error: "Antes de enviar, toma el control de la conversación.",
      };
    }

    const instance = ctx.tenants.evolution_instance;
    if (!instance) {
      return {
        error: "Esta empresa aún no tiene una instancia de Evolution API configurada.",
      };
    }

    // Send via Evolution
    await sendText(instance, ctx.users.whatsapp_number, parsed.data.text);

    // Persist to chat_history (service role — auth already verified above)
    const svc = createServiceClient();
    const { error: insertErr } = await svc.from("chat_history").insert({
      tenant_id: ctx.tenant_id,
      conversation_id: ctx.id,
      user_id: ctx.user_id,
      role: "operator",
      content: parsed.data.text,
      is_pending: false,
    });

    if (insertErr) return { error: insertErr.message };

    // Bump conversation timestamp
    await svc
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", ctx.id);

    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations/${ctx.id}`);
    revalidatePath(`/dashboard/${ctx.tenants.slug}/conversations`);
    return { error: null, success: true, clearForm: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "No se pudo enviar el mensaje",
    };
  }
}
