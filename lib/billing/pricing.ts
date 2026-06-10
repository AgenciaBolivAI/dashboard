/**
 * Pure pricing constants + helpers — client-safe.
 *
 * Lives separately from credits.ts because credits.ts imports
 * @/lib/supabase/server which pulls in next/headers (cookies()).
 * Any client component that needs TOPUP_PRESETS or calculateBonusCredits
 * imports here and avoids the build error chain.
 */

export const MIN_TOPUP_CENTS = 1_000;     // $10
export const MAX_TOPUP_CENTS = 1_000_000; // $10,000 per transaction

/**
 * Bonus credit tiers. 5/10/15/20% at $50/$100/$250/$500. Cash booked is
 * always face value; bonus comes from gross margin.
 */
const BONUS_TIERS = [
  { min_cents: 50_000, bonus_pct: 20 },   // $500+
  { min_cents: 25_000, bonus_pct: 15 },   // $250+
  { min_cents: 10_000, bonus_pct: 10 },   // $100+
  { min_cents:  5_000, bonus_pct: 5 },    // $50+
] as const;

export function calculateBonusCredits(paidCents: number): number {
  for (const tier of BONUS_TIERS) {
    if (paidCents >= tier.min_cents) {
      // 1¢ = 1 credit; bonus is a % of credits, rounded down.
      return Math.floor((paidCents * tier.bonus_pct) / 100);
    }
  }
  return 0;
}

export const TOPUP_PRESETS = [
  { cents: 1_000,  label: "$10",  bonus: 0 },
  { cents: 2_500,  label: "$25",  bonus: 0 },
  { cents: 5_000,  label: "$50",  bonus: 250 },
  { cents: 10_000, label: "$100", bonus: 1_000 },
  { cents: 25_000, label: "$250", bonus: 3_750 },
  { cents: 50_000, label: "$500", bonus: 10_000 },
];
