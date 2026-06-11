"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALES, type Locale } from "@/lib/i18n";

/**
 * Persist the user's UI language preference in a cookie.
 * The root layout reads this cookie on every render to pick the right
 * messages bundle, so changing it propagates everywhere on next render.
 */
export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale as string)) return;
  const store = await cookies();
  store.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  revalidatePath("/", "layout");
}
