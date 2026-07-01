"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/overview", key: "tab_overview" },
  { href: "/admin", key: "tab_tenants", exact: true },
  { href: "/admin/usage", key: "tab_usage" },
  { href: "/admin/pricing", key: "tab_pricing" },
  { href: "/admin/codes", key: "tab_codes" },
  { href: "/admin/brain", key: "tab_brain" },
  { href: "/admin/users", key: "tab_users" },
  { href: "/admin/health", key: "tab_health" },
];

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("admin_nav");
  return (
    <nav className="border-b border-border bg-card">
      <div className="px-6 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
