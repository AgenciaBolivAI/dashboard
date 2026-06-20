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
    <Card className="panel-pro group relative overflow-hidden p-5">
      {/* hover accent line */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 transition-shadow group-hover:shadow-[0_0_16px_-4px_hsl(var(--primary)/0.6)]">
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p className="glow-num mt-3 font-display text-[2rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {deltaPct === null ? (
          <span className="text-xs text-muted-foreground">{deltaLabel}</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset tabular-nums",
                up
                  ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-600 ring-rose-500/25 dark:text-rose-400",
              )}
            >
              {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(deltaPct)}%
            </span>
            <span className="text-[11px] text-muted-foreground">{deltaLabel}</span>
          </>
        )}
        {spark && spark.length > 1 ? (
          <div className={cn("ml-auto", up ? "text-emerald-500" : "text-rose-500")}>
            <Sparkline points={spark} width={76} height={28} showZeroLine={false} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
