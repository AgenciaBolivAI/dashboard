"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Coins,
  Contact,
  FileText,
  MessagesSquare,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UserPlus,
  Wand2,
  Megaphone,
  PhoneCall,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "overview", key: "overview", icon: BarChart3 },
  { href: "assistant", key: "assistant", icon: Bot },
  { href: "conversations", key: "conversations", icon: MessagesSquare },
  { href: "leads", key: "leads", icon: UserPlus },
  { href: "customers", key: "customers", icon: Contact },
  { href: "calendar", key: "calendar", icon: CalendarDays },
  { href: "invoices", key: "invoices", icon: Receipt },
  { href: "services", key: "services", icon: Sparkles },
  { href: "staff", key: "staff", icon: Users },
  { href: "knowledge", key: "knowledge", icon: FileText },
  { href: "marketing", key: "marketing", icon: Megaphone },
  { href: "content", key: "content", icon: Wand2 },
  { href: "shorts", key: "shorts", icon: Video },
  { href: "billing", key: "billing", icon: Coins },
  // Link straight to the real leaf (/settings/general) to skip the
  // /settings -> /settings/general redirect, but keep `match: "settings"` so
  // every settings/* subpage still highlights the nav item.
  { href: "settings/general", key: "settings", icon: Settings, match: "settings" },
] as const;

// Internal-only nav items kept for BolivAI's own tenant (single-tenant tables).
// Will get multi-tenant when sandra_call_queue gets a tenant_id column.
const BOLIVAI_ONLY_ITEMS = [
  { href: "sandra", key: "sandra_queue", icon: PhoneCall },
] as const;

export function Sidebar({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const base = `/dashboard/${tenantSlug}`;

  const items = tenantSlug === "bolivai" ? [...NAV_ITEMS, ...BOLIVAI_ONLY_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {items.map((item) => {
        const { href, key, icon: Icon } = item;
        const fullHref = `${base}/${href}`;
        // Active state matches on `match` (e.g. "settings") so all subpages
        // light up, even though the link points at a specific leaf.
        const matchBase = `${base}/${"match" in item ? item.match : href}`;
        const active =
          pathname === matchBase || pathname.startsWith(`${matchBase}/`);
        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {active ? (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            ) : null}
            <Icon className="size-4 shrink-0" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
