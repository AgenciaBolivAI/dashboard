/**
 * Format an integer cents amount in a given currency, locale-aware.
 * Examples:
 *   formatMoney(123456, "USD") -> "$1,234.56"
 *   formatMoney(123456, "EUR") -> "€1,234.56"
 */
export function formatMoney(cents: number, currency: string, locale = "es"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
