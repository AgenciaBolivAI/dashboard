import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    typescript: true,
  });
  return _stripe;
}

export const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID ?? "";

/** Platform fee in basis points (1 bp = 0.01%). Default: 100 bp = 1%. */
export const STRIPE_PLATFORM_FEE_BPS = (() => {
  const raw = process.env.STRIPE_PLATFORM_FEE_BPS;
  const parsed = raw ? parseInt(raw, 10) : 100;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : 100;
})();

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
