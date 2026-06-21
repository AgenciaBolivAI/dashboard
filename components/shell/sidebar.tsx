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
  LifeBuoy,
  LineChart,
  ListTodo,
  MessagesSquare,
  Receipt,
  Rocket,
  Settings,
  Sparkles,
  Users,
  UserPlus,
  Wand2,
  Megaphone,
  PhoneCall,
  Video,
} from "lucide-react";
import { levelSatisfies, type Feature, type PermissionSet } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// `feature`, when present, gates the item: a role without READ on it is hidden.
// Items without a feature (overview, assistant, services, staff) always show.
const NAV_ITEMS = [
  { href: "overview", key: "overview", icon: BarChart3 },
  { href: "assistant", key: "assistant", icon: Bot },
  { href: "conversations", key: "conversations", icon: MessagesSquare, feature: "conversations" },
  { href: "tickets", key: "tickets", icon: LifeBuoy, feature: "tickets" },
  { href: "leads", key: "leads", icon: UserPlus, feature: "leads" },
  { href: "tasks", key: "tasks", icon: ListTodo, feature: "tasks" },
  { href: "customers", key: "customers", icon: Contact, feature: "customers" },
  { href: "calendar", key: "calendar", icon: CalendarDays, feature: "calendar" },
  { href: "invoices", key: "invoices", icon: Receipt, feature: "invoices" },
  { href: "reports", key: "reports", icon: LineChart, feature: "reports" },
  { href: "services", key: "services", icon: Sparkles },
  { href: "staff", key: "staff", icon: Users },
  { href: "knowledge", key: "knowledge", icon: FileText, feature: "knowledge" },
  { href: "marketing", key: "marketing", icon: Megaphone, feature: "marketing" },
  { href: "campaigns", key: "campaigns", icon: Rocket, feature: "marketing" },
  { href: "content", key: "content", icon: Wand2, feature: "content" },
  { href: "shorts", key: "shorts", icon: Video, feature: "shorts" },
  { href: "billing", key: "billing", icon: Coins, feature: "billing" },
  // Link straight to the real leaf (/settings/general) to skip the
  // /settings -> /settings/general redirect, but keep `match: "settings"` so
  // every settings/* subpage still highlights the nav item.
  { href: "settings/general", key: "settings", icon: Settings, match: "settings", feature: "settings" },
] as const;

// Internal-only nav items kept for BolivAI's own tenant (single-tenant tables).
// Will get multi-tenant when sandra_call_queue gets a tenant_id column.
const BOLIVAI_ONLY_ITEMS = [
  { href: "sandra", key: "sandra_queue", icon: PhoneCall },
] as const;

export function Sidebar({
  tenantSlug,
  permissions,
}: {
  tenantSlug: string;
  /** When provided, items the role can't READ are hidden (RBAC). */
  permissions?: PermissionSet;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const base = `/dashboard/${tenantSlug}`;

  const all = tenantSlug === "bolivai" ? [...NAV_ITEMS, ...BOLIVAI_ONLY_ITEMS] : NAV_ITEMS;
  const items = all.filter((item) => {
    if (!permissions || !("feature" in item)) return true;
    return levelSatisfies(permissions[item.feature as Feature] ?? "none", "read");
  });

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
