/**
 * i18n — locale registry + helpers.
 *
 * Locale lives in a cookie called `locale`. Default is Spanish (the
 * dashboard was originally written in es). Adding a new language =
 * (1) add the code to LOCALES, (2) create `messages/{code}.json` matching
 * the schema of `es.json`, (3) add an entry to LOCALE_LABELS, (4) add a
 * choice to the user-menu LangChoice list.
 */

export const LOCALES = ["es", "en", "pt", "fr", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** UI labels + flag emoji for the language picker, keyed by locale code. */
export const LOCALE_META: Record<Locale, { flag: string; nativeName: string }> = {
  es: { flag: "🇧🇴", nativeName: "Español" },
  en: { flag: "🇺🇸", nativeName: "English" },
  pt: { flag: "🇧🇷", nativeName: "Português" },
  fr: { flag: "🇫🇷", nativeName: "Français" },
  it: { flag: "🇮🇹", nativeName: "Italiano" },
};
