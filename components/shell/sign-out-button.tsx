"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutMenuItem() {
  const t = useTranslations("userMenu");
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <LogOut className="size-4" />
        {t("sign_out")}
      </button>
    </form>
  );
}
