"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  upsertInvoiceAction,
  sendInvoiceAction,
  type InvoiceActionState,
} from "@/lib/actions/invoices";
import type { Invoice, InvoiceItem } from "@/lib/queries/invoices";

type Service = {
  id: string;
  name: string;
  price_amount: number | null;
  price_currency: string | null;
  duration_min: number | null;
};

type TenantCtx = {
  id: string;
  slug: string;
  invoice_default_currency: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
};

type EditableItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_bps: number;
  service_id: string | null;
};

const initial: InvoiceActionState = { error: null };
const CURRENCIES = ["USD", "EUR", "GBP", "MXN", "BRL", "CLP", "PEN", "COP", "ARS", "CAD", "AUD"];

export function InvoiceEditor({
  tenant,
  services,
  invoice,
  items: itemsFromDb,
}: {
  tenant: TenantCtx;
  services: Service[];
  invoice: Invoice | null;
  items: InvoiceItem[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(upsertInvoiceAction, initial);
  const [sending, startSend] = useTransition();

  const [items, setItems] = useState<EditableItem[]>(
    itemsFromDb.length > 0
      ? itemsFromDb.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit_price_cents: it.unit_price_cents,
          tax_rate_bps: it.tax_rate_bps,
          service_id: it.service_id,
        }))
      : [{ description: "", quantity: 1, unit_price_cents: 0, tax_rate_bps: 0, service_id: null }],
  );
  const [currency, setCurrency] = useState(invoice?.currency ?? tenant.invoice_default_currency);
  const [isRecurring, setIsRecurring] = useState(invoice?.is_recurring ?? false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success("Borrador guardado");
      if (state.invoiceId && !invoice) {
        router.push(`/dashboard/${tenant.slug}/invoices/${state.invoiceId}`);
      }
    }
  }, [state, router, tenant.slug, invoice]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      const line = Math.round(it.quantity * it.unit_price_cents);
      subtotal += line;
      tax += Math.round((line * it.tax_rate_bps) / 10_000);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  function patchItem(idx: number, patch: Partial<EditableItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));
  }
  function addItem() {
    setItems((arr) => [...arr, { description: "", quantity: 1, unit_price_cents: 0, tax_rate_bps: 0, service_id: null }]);
  }
  function applyServiceToItem(idx: number, serviceId: string) {
    if (!serviceId) {
      patchItem(idx, { service_id: null });
      return;
    }
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    patchItem(idx, {
      service_id: svc.id,
      description: svc.name,
      unit_price_cents: Math.round((svc.price_amount ?? 0) * 100),
    });
  }

  async function handleSend() {
    if (!invoice) {
      toast.error("Guarda el borrador primero");
      return;
    }
    if (!confirm("Una vez enviada no podrás editarla. ¿Continuar?")) return;
    startSend(async () => {
      const res = await sendInvoiceAction(tenant.id, invoice.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Factura enviada");
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenant_id" value={tenant.id} />
      <input type="hidden" name="invoice_id" value={invoice?.id ?? ""} />
      <input type="hidden" name="reservation_id" value={invoice?.reservation_id ?? ""} />
      <input type="hidden" name="items_json" value={JSON.stringify(items)} />

      {/* Stripe disconnected warning */}
      {!tenant.stripe_account_id || !tenant.stripe_charges_enabled ? (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-md p-3">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            Puedes guardar el borrador, pero para enviarla necesitas conectar Stripe en{" "}
            Ajustes → Facturación.
          </span>
        </div>
      ) : null}

      {/* Customer card */}
      <Section title="Cliente">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Nombre"
            name="customer_name"
            defaultValue={invoice?.customer_name ?? ""}
            placeholder="Nombre completo"
            required
          />
          <Field
            label="Email"
            name="customer_email"
            type="email"
            defaultValue={invoice?.customer_email ?? ""}
            placeholder="cliente@email.com"
            required
          />
          <Field
            label="Teléfono"
            name="customer_phone"
            defaultValue={invoice?.customer_phone ?? ""}
            placeholder="+1…"
          />
          <Field
            label="Vence"
            name="due_date"
            type="date"
            defaultValue={invoice?.due_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer_address">Dirección (opcional)</Label>
          <textarea
            id="customer_address"
            name="customer_address"
            defaultValue={invoice?.customer_address ?? ""}
            rows={2}
            className={txtCls}
          />
        </div>
      </Section>

      {/* Items */}
      <Section title="Items">
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 items-end rounded-md border border-border p-3"
            >
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <Label className="text-xs">Descripción</Label>
                {services.length > 0 ? (
                  <select
                    value={it.service_id ?? ""}
                    onChange={(e) => applyServiceToItem(idx, e.target.value)}
                    className={cn(selectCls, "mb-1 text-xs")}
                  >
                    <option value="">— Elegir servicio (opcional) —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Input
                  value={it.description}
                  onChange={(e) => patchItem(idx, { description: e.target.value })}
                  placeholder="Consulta, sesión, etc."
                  required
                />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs">Cantidad</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={it.quantity}
                  onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs">Precio unit.</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(it.unit_price_cents / 100).toString()}
                  onChange={(e) => patchItem(idx, {
                    unit_price_cents: Math.round((Number(e.target.value) || 0) * 100),
                  })}
                />
              </div>
              <div className="col-span-3 sm:col-span-2 space-y-1">
                <Label className="text-xs">IVA %</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={(it.tax_rate_bps / 100).toString()}
                  onChange={(e) => patchItem(idx, {
                    tax_rate_bps: Math.round((Number(e.target.value) || 0) * 100),
                  })}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(idx)}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={items.length === 1}
                  title="Eliminar item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="col-span-12 text-right text-xs text-muted-foreground -mt-1">
                Importe: {formatMoney(Math.round(it.quantity * it.unit_price_cents), currency)}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="size-4" />
            Añadir item
          </Button>
        </div>
      </Section>

      {/* Currency + recurring + totals */}
      <Section title="Totales">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="currency">Moneda</Label>
            <select
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Total</Label>
            <div className="h-10 rounded-md border border-input bg-secondary/20 px-3 py-2 text-sm flex items-center justify-end font-medium tabular-nums">
              {formatMoney(totals.total, currency)}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm pt-2">
          <input
            type="checkbox"
            name="is_recurring"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span>Cobro recurrente (suscripción)</span>
        </label>

        {isRecurring ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border border-border bg-secondary/20 p-3">
            <div className="space-y-2">
              <Label htmlFor="recurrence_interval">Frecuencia</Label>
              <select
                id="recurrence_interval"
                name="recurrence_interval"
                defaultValue={invoice?.recurrence_interval ?? "month"}
                className={selectCls}
              >
                <option value="week">Semanal</option>
                <option value="month">Mensual</option>
                <option value="year">Anual</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence_interval_count">Cada</Label>
              <Input
                id="recurrence_interval_count"
                name="recurrence_interval_count"
                type="number"
                min="1"
                max="99"
                defaultValue={invoice?.recurrence_interval_count ?? 1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence_end_date">Hasta (opcional)</Label>
              <Input
                id="recurrence_end_date"
                name="recurrence_end_date"
                type="date"
                defaultValue={invoice?.recurrence_end_date ?? ""}
              />
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Notas">
        <textarea
          name="notes"
          defaultValue={invoice?.notes ?? ""}
          rows={3}
          placeholder="Términos, agradecimiento, datos bancarios alternativos…"
          className={txtCls}
        />
      </Section>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background border-t border-border py-3 -mx-6 px-6">
        <Button type="submit" variant="outline" disabled={pending || sending}>
          {pending ? "Guardando…" : "Guardar borrador"}
        </Button>
        <Button
          type="button"
          disabled={!invoice || pending || sending}
          onClick={handleSend}
        >
          <Send className="size-4" />
          {sending ? "Enviando…" : "Enviar al cliente"}
        </Button>
      </div>
    </form>
  );
}

const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const txtCls = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}
