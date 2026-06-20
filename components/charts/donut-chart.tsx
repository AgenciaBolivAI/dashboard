"use client";

import { useLocale } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/**
 * Themed donut + legend (Recharts) with a premium treatment: per-segment
 * gradients, rounded caps, a soft glow (dark), and a glowing center total.
 * The top slice uses the tenant brand `--primary`; the rest are a vibrant
 * palette that pops on dark and stays legible on light.
 */
export type DonutSlice = { name: string; value: number };

const PALETTE = ["hsl(var(--primary))", "#22d3ee", "#a855f7", "#f472b6", "#fbbf24"];

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  locale,
}: {
  data: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  locale?: string;
}) {
  const activeLocale = useLocale();
  const fmtLocale = locale ?? activeLocale;
  const total = data.reduce((s, d) => s + d.value, 0);
  const colored = data.map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length]! }));

  return (
    <div className="flex items-center gap-5">
      <div className="chart-glow relative shrink-0" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {colored.map((d, i) => (
                <linearGradient key={i} id={`donutGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={d.color} stopOpacity={0.68} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={total > 0 ? 3 : 0}
              cornerRadius={4}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {colored.map((d, i) => (
                <Cell key={d.name} fill={total > 0 ? `url(#donutGrad${i})` : "hsl(var(--muted))"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="glow-num font-display text-2xl font-bold leading-none tabular-nums">{centerValue}</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
        {colored.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: d.color, boxShadow: `0 0 9px -1px ${d.color}` }}
            />
            <span className="truncate text-muted-foreground">{d.name}</span>
            <span className="ml-auto shrink-0 tabular-nums font-semibold">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
        {colored.length === 0 ? (
          <li className="text-muted-foreground">
            {centerLabel}: {(0).toLocaleString(fmtLocale)}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
