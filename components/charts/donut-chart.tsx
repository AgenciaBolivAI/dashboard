"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/**
 * Themed donut + legend (Recharts). Slice colors come from a green-leaning
 * palette that reads well in both light and dark; the top slice uses the
 * tenant brand `--primary`. Center shows a total + label.
 */
export type DonutSlice = { name: string; value: number };

// First slice = brand primary (theme-aware); the rest are fixed greens/neutral
// that stay legible on both light and dark backgrounds.
const PALETTE = ["hsl(var(--primary))", "#22c55e", "#0ea5e9", "#a78bfa", "#94a3b8"];

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  locale = "es",
}: {
  data: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  locale?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const colored = data.map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length]! }));

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 144, height: 144 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={46}
              outerRadius={70}
              paddingAngle={total > 0 ? 2 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {colored.map((d) => (
                <Cell key={d.name} fill={total > 0 ? d.color : "hsl(var(--muted))"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold leading-none">{centerValue}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {colored.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate text-muted-foreground">{d.name}</span>
            <span className="ml-auto shrink-0 tabular-nums font-medium">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
        {colored.length === 0 ? (
          <li className="text-muted-foreground">{centerLabel}: {(0).toLocaleString(locale)}</li>
        ) : null}
      </ul>
    </div>
  );
}
