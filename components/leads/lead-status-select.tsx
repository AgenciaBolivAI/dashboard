"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateLeadStatusAction } from "@/lib/actions/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads-types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "bg-primary/10 text-primary border-primary/30",
  contacted: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  warm: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  converted: "bg-green-500/10 text-green-600 border-green-500/30",
  not_interested: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  do_not_contact: "bg-red-500/10 text-red-600 border-red-500/30",
  lost: "bg-muted text-muted-foreground border-border",
};

export function LeadStatusSelect({
  tenantId,
  leadId,
  currentStatus,
}: {
  tenantId: string;
  leadId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const t = useTranslations("leads");
  const [pending, startSave] = useTransition();
  const statusKey = (LEAD_STATUSES as readonly string[]).includes(currentStatus)
    ? (currentStatus as LeadStatus)
    : "new";

  function handleChange(next: string) {
    if (next === currentStatus) return;
    startSave(async () => {
      const res = await updateLeadStatusAction(tenantId, leadId, next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        value={currentStatus}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        className={cn(
          "rounded-md border px-2 py-1.5 text-sm font-medium cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-ring",
          STATUS_CLASS[statusKey],
          pending && "opacity-50",
        )}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {(() => {
              try {
                return t(`status_${s}` as `status_${LeadStatus}`);
              } catch {
                return s.replace(/_/g, " ");
              }
            })()}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
