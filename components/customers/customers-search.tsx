"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserSearch, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Realtime customer search. Debounces the URL update by 200ms so we don't
 * thrash the server while the user is still typing. Falls back to a plain
 * form submit on Enter for users without JS or who want explicit submit.
 *
 * Keeps any other existing query params (?vip=1 etc.) intact when updating
 * the URL.
 */
export function CustomersSearch({
  initialValue,
}: {
  initialValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("customers");
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push a new URL when the user pauses typing for 200ms.
  useEffect(() => {
    // Skip the initial render — the URL already matches.
    if (value === initialValue) return;
    setBusy(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
      // Use a small delay before clearing busy so the spinner has a moment to show
      setTimeout(() => setBusy(false), 100);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function clear() {
    setValue("");
  }

  return (
    <div className="relative flex-1 max-w-md">
      <UserSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search_placeholder")}
        className="pl-9 pr-9"
        autoFocus
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
        {busy ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
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
