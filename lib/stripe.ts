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

/**
 * Countries where Stripe Connect Express is currently available
 * (per Stripe docs, ISO 3166-1 alpha-2). Tenants outside this list
 * can still use BolivAI, just with manual-mark-paid invoices.
 *
 * Keep this list updated when Stripe expands coverage.
 */
export const CONNECT_EXPRESS_COUNTRIES = new Set<string>([
  // North America
  "US", "CA", "MX",
  // South America
  "BR", "CL", "PE", "UY",
  // EU + EEA
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // Other Europe
  "GB", "NO", "CH", "LI", "IS",
  // APAC
  "AU", "NZ", "JP", "SG", "HK", "MY", "TH", "ID", "IN",
  // Middle East
  "AE", "IL", "SA",
  // Africa
  "ZA",
]);

export function isConnectExpressSupported(country: string | null | undefined): boolean {
  if (!country) return true; // Don't gate when unknown — let Stripe surface the real error
  return CONNECT_EXPRESS_COUNTRIES.has(country.toUpperCase());
}

/**
 * URL of the n8n "Invoice Notify" webhook that emails the tenant when a
 * customer pays or a payment fails. Configured in n8n; secret matches
 * `bolivai_settings.notify_shared_secret`.
 */
export const INVOICE_NOTIFY_WEBHOOK_URL =
  process.env.INVOICE_NOTIFY_WEBHOOK_URL ?? "";

// Never hardcode the shared secret — it authenticates to the n8n notify webhook.
// Empty when unset; the webhook caller skips the notify rather than sending an
// unauthenticated (or fallback-secret) request.
export const INVOICE_NOTIFY_SECRET = process.env.INVOICE_NOTIFY_SECRET ?? "";
