/**
 * Minimal Twilio API helpers for voice provisioning.
 *
 * We don't pull in the official `twilio` Node SDK — we only ever do
 * two things:
 *   1. Validate that a tenant's Account SID + Auth Token are real
 *      by fetching the account record.
 *   2. (Future Phase 3.5) Look up the IncomingPhoneNumber SID for a
 *      given E.164 number so we can attach a voice webhook URL.
 *
 * For Phase 3 the actual call routing is handled by ElevenLabs after
 * we import the number into their system — they configure the Twilio
 * webhook end of things via the SID/token we pass them.
 */

const API_BASE = "https://api.twilio.com/2010-04-01";

export type TwilioAccount = {
  sid: string;
  friendly_name: string;
  status: string;     // 'active' | 'suspended' | 'closed'
  type: string;       // 'Trial' | 'Full'
};

/**
 * Validate creds by fetching the account record. Throws on invalid
 * creds, network error, or suspended account.
 */
export async function validateTwilioCreds(
  accountSid: string,
  authToken: string,
): Promise<TwilioAccount> {
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    throw new Error("Account SID format inválido (debe empezar con 'AC').");
  }
  if (!authToken || authToken.length < 16) {
    throw new Error("Auth Token vacío o demasiado corto.");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(`${API_BASE}/Accounts/${accountSid}.json`, {
    headers: { Authorization: `Basic ${auth}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Twilio rechazó las credenciales. Revisa Account SID + Auth Token.");
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const account = (await res.json()) as TwilioAccount;
  if (account.status !== "active") {
    throw new Error(`Cuenta Twilio en estado '${account.status}'. Debe estar activa.`);
  }
  return account;
}

/**
 * Verify the tenant actually owns the phone number on this Twilio
 * account. Prevents mistakes (typo'd number) before we tell ElevenLabs.
 */
export async function verifyOwnsNumber(
  accountSid: string,
  authToken: string,
  phoneNumberE164: string,
): Promise<{ sid: string; phone_number: string }> {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({ PhoneNumber: phoneNumberE164 });
  const res = await fetch(
    `${API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers.json?${params}`,
    {
      headers: { Authorization: `Basic ${auth}`, accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio HTTP ${res.status} al buscar el número.`);
  }
  const data = (await res.json()) as {
    incoming_phone_numbers: Array<{ sid: string; phone_number: string }>;
  };
  const found = data.incoming_phone_numbers?.find(
    (n) => n.phone_number === phoneNumberE164,
  );
  if (!found) {
    throw new Error(
      `El número ${phoneNumberE164} no existe en esta cuenta Twilio. Cómpralo en Twilio primero.`,
    );
  }
  return { sid: found.sid, phone_number: found.phone_number };
}
