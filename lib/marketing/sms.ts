import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Pluggable SMS sender for the marketing dispatcher. A tenant picks one provider
 * (tenant_sms_settings.provider):
 *   twilio        → the tenant's Twilio number (tenants.voice_phone_*), shared
 *                   with the voice integration.
 *   http_gateway  → any PBX / VoIP SMS gateway with an HTTP API. The tenant
 *                   defines URL + method + auth header + a body template using
 *                   {to} / {from} / {text} tokens, so it fits 3CX, GoIP, Yeastar,
 *                   Grandstream, Telnyx, etc. without a per-vendor adapter.
 *
 * All creds (Twilio auth token / gateway auth header) are secret columns read
 * with the service client. Returns a structured result (never throws); noConfig
 * means the chosen provider isn't set up → the tick pauses the campaign.
 */
export type SmsResult = { ok: true } | { ok: false; error: string; noConfig?: boolean };

/**
 * Defense-in-depth SSRF guard: a tenant-supplied gateway URL must be http(s) and
 * must not point at loopback / link-local / private / cloud-metadata hosts (a
 * malicious config could otherwise probe internal services, whose status/body we
 * surface in the message error). Tokens may still be present (validated on the
 * raw template); the host doesn't change after substitution.
 */
export function isSafeGatewayUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "metadata.google.internal") return false;
  if (h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || h.startsWith("fe80:")) return false; // IPv6 ULA / link-local
  return true;
}

/** Masked SMS settings for the dashboard — the auth header is NEVER returned. */
export type SmsSettingsMasked = {
  provider: "twilio" | "http_gateway";
  gateway_url: string;
  gateway_method: "GET" | "POST";
  gateway_content_type: "json" | "form";
  gateway_body_template: string;
  gateway_from: string;
  has_auth_header: boolean;
};

export async function getSmsSettingsMasked(tenantId: string): Promise<SmsSettingsMasked> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc
    .from("tenant_sms_settings")
    .select("provider, gateway_url, gateway_method, gateway_content_type, gateway_body_template, gateway_from, gateway_auth_header")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const s = data as SmsSettings | null;
  return {
    provider: s?.provider ?? "twilio",
    gateway_url: s?.gateway_url ?? "",
    gateway_method: s?.gateway_method ?? "POST",
    gateway_content_type: s?.gateway_content_type ?? "json",
    gateway_body_template: s?.gateway_body_template ?? "",
    gateway_from: s?.gateway_from ?? "",
    has_auth_header: Boolean(s?.gateway_auth_header),
  };
}

type SmsSettings = {
  provider: "twilio" | "http_gateway";
  gateway_url: string | null;
  gateway_method: "GET" | "POST";
  gateway_content_type: "json" | "form";
  gateway_body_template: string | null;
  gateway_from: string | null;
  gateway_auth_header: string | null;
};

type TwilioCfg = {
  voice_phone_provider: string | null;
  voice_phone_account_sid: string | null;
  voice_phone_auth_token: string | null;
  voice_phone_number: string | null;
};

export async function sendSms(tenantId: string, to: string, body: string): Promise<SmsResult> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc
    .from("tenant_sms_settings")
    .select("provider, gateway_url, gateway_method, gateway_content_type, gateway_body_template, gateway_from, gateway_auth_header")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const settings = data as SmsSettings | null;

  if (settings?.provider === "http_gateway") {
    return sendViaHttpGateway(settings, to, body);
  }
  // Default / explicit twilio.
  return sendViaTwilio(svc, tenantId, to, body);
}

// ─── Twilio ───────────────────────────────────────────────────────────────
async function sendViaTwilio(svc: SupabaseClient, tenantId: string, to: string, body: string): Promise<SmsResult> {
  const { data } = await svc
    .from("tenants")
    .select("voice_phone_provider, voice_phone_account_sid, voice_phone_auth_token, voice_phone_number")
    .eq("id", tenantId)
    .maybeSingle();
  const t = data as TwilioCfg | null;

  if (!t || t.voice_phone_provider !== "twilio" || !t.voice_phone_account_sid || !t.voice_phone_auth_token || !t.voice_phone_number) {
    return { ok: false, noConfig: true, error: "SMS no configurado: conecta Twilio o un gateway PBX en Difusiones → SMS." };
  }

  const sid = t.voice_phone_account_sid;
  const auth = Buffer.from(`${sid}:${t.voice_phone_auth_token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: t.voice_phone_number, Body: body.slice(0, 1600) });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: params,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${(await res.text()).slice(0, 180)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar SMS por Twilio." };
  }
}

// ─── Generic HTTP / PBX gateway ─────────────────────────────────────────────
/** Token-escape a value for the target encoding so {text} can't break the body. */
function enc(value: string, mode: "url" | "json"): string {
  if (mode === "url") return encodeURIComponent(value);
  // JSON string body: escape quotes/backslashes/control chars, drop the wrapping quotes.
  return JSON.stringify(value).slice(1, -1);
}

function fill(template: string, vals: { to: string; from: string; text: string }, mode: "url" | "json"): string {
  return template
    .replace(/\{to\}/g, enc(vals.to, mode))
    .replace(/\{from\}/g, enc(vals.from, mode))
    .replace(/\{text\}/g, enc(vals.text, mode));
}

async function sendViaHttpGateway(s: SmsSettings, to: string, body: string): Promise<SmsResult> {
  if (!s.gateway_url) {
    return { ok: false, noConfig: true, error: "Gateway SMS no configurado (falta la URL)." };
  }
  const vals = { to, from: s.gateway_from ?? "", text: body.slice(0, 1600) };

  // Tokens in the URL are always URL-encoded (covers GET-style gateways like GoIP).
  const url = fill(s.gateway_url, vals, "url");
  if (!isSafeGatewayUrl(url)) {
    return { ok: false, noConfig: true, error: "URL del gateway SMS no permitida (debe ser http(s) público)." };
  }

  const headers: Record<string, string> = { accept: "application/json, text/plain, */*" };
  if (s.gateway_auth_header) {
    const i = s.gateway_auth_header.indexOf(":");
    if (i > 0) {
      headers[s.gateway_auth_header.slice(0, i).trim()] = s.gateway_auth_header.slice(i + 1).trim();
    } else {
      headers["Authorization"] = s.gateway_auth_header.trim();
    }
  }

  let requestBody: string | undefined;
  if (s.gateway_method === "POST" && s.gateway_body_template) {
    if (s.gateway_content_type === "json") {
      headers["Content-Type"] = "application/json";
      requestBody = fill(s.gateway_body_template, vals, "json");
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestBody = fill(s.gateway_body_template, vals, "url");
    }
  }

  try {
    const res = await fetch(url, {
      method: s.gateway_method,
      headers,
      body: s.gateway_method === "POST" ? requestBody : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `Gateway ${res.status}: ${(await res.text()).slice(0, 180)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar SMS por el gateway." };
  }
}
