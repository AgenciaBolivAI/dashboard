import "server-only";
import nodemailer from "nodemailer";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantGoogleAccess } from "@/lib/google-calendar";

/**
 * Per-tenant outbound email. Tenants send from THEIR OWN sender — either their
 * connected Google/Gmail (the gmail.send scope is already granted on the Google
 * integration) or their own SMTP server. BolivAI's own info@bolivai.com is NOT
 * used here — that's reserved for platform/system mail (signups, password
 * resets). If a tenant hasn't connected a sender, sending fails with a clear,
 * surfaceable reason.
 */

export type TenantSender =
  | { kind: "gmail"; fromEmail: string }
  | { kind: "smtp"; host: string; port: number; secure: boolean; user: string; pass: string; fromEmail: string; fromName: string | null }
  | null;

type SmtpMeta = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from_email?: string;
  from_name?: string | null;
};

/** Ask Gmail for the connected account's email address (the From). */
async function gmailProfileEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { emailAddress?: string };
    return j.emailAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the tenant's configured sender. Gmail (via the Google connection) is
 * preferred; otherwise a per-tenant SMTP row (tenant_integrations provider='smtp',
 * password stored in access_token, the rest in metadata). Returns null when the
 * tenant has no usable sender configured.
 */
export async function getTenantSender(tenantId: string): Promise<TenantSender> {
  // 1) Gmail via the connected Google account (gmail.send scope already granted)
  const g = await getTenantGoogleAccess(tenantId);
  if (g?.accessToken) {
    const fromEmail = await gmailProfileEmail(g.accessToken);
    if (fromEmail) return { kind: "gmail", fromEmail };
  }

  // 2) Per-tenant SMTP
  const svc = createServiceClient();
  const { data } = await svc
    .from("tenant_integrations")
    .select("access_token, metadata")
    .eq("tenant_id", tenantId)
    .eq("provider", "smtp")
    .maybeSingle();
  if (data) {
    const row = data as { access_token: string | null; metadata: SmtpMeta | null };
    const m = row.metadata ?? {};
    if (m.host && m.user && m.from_email && row.access_token) {
      return {
        kind: "smtp",
        host: m.host,
        port: m.port ?? 587,
        secure: m.secure ?? (m.port === 465),
        user: m.user,
        pass: row.access_token,
        fromEmail: m.from_email,
        fromName: m.from_name ?? null,
      };
    }
  }
  return null;
}

/**
 * Settings-page view of a tenant's email sender: both the Gmail-connected state
 * and the SMTP config (password never returned), plus which one would actually
 * be used. Gmail wins when both are present.
 */
export async function getTenantEmailStatus(tenantId: string): Promise<{
  active: "gmail" | "smtp" | null;
  gmailEmail: string | null;
  smtp: { host: string; port: number; secure: boolean; user: string; fromEmail: string; fromName: string | null } | null;
}> {
  let gmailEmail: string | null = null;
  const g = await getTenantGoogleAccess(tenantId);
  if (g?.accessToken) gmailEmail = await gmailProfileEmail(g.accessToken);

  const svc = createServiceClient();
  const { data } = await svc
    .from("tenant_integrations")
    .select("access_token, metadata")
    .eq("tenant_id", tenantId)
    .eq("provider", "smtp")
    .maybeSingle();
  let smtp: { host: string; port: number; secure: boolean; user: string; fromEmail: string; fromName: string | null } | null = null;
  if (data) {
    const row = data as { access_token: string | null; metadata: SmtpMeta | null };
    const m = row.metadata ?? {};
    if (m.host && m.user && m.from_email && row.access_token) {
      smtp = {
        host: m.host,
        port: m.port ?? 587,
        secure: m.secure ?? (m.port === 465),
        user: m.user,
        fromEmail: m.from_email,
        fromName: m.from_name ?? null,
      };
    }
  }
  const active = gmailEmail ? "gmail" : smtp ? "smtp" : null;
  return { active, gmailEmail, smtp };
}

/** Strip CR/LF + other control chars from a header value — prevents email
 * header injection (a smuggled "\r\nBcc: ..." in a recipient/subject). */
function sanitizeHeader(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

/** A single, well-formed email address — no display name, CRLF, or extra
 * addresses. Used to reject anything that could smuggle headers/recipients. */
function isPlainEmail(v: string): boolean {
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v);
}

/** RFC2047-encode a header value (handles non-ASCII subjects/names). */
function encodeHeader(v: string): string {
  // ASCII-only → pass through; otherwise base64 encoded-word.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(v)) return v;
  return `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** Build a base64url RFC822 message for the Gmail send API. Every header value
 * is CR/LF-stripped first so neither the model-supplied subject nor the
 * DB-sourced recipient can inject additional headers. */
function buildGmailRaw(opts: { from: string; to: string; subject: string; html: string }): string {
  const headers = [
    `From: ${sanitizeHeader(opts.from)}`,
    `To: ${sanitizeHeader(opts.to)}`,
    `Subject: ${encodeHeader(sanitizeHeader(opts.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].join("\r\n");
  const body = Buffer.from(opts.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return Buffer.from(`${headers}\r\n\r\n${body}`, "utf8").toString("base64url");
}

export type SendResult = { ok: true; via: "gmail" | "smtp"; from: string } | { ok: false; error: string; noSender?: boolean };

/**
 * Send an email from the tenant's own sender. `to` MUST be a real address that
 * the caller already resolved + authorized server-side (never a model-supplied
 * value — see the BOLIV email tools).
 */
export async function sendTenantEmail(
  tenantId: string,
  msg: { to: string; subject: string; html: string },
): Promise<SendResult> {
  // Defense-in-depth: the recipient comes from tenant data (a lead/customer row)
  // and could in theory carry CRLF or a second address — reject anything that
  // isn't a single plain address before it ever reaches an email header.
  if (!isPlainEmail(msg.to)) {
    return { ok: false, error: "La dirección de destino no es válida." };
  }
  const safeSubject = sanitizeHeader(msg.subject);

  const sender = await getTenantSender(tenantId);
  if (!sender) {
    return { ok: false, noSender: true, error: "El negocio no tiene un remitente de email configurado. Conecta Google o configura SMTP en Ajustes." };
  }

  if (sender.kind === "gmail") {
    const g = await getTenantGoogleAccess(tenantId);
    if (!g?.accessToken) return { ok: false, noSender: true, error: "La conexión de Google no está disponible." };
    const raw = buildGmailRaw({ from: sender.fromEmail, to: msg.to, subject: safeSubject, html: msg.html });
    try {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${g.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `Gmail rechazó el envío (${res.status}): ${t.slice(0, 200)}` };
      }
      return { ok: true, via: "gmail", from: sender.fromEmail };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar por Gmail." };
    }
  }

  // SMTP
  try {
    const transport = nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      secure: sender.secure,
      auth: { user: sender.user, pass: sender.pass },
    });
    const from = sender.fromName ? `${sanitizeHeader(sender.fromName)} <${sender.fromEmail}>` : sender.fromEmail;
    await transport.sendMail({ from, to: msg.to, subject: safeSubject, html: msg.html });
    return { ok: true, via: "smtp", from: sender.fromEmail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fallo al enviar por SMTP." };
  }
}
