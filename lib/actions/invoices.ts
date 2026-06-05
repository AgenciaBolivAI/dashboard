"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe, STRIPE_PLATFORM_FEE_BPS } from "@/lib/stripe";

export type InvoiceActionState = {
  error: string | null;
  success?: boolean;
  invoiceId?: string;
};

const itemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive().max(10_000),
  unit_price_cents: z.coerce.number().int().min(0).max(1_000_000_00),
  tax_rate_bps: z.coerce.number().int().min(0).max(10_000),
  service_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});

const upsertSchema = z.object({
  tenant_id: z.string().uuid(),
  invoice_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  reservation_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  customer_name: z.string().trim().max(200).optional().transform((v) => v || null),
  customer_email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
  customer_phone: z.string().trim().max(40).optional().transform((v) => v || null),
  customer_address: z.string().trim().max(500).optional().transform((v) => v || null),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || null),
  notes: z.string().max(2000).optional().transform((v) => v || null),
  // recurring
  is_recurring: z.string().optional().transform((v) => v === "on" || v === "true"),
  recurrence_interval: z.enum(["week", "month", "year"]).optional().or(z.literal("")).transform((v) => v || null),
  recurrence_interval_count: z.coerce.number().int().min(1).max(99).optional(),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || null),
  // items: JSON-encoded array
  items_json: z.string(),
});

type ItemInput = z.infer<typeof itemSchema>;

/**
 * Create a new draft OR replace an existing draft's contents.
 * Items are wiped + reinserted (simpler than diffing for this UX).
 */
export async function upsertInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const parsed = upsertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  let items: ItemInput[];
  try {
    items = z.array(itemSchema).min(1, "Agrega al menos un item").parse(JSON.parse(data.items_json));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Items inválidos" };
  }

  await requireUser();
  await requireTenantAccess(data.tenant_id, { minRole: "operator" });

  const supabase = await createClient();

  // Reject editing a non-draft invoice
  let invoiceId = data.invoice_id;
  if (invoiceId) {
    const { data: existing } = await supabase
      .from("invoices")
      .select("status, tenant_id")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!existing) return { error: "Factura no encontrada" };
    const row = existing as { status: string; tenant_id: string };
    if (row.tenant_id !== data.tenant_id) return { error: "Factura de otro tenant" };
    if (row.status !== "draft") {
      return { error: "Solo se pueden editar facturas en borrador" };
    }
  }

  const headerPayload = {
    tenant_id: data.tenant_id,
    reservation_id: data.reservation_id,
    customer_name: data.customer_name,
    customer_email: data.customer_email,
    customer_phone: data.customer_phone,
    customer_address: data.customer_address,
    currency: data.currency,
    due_date: data.due_date,
    notes: data.notes,
    is_recurring: data.is_recurring,
    recurrence_interval: data.is_recurring ? data.recurrence_interval : null,
    recurrence_interval_count: data.is_recurring ? data.recurrence_interval_count ?? 1 : null,
    recurrence_end_date: data.is_recurring ? data.recurrence_end_date : null,
    status: "draft" as const,
  };

  if (!invoiceId) {
    const { data: ins, error } = await supabase
      .from("invoices")
      .insert(headerPayload)
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    invoiceId = (ins as { id: string }).id;
  } else {
    const { error } = await supabase
      .from("invoices")
      .update(headerPayload)
      .eq("id", invoiceId);
    if (error) return { error: error.message };
    const { error: delErr } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", invoiceId);
    if (delErr) return { error: delErr.message };
  }

  const itemRows = items.map((it, idx) => ({
    invoice_id: invoiceId,
    position: idx,
    description: it.description,
    quantity: it.quantity,
    unit_price_cents: it.unit_price_cents,
    tax_rate_bps: it.tax_rate_bps,
    amount_cents: Math.round(it.quantity * it.unit_price_cents),
    service_id: it.service_id,
  }));

  const { error: insItemsErr } = await supabase.from("invoice_items").insert(itemRows);
  if (insItemsErr) return { error: insItemsErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, invoiceId: invoiceId! };
}

/**
 * Push the draft to Stripe via the tenant's Connect account. Creates a
 * Customer + Invoice (+ Subscription if recurring), then finalizes so
 * Stripe sends the hosted invoice email automatically.
 */
export async function sendInvoiceAction(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const [invRes, itemsRes, tenantRes] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
    supabase
      .from("tenants")
      .select("stripe_account_id, stripe_charges_enabled, name, invoice_footer")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);

  if (!invRes.data) return { error: "Factura no encontrada" };
  const invoice = invRes.data as Record<string, unknown> & {
    id: string;
    status: string;
    currency: string;
    customer_email: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_address: string | null;
    notes: string | null;
    is_recurring: boolean;
    recurrence_interval: "week" | "month" | "year" | null;
    recurrence_interval_count: number | null;
    recurrence_end_date: string | null;
    due_date: string | null;
    total_cents: number;
  };
  const items = (itemsRes.data ?? []) as Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    tax_rate_bps: number;
  }>;
  const tenant = tenantRes.data as
    | { stripe_account_id: string | null; stripe_charges_enabled: boolean; name: string; invoice_footer: string | null }
    | null;

  if (invoice.status !== "draft") {
    return { error: "Esta factura ya fue enviada" };
  }
  if (items.length === 0) {
    return { error: "Agrega al menos un item antes de enviar" };
  }
  if (!invoice.customer_email) {
    return { error: "Falta el email del cliente — Stripe lo necesita para enviar la factura" };
  }
  if (!tenant?.stripe_account_id || !tenant.stripe_charges_enabled) {
    return { error: "Conecta tu cuenta de Stripe en Ajustes → Facturación antes de enviar facturas" };
  }

  const stripe = getStripe();
  const stripeAccount = tenant.stripe_account_id;

  try {
    // 1. Find or create the Stripe Customer on the connected account
    let stripeCustomerId = invoice.stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email: invoice.customer_email,
          name: invoice.customer_name ?? undefined,
          phone: invoice.customer_phone ?? undefined,
        },
        { stripeAccount },
      );
      stripeCustomerId = customer.id;
    }

    let stripeInvoiceId: string;
    let hostedUrl: string | null = null;
    let stripeSubscriptionId: string | null = null;

    if (invoice.is_recurring && invoice.recurrence_interval) {
      // Recurring: build a Subscription. Stripe will generate invoices on each cycle.
      // First, create a Price for each item (one-time vs recurring requires Price objects).
      const subscriptionItems = await Promise.all(
        items.map(async (it) => {
          const price = await stripe.prices.create(
            {
              currency: invoice.currency.toLowerCase(),
              unit_amount: it.unit_price_cents,
              product_data: { name: it.description },
              recurring: {
                interval: invoice.recurrence_interval!,
                interval_count: invoice.recurrence_interval_count ?? 1,
              },
            },
            { stripeAccount },
          );
          return { price: price.id, quantity: Math.round(it.quantity) };
        }),
      );

      const sub = await stripe.subscriptions.create(
        {
          customer: stripeCustomerId,
          items: subscriptionItems,
          application_fee_percent: STRIPE_PLATFORM_FEE_BPS / 100,
          collection_method: "send_invoice",
          days_until_due: 7,
          ...(invoice.recurrence_end_date
            ? { cancel_at: Math.floor(new Date(invoice.recurrence_end_date).getTime() / 1000) }
            : {}),
          metadata: { bolivai_invoice_id: invoice.id },
        },
        { stripeAccount },
      );

      stripeSubscriptionId = sub.id;
      // The first invoice created by the subscription
      stripeInvoiceId =
        typeof sub.latest_invoice === "string" ? sub.latest_invoice : (sub.latest_invoice as { id?: string } | null)?.id ?? "";
      if (stripeInvoiceId) {
        const inv = await stripe.invoices.retrieve(stripeInvoiceId, { stripeAccount });
        hostedUrl = inv.hosted_invoice_url ?? null;
      }
    } else {
      // One-off invoice
      const applicationFeeCents = Math.round(
        (invoice.total_cents * STRIPE_PLATFORM_FEE_BPS) / 10_000,
      );

      const stripeInv = await stripe.invoices.create(
        {
          customer: stripeCustomerId,
          collection_method: "send_invoice",
          days_until_due: 7,
          currency: invoice.currency.toLowerCase(),
          application_fee_amount: applicationFeeCents,
          footer: tenant.invoice_footer ?? undefined,
          metadata: { bolivai_invoice_id: invoice.id },
        },
        { stripeAccount },
      );

      // Add items
      for (const it of items) {
        const lineAmount = Math.round(it.quantity * it.unit_price_cents);
        await stripe.invoiceItems.create(
          {
            customer: stripeCustomerId,
            invoice: stripeInv.id,
            currency: invoice.currency.toLowerCase(),
            amount: lineAmount,
            description: `${it.description}${it.quantity !== 1 ? ` ×${it.quantity}` : ""}`,
          },
          { stripeAccount },
        );
      }

      // Finalize → triggers Stripe to send the email
      const finalized = await stripe.invoices.finalizeInvoice(stripeInv.id!, {}, { stripeAccount });
      await stripe.invoices.sendInvoice(stripeInv.id!, {}, { stripeAccount });

      stripeInvoiceId = finalized.id!;
      hostedUrl = finalized.hosted_invoice_url ?? null;
    }

    // Allocate a human-readable number
    const { data: numberRow } = await supabase.rpc("next_invoice_number", {
      p_tenant_id: tenantId,
    });
    const number = (numberRow as string | null) ?? null;

    const applicationFeeCents = Math.round(
      (invoice.total_cents * STRIPE_PLATFORM_FEE_BPS) / 10_000,
    );

    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        status: "open",
        number,
        sent_at: new Date().toISOString(),
        stripe_invoice_id: stripeInvoiceId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_link: hostedUrl,
        application_fee_cents: applicationFeeCents,
      })
      .eq("id", invoice.id);
    if (updErr) return { error: updErr.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Stripe rechazó la factura: ${msg}` };
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, invoiceId };
}

export async function voidInvoiceAction(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("invoices")
    .select("status, stripe_invoice_id")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) return { error: "Factura no encontrada" };

  const row = existing as { status: string; stripe_invoice_id: string | null };
  if (row.status === "paid") {
    return { error: "No se puede anular una factura ya pagada" };
  }

  // If it was sent to Stripe, try to void there too (best-effort)
  if (row.stripe_invoice_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("stripe_account_id")
      .eq("id", tenantId)
      .maybeSingle();
    const stripeAccount = (tenant as { stripe_account_id?: string } | null)?.stripe_account_id;
    if (stripeAccount) {
      try {
        await getStripe().invoices.voidInvoice(row.stripe_invoice_id, {}, { stripeAccount });
      } catch {
        // Soft-fail — still mark void locally
      }
    }
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function cancelSubscriptionAction(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const [invRes, tenantRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("stripe_subscription_id")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenants")
      .select("stripe_account_id")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);

  const subId = (invRes.data as { stripe_subscription_id?: string } | null)
    ?.stripe_subscription_id;
  const stripeAccount = (tenantRes.data as { stripe_account_id?: string } | null)
    ?.stripe_account_id;

  if (!subId) return { error: "Esta factura no tiene una suscripción activa" };
  if (!stripeAccount) return { error: "Stripe no está conectado" };

  try {
    await getStripe().subscriptions.cancel(subId, { stripeAccount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Stripe rechazó la cancelación: ${msg}` };
  }

  await supabase
    .from("invoices")
    .update({ recurrence_end_date: new Date().toISOString().slice(0, 10) })
    .eq("stripe_subscription_id", subId)
    .eq("is_recurring", true);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function markPaidManuallyAction(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("invoices")
    .select("status, total_cents")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) return { error: "Factura no encontrada" };
  const row = existing as { status: string; total_cents: number };
  if (row.status === "paid") return { error: "Ya está marcada como pagada" };
  if (row.status === "void") return { error: "Esta factura fue anulada" };

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      amount_paid_cents: row.total_cents,
    })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Server action used as the form action on the "Crear factura" button
 * inside the reservation dialog. Creates a one-line draft pre-filled with
 * the reservation's service and customer info, then redirects to the
 * editor.
 */
export async function createInvoiceFromReservationAction(
  formData: FormData,
): Promise<void> {
  const tenantSlug = String(formData.get("tenant_slug") ?? "");
  const tenantId = String(formData.get("tenant_id") ?? "");
  const reservationId = String(formData.get("reservation_id") ?? "");
  if (!tenantSlug || !tenantId || !reservationId) {
    redirect(`/dashboard/${tenantSlug}/calendar?invoice_error=missing_data`);
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { data: resv } = await supabase
    .from("reservations")
    .select(
      "id, customer_name, customer_email, customer_phone, service_id, services(name, price_amount, price_currency, duration_min)",
    )
    .eq("id", reservationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!resv) {
    redirect(`/dashboard/${tenantSlug}/calendar?invoice_error=reservation_not_found`);
  }
  const r = resv as Record<string, unknown> & {
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    service_id: string | null;
    services: { name: string | null; price_amount: number | null; price_currency: string | null; duration_min: number | null } | null;
  };

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("invoice_default_currency")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantCurrency = (tenantRow as { invoice_default_currency?: string } | null)?.invoice_default_currency ?? "USD";

  const currency = r.services?.price_currency ?? tenantCurrency;
  const unitPriceCents = Math.round(((r.services?.price_amount ?? 0) as number) * 100);

  const { data: ins, error } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      reservation_id: reservationId,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone,
      currency,
      status: "draft" as const,
    })
    .select("id")
    .maybeSingle();
  if (error || !ins) {
    redirect(`/dashboard/${tenantSlug}/calendar?invoice_error=${encodeURIComponent(error?.message ?? "insert_failed")}`);
  }
  const invoiceId = (ins as { id: string }).id;

  await supabase.from("invoice_items").insert({
    invoice_id: invoiceId,
    position: 0,
    description: r.services?.name ?? "Consulta",
    quantity: 1,
    unit_price_cents: unitPriceCents,
    tax_rate_bps: 0,
    amount_cents: unitPriceCents,
    service_id: r.service_id,
  });

  redirect(`/dashboard/${tenantSlug}/invoices/${invoiceId}`);
}
