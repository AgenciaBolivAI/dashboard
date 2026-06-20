"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { sendText } from "@/lib/evolution";
import { sendMessage as sendMetaMessage } from "@/lib/meta";

export type HitlState = { error: string | null; success?: boolean; clearForm?: boolean };

// ─── Helpers ─────────────────────────────────────────────────────────
async function loadConversationContext(conversationId: string) {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("conversations")
    .select(
      `id, tenant_id, user_id, channel, hitl_taken_over,
       tenants:tenant_id ( id, slug, gateway, gateway_config ),
       users:user_id ( id, whatsapp_number, channel_user_id )`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(`Error cargando conversación: ${error.message}`);
  if (!data) throw new Error("Conversación no encontrada");

  const row = data as unknown as {
    id: string;
    tenant_id: string;
    user_id: string;
    channel: string;
    hitl_taken_over: boolean;
    tenants: {
      id: string;
      slug: string;
      gateway: string | null;
      gateway_config: Record<string, unknown> | null;
    };
    users: { id: string; whatsapp_number: string | null; channel_user_id: string | null };
  };

  // Pull the Evolution instance out of gateway_config (the new home for it).
  const evolutionInstance =
    row.tenants?.gateway === "evolution"
      ? (row.tenants?.gateway_config?.instance as string | undefined) ?? null
      : null;

  return {
    ...row,
    tenants: { ...row.tenants, evolution_instance: evolutionInstance },
  };
}

// ─── Take over a conversation ────────────────────────────────────────
export async function takeoverAction(conversationId: string): Promise<HitlState> {
  try {
    const user = await requireUser();
    const ctx = await loadConversationContext(conversationId);
    await requireTenantAccess(ctx.tenant_id, { minRole: "operator" });

    // Service-role client bypasses RLS — auth was already verified above.
    // Operators don't have an UPDATE policy on conversations, which is why
    // the previous anon-client write silently affected 0 rows.
    const svc = createServiceClient();
    const { error } = await svc
      .from("conversations")
      .update({
        hitl_taken_over: true,
        hitl_operator_id: user.id,
        hitl_taken_over_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (error) return { error: error.message };

    // Verify the column actually changed (defensive: surfaces silent failures).
    const { data: check } = await svc
      .from("conversations")
      .select("hitl_taken_over")
      .eq("id", conversationId)
      .maybeSingle();
    if (!check?.hitl_taken_over) {
      return { error: "El control no quedó registrado. Intenta de nuevo." };
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
    const { error } = await svc
      .from("conversations")
      .update({
        hitl_taken_over: false,
        hitl_operator_id: null,
        hitl_taken_over_at: null,
      })
      .eq("id", conversationId);

    if (error) return { error: error.message };

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

    // Send on the SAME channel the customer wrote in. WhatsApp → Evolution;
    // Instagram / Messenger → Meta Graph Send API (reply to the user's PSID
    // with the page token). Without this branch, taking over a Meta chat would
    // leave the operator unable to reply.
    const svcSend = createServiceClient();
    if (ctx.channel === "instagram" || ctx.channel === "facebook_messenger") {
      const { data: tc } = await svcSend
        .from("tenant_channels")
        .select("external_id, config")
        .eq("tenant_id", ctx.tenant_id)
        .eq("channel", ctx.channel)
        .maybeSingle();
      const chan = tc as { external_id: string; config: Record<string, unknown> } | null;
      const pageToken = chan?.config?.page_access_token as string | undefined;
      if (!chan?.external_id || !pageToken) {
        return { error: "El canal de Meta no está conectado. Reconéctalo en Ajustes → Integraciones." };
      }
      if (!ctx.users.channel_user_id) {
        return { error: "No se encontró el destinatario de este canal." };
      }
      await sendMetaMessage({
        externalId: chan.external_id,
        pageToken,
        recipientId: ctx.users.channel_user_id,
        text: parsed.data.text,
      });
    } else {
      // WhatsApp (default)
      const instance = ctx.tenants.evolution_instance;
      if (!instance) {
        return {
          error: "Esta empresa aún no tiene una instancia de Evolution API configurada.",
        };
      }
      if (!ctx.users.whatsapp_number) {
        return { error: "Este contacto no tiene un número de WhatsApp." };
      }
      await sendText(instance, ctx.users.whatsapp_number, parsed.data.text);
    }

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
