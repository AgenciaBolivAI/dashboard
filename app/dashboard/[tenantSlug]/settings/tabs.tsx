"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "general", labelKey: "tab_general" },
  { href: "agent", labelKey: "tab_agent" },
  { href: "voice", labelKey: "tab_voice" },
  { href: "branding", labelKey: "tab_branding" },
  { href: "team", labelKey: "tab_team" },
  { href: "integrations", labelKey: "tab_integrations" },
  { href: "billing", labelKey: "tab_billing" },
] as const;

export function SettingsTabs({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("settings_general");
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
      {TABS.map((tab) => {
        const fullHref = `/dashboard/${tenantSlug}/settings/${tab.href}`;
        const active = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        return (
          <Link
            key={tab.href}
            href={fullHref}
            className={cn(
              "px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
