import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/admin/sparkline";
import { cn } from "@/lib/utils";

/**
 * KPI stat card: big value + period-over-period delta badge + mini sparkline.
 * Presentational — all strings come pre-translated from the page. Reuses the
 * hand-rolled SVG Sparkline (server-friendly, currentColor) for the trend.
 */
export function KpiCard({
  label,
  value,
  deltaPct,
  deltaLabel,
  spark,
  icon: Icon,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  deltaLabel: string;
  spark?: number[];
  icon?: LucideIcon;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card className="p-5 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{value}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        {deltaPct === null ? (
          <span className="text-xs text-muted-foreground">{deltaLabel}</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(deltaPct)}%
            <span className="ml-1 font-normal text-muted-foreground">{deltaLabel}</span>
          </span>
        )}
        {spark && spark.length > 1 ? (
          <div className={cn(up ? "text-emerald-500/80" : "text-rose-500/80")}>
            <Sparkline points={spark} width={76} height={28} showZeroLine={false} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
