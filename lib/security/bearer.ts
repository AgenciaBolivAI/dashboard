/**
 * Constant-time Bearer token check.
 *
 * Why this exists: a naive string compare like `auth === expected` (or
 * `auth !== \`Bearer ${expected}\``) returns the moment the first byte
 * differs. That's a measurable timing oracle — an attacker can probe
 * one byte at a time and learn the secret. The Node `crypto.timingSafeEqual`
 * compares all bytes regardless of where they diverge, eliminating the leak.
 *
 * Usage:
 *   if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * @returns true iff the request carries `Authorization: Bearer <secret>`
 *          AND `secret` is defined. Constant-time comparison.
 */
export function checkBearer(
  req: NextRequest | Request,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : header.replace(/^Bearer\s+/i, "");
  return timingSafeEqual(got, expected);
}

/** Constant-time string compare. Returns false if lengths differ (which is itself a length oracle, but acceptable for fixed-length secrets). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}
