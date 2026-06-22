"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { updateTicketAction } from "@/lib/actions/tickets";
import type { Ticket, TicketPriority, TicketStatus } from "@/lib/queries/tickets";
import { cn } from "@/lib/utils";

type Member = { user_id: string; email: string };

const STATUSES: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  low: "text-slate-500",
  medium: "text-blue-600",
  high: "text-orange-600",
  urgent: "text-red-600",
};

export function TicketsTable({
  tenantId,
  tenantSlug,
  tickets,
  members,
}: {
  tenantId: string;
  tenantSlug: string;
  tickets: Ticket[];
  members: Member[];
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function update(id: string, patch: Parameters<typeof updateTicketAction>[2]) {
    startTransition(async () => {
      const res = await updateTicketAction(tenantId, id, patch);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-3 py-2.5">{t("col_customer")}</th>
              <th className="text-left px-3 py-2.5 w-36">{t("col_status")}</th>
              <th className="text-left px-3 py-2.5 w-28">{t("col_priority")}</th>
              <th className="text-left px-3 py-2.5 w-44">{t("col_assignee")}</th>
              <th className="text-left px-3 py-2.5 w-32">{t("col_sla")}</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {tickets.map((tk) => {
              const overdue =
                tk.sla_due_at &&
                tk.ticket_status !== "resolved" &&
                tk.ticket_status !== "closed" &&
                new Date(tk.sla_due_at) < new Date();
              return (
                <tr key={tk.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <div className="font-medium truncate max-w-48">{tk.customer_name || "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{tk.customer_contact ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={tk.ticket_status ?? "open"}
                      onChange={(e) => update(tk.id, { ticket_status: e.target.value as TicketStatus })}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs w-full"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`status_${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={tk.priority ?? "medium"}
                      onChange={(e) => update(tk.id, { priority: e.target.value as TicketPriority })}
                      className={cn(
                        "rounded-md border border-input bg-background px-2 py-1 text-xs w-full font-medium",
                        PRIORITY_CLASS[tk.priority ?? "medium"],
                      )}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {t(`priority_${p}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={tk.assignee_user_id ?? ""}
                      onChange={(e) => update(tk.id, { assignee_user_id: e.target.value || null })}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs w-full"
                    >
                      <option value="">{t("unassigned")}</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {tk.sla_due_at ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          overdue ? "text-red-600 font-medium" : "text-muted-foreground",
                        )}
                      >
                        {overdue ? <AlertTriangle className="size-3" /> : null}
                        {new Date(tk.sla_due_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/dashboard/${tenantSlug}/conversations/${tk.id}`}
                      className="text-muted-foreground hover:text-primary"
                      aria-label={t("open")}
                    >
                      <ExternalLink className="size-4 inline" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
