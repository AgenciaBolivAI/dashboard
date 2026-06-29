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

/** Per-recipient opt-out context (compliance) attached to every send. */
export type UnsubscribeCtx = {
  pageUrl: string; // confirm landing page (visible footer link)
  oneClickUrl: string; // RFC 8058 one-click POST target (List-Unsubscribe header)
  label: string; // localized "Unsubscribe"
  notice: string; // localized "To stop receiving these messages"
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal, safe HTML wrapper for a plain-text marketing body. */
export function textToHtml(body: string): string {
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">` +
    `${esc.replace(/\n/g, "<br/>")}</div>`
  );
}

/** Compliance footer appended to marketing emails. */
function unsubscribeFooterHtml(u: UnsubscribeCtx): string {
  return (
    `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;` +
    `font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#8a8a8a;">` +
    `${escapeHtml(u.notice)}: <a href="${escapeHtml(u.pageUrl)}" style="color:#8a8a8a;">${escapeHtml(u.label)}</a>` +
    `</div>`
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
  ctx?: { evolutionInstance?: string | null; unsubscribe?: UnsubscribeCtx },
): Promise<ChannelSendResult> {
  const u = ctx?.unsubscribe;

  if (channel === "email") {
    const r = await sendTenantEmail(tenantId, {
      to: msg.to,
      subject: msg.subject?.trim() || "—",
      html: textToHtml(msg.body) + (u ? unsubscribeFooterHtml(u) : ""),
      // RFC 2369 + RFC 8058 one-click — lets Gmail/Outlook show a native
      // Unsubscribe button and POST the opt-out for us (deliverability + law).
      headers: u
        ? { "List-Unsubscribe": `<${u.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined,
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: r.error, noConfig: r.noSender };
  }

  // Messaging channels: append a concise opt-out line with the link.
  const body = u ? `${msg.body}\n\n${u.notice}: ${u.pageUrl}` : msg.body;

  if (channel === "whatsapp") {
    const instance =
      ctx?.evolutionInstance !== undefined
        ? ctx.evolutionInstance
        : await resolveEvolutionInstance(tenantId);
    if (!instance) {
      return { ok: false, noConfig: true, error: "WhatsApp no está conectado para este negocio." };
    }
    try {
      await sendText(instance, waNumber(msg.to), body);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar por WhatsApp." };
    }
  }

  // sms
  return sendSms(tenantId, msg.to, body);
}
