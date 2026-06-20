"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ticket, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createLifetimeCodeAction,
  deactivateLifetimeCodeAction,
  type CodeState,
} from "@/lib/actions/admin-codes";
import type { LifetimeCode } from "@/lib/billing/lifetime-codes";

const initial: CodeState = { error: null };

export function LifetimeCodesManager({ codes }: { codes: LifetimeCode[] }) {
  const router = useRouter();
  const t = useTranslations("admin_codes");
  const [state, action, pending] = useActionState(createLifetimeCodeAction, initial);
  const [delPending, startDel] = useTransition();

  useEffect(() => {
    if (state.success) {
      toast.success(t("toast_code_created"));
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router, t]);

  function deactivate(id: string) {
    startDel(async () => {
      const r = await deactivateLifetimeCodeAction(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("toast_code_deactivated"));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Ticket className="size-4 text-primary" />
          <h2 className="font-display font-semibold">{t("create_code_title")}</h2>
        </div>
        <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("field_discount_pct")}>
            <Input name="percent_off" type="number" min={1} max={100} required defaultValue="50" />
          </Field>
          <Field label={t("field_code")}>
            <Input name="code" placeholder="FUNDADOR50" maxLength={40} />
          </Field>
          <Field label={t("field_label")}>
            <Input name="label" placeholder={t("field_label_placeholder")} maxLength={60} />
          </Field>
          <Field label={t("field_max_uses")}>
            <Input name="max_redemptions" type="number" min={1} placeholder="∞" />
          </Field>
          <Field label={t("field_expires")}>
            <Input name="expires_at" type="date" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t("creating") : t("create_code_button")}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("create_code_hint")}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display font-semibold">{t("codes_title")}</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("codes_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">{t("col_code")}</th>
                  <th>{t("col_discount")}</th>
                  <th>{t("col_uses")}</th>
                  <th>{t("col_expires")}</th>
                  <th>{t("col_status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-2 font-mono font-medium">
                      {c.code}
                      {c.label ? <span className="ml-2 text-xs text-muted-foreground">{c.label}</span> : null}
                    </td>
                    <td>{c.percentOff}%</td>
                    <td>
                      {c.timesRedeemed}
                      {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td>{c.expiresAt ? new Date(c.expiresAt * 1000).toLocaleDateString() : "—"}</td>
                    <td>
                      {c.active ? (
                        <Badge variant="success">{t("status_active")}</Badge>
                      ) : (
                        <Badge variant="muted">{t("status_inactive")}</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      {c.active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivate(c.id)}
                          disabled={delPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
