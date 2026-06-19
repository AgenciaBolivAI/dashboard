import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

/**
 * Meta "Data Deletion Request Callback". When a person removes the app from
 * their Facebook/Instagram settings, Meta POSTs a `signed_request`. We verify
 * it with the app secret, record the request for completion, and return the
 * JSON Meta requires: { url, confirmation_code }. The simpler, equivalent
 * option is the instructions page at bolivai.com/data-deletion.html — either
 * one satisfies Meta's requirement.
 */

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function parseSignedRequest(signed: string, appSecret: string): { user_id?: string } | null {
  const [encSig, encPayload] = signed.split(".");
  if (!encSig || !encPayload) return null;
  const expected = createHmac("sha256", appSecret).update(encPayload).digest();
  const got = b64urlToBuf(encSig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    return JSON.parse(b64urlToBuf(encPayload).toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  let signed: string | null = null;
  try {
    const form = await req.formData();
    signed = (form.get("signed_request") as string | null) ?? null;
  } catch {
    try {
      signed = (await req.json())?.signed_request ?? null;
    } catch {
      /* ignore */
    }
  }

  const data = signed ? parseSignedRequest(signed, appSecret) : null;
  if (!data?.user_id) {
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  const code = createHmac("sha256", appSecret)
    .update(`${data.user_id}:${Date.now()}`)
    .digest("hex")
    .slice(0, 24);

  // Record the request so it is completed within 30 days (captured by the
  // platform's structured logging / error monitoring).
  console.error(
    "[meta-data-deletion]",
    JSON.stringify({ meta_user_id: data.user_id, confirmation_code: code, ts: new Date().toISOString() }),
  );

  // Meta requires a status URL + confirmation code in the response body.
  return NextResponse.json({
    url: `https://bolivai.com/data-deletion.html?code=${code}`,
    confirmation_code: code,
  });
}
