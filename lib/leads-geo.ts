/**
 * Lead geography helpers — extract country + state from phone numbers and
 * metadata. Used by the leads page to power Country/State filters.
 *
 * Phone number prefix → country: E.164 numbering plan. For shared prefixes
 * (+1 = US/CA/Caribbean), we treat as "US/CA" by default. Future
 * improvement: parse area code to disambiguate +1 numbers.
 *
 * State: pulled from metadata in this priority:
 *   metadata.state → metadata.region → metadata.administrative_area_level_1
 * AIMA's Google Maps scraper populates `metadata.region` from the Place's
 * adminAreaLevel1. Older leads predating that change have no state — they
 * fall back to "(unknown)".
 */

export type Country = {
  code: string;          // ISO 3166-1 alpha-2 (e.g. "US")
  prefix: string;        // E.164 prefix without "+" (e.g. "1")
  flag: string;          // emoji
  name: string;          // English name (used as key; UI may translate)
};

/**
 * Ordered LONGEST-PREFIX-FIRST so multi-digit prefixes (591=Bolivia,
 * 504=Honduras, 595=Paraguay) match before single-digit ones (1=US).
 */
export const COUNTRIES: Country[] = [
  // 3-digit
  { code: "BO", prefix: "591", flag: "🇧🇴", name: "Bolivia" },
  { code: "EC", prefix: "593", flag: "🇪🇨", name: "Ecuador" },
  { code: "PY", prefix: "595", flag: "🇵🇾", name: "Paraguay" },
  { code: "UY", prefix: "598", flag: "🇺🇾", name: "Uruguay" },
  { code: "HN", prefix: "504", flag: "🇭🇳", name: "Honduras" },
  { code: "NI", prefix: "505", flag: "🇳🇮", name: "Nicaragua" },
  { code: "CR", prefix: "506", flag: "🇨🇷", name: "Costa Rica" },
  { code: "PA", prefix: "507", flag: "🇵🇦", name: "Panama" },
  { code: "SV", prefix: "503", flag: "🇸🇻", name: "El Salvador" },
  { code: "GT", prefix: "502", flag: "🇬🇹", name: "Guatemala" },
  { code: "BZ", prefix: "501", flag: "🇧🇿", name: "Belize" },
  { code: "DO", prefix: "809", flag: "🇩🇴", name: "Dominican Republic" },
  // 2-digit
  { code: "MX", prefix: "52", flag: "🇲🇽", name: "Mexico" },
  { code: "AR", prefix: "54", flag: "🇦🇷", name: "Argentina" },
  { code: "BR", prefix: "55", flag: "🇧🇷", name: "Brazil" },
  { code: "CL", prefix: "56", flag: "🇨🇱", name: "Chile" },
  { code: "CO", prefix: "57", flag: "🇨🇴", name: "Colombia" },
  { code: "VE", prefix: "58", flag: "🇻🇪", name: "Venezuela" },
  { code: "PE", prefix: "51", flag: "🇵🇪", name: "Peru" },
  { code: "ES", prefix: "34", flag: "🇪🇸", name: "Spain" },
  { code: "FR", prefix: "33", flag: "🇫🇷", name: "France" },
  { code: "IT", prefix: "39", flag: "🇮🇹", name: "Italy" },
  { code: "DE", prefix: "49", flag: "🇩🇪", name: "Germany" },
  { code: "GB", prefix: "44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "PT", prefix: "351", flag: "🇵🇹", name: "Portugal" },
  { code: "PL", prefix: "48", flag: "🇵🇱", name: "Poland" },
  // 1-digit (matched last)
  { code: "US", prefix: "1", flag: "🇺🇸", name: "United States" },
];

export const COUNTRY_BY_CODE: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
);

/**
 * Match a phone number (with or without leading +) to its country.
 * Strips non-digits first, then longest-prefix-wins. Returns null if no match.
 */
export function getCountryFromPhone(phone: string | null | undefined): Country | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  for (const c of COUNTRIES) {
    if (digits.startsWith(c.prefix)) return c;
  }
  return null;
}

/**
 * Pull state/region out of lead metadata. AIMA's Google Maps scraper writes
 * `metadata.region` (the Place's adminAreaLevel1). Older code may have used
 * `metadata.state` or `metadata.administrative_area_level_1`.
 */
export function getStateFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const k of ["state", "region", "administrative_area_level_1"]) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
