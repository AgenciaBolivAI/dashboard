import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  getAppUrl,
  INVOICE_NOTIFY_WEBHOOK_URL,
  INVOICE_NOTIFY_SECRET,
} from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { applyTopupFromStripe } from "@/lib/billing/credits";
import { grantLifetimeFromStripe } from "@/lib/billing/lifetime";

/**
 * Update invoices matched by a Stripe id, but ALWAYS re-scope the write to the
 * matched row's (id, tenant_id) — the same pattern the `invoice.paid` handler
 * uses. Defense-in-depth so a webhook write can never cross tenants even though
 * Stripe ids are globally unique (signature already verified upstream).
 */
async function scopeInvoiceWrite(
  supabase: ReturnType<typeof createServiceClient>,
  col: "stripe_invoice_id" | "stripe_subscription_id",
  id: string,
  patch: Record<string, unknown>,
  onlyRecurring = false,
): Promise<void> {
  let q = supabase.from("invoices").select("id, tenant_id").eq(col, id);
  if (onlyRecurring) q = q.eq("is_recurring", true);
  const { data } = await q;
  for (const r of (data ?? []) as Array<{ id: string; tenant_id: string }>) {
    await supabase
      .from("invoices")
      .update(patch as never)
      .eq("id", r.id)
      .eq("tenant_id", r.tenant_id);
  }
}

/**
 * POST to the n8n Invoice Notify webhook. The fetch IS awaited (callers
 * await this function before responding to Stripe): on Vercel serverless any
 * work left running after the response is sent is killed, so an un-awaited
 * notify could silently never fire. The webhook is fast; on failure we log and
 * still return 200 to Stripe (we don't want a flaky notifier to trigger
 * Stripe retries of an event we already processed).
 */
async function notifyTenantOfInvoiceEvent(
  event: "invoice.paid" | "invoice.payment_failed",
  stripeInvoice: Stripe.Invoice,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: invRow } = await supabase
      .from("invoices")
      .select("id, tenant_id, number, customer_name, customer_email, currency, total_cents, amount_paid_cents, application_fee_cents")
      .eq("stripe_invoice_id", stripeInvoice.id)
      .maybeSingle();
    if (!invRow) return;
    const inv = invRow as {
      id: string;
      tenant_id: string;
      number: string | null;
      customer_name: string | null;
      customer_email: string | null;
      currency: string;
      total_cents: number;
      amount_paid_cents: number;
      application_fee_cents: number;
    };

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("name, language, notification_email, notify_on_new_reservation, slug")
      .eq("id", inv.tenant_id)
      .maybeSingle();
    if (!tenantRow) return;
    const t = tenantRow as {
      name: string;
      language: string;
      notification_email: string | null;
      slug: string;
    };
    if (!t.notification_email) return;
    // Skip if the notify webhook isn't configured (no URL/secret) — never send
    // with a missing or fallback secret.
    if (!INVOICE_NOTIFY_WEBHOOK_URL || !INVOICE_NOTIFY_SECRET) return;

    const payload = {
      event,
      tenant_id: inv.tenant_id,
      tenant_name: t.name,
      tenant_language: t.language,
      notification_email: t.notification_email,
      invoice: {
        id: inv.id,
        number: inv.number,
        customer_name: inv.customer_name,
        customer_email: inv.customer_email,
        currency: inv.currency,
        total_cents: inv.total_cents,
        amount_paid_cents: inv.amount_paid_cents,
        application_fee_cents: inv.application_fee_cents,
        hosted_invoice_url: stripeInvoice.hosted_invoice_url ?? null,
        dashboard_url: `${getAppUrl()}/dashboard/${t.slug}/invoices/${inv.id}`,
      },
    };

    await fetch(INVOICE_NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bolivai-secret": INVOICE_NOTIFY_SECRET,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[stripe webhook] notifyTenantOfInvoiceEvent failed", e);
  }
}

/**
 * Stripe Connect webhook receiver.
 *
 * Configure this endpoint at https://dashboard.stripe.com/webhooks under
 * **Connect** (not Account) so events arrive for all connected accounts.
 * Set the env var STRIPE_WEBHOOK_SECRET to the signing secret Stripe
 * generates for this endpoint.
 *
 * Handled events:
 *   invoice.paid                  -> mark our invoice paid
 *   invoice.payment_failed        -> mark past_due
 *   invoice.marked_uncollectible  -> mark uncollectible
 *   invoice.voided                -> mark void
 *   invoice.finalized             -> sync hosted_invoice_url
 *   account.updated               -> sync charges_enabled / payouts_enabled
 *   account.application.deauthorized -> clear connection
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature/secret" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Invalid signature: ${msg}` }, { status: 400 });
  }

  // Service client: a Stripe webhook carries no Supabase session, so the
  // RLS-bound anon client would silently match zero rows on every write.
  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Founding Member lifetime-access purchase (one-time). A 100%-off code
        // makes amount_total $0 → Stripe marks it `no_payment_required` with no
        // payment_intent, so fall back to the session id and accept that status.
        if (session.metadata?.bolivai_purpose === "lifetime_access") {
          const tenantId = session.metadata.bolivai_tenant_id;
          const pi =
            (typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id) ?? session.id;
          const settled =
            session.payment_status === "paid" ||
            session.payment_status === "no_payment_required";
          if (tenantId && settled) {
            const r = await grantLifetimeFromStripe({
              tenantId,
              paidCents: session.amount_total ?? 0,
              stripePaymentIntentId: pi,
              code: session.metadata?.bolivai_code ?? null,
            });
            console.log(
              `[stripe webhook] lifetime granted ${tenantId} #${r.foundingNumber} (already=${r.wasAlready})`,
            );
          } else {
            console.warn("[stripe webhook] lifetime missing metadata/paid", session.id);
          }
          break;
        }

        // Credit top-up flow: bolivai_purpose=credit_topup in metadata.
        if (session.metadata?.bolivai_purpose !== "credit_topup") break;

        const tenantId = session.metadata.bolivai_tenant_id;
        const paidCents = parseInt(session.metadata.bolivai_paid_cents ?? "0", 10);
        const bonus = parseInt(session.metadata.bolivai_bonus_credits ?? "0", 10);
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        if (!tenantId || !paymentIntentId || !(paidCents > 0)) {
          console.warn("[stripe webhook] topup missing metadata", session.id);
          break;
        }
        if (session.payment_status !== "paid") {
          console.warn(
            "[stripe webhook] topup checkout completed but not paid:",
            session.id,
            session.payment_status,
          );
          break;
        }

        const result = await applyTopupFromStripe({
          tenantId,
          paidCents,
          bonusCredits: bonus,
          stripePaymentIntentId: paymentIntentId,
          stripeCheckoutSessionId: session.id,
        });
        console.log(
          `[stripe webhook] topup applied ${tenantId} +${result.creditsAdded} → ${result.newBalance} (idempotent=${result.wasIdempotent})`,
        );
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        // Resolve the owning invoice by its Stripe id (the only trustworthy
        // selector — `metadata.bolivai_invoice_id` is client-influencable and
        // must NEVER be used to choose which row to write). Then scope the
        // update to that exact (id, tenant_id) pair so a forged event can't
        // touch another tenant's invoice.
        const { data: ownRow } = await supabase
          .from("invoices")
          .select("id, tenant_id")
          .eq("stripe_invoice_id", inv.id)
          .maybeSingle();
        const own = ownRow as { id: string; tenant_id: string } | null;
        if (!own) {
          console.warn("[stripe webhook] invoice.paid: no invoice matches stripe_invoice_id", inv.id);
          break;
        }
        await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date(inv.status_transitions?.paid_at
              ? inv.status_transitions.paid_at * 1000
              : Date.now()).toISOString(),
            amount_paid_cents: inv.amount_paid ?? 0,
            stripe_payment_link: inv.hosted_invoice_url ?? null,
            stripe_invoice_pdf: inv.invoice_pdf ?? null,
          })
          .eq("id", own.id)
          .eq("tenant_id", own.tenant_id);
        await notifyTenantOfInvoiceEvent("invoice.paid", inv);
        break;
      }
      case "invoice.created": {
        // Mirror a subscription's recurring cycle into our DB. We only
        // care about Stripe-originated invoices (no bolivai_invoice_id in
        // metadata) tied to a subscription we already know about.
        const inv = event.data.object as Stripe.Invoice;
        if (inv.metadata?.bolivai_invoice_id) break;
        const subId = typeof inv.subscription === "string"
          ? inv.subscription
          : (inv.subscription as { id?: string } | null)?.id ?? null;
        if (!subId) break;

        // Find the parent BolivAI invoice that owns this subscription so
        // we can copy tenant_id + customer + currency.
        const { data: parentRow } = await supabase
          .from("invoices")
          .select(
            "tenant_id, customer_name, customer_email, customer_phone, customer_address, currency, reservation_id, notes, recurrence_interval, recurrence_interval_count",
          )
          .eq("stripe_subscription_id", subId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!parentRow) break;

        const parent = parentRow as {
          tenant_id: string;
          customer_name: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          customer_address: string | null;
          currency: string;
          reservation_id: string | null;
          notes: string | null;
          recurrence_interval: string | null;
          recurrence_interval_count: number | null;
        };

        const { data: numberRow } = await supabase.rpc("next_invoice_number", {
          p_tenant_id: parent.tenant_id,
        });

        const { data: newInv } = await supabase
          .from("invoices")
          .insert({
            tenant_id: parent.tenant_id,
            reservation_id: parent.reservation_id,
            customer_name: parent.customer_name,
            customer_email: parent.customer_email,
            customer_phone: parent.customer_phone,
            customer_address: parent.customer_address,
            currency: parent.currency,
            status: "open" as const,
            number: numberRow ?? null,
            sent_at: new Date(inv.created * 1000).toISOString(),
            due_date: inv.due_date
              ? new Date(inv.due_date * 1000).toISOString().slice(0, 10)
              : null,
            stripe_invoice_id: inv.id,
            stripe_subscription_id: subId,
            stripe_customer_id:
              typeof inv.customer === "string"
                ? inv.customer
                : (inv.customer as { id?: string } | null)?.id ?? null,
            stripe_payment_link: inv.hosted_invoice_url ?? null,
            stripe_invoice_pdf: inv.invoice_pdf ?? null,
            notes: parent.notes,
            is_recurring: true,
            recurrence_interval: parent.recurrence_interval,
            recurrence_interval_count: parent.recurrence_interval_count,
          })
          .select("id")
          .maybeSingle();

        // Mirror the line items so list views and PDFs render correctly
        const newInvId = (newInv as { id?: string } | null)?.id;
        if (newInvId && inv.lines?.data?.length) {
          const items = inv.lines.data.map((line, idx) => ({
            invoice_id: newInvId,
            position: idx,
            description: line.description ?? "Cargo recurrente",
            quantity: line.quantity ?? 1,
            unit_price_cents:
              line.quantity && line.quantity > 0
                ? Math.round((line.amount ?? 0) / line.quantity)
                : line.amount ?? 0,
            tax_rate_bps: 0,
            amount_cents: line.amount ?? 0,
          }));
          await supabase.from("invoice_items").insert(items);
        }
        break;
      }
      case "customer.subscription.deleted":
      case "customer.subscription.paused": {
        const sub = event.data.object as Stripe.Subscription;
        // No dedicated subscription row — mark the recurrence as ended so we
        // stop expecting new cycles. We intentionally do NOT change invoice
        // status: an already-open/unpaid invoice stays owed (the customer
        // still owes it); only future cycles stop.
        await scopeInvoiceWrite(
          supabase,
          "stripe_subscription_id",
          sub.id,
          { recurrence_end_date: new Date().toISOString().slice(0, 10) },
          true,
        );
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.id) await scopeInvoiceWrite(supabase, "stripe_invoice_id", inv.id, { status: "past_due" });
        await notifyTenantOfInvoiceEvent("invoice.payment_failed", inv);
        break;
      }
      case "invoice.marked_uncollectible": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.id) await scopeInvoiceWrite(supabase, "stripe_invoice_id", inv.id, { status: "uncollectible" });
        break;
      }
      case "invoice.voided": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.id) await scopeInvoiceWrite(supabase, "stripe_invoice_id", inv.id, { status: "void" });
        break;
      }
      case "invoice.finalized": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.id)
          await scopeInvoiceWrite(supabase, "stripe_invoice_id", inv.id, {
            stripe_payment_link: inv.hosted_invoice_url ?? null,
            stripe_invoice_pdf: inv.invoice_pdf ?? null,
          });
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await supabase
          .from("tenants")
          .update({
            stripe_account_country: acct.country ?? null,
            stripe_charges_enabled: acct.charges_enabled ?? false,
            stripe_payouts_enabled: acct.payouts_enabled ?? false,
            stripe_account_updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", acct.id);
        break;
      }
      case "account.application.deauthorized": {
        // Stripe doesn't include the account id in this event body, but
        // does provide it as the event's `account` field at the top level.
        const acctId = event.account;
        if (acctId) {
          await supabase
            .from("tenants")
            .update({
              stripe_account_id: null,
              stripe_charges_enabled: false,
              stripe_payouts_enabled: false,
              stripe_account_updated_at: new Date().toISOString(),
            })
            .eq("stripe_account_id", acctId);
        }
        break;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe webhook] handler failed", event.type, msg);
    return NextResponse.json({ received: true, warning: msg });
  }

  return NextResponse.json({ received: true });
}
