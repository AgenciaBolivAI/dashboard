"use client";

import { useState, useTransition } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getAdminKpiDetail,
  type KpiMetric,
  type KpiDetail,
} from "@/lib/actions/admin-kpi-detail";

/**
 * A clickable admin-overview KPI tile. Visually identical to the static KpiCard
 * but opens a dialog and lazy-loads the rows behind the number (e.g. clicking
 * "Founding members" lists who paid). `icon` is passed as a pre-rendered element
 * so this client component needs no icon-name map.
 */
export function KpiDrill({
  icon,
  label,
  value,
  subtitle,
  valueClassName,
  metric,
  window,
  dialogTitle,
  loadingLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
  metric: KpiMetric;
  window: string;
  dialogTitle: string;
  loadingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<KpiDetail | null>(null);
  const [pending, start] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !detail) {
      start(async () => {
        const d = await getAdminKpiDetail(metric, window);
        setDetail(d);
      });
    }
  }

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => onOpenChange(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChange(true);
          }
        }}
        className="panel-pro group relative cursor-pointer overflow-hidden p-4 transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
          {icon}
          <span>{label}</span>
          <ChevronRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
        </div>
        <p
          className={cn(
            "font-display text-[1.6rem] font-extrabold leading-none tracking-tight tabular-nums mt-2",
            valueClassName,
          )}
        >
          {value}
        </p>
        {subtitle ? <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p> : null}
      </Card>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {pending || !detail ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {loadingLabel}
              </div>
            ) : detail.rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{detail.empty}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    {detail.columns.map((c) => (
                      <th
                        key={c.key}
                        className={cn("py-2 px-2 font-medium", c.align === "right" ? "text-right" : "text-left")}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      {detail.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "py-2 px-2 tabular-nums",
                            c.align === "right" ? "text-right" : "text-left",
                          )}
                        >
                          {row[c.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {detail && detail.rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">{detail.rows.length}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
