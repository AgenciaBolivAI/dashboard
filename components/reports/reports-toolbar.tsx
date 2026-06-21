"use client";

import { Printer, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ReportData } from "@/lib/queries/reports";

/**
 * Report actions: Print/PDF (the browser's print dialog → "Save as PDF",
 * styled by the print stylesheet) and a client-built CSV download of the
 * report's figures. No server round-trip — the data is already on the page.
 */
export function ReportsToolbar({ data }: { data: ReportData }) {
  const t = useTranslations("reports");

  function downloadCsv() {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[][] = [["section", "metric", "value"]];
    lines.push(["kpi", "total_leads", String(data.totalLeads)]);
    lines.push(["kpi", "conversion_rate_pct", data.conversionRatePct == null ? "" : String(data.conversionRatePct)]);
    lines.push(["kpi", "weighted_forecast_cents", String(data.weightedForecastCents)]);
    lines.push(["kpi", "open_pipeline_cents", String(data.openPipelineCents)]);
    lines.push(["kpi", "won_value_cents", String(data.wonValueCents)]);
    lines.push(["kpi", "revenue_total_cents", String(data.revenueTotalCents)]);
    lines.push(["kpi", "currency", data.currency]);
    for (const f of data.funnel) lines.push(["funnel", f.status, `${f.count} (${f.pct}%)`]);
    for (const s of data.pipelineByStage)
      lines.push(["pipeline_value_cents", s.status, `${s.value_cents} (${s.count})`]);
    for (const r of data.revenueTrend) lines.push(["revenue_by_day", r.day, String(r.count)]);

    const csv = lines.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${data.period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download className="size-4" />
        {t("export_csv")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        {t("export_pdf")}
      </Button>
    </div>
  );
}
