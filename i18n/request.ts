/**
 * next-intl request config — auto-loaded by next-intl/server on every request.
 *
 * We use cookie-based locale (no URL prefix). This reads the `locale`
 * cookie set by `setLocaleAction` and loads the matching messages bundle.
 * Falls back to Spanish if the cookie is missing or contains an unknown
 * locale code.
 */
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieValue = store.get("locale")?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(cookieValue ?? "")
    ? (cookieValue as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
