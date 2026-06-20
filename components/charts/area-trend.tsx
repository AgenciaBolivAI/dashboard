"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Themed area trend chart (Recharts). Colors reference the CSS theme tokens
 * (`--primary`, `--border`, `--muted-foreground`) so the chart flips with
 * light/dark automatically and respects the tenant's brand green.
 */
export type AreaPoint = { day: string; count: number };

function fmtDay(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AreaTrend({
  data,
  locale = "es",
  height = 260,
  valueLabel,
}: {
  data: AreaPoint[];
  locale?: string;
  height?: number;
  valueLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="areaTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickFormatter={(d: string) => fmtDay(d, locale)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          width={34}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          content={<TrendTooltip locale={locale} valueLabel={valueLabel} />}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#areaTrendFill)"
          dot={false}
          activeDot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
  locale,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  locale: string;
  valueLabel: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{fmtDay(label, locale)}</p>
      <p className="mt-0.5 text-muted-foreground">
        {valueLabel}:{" "}
        <span className="font-semibold text-foreground">{payload[0]!.value.toLocaleString(locale)}</span>
      </p>
    </div>
  );
}
