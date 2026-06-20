import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Locale-aware formatters. `locale` defaults to "en" (a neutral fallback) but
// callers should pass the runtime locale (useLocale() / getLocale()) so dates,
// numbers and relative times render in the user's language — NOT hardcoded
// Spanish, which previously leaked Spanish formatting to every locale.
export function formatCurrency(amount: number, currency = "USD", locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

export function formatDate(d: string | Date, locale = "en") {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelative(d: string | Date, locale = "en") {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const mins = Math.round(diffMs / 60_000);
  if (Math.abs(mins) < 1) return rtf.format(0, "minute");
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return formatDate(date, locale);
}
