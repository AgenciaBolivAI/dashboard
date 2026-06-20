"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** Clamp an arbitrary page-size to one of the allowed options. */
export function clampPageSize(raw: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  if (!raw) return fallback;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : fallback;
}

/**
 * URL-driven pager. Reads `page` + `pageSize` from the query string and writes
 * them back (preserving every other param). Shows "showing X–Y of Z", a
 * per-page selector, and prev/next. Pair with a server query that uses
 * `count: "exact"` + `.range()` so `total` reflects the whole filtered set.
 *
 * Changing the page size resets to page 1 (a deep page would otherwise fall
 * out of range). The parent page should likewise reset `page` when filters or
 * search change.
 */
export function Pagination({
  total,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  className,
}: {
  total: number;
  defaultPageSize?: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const t = useTranslations("common");
  const locale = useLocale();

  const pageSize = clampPageSize(Number(sp.get("pageSize")) || undefined, defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(sp.get("page")) || 1), totalPages);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const fmt = (n: number) => n.toLocaleString(locale);

  function push(next: { page?: number; pageSize?: number }) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (next.pageSize != null) {
      params.set("pageSize", String(next.pageSize));
      params.set("page", "1"); // a new page size invalidates the old offset
    }
    if (next.page != null) params.set("page", String(next.page));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
  }

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>{t("pg_per_page")}</span>
        <select
          value={pageSize}
          onChange={(e) => push({ pageSize: Number(e.target.value) })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label={t("pg_per_page")}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="tabular-nums">
          {t("pg_showing", { from: fmt(from), to: fmt(to), total: fmt(total) })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {t("pg_page_of", { page: fmt(page), pages: fmt(totalPages) })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => push({ page: page - 1 })}
            disabled={page <= 1}
            className="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
            aria-label={t("pg_prev")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => push({ page: page + 1 })}
            disabled={page >= totalPages}
            className="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
            aria-label={t("pg_next")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
