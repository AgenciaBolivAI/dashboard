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
