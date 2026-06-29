import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTenantEmail } from "@/lib/email/send";
import { sendText } from "@/lib/evolution";
import { sendSms } from "@/lib/marketing/sms";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The single marketing send dispatcher. One `sendOnChannel` routes to the
 * tenant's owned transport for the chosen channel:
 *   email    → lib/email/send.ts        (per-tenant Gmail/SMTP, injection-safe)
 *   whatsapp → lib/evolution.ts         (the tenant's Evolution instance)
 *   sms      → lib/marketing/sms.ts     (Twilio OR a PBX/HTTP gateway, per tenant)
 *
 * Every result is structured (never throws). `noConfig` flags a channel that
 * isn't set up for this tenant (no email sender / no Evolution instance / no
 * Twilio number) — the engine treats that as campaign-level (pause + notify)
 * rather than a per-recipient failure.
 */
export type MarketingChannel = "email" | "whatsapp" | "sms";
export type ChannelSendResult = { ok: true } | { ok: false; error: string; noConfig?: boolean };

/** Minimal, safe HTML wrapper for a plain-text marketing body. */
export function textToHtml(body: string): string {
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">` +
    `${esc.replace(/\n/g, "<br/>")}</div>`
  );
}

/** Digits-only WhatsApp number (Evolution wants country code + number, no `+`). */
function waNumber(addr: string): string {
  return addr.replace(/[^\d]/g, "");
}

/** Resolve the tenant's Evolution instance from gateway_config (service client). */
export async function resolveEvolutionInstance(tenantId: string): Promise<string | null> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc.from("tenants").select("gateway_config").eq("id", tenantId).maybeSingle();
  const instance = (data as { gateway_config?: { instance?: string } } | null)?.gateway_config?.instance;
  if (!instance || instance.startsWith("pending_")) return null;
  return instance;
}

export async function sendOnChannel(
  tenantId: string,
  channel: MarketingChannel,
  msg: { to: string; subject?: string | null; body: string },
  ctx?: { evolutionInstance?: string | null },
): Promise<ChannelSendResult> {
  if (channel === "email") {
    const r = await sendTenantEmail(tenantId, {
      to: msg.to,
      subject: msg.subject?.trim() || "—",
      html: textToHtml(msg.body),
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: r.error, noConfig: r.noSender };
  }

  if (channel === "whatsapp") {
    const instance =
      ctx?.evolutionInstance !== undefined
        ? ctx.evolutionInstance
        : await resolveEvolutionInstance(tenantId);
    if (!instance) {
      return { ok: false, noConfig: true, error: "WhatsApp no está conectado para este negocio." };
    }
    try {
      await sendText(instance, waNumber(msg.to), msg.body);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar por WhatsApp." };
    }
  }

  // sms
  return sendSms(tenantId, msg.to, msg.body);
}
