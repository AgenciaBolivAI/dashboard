"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("invoices");
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
            if (!confirm(t("mark_paid_confirm"))) return;
            run(() => markPaidManuallyAction(tenantId, invoice.id), t("marked_paid"));
          }}
        >
          <CheckCircle2 className="size-4" />
          {t("mark_paid")}
        </Button>
      ) : null}
      {canVoid ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (!confirm(t("void_confirm"))) return;
            run(() => voidInvoiceAction(tenantId, invoice.id), t("invoice_voided"));
          }}
        >
          <XCircle className="size-4" />
          {t("void")}
        </Button>
      ) : null}
      {canCancelSub ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (!confirm(t("cancel_sub_confirm"))) return;
            run(() => cancelSubscriptionAction(tenantId, invoice.id), t("sub_cancelled"));
          }}
        >
          <StopCircle className="size-4" />
          {t("cancel_subscription")}
        </Button>
      ) : null}
    </>
  );
}
