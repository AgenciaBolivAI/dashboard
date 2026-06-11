"use client";

import { useTransition } from "react";
import { User, Sun, Moon, Monitor, Languages, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignOutMenuItem } from "./sign-out-button";
import { setLocaleAction } from "@/lib/actions/preferences";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function UserMenu({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  const t = useTranslations("userMenu");
  const { theme, setTheme } = useTheme();
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  function pickLocale(loc: Locale) {
    if (loc === currentLocale) return;
    startSwitch(async () => {
      await setLocaleAction(loc);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          suppressHydrationWarning
          className="flex items-center gap-2 rounded-md p-1.5 hover:bg-secondary transition"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground tracking-normal normal-case">
              {t("signedIn")}
            </span>
            <span className="truncate text-sm font-medium normal-case tracking-normal text-foreground">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled>
          <User className="size-4" />
          {t("profile")}
        </DropdownMenuItem>

        {/* Appearance — theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon className="size-4" />
            <span>{t("appearance")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeChoice
              value="light"
              label={t("theme_light")}
              icon={Sun}
              active={theme === "light"}
              onClick={() => setTheme("light")}
            />
            <ThemeChoice
              value="dark"
              label={t("theme_dark")}
              icon={Moon}
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
            />
            <ThemeChoice
              value="system"
              label={t("theme_system")}
              icon={Monitor}
              active={theme === "system"}
              onClick={() => setTheme("system")}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Language */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="size-4" />
            <span>{t("language")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {LOCALES.map((loc) => (
              <LangChoice
                key={loc}
                flag={LOCALE_META[loc].flag}
                label={t(`lang_${loc}` as "lang_es" | "lang_en" | "lang_pt" | "lang_fr" | "lang_it")}
                active={currentLocale === loc}
                busy={switching}
                onClick={() => pickLocale(loc)}
              />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <SignOutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Renders the right theme icon based on the current theme. */
function ThemeIcon({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  if (resolvedTheme === "light") return <Sun className={className} />;
  return <Moon className={className} />;
}

function ThemeChoice({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  value: string;
  label: string;
  icon: typeof Sun;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick} className={cn(active && "bg-accent")}>
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {active && <Check className="size-3.5 text-primary" />}
    </DropdownMenuItem>
  );
}

function LangChoice({
  flag,
  label,
  active,
  busy,
  onClick,
}: {
  flag: string;
  label: string;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick} disabled={busy} className={cn(active && "bg-accent")}>
      <span className="text-base leading-none">{flag}</span>
      <span className="flex-1">{label}</span>
      {active && <Check className="size-3.5 text-primary" />}
    </DropdownMenuItem>
  );
}
