"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ChevronRight, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAdminKpiDetail, type KpiDetail } from "@/lib/actions/admin-kpi-detail";
import { getTenantKpiDetail } from "@/lib/actions/tenant-kpi-detail";

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function buildCsv(detail: KpiDetail): string {
  const head = detail.columns.map((c) => csvEscape(c.label)).join(",");
  const lines = detail.rows.map((r) =>
    detail.columns.map((c) => csvEscape(String(r[c.key] ?? ""))).join(","),
  );
  return [head, ...lines].join("\n");
}
function downloadCsv(name: string, csv: string) {
  // Prepend a BOM so Excel reads UTF-8 (accented business names) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "export";

/**
 * A clickable KPI tile that opens a dialog and lazy-loads the rows behind the
 * number. Two modes:
 *  - admin (no `tenantId`): platform-wide data via getAdminKpiDetail (admin-gated).
 *  - tenant (`tenantId` set): that tenant's own data via getTenantKpiDetail
 *    (membership-gated + RLS + tenant_id filter — never crosses tenants).
 *
 * Pass `children` (a pre-rendered KpiCard) to wrap an existing card, or omit it
 * to render a built-in admin-style card from icon/label/value/subtitle.
 */
export function KpiDrill({
  icon,
  label,
  value,
  subtitle,
  valueClassName,
  metric,
  window,
  tenantId,
  dialogTitle,
  loadingLabel,
  children,
}: {
  icon?: React.ReactNode;
  label?: string;
  value?: string;
  subtitle?: string;
  valueClassName?: string;
  metric: string;
  window: string;
  tenantId?: string;
  dialogTitle: string;
  loadingLabel: string;
  children?: React.ReactNode;
}) {
  const td = useTranslations("kpi_drill");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<KpiDetail | null>(null);
  const [pending, start] = useTransition();

  const hasEmail = !!detail?.columns.some((c) => c.key === "email");
  function copyEmails() {
    if (!detail) return;
    const emails = detail.rows.map((r) => r.email).filter(Boolean);
    if (!emails.length) return;
    navigator.clipboard.writeText(emails.join(", "));
    toast.success(td("copied", { count: emails.length }));
  }
  function exportCsv() {
    if (!detail) return;
    downloadCsv(`${slugify(dialogTitle)}-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(detail));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !detail) {
      start(async () => {
        const d = tenantId
          ? await getTenantKpiDetail(tenantId, metric, window)
          : await getAdminKpiDetail(metric, window);
        setDetail(d);
      });
    }
  }

  const open0 = () => onOpenChange(true);
  const keyOpen = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenChange(true);
    }
  };

  return (
    <>
      {children ? (
        // Wrapper mode: make the provided card clickable without changing its look.
        <div
          role="button"
          tabIndex={0}
          onClick={open0}
          onKeyDown={keyOpen}
          className="cursor-pointer rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-ring [&>*]:transition hover:[&>*]:border-primary/40"
        >
          {children}
        </div>
      ) : (
        <Card
          role="button"
          tabIndex={0}
          onClick={open0}
          onKeyDown={keyOpen}
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
      )}

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
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground tabular-nums">{detail.rows.length}</span>
              <div className="flex gap-2">
                {hasEmail ? (
                  <Button type="button" variant="outline" size="sm" onClick={copyEmails} className="gap-1.5">
                    <Copy className="size-3.5" />
                    {td("copy_emails")}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
                  <Download className="size-3.5" />
                  {td("export_csv")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
