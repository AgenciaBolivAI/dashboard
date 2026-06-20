import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Segmented period switch (Today / 7d / 30d / 90d). Plain Links that set
 * `?period=` — mirrors the Content page's status-filter pattern. The default
 * period (7d) omits the query param to keep the canonical URL clean.
 */
export function PeriodSelector({
  periods,
  active,
  basePath,
  defaultValue = "7d",
}: {
  periods: { value: string; label: string }[];
  active: string;
  basePath: string;
  defaultValue?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      {periods.map((p) => {
        const isActive = p.value === active;
        const href = p.value === defaultValue ? basePath : `${basePath}?period=${p.value}`;
        return (
          <Link
            key={p.value}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
