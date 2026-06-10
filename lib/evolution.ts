/**
 * Evolution API wrapper. Used during HITL takeover so an operator can
 * send WhatsApp messages directly without going through n8n.
 *
 * Server-only.
 */

const BASE = process.env.EVOLUTION_BASE_URL!;
const KEY = process.env.EVOLUTION_API_KEY!;

export async function sendText(
  instance: string,
  toWhatsAppNumber: string,
  text: string,
) {
  const res = await fetch(`${BASE}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY,
    },
    body: JSON.stringify({
      number: toWhatsAppNumber,
      text,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evolution ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function getInstanceStatus(instance: string) {
  const res = await fetch(`${BASE}/instance/connectionState/${instance}`, {
    headers: { apikey: KEY },
    cache: "no-store",
  });
  if (!res.ok) return { state: "unknown" };
  return res.json() as Promise<{ instance: { state: string } }>;
}

/**
 * Create a new Evolution WhatsApp instance + return its QR code.
 *
 * `instance` must be DNS-safe (matches our tenant slug). After this call,
 * the operator scans the returned QR with the business's WhatsApp; status
 * flips to `open` once the handshake completes.
 */
export type CreateInstanceResponse = {
  instance: { instanceName: string; status: string };
  hash?: { apikey?: string };
  qrcode?: { base64?: string; code?: string; pairingCode?: string };
};

export async function createInstance(
  instance: string,
  options: { webhookUrl?: string; webhookByEvents?: string[] } = {},
): Promise<CreateInstanceResponse> {
  const body: Record<string, unknown> = {
    instanceName: instance,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (options.webhookUrl) {
    body.webhook = options.webhookUrl;
    body.webhookByEvents = options.webhookByEvents ?? [
      "MESSAGES_UPSERT",
      "CONNECTION_UPDATE",
    ];
  }

  const res = await fetch(`${BASE}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evolution create ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}

/** Fetch the QR code for an EXISTING instance (e.g. after restart). */
export async function getInstanceQr(instance: string): Promise<{ base64?: string; pairingCode?: string }> {
  const res = await fetch(`${BASE}/instance/connect/${instance}`, {
    headers: { apikey: KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Evolution connect ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Delete an Evolution instance (cleanup on tenant deletion or QR re-issue). */
export async function deleteInstance(instance: string): Promise<void> {
  const res = await fetch(`${BASE}/instance/delete/${instance}`, {
    method: "DELETE",
    headers: { apikey: KEY },
    cache: "no-store",
  });
  // 404 is fine — already gone
  if (!res.ok && res.status !== 404) {
    throw new Error(`Evolution delete ${res.status}: ${await res.text()}`);
  }
}
