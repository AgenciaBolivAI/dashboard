import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { debitCredits } from "@/lib/billing/credits";

/**
 * Per-seat billing. Every account includes 2 seats; each extra team member
 * costs US$5/month = 500 credits (1 credit = 1¢). Charged from the tenant's
 * prepaid credit balance via the `seat_fee` action:
 *   • at invite time for a billable seat (hard gate — blocked if the balance
 *     can't cover it), and
 *   • monthly by the seat-billing tick.
 * A per-(tenant, UTC month) ledger (seat_charges) reconciles both paths so each
 * billable seat is charged at most once per calendar month.
 */

export const SEAT_FEE_CREDITS = 500; // US$5 (1 credit = 1¢)
export const SEAT_FEE_USD = 5;
export const DEFAULT_INCLUDED_SEATS = 2;

// seat_charges + the new tenants.included_seats / invitations.seat_charged
// columns aren't in the generated DB types yet — loosely-typed client.
function svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** Current billing period, UTC 'YYYY-MM' — matches the tick + invite charge. */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

async function includedSeats(tenantId: string): Promise<number> {
  const { data } = await svc()
    .from("tenants")
    .select("included_seats")
    .eq("id", tenantId)
    .maybeSingle();
  const n = (data as { included_seats?: number } | null)?.included_seats;
  return typeof n === "number" && n >= 0 ? n : DEFAULT_INCLUDED_SEATS;
}

/** Active members (dashboard_users) + live pending invites = occupied seats. */
async function seatOccupancy(tenantId: string): Promise<{ members: number; pending: number }> {
  const s = svc();
  const [{ count: members }, { count: pending }] = await Promise.all([
    s.from("dashboard_users").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    s
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return { members: members ?? 0, pending: pending ?? 0 };
}

export type SeatUsage = {
  members: number;
  pending: number;
  occupied: number; // members + pending
  included: number;
  billable: number; // occupied seats beyond included
  monthlyCostCredits: number;
  monthlyCostUsd: number;
  /** Would the NEXT invite occupy a billable (paid) seat? */
  nextSeatBillable: boolean;
};

/** Seat usage snapshot for the team/billing UI. */
export async function getSeatUsage(tenantId: string): Promise<SeatUsage> {
  const [{ members, pending }, included] = await Promise.all([
    seatOccupancy(tenantId),
    includedSeats(tenantId),
  ]);
  const occupied = members + pending;
  const billable = Math.max(0, occupied - included);
  return {
    members,
    pending,
    occupied,
    included,
    billable,
    monthlyCostCredits: billable * SEAT_FEE_CREDITS,
    monthlyCostUsd: billable * SEAT_FEE_USD,
    nextSeatBillable: occupied >= included,
  };
}

export type SeatChargeResult =
  | { ok: true; charged: boolean; creditsDebited: number }
  | { ok: false; reason: "insufficient_credits" | "error"; needed: number; balanceAfter: number };

/**
 * Charge for ONE new seat at invite time, IF the next seat is billable. Returns
 * `{ok:true, charged:false}` when the seat is still within the included
 * allowance (free). On a billable seat with insufficient credits, returns
 * `{ok:false}` so the caller blocks the invite. On success, bumps the
 * per-month seat ledger so the monthly tick won't double-charge.
 */
export async function chargeSeatForInvite(tenantId: string, referenceId?: string): Promise<SeatChargeResult> {
  const { members, pending } = await seatOccupancy(tenantId);
  const included = await includedSeats(tenantId);
  const billable = members + pending >= included;
  if (!billable) return { ok: true, charged: false, creditsDebited: 0 };

  const debit = await debitCredits({
    tenantId,
    actionKey: "seat_fee",
    units: 1,
    referenceId: referenceId ?? null,
    metadata: { kind: "seat_invite", period: currentPeriod() },
  });
  if (!debit.ok) {
    return {
      ok: false,
      reason: "insufficient_credits",
      needed: SEAT_FEE_CREDITS,
      balanceAfter: debit.balance_after,
    };
  }
  const { error: ledgerErr } = await svc().rpc("add_seat_charge", { p_tenant_id: tenantId, p_period: currentPeriod(), p_delta: 1 });
  // If the ledger bump fails after a successful debit, the month's seat appears
  // uncharged and the tick could re-charge it — log loudly so it's caught.
  if (ledgerErr) console.warn("[seats] add_seat_charge(+1) failed after debit", tenantId, ledgerErr.message);
  return { ok: true, charged: true, creditsDebited: debit.credits_debited };
}

/**
 * Refund a seat charge when a charged, still-pending invite is revoked in the
 * SAME calendar month it was charged (a seat that was never used). Decrements
 * the month ledger so the tick can re-charge if a real member takes the seat.
 */
export async function refundSeatForInvite(tenantId: string, chargedPeriod: string, referenceId?: string): Promise<void> {
  if (chargedPeriod !== currentPeriod()) return; // only same-month refunds
  const s = svc();
  const { error: refundErr } = await s.rpc("refund_credits", {
    p_tenant_id: tenantId,
    p_credits: SEAT_FEE_CREDITS,
    p_action_key: "seat_fee",
    p_reference_id: referenceId ?? null,
    p_metadata: { kind: "seat_invite_refund", period: chargedPeriod },
  });
  if (refundErr) console.warn("[seats] refund_credits failed", tenantId, refundErr.message);
  const { error: decErr } = await s.rpc("add_seat_charge", { p_tenant_id: tenantId, p_period: chargedPeriod, p_delta: -1 });
  if (decErr) console.warn("[seats] add_seat_charge(-1) failed on refund", tenantId, decErr.message);
}

export type SeatTickResult = {
  tenantId: string;
  billable: number;
  alreadyCharged: number;
  due: number;
  charged: number;
  ok: boolean;
  reason?: string;
};

/**
 * Monthly recurring charge for one tenant (called by the seat-billing tick).
 * Tops the month's ledger up to the current billable-MEMBER count, so a seat
 * charged at invite time isn't billed twice in the same month. Idempotent:
 * re-running in the same month with no new seats charges nothing.
 */
export async function billTenantSeats(tenantId: string): Promise<SeatTickResult> {
  const s = svc();
  const period = currentPeriod();
  const included = await includedSeats(tenantId);
  const { count: members } = await s
    .from("dashboard_users")
    .select("user_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const billable = Math.max(0, (members ?? 0) - included);

  const { data: row } = await s
    .from("seat_charges")
    .select("seats_charged")
    .eq("tenant_id", tenantId)
    .eq("period", period)
    .maybeSingle();
  const alreadyCharged = (row as { seats_charged?: number } | null)?.seats_charged ?? 0;
  const due = Math.max(0, billable - alreadyCharged);

  if (due <= 0) {
    return { tenantId, billable, alreadyCharged, due: 0, charged: 0, ok: true };
  }

  const debit = await debitCredits({
    tenantId,
    actionKey: "seat_fee",
    units: due,
    metadata: { kind: "seat_monthly", period },
  });
  if (!debit.ok) {
    return { tenantId, billable, alreadyCharged, due, charged: 0, ok: false, reason: debit.reason ?? "debit_failed" };
  }
  const { error: bumpErr } = await s.rpc("add_seat_charge", { p_tenant_id: tenantId, p_period: period, p_delta: due });
  if (bumpErr) console.warn("[seats] add_seat_charge(tick) failed after debit", tenantId, bumpErr.message);
  return { tenantId, billable, alreadyCharged, due, charged: due, ok: true };
}

/**
 * Monthly seat-billing tick across all tenants (or one). Idempotent per
 * calendar month via billTenantSeats. Safe to run daily — a tenant already
 * billed this month with no new seats is a no-op. Per-tenant failures (e.g.
 * insufficient credits) are recorded, never thrown, so one bad tenant can't
 * stop the run.
 */
export async function runSeatBillingTick(opts?: { tenantId?: string }): Promise<{
  tenants: number;
  seatsCharged: number;
  creditsDebited: number;
  insufficient: number;
  results: SeatTickResult[];
}> {
  const s = svc();
  let ids: string[];
  if (opts?.tenantId) {
    ids = [opts.tenantId];
  } else {
    const { data } = await s.from("tenants").select("id");
    ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  const results: SeatTickResult[] = [];
  for (const id of ids) {
    try {
      results.push(await billTenantSeats(id));
    } catch (e) {
      results.push({
        tenantId: id,
        billable: 0,
        alreadyCharged: 0,
        due: 0,
        charged: 0,
        ok: false,
        reason: e instanceof Error ? e.message : "error",
      });
    }
  }

  const seatsCharged = results.reduce((a, r) => a + r.charged, 0);
  return {
    tenants: ids.length,
    seatsCharged,
    creditsDebited: seatsCharged * SEAT_FEE_CREDITS,
    insufficient: results.filter((r) => !r.ok).length,
    results,
  };
}
