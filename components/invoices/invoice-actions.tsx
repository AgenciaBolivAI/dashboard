"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markPaidManuallyAction,
  voidInvoiceAction,
  cancelSubscriptionAction,
} from "@/lib/actions/invoices";
import type { Invoice } from "@/lib/queries/invoices";

export function InvoiceActions({
  tenantId,
  invoice,
}: {
  tenantId: string;
  invoice: Invoice;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const canMarkPaid = invoice.status === "open" || invoice.status === "past_due";
  const canVoid = invoice.status !== "paid" && invoice.status !== "void";
  const canCancelSub =
    !!invoice.stripe_subscription_id &&
    invoice.is_recurring &&
    !invoice.recurrence_end_date;

  function run(fn: () => Promise<{ error: string | null }>, ok: string) {
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        router.refresh();
      }
    });
  }

  return (
    <>
      {canMarkPaid ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Marcar como pagada manualmente? Útil para cobros en efectivo o transferencia.")) return;
            run(() => markPaidManuallyAction(tenantId, invoice.id), "Marcada como pagada");
          }}
        >
          <CheckCircle2 className="size-4" />
          Marcar pagada
        </Button>
      ) : null}
      {canVoid ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (!confirm("¿Anular esta factura? También se anulará en Stripe si fue enviada.")) return;
            run(() => voidInvoiceAction(tenantId, invoice.id), "Factura anulada");
          }}
        >
          <XCircle className="size-4" />
          Anular
        </Button>
      ) : null}
      {canCancelSub ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (
              !confirm(
                "¿Cancelar la suscripción? El cliente dejará de recibir facturas recurrentes. Las facturas ya emitidas no se anulan.",
              )
            )
              return;
            run(() => cancelSubscriptionAction(tenantId, invoice.id), "Suscripción cancelada");
          }}
        >
          <StopCircle className="size-4" />
          Cancelar suscripción
        </Button>
      ) : null}
    </>
  );
}
