"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Generic realtime search input. Debounces the URL `q` param update by
 * 200ms so the server re-renders as you type without thrashing. Preserves
 * every other query param (filters, pagination, etc.).
 *
 * Same pattern as CustomersSearch but reusable — used on leads + calls.
 */
export function RealtimeSearch({
  placeholder,
  paramName = "q",
}: {
  placeholder: string;
  paramName?: string;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialValue = searchParams?.get(paramName) ?? "";
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === initialValue) return;
    setBusy(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const trimmed = value.trim();
      if (trimmed) params.set(paramName, trimmed);
      else params.delete(paramName);
      params.delete("page"); // a new search resets to the first page
      const qs = params.toString();
      router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
      setTimeout(() => setBusy(false), 100);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
        {busy ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            className="text-muted-foreground hover:text-foreground transition p-0.5"
            aria-label={t("clear_search")}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
