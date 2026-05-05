"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "general", label: "General" },
  { href: "agent", label: "Agente" },
  { href: "branding", label: "Marca" },
  { href: "team", label: "Equipo" },
  { href: "integrations", label: "Integraciones" },
  { href: "billing", label: "Facturación" },
];

export function SettingsTabs({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
      {TABS.map((t) => {
        const fullHref = `/dashboard/${tenantSlug}/settings/${t.href}`;
        const active = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        return (
          <Link
            key={t.href}
            href={fullHref}
            className={cn(
              "px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
