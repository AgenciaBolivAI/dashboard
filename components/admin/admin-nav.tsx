"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Tenants", exact: true },
  { href: "/admin/templates", label: "Plantillas" },
  { href: "/admin/usage", label: "Uso" },
  { href: "/admin/users", label: "Equipo BolivAI" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-card">
      <div className="px-6 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
