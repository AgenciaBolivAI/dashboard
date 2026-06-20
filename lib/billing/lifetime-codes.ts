import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * Shareable discount codes for the Founding Member fee, backed by native Stripe
 * Coupons + Promotion Codes (validation, redemption limits and expiry are
 * handled by Stripe — no custom table to build or secure). Every coupon we
 * create is tagged `metadata.bolivai_kind = 'lifetime'` so we only ever list /
 * honor our own codes, never other Stripe coupons on the account.
 */
const KIND = "lifetime";

export type LifetimeCode = {
  id: string; // promotion code id (promo_…)
  code: string; // the user-facing code, e.g. FOUNDER50
  percentOff: number;
  active: boolean;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: number | null; // unix seconds
  label: string | null;
  createdAt: number;
};

export async function createLifetimeCode(input: {
  percentOff: number;
  code?: string;
  maxRedemptions?: number;
  expiresAt?: number; // unix seconds
  label?: string;
}): Promise<LifetimeCode> {
  const stripe = getStripe();
  const pct = Math.min(100, Math.max(1, Math.round(input.percentOff)));

  const coupon = await stripe.coupons.create({
    percent_off: pct,
    duration: "once",
    name: input.label || `BolivAI lifetime ${pct}% off`,
    metadata: { bolivai_kind: KIND },
  });

  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    ...(input.code ? { code: input.code.trim().toUpperCase() } : {}),
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
    metadata: { bolivai_kind: KIND, label: input.label ?? "" },
  });

  return {
    id: promo.id,
    code: promo.code,
    percentOff: pct,
    active: promo.active,
    maxRedemptions: promo.max_redemptions ?? null,
    timesRedeemed: promo.times_redeemed,
    expiresAt: promo.expires_at ?? null,
    label: input.label ?? null,
    createdAt: promo.created,
  };
}

export async function listLifetimeCodes(): Promise<LifetimeCode[]> {
  const stripe = getStripe();
  const res = await stripe.promotionCodes.list({ limit: 100, expand: ["data.coupon"] });
  return res.data
    .filter((p) => couponOf(p)?.metadata?.bolivai_kind === KIND)
    .map(toLifetimeCode)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deactivateLifetimeCode(promotionCodeId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.promotionCodes.update(promotionCodeId, { active: false });
}

/** Resolve a user-entered code to an active, lifetime-tagged promotion code id. */
export async function resolvePromotionCode(code: string): Promise<{ id: string } | null> {
  const c = (code || "").trim();
  if (!c) return null;
  const stripe = getStripe();
  const res = await stripe.promotionCodes.list({
    code: c,
    active: true,
    limit: 1,
    expand: ["data.coupon"],
  });
  const p = res.data[0];
  if (!p || couponOf(p)?.metadata?.bolivai_kind !== KIND) return null;
  return { id: p.id };
}

function couponOf(p: Stripe.PromotionCode): Stripe.Coupon | null {
  return typeof p.coupon === "string" ? null : p.coupon;
}

function toLifetimeCode(p: Stripe.PromotionCode): LifetimeCode {
  const coupon = couponOf(p);
  const label = typeof p.metadata?.label === "string" && p.metadata.label ? p.metadata.label : null;
  return {
    id: p.id,
    code: p.code,
    percentOff: coupon?.percent_off ?? 0,
    active: p.active,
    maxRedemptions: p.max_redemptions ?? null,
    timesRedeemed: p.times_redeemed,
    expiresAt: p.expires_at ?? null,
    label,
    createdAt: p.created,
  };
}
